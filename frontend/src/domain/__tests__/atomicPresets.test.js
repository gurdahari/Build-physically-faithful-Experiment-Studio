/**
 * Tests for the atomic-state presets.  Presets are plain backend-valid DATA;
 * the backend computes all physics.  We check the required set is present,
 * coefficients are normalized, and the two superposition kinds are distinguished.
 */

import { describe, it, expect } from "vitest";
import { ATOMIC_PRESETS, PRESET_BY_KEY, KEYS, distinctN } from "../atomicPresets.js";
import { coefficientsAreEvolving } from "../atomicVisual.js";

describe("required presets", () => {
  it("includes 1s, 2s, all three 2p, one unequal-energy and one degenerate superposition", () => {
    const keys = ATOMIC_PRESETS.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(["1s", "2s", "2p-1", "2p0", "2p+1", "sup_uneq", "sup_degen"]));
  });

  it("references only supported backend basis keys", () => {
    const allowed = new Set(Object.values(KEYS));
    for (const p of ATOMIC_PRESETS) for (const c of p.coefficients) {
      expect(allowed.has(c.state)).toBe(true);
      expect(typeof c.real).toBe("number");
      expect(typeof c.imag).toBe("number");
    }
  });

  it("every preset is normalized (Σ|c|² = 1)", () => {
    for (const p of ATOMIC_PRESETS) {
      const norm = p.coefficients.reduce((a, c) => a + c.real * c.real + c.imag * c.imag, 0);
      expect(norm).toBeCloseTo(1, 10);
    }
  });
});

describe("superposition kinds", () => {
  it("the unequal-energy superposition spans distinct n (time-dependent)", () => {
    const p = PRESET_BY_KEY.sup_uneq;
    expect(p.kind).toBe("unequal-energy");
    expect(coefficientsAreEvolving(p.coefficients)).toBe(true);
  });

  it("the degenerate superposition stays within one n (stationary density)", () => {
    const p = PRESET_BY_KEY.sup_degen;
    expect(p.kind).toBe("degenerate");
    expect(coefficientsAreEvolving(p.coefficients)).toBe(false);
  });
});

describe("distinctN", () => {
  it("extracts the set of principal quantum numbers from state keys", () => {
    expect([...distinctN([{ state: KEYS.s1 }, { state: KEYS.p0 }])].sort()).toEqual([1, 2]);
    expect([...distinctN([{ state: KEYS.p_p1 }, { state: KEYS.p_m1 }])]).toEqual([2]);
  });
});
