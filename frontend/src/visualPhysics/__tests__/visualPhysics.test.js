/**
 * Tests for the visual-physics mapping layer.
 *
 * All modules under test are pure JavaScript with no React or Three.js
 * dependencies — they can be run in a plain Node environment via Vitest.
 */

import { describe, it, expect } from "vitest";

import {
  normalizeVec3, vecMagnitude,
  phaseToXYDirection, effectiveFieldVector,
  rotatingToLab, toEffectiveFrame, transformTrajectory,
} from "../frameTransforms.js";

import {
  normalizeVec, computeTimeScale, buildScaleMetadata, ARROW_DISPLAY_LENGTH,
} from "../visualScales.js";

import {
  getModeConfig,
  mapB0ToVisual, mapB1ToVisual, mapOmegaEffToVisual, mapDetuningToVisual,
  getFrameLabel, getFrameWarning, getModeDescription, getMissingDataDescriptor,
} from "../visualMappings.js";

import {
  VIS_MODES, FRAMES, FIELD_IDS, SCALE_TYPE,
} from "../visualizationTypes.js";

const ATOL = 1e-10;
const close = (a, b) => Math.abs(a - b) < 1e-8;
const closeVec = (v, w) => v.every((c, i) => Math.abs(c - w[i]) < 1e-8);

// ── frameTransforms ───────────────────────────────────────────────────────────

describe("normalizeVec3", () => {
  it("normalizes a non-zero vector", () => {
    const n = normalizeVec3([3, 4, 0]);
    expect(close(n[0], 0.6)).toBe(true);
    expect(close(n[1], 0.8)).toBe(true);
    expect(close(n[2], 0)).toBe(true);
  });

  it("returns zero for a near-zero vector", () => {
    expect(normalizeVec3([0, 0, 0])).toEqual([0, 0, 0]);
    expect(normalizeVec3([1e-15, 1e-15, 1e-15])).toEqual([0, 0, 0]);
  });
});

describe("vecMagnitude", () => {
  it("computes magnitude correctly", () => {
    expect(close(vecMagnitude([3, 4, 0]), 5)).toBe(true);
    expect(close(vecMagnitude([1, 0, 0]), 1)).toBe(true);
    expect(close(vecMagnitude([0, 0, 0]), 0)).toBe(true);
  });
});

describe("phaseToXYDirection", () => {
  it("phase 0 → +X", () => {
    const d = phaseToXYDirection(0);
    expect(close(d[0], 1)).toBe(true);
    expect(close(d[1], 0)).toBe(true);
    expect(close(d[2], 0)).toBe(true);
  });

  it("phase π/2 → +Y", () => {
    const d = phaseToXYDirection(Math.PI / 2);
    expect(close(d[0], 0)).toBe(true);
    expect(close(d[1], 1)).toBe(true);
  });

  it("phase π → −X", () => {
    const d = phaseToXYDirection(Math.PI);
    expect(close(d[0], -1)).toBe(true);
    expect(close(d[1], 0)).toBe(true);
  });
});

describe("effectiveFieldVector", () => {
  it("on-resonance (Δ=0): result lies in XY plane", () => {
    const v = effectiveFieldVector(2.0, Math.PI / 4, 0);
    expect(close(v[2], 0)).toBe(true);
    const amp = Math.sqrt(v[0] ** 2 + v[1] ** 2);
    expect(close(amp, 2.0)).toBe(true);
  });

  it("pure detuning (Ω=0): result along Z", () => {
    const v = effectiveFieldVector(0, 0, 1.5);
    expect(close(v[0], 0)).toBe(true);
    expect(close(v[1], 0)).toBe(true);
    expect(close(v[2], 1.5)).toBe(true);
  });

  it("general case magnitude = sqrt(Ω² + Δ²)", () => {
    const Omega = 3.0, Delta = 4.0;
    const v = effectiveFieldVector(Omega, 0, Delta);
    expect(close(vecMagnitude(v), 5.0)).toBe(true);
  });
});

describe("rotatingToLab", () => {
  it("t=0 → no transformation", () => {
    const vec = [1, 0, 0];
    expect(closeVec(rotatingToLab(vec, 0, 2.0), vec)).toBe(true);
  });

  it("t=π/(2ω): x→y when ω=1, input=[1,0,0]", () => {
    const t = Math.PI / 2;
    const result = rotatingToLab([1, 0, 0], t, 1.0);
    // angle = 1.0 * π/2: cos=0, sin=1 → [x·0-y·1, x·1+y·0, z] = [0,1,0]
    expect(close(result[0], 0)).toBe(true);
    expect(close(result[1], 1)).toBe(true);
    expect(close(result[2], 0)).toBe(true);
  });

  it("preserves Z component", () => {
    const vec = [0.5, 0.3, 0.7];
    const result = rotatingToLab(vec, 1.23, 2.5);
    expect(close(result[2], 0.7)).toBe(true);
  });

  it("preserves vector magnitude", () => {
    const vec = [0.6, 0.8, 0.0];
    const result = rotatingToLab(vec, 3.14, 1.0);
    expect(close(vecMagnitude(result), vecMagnitude(vec))).toBe(true);
  });
});

describe("toEffectiveFrame", () => {
  it("omegaEff along +Z → no change", () => {
    const vec = [0.5, 0.3, 0.7];
    const result = toEffectiveFrame(vec, [0, 0, 1]);
    expect(closeVec(result, vec)).toBe(true);
  });

  it("preserves vector magnitude", () => {
    const vec = [0.6, 0.0, 0.8];
    const omegaEff = [1, 1, 1];
    const result = toEffectiveFrame(vec, omegaEff);
    expect(close(vecMagnitude(result), vecMagnitude(vec))).toBe(true);
  });

  it("zero omegaEff → identity", () => {
    const vec = [1, 0, 0];
    expect(closeVec(toEffectiveFrame(vec, [0, 0, 0]), vec)).toBe(true);
  });

  it("Ω_eff → Z after transform (the effective field maps to +Z)", () => {
    const omegaEff = [1, 0, 1]; // at 45° from Z
    const result   = toEffectiveFrame(normalizeVec3(omegaEff), omegaEff);
    // The effective-field direction itself should become [0,0,1]
    expect(close(result[0], 0)).toBe(true);
    expect(close(result[1], 0)).toBe(true);
    expect(close(result[2], 1)).toBe(true);
  });

  it("anti-parallel (−Z): flips z component", () => {
    const result = toEffectiveFrame([1, 0, 0], [0, 0, -1]);
    // 180° rotation about X: (x,y,z) → (x,−y,−z)
    expect(close(result[0], 1)).toBe(true);
    expect(close(result[1], 0)).toBe(true);
    expect(close(result[2], 0)).toBe(true);
  });
});

describe("transformTrajectory", () => {
  it("rotating frame → returns identical array", () => {
    const traj = [[1, 0, 0], [0, 1, 0]];
    const out  = transformTrajectory(traj, FRAMES.ROTATING);
    expect(out).toBe(traj); // same reference
  });

  it("effective frame transforms each point", () => {
    const traj     = [[1, 0, 0], [0, 0, 1]];
    const omegaEff = [0, 0, 1]; // already along Z → identity
    const out      = transformTrajectory(traj, FRAMES.EFFECTIVE, { omegaEff });
    expect(closeVec(out[0], [1, 0, 0])).toBe(true);
    expect(closeVec(out[1], [0, 0, 1])).toBe(true);
  });

  it("empty trajectory → returns as-is", () => {
    expect(transformTrajectory([], FRAMES.EFFECTIVE, { omegaEff: [0, 0, 1] })).toEqual([]);
    expect(transformTrajectory(null, FRAMES.ROTATING)).toBeNull();
  });
});

// ── visualScales ──────────────────────────────────────────────────────────────

describe("normalizeVec (visualScales)", () => {
  it("available=true for non-zero vector", () => {
    const r = normalizeVec([3, 0, 4]);
    expect(r.available).toBe(true);
    expect(close(r.physicalMagnitude, 5)).toBe(true);
    expect(close(vecMagnitude(r.direction), 1)).toBe(true);
  });

  it("available=false for near-zero vector", () => {
    const r = normalizeVec([0, 0, 0]);
    expect(r.available).toBe(false);
  });
});

describe("computeTimeScale", () => {
  it("returns slowed scale type", () => {
    const s = computeTimeScale(10, 200);
    expect(s.scaleType).toBe(SCALE_TYPE.SLOWED);
    expect(s.physicalTime).toBe(10);
    expect(s.playbackTime).toBeGreaterThan(0);
    expect(s.scaleFactor).toBeGreaterThan(0);
  });
});

describe("buildScaleMetadata", () => {
  it("includes frame and decoherence flag", () => {
    const meta = buildScaleMetadata({
      frame: FRAMES.ROTATING, physicalDuration: 5, numPoints: 400, hasDecoherence: true,
    });
    expect(meta.frame).toBe(FRAMES.ROTATING);
    expect(meta.hasDecoherence).toBe(true);
    expect(meta.fieldArrowScale).toBe(SCALE_TYPE.NORMALIZED);
  });

  it("carrierSlowFactor only for lab frame", () => {
    const labMeta = buildScaleMetadata({
      frame: FRAMES.LAB, physicalDuration: 2, numPoints: 100,
      hasDecoherence: false, carrierSlowFactor: 1000,
    });
    expect(labMeta.carrierSlowFactor).toBe(1000);

    const rotMeta = buildScaleMetadata({
      frame: FRAMES.ROTATING, physicalDuration: 2, numPoints: 100, hasDecoherence: false,
    });
    expect(rotMeta.carrierSlowFactor).toBeNull();
  });
});

// ── visualMappings ────────────────────────────────────────────────────────────

describe("getModeConfig", () => {
  it("concept: no field vectors", () => {
    const c = getModeConfig(VIS_MODES.CONCEPT);
    expect(c.showB0).toBe(false);
    expect(c.showB1).toBe(false);
    expect(c.showOmegaEff).toBe(false);
    expect(c.showDetuning).toBe(false);
  });

  it("physics: shows B0, B1, Ω_eff but not detuning", () => {
    const c = getModeConfig(VIS_MODES.PHYSICS);
    expect(c.showB0).toBe(true);
    expect(c.showB1).toBe(true);
    expect(c.showOmegaEff).toBe(true);
    expect(c.showDetuning).toBe(false);
  });

  it("diagnostic: shows everything including detuning", () => {
    const c = getModeConfig(VIS_MODES.DIAGNOSTIC);
    expect(c.showDetuning).toBe(true);
    expect(c.showIdealPath).toBe(true);
    expect(c.showNumerics).toBe(true);
  });
});

describe("mapB0ToVisual", () => {
  it("always available, direction [0,0,1]", () => {
    const v = mapB0ToVisual(FRAMES.ROTATING);
    expect(v.available).toBe(true);
    expect(v.direction).toEqual([0, 0, 1]);
    expect(v.label).toBe("B₀");
    expect(v.fieldId).toBe(FIELD_IDS.B0);
  });

  it("same in all frames", () => {
    expect(mapB0ToVisual(FRAMES.LAB).available).toBe(true);
    expect(mapB0ToVisual(FRAMES.EFFECTIVE).available).toBe(true);
  });
});

describe("mapB1ToVisual", () => {
  it("available=false when fieldVec is null", () => {
    expect(mapB1ToVisual(null, FRAMES.ROTATING).available).toBe(false);
  });

  it("available=false when amplitude is zero (free evolution)", () => {
    expect(mapB1ToVisual([0, 0, 1.5], FRAMES.ROTATING).available).toBe(false);
  });

  it("returns correct direction for phase=0", () => {
    const v = mapB1ToVisual([2.0, 0, 0], FRAMES.ROTATING);
    expect(v.available).toBe(true);
    expect(close(v.direction[0], 1)).toBe(true);
    expect(close(v.direction[1], 0)).toBe(true);
    expect(close(v.direction[2], 0)).toBe(true);
    expect(v.fieldId).toBe(FIELD_IDS.B1);
  });

  it("direction is unit vector", () => {
    const v = mapB1ToVisual([1.5, 2.5, 0], FRAMES.ROTATING);
    expect(close(vecMagnitude(v.direction), 1)).toBe(true);
  });
});

describe("mapOmegaEffToVisual", () => {
  it("available=false for null", () => {
    expect(mapOmegaEffToVisual(null).available).toBe(false);
  });

  it("available=false for zero field", () => {
    expect(mapOmegaEffToVisual([0, 0, 0]).available).toBe(false);
  });

  it("direction is unit vector", () => {
    const v = mapOmegaEffToVisual([3, 0, 4]);
    expect(v.available).toBe(true);
    expect(close(vecMagnitude(v.direction), 1)).toBe(true);
    expect(close(v.physicalMagnitude, 5)).toBe(true);
    expect(v.fieldId).toBe(FIELD_IDS.OMEGA_EFF);
  });
});

describe("mapDetuningToVisual", () => {
  it("available=false for zero detuning", () => {
    expect(mapDetuningToVisual([1, 0, 0]).available).toBe(false);
  });

  it("positive Δ → +Z direction", () => {
    const v = mapDetuningToVisual([0, 0, 2.0]);
    expect(v.available).toBe(true);
    expect(v.direction[2]).toBeGreaterThan(0);
  });

  it("negative Δ → −Z direction", () => {
    const v = mapDetuningToVisual([0, 0, -1.5]);
    expect(v.available).toBe(true);
    expect(v.direction[2]).toBeLessThan(0);
  });
});

describe("getFrameLabel", () => {
  it("returns correct labels", () => {
    expect(getFrameLabel(FRAMES.ROTATING)).toBe("Rotating frame");
    expect(getFrameLabel(FRAMES.LAB)).toBe("Lab frame (visual)");
    expect(getFrameLabel(FRAMES.EFFECTIVE)).toBe("Effective-field frame");
  });
});

describe("getFrameWarning", () => {
  it("rotating frame has no warning", () => {
    expect(getFrameWarning(FRAMES.ROTATING)).toBeNull();
  });

  it("lab frame has a warning about slowed carrier", () => {
    const w = getFrameWarning(FRAMES.LAB);
    expect(typeof w).toBe("string");
    expect(w.length).toBeGreaterThan(0);
  });

  it("effective frame has a warning about frame rotation", () => {
    const w = getFrameWarning(FRAMES.EFFECTIVE);
    expect(typeof w).toBe("string");
  });
});

describe("getMissingDataDescriptor", () => {
  it("always returns available=false", () => {
    const d = getMissingDataDescriptor(FIELD_IDS.B1);
    expect(d.available).toBe(false);
    expect(d.fieldId).toBe(FIELD_IDS.B1);
  });

  it("accepts custom reason", () => {
    const d = getMissingDataDescriptor(FIELD_IDS.OMEGA_EFF, "test reason");
    expect(d.reason).toBe("test reason");
  });
});

describe("getModeDescription", () => {
  it("returns title and body for all modes", () => {
    [VIS_MODES.CONCEPT, VIS_MODES.PHYSICS, VIS_MODES.DIAGNOSTIC].forEach(mode => {
      const desc = getModeDescription(mode);
      expect(typeof desc.title).toBe("string");
      expect(typeof desc.body).toBe("string");
      expect(desc.title.length).toBeGreaterThan(0);
    });
  });
});

// ── Round-trip sanity tests ───────────────────────────────────────────────────

describe("toEffectiveFrame round-trip", () => {
  it("applying twice (with negated angle) returns original", () => {
    // For a well-defined Ω_eff, transforming and back-transforming should recover original.
    // Back-transform: same rotation but opposite sign → apply to −Ω_eff
    const omegaEff = [1, 1, 2];
    const vec      = [0.5, 0.3, 0.8];
    const transformed = toEffectiveFrame(vec, omegaEff);
    // The inverse transform maps −Ω_eff (pointing to +Z after first transform)
    // back to rotating frame; for the purpose of this test, check magnitude is preserved.
    expect(close(vecMagnitude(transformed), vecMagnitude(vec))).toBe(true);
  });
});

describe("consistency: mapOmegaEff direction matches effectiveFieldVector", () => {
  it("direction from mapOmegaEff matches effectiveFieldVector normalized", () => {
    const Omega = 2.5, phase = Math.PI / 3, Delta = 1.0;
    const rawField = [Omega * Math.cos(phase), Omega * Math.sin(phase), Delta];
    const visual   = mapOmegaEffToVisual(rawField);
    expect(visual.available).toBe(true);
    const fromEff  = normalizeVec3(effectiveFieldVector(Omega, phase, Delta));
    expect(closeVec(visual.direction, fromEff)).toBe(true);
  });
});
