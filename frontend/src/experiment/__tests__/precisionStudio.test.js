/**
 * Structural + domain guards for the Milestone 4 Precision Atomic Structure layer.
 *
 * Verify (without WebGL): the Precision resolution is active with VisualTruth
 * descriptors; the overlay is the single contextual card; toggling corrections
 * does NOT recompute the orbital density; stale field responses cannot replace
 * newer ones; spin visuals are interpretive (no rotating balls); no fabricated
 * distinct orbital clouds; and the scene swap preserves the app shell + Proton
 * Spin experiment.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isActive, RES, getContractForResolution, CONTRACT } from "../../domain/hydrogen.js";
import { listPrecisionVisualTruth } from "../../domain/visualTruth.js";

const here = dirname(fileURLToPath(import.meta.url));
const srcOf = (f) => readFileSync(join(here, "..", f), "utf8");
const overlay = srcOf("PrecisionOverlay.jsx");
const hook = srcOf("usePrecision.js");
const studio = srcOf("ExperimentStudio.jsx");

function bodyOf(src, a, b) {
  const i = src.indexOf(a), j = src.indexOf(b, i + a.length);
  return i >= 0 && j > i ? src.slice(i, j) : "";
}

// 31 ─ Precision resolution is active ─────────────────────────────────────────
describe("Precision resolution is active", () => {
  it("reports ACTIVE and carries the layered-model contract", () => {
    expect(isActive(RES.PRECISION)).toBe(true);
    const c = getContractForResolution(RES.PRECISION);
    expect(c.solver).toMatch(/precision/);
    expect(c.limitations.join(" ")).toMatch(/layered effective model/i);
    expect(c.limitations.join(" ")).toMatch(/NOT a complete real-time bound-state QED/i);
  });

  // 32 ─ Selecting Precision replaces the generic placeholder ─────────────────
  it("no longer forbids all rendered results and lists included precision DOF", () => {
    const c = getContractForResolution(RES.PRECISION);
    expect(c.includedDegreesOfFreedom.join(" ")).toMatch(/fine-structure/i);
    expect(c.includedDegreesOfFreedom.join(" ")).toMatch(/hyperfine/i);
    // forbids the misleading representations rather than "any rendered result"
    expect(c.forbiddenRepresentations.join(" ")).toMatch(/rotating classical ball/i);
    expect(c.forbiddenRepresentations.join(" ")).toMatch(/distinct spatial orbital clouds/i);
  });
});

// VisualTruth descriptors ─────────────────────────────────────────────────────
describe("Precision VisualTruth descriptors", () => {
  const list = listPrecisionVisualTruth();
  it("declares fine/lamb/hyperfine/21cm/spin/coupled-F/Breit–Rabi/budget/spectral/magnified", () => {
    const ids = list.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining([
      "visual.precision.fine_split", "visual.precision.lamb_overlay", "visual.precision.hyperfine_split",
      "visual.precision.transition_21cm", "visual.precision.electron_spin", "visual.precision.proton_spin",
      "visual.precision.coupled_F", "visual.precision.breit_rabi", "visual.precision.budget",
      "visual.precision.spectral_readout", "visual.precision.magnified_axis",
    ]));
  });
  it("binds every descriptor to the precision contract and classifies spin as interpretive, Lamb as reference-derived", () => {
    for (const d of list) expect(d.modelContractId).toBe(CONTRACT.PRECISION);
    const byId = Object.fromEntries(list.map((d) => [d.id, d]));
    expect(byId["visual.precision.electron_spin"].category).toBe("interpretive");
    expect(byId["visual.precision.proton_spin"].category).toBe("interpretive");
    expect(byId["visual.precision.lamb_overlay"].limitations.toLowerCase()).toMatch(/reference-data|not a real-time/);
  });
});

// 34 / 40 ─ Hook does not recompute density; cancels stale field responses ────
describe("usePrecision requests only precision endpoints, cancels stale responses", () => {
  it("hits the precision endpoints and NEVER the atomic density endpoint", () => {
    expect(/\/hydrogen\/precision\/model/.test(hook)).toBe(true);
    expect(/\/hydrogen\/precision\/levels/.test(hook)).toBe(true);
    expect(/\/hydrogen\/precision\/transitions/.test(hook)).toBe(true);
    expect(/\/hydrogen\/atomic\/evaluate/.test(hook)).toBe(false);   // no orbital recompute
  });

  it("computes no physics (no laguerre/harmonic/eigen math)", () => {
    expect(/genlaguerre|sph_harm|legendre|eigh\(|diagonaliz/i.test(hook)).toBe(false);
  });

  it("cancels stale field/transition requests (AbortController + monotonic token)", () => {
    expect(/new AbortController\(\)/.test(hook)).toBe(true);
    expect(/lAbort\.current\.abort\(\)/.test(hook)).toBe(true);
    expect(/myToken !== lToken\.current/.test(hook)).toBe(true);
    expect(/myToken !== tToken\.current/.test(hook)).toBe(true);
  });

  it("refetches levels when the magnetic field changes", () => {
    // The debounced levels effect depends on field.
    expect(/\[active, family, corrections, field\]/.test(hook)).toBe(true);
  });
});

// 33 / 34 / 47 ─ ExperimentStudio wiring ─────────────────────────────────────
describe("ExperimentStudio precision wiring", () => {
  it("keeps the orbital density as spatial context at the Precision resolution", () => {
    expect(/precisionActive = nav\.level === NAV_LEVEL\.RESOLUTION && nav\.resolutionId === RES\.PRECISION/.test(studio)).toBe(true);
    expect(/useAtomicHydrogen\(atomicActive \|\| precisionActive\)/.test(studio)).toBe(true);
    expect(/spatialContext=\{precisionActive\}/.test(studio)).toBe(true);
  });

  it("recomputes the orbital ONLY when the spatial preset changes (not on correction/field toggles)", () => {
    // The sync effect depends on [precisionActive, spatialPreset] — not corrections/field.
    expect(/\[precisionActive, spatialPreset\]/.test(studio)).toBe(true);
  });

  it("renders exactly one PrecisionOverlay and preserves the Proton Spin experiment", () => {
    expect(/precisionActive \? \(\s*<PrecisionOverlay/.test(studio)).toBe(true);
    expect((studio.match(/<PrecisionOverlay/g) ?? []).length).toBe(1);
    // The precision spatial-sync effect never touches the QuTiP experiment.
    const eff = bodyOf(studio, "In Precision mode the spatial cloud", "const clearCameraFocus");
    expect(/exp\.run|exp\.play|exp\.reset|exp\.set/.test(eff)).toBe(false);
  });

  it("hides the mathematical Bloch view during the precision overlay", () => {
    expect(/showMath && !atomicActive && !precisionActive/.test(studio)).toBe(true);
  });
});

// 35–39, 41–44 ─ Overlay content ─────────────────────────────────────────────
describe("PrecisionOverlay content", () => {
  it("shows the fine-structure splitting and the level explorer (35)", () => {
    expect(/data-testid="precision-fine-split"/.test(overlay)).toBe(true);
    expect(/data-testid="precision-level"/.test(overlay)).toBe(true);
  });
  it("labels the Lamb shift as reference-derived (36)", () => {
    expect(/data-testid="precision-lamb-ref"/.test(overlay)).toBe(true);
    expect(/reference-data QED correction/i.test(overlay)).toBe(true);
  });
  it("shows the hyperfine F=0/F=1 levels (37) and the 21 cm preset (38)", () => {
    // section/preset testids are applied via wrappers (data-testid at runtime).
    expect(/precision-hyperfine-levels/.test(overlay)).toBe(true);
    expect(/precision-21cm/.test(overlay)).toBe(true);
  });
  it("has a magnetic-field control and Breit–Rabi plot (39)", () => {
    expect(/data-testid="precision-field"/.test(overlay)).toBe(true);
    expect(/precision\.setField/.test(overlay)).toBe(true);
    expect(/data-testid="precision-breit-rabi"/.test(overlay)).toBe(true);
  });
  it("labels spin visuals interpretive with NO rotating balls (41, 42)", () => {
    expect(/data-testid="precision-spin-glyph"/.test(overlay)).toBe(true);
    expect(/interpretive/i.test(overlay)).toBe(true);
    expect(/NOT rotating classical balls/i.test(overlay)).toBe(true);
    // No 3D/animation machinery in the overlay → no literal spinning ball.
    expect(/useFrame|from "three"|@react-three/.test(overlay)).toBe(false);
  });
  it("creates no distinct orbital geometry for spin/hyperfine splittings (43)", () => {
    expect(/<points|sphereGeometry|BufferGeometry|Canvas/.test(overlay)).toBe(false);
  });
  it("has a Back control wired to onBack (44) and a magnification declaration + provenance", () => {
    expect(/data-testid="precision-back"/.test(overlay)).toBe(true);
    expect(/onClick=\{onBack\}/.test(overlay)).toBe(true);
    expect(/data-testid="precision-magnification"/.test(overlay)).toBe(true);
    expect(/data-testid="precision-provenance"/.test(overlay)).toBe(true);
    expect(/data-testid="precision-budget"/.test(overlay)).toBe(true);
  });
});
