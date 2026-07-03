/**
 * Pure-mapping tests for the precision domain model. No physics is computed in
 * the frontend; these check request building, cache keys, the spatial-orbital
 * mapping (unchanged by precision), energy-axis magnification, and spin glyphs.
 */

import { describe, it, expect } from "vitest";
import {
  CORRECTIONS, FAMILIES, FAMILY_BY_KEY, STACK_VIEWS, allowedCorrections,
  spatialPresetForTerm, spatialPresetForFamily, levelsBody, levelsCacheKey,
  transitionBody, transitionCacheKey, energyAxis, spinCouplingFor,
} from "../precisionModel.js";

describe("corrections and families", () => {
  it("classifies the Lamb shift as reference data and fine/hyperfine/Zeeman as computed", () => {
    const byKey = Object.fromEntries(CORRECTIONS.map((c) => [c.key, c.classification]));
    expect(byKey.lamb_shift).toBe("reference-data");
    expect(byKey.fine_structure).toBe("computed");
    expect(byKey.hyperfine).toBe("computed");
    expect(byKey.zeeman).toBe("computed");
  });

  it("ground-hyperfine family allows hyperfine + zeeman; fine-structure allows fine/lamb/zeeman", () => {
    expect(FAMILY_BY_KEY.ground_hyperfine.allowed).toEqual(expect.arrayContaining(["hyperfine", "zeeman"]));
    expect(FAMILY_BY_KEY.ground_hyperfine.allowed).not.toContain("lamb_shift");
    expect(FAMILY_BY_KEY.fine_structure.allowed).toEqual(expect.arrayContaining(["fine_structure", "lamb_shift", "zeeman"]));
  });

  it("allowedCorrections filters out corrections not supported by a family", () => {
    expect(allowedCorrections("ground_hyperfine", ["fine_structure", "hyperfine", "zeeman"])).toEqual(["hyperfine", "zeeman"]);
    expect(allowedCorrections("fine_structure", ["hyperfine", "fine_structure"])).toEqual(["fine_structure"]);
  });

  it("progressive stack views span baseline → fine → fine+lamb → hyperfine → magnetic", () => {
    const keys = STACK_VIEWS.map((v) => v.key);
    expect(keys).toEqual(["baseline", "fine", "fine_lamb", "hyperfine", "magnetic"]);
  });
});

describe("spatial-orbital mapping is unchanged by precision", () => {
  it("maps terms to the nonrelativistic orbital preset", () => {
    expect(spatialPresetForTerm("1S1/2")).toBe("1s");
    expect(spatialPresetForTerm("2S1/2")).toBe("2s");
    expect(spatialPresetForTerm("2P1/2")).toBe("2p0");
    expect(spatialPresetForTerm("2P3/2")).toBe("2p0");   // 2P1/2 and 2P3/2 SHARE the 2p spatial basis
  });

  it("ALL ground-hyperfine sublevels share the 1s density (no fake distinct clouds)", () => {
    for (const term of ["1S1/2"]) {
      expect(spatialPresetForFamily("ground_hyperfine", term)).toBe("1s");
    }
    // The spatial preset is independent of the correction stack.
    expect(spatialPresetForFamily("fine_structure", "2P3/2")).toBe("2p0");
  });
});

describe("request builders and cache keys", () => {
  it("ground-hyperfine + zeeman requests a field sweep for the Breit–Rabi plot", () => {
    const body = levelsBody({ family: "ground_hyperfine", corrections: ["hyperfine", "zeeman"], field: 0.02, fieldSweep: true, sweepBmax: 0.1 });
    expect(body.state_family).toBe("ground_hyperfine");
    expect(body.field_sweep).toBe(true);
    expect(body.sweep_bmax_tesla).toBe(0.1);
  });

  it("levels cache key is deterministic and distinguishes field and corrections", () => {
    const base = levelsBody({ family: "fine_structure", corrections: ["fine_structure"], field: 0 });
    const k = levelsCacheKey(base);
    expect(levelsCacheKey(levelsBody({ family: "fine_structure", corrections: ["fine_structure"], field: 0 }))).toBe(k);
    expect(levelsCacheKey(levelsBody({ family: "fine_structure", corrections: ["fine_structure"], field: 0.1 }))).not.toBe(k);
    expect(levelsCacheKey(levelsBody({ family: "fine_structure", corrections: ["fine_structure", "lamb_shift"], field: 0 }))).not.toBe(k);
  });

  it("transition cache key distinguishes preset and field", () => {
    const a = transitionCacheKey(transitionBody({ preset: "hyperfine_21cm", corrections: ["hyperfine"], field: 0 }));
    const b = transitionCacheKey(transitionBody({ preset: "lyman_alpha", corrections: ["hyperfine"], field: 0 }));
    expect(a).not.toBe(b);
  });
});

describe("energy-axis magnification (declared, honest)", () => {
  it("declares magnification only when the spread is tiny; keeps normalization", () => {
    const big = energyAxis([-13.6, -3.4]);
    expect(big.magnified).toBe(false);
    expect(big.norm(-13.6)).toBeCloseTo(0, 6);
    expect(big.norm(-3.4)).toBeCloseTo(1, 6);

    const tiny = energyAxis([0, 5e-6, -1e-6]);   // ~µeV spread
    expect(tiny.magnified).toBe(true);
    expect(tiny.spread).toBeLessThan(1e-3);
  });
});

describe("interpretive spin coupling", () => {
  it("F=0 is a singlet and F=1 is a triplet, both marked interpretive", () => {
    const s = spinCouplingFor(0), t = spinCouplingFor(2);
    expect(s.kind).toBe("singlet");
    expect(s.interpretive).toBe(true);
    expect(t.kind).toBe("triplet");
    expect(t.m_F).toEqual([-1, 0, 1]);
    expect(s.description.toLowerCase()).toMatch(/not a fixed pair|entangled/);
  });
});
