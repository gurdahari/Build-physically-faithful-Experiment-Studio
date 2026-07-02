/**
 * Tests for signalModel + fieldSampler — the pure mapping from backend arrays
 * to live pulse-field, detector, camera, and representative-state visuals.
 */

import { describe, it, expect } from "vitest";
import {
  maxTransverse, driveLevel, b1Direction,
  detectorLevel, signalPhase, representativeArrow,
  cameraDistanceForStage, CAMERA_DIST, sampleExperimentAtIndex,
} from "../signalModel.js";
import { sampleFieldLines, isUniformField } from "../fieldSampler.js";

const close = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

// ── Drive envelope ────────────────────────────────────────────────────────────
describe("maxTransverse", () => {
  it("finds the peak transverse magnitude over a run", () => {
    const traj = [[0, 0, 1], [2, 0, 1], [1, 0, 1]];
    expect(close(maxTransverse(traj), 2)).toBe(true);
  });
  it("returns 0 for empty/null", () => {
    expect(maxTransverse([])).toBe(0);
    expect(maxTransverse(null)).toBe(0);
  });
});

describe("driveLevel", () => {
  it("Gaussian drive visibly rises then falls", () => {
    // Envelope-shaped transverse magnitudes: weak → strong → weak.
    const env = [0.1, 0.5, 1.0, 0.5, 0.1];
    const maxDrive = maxTransverse(env.map(a => [a, 0, 0]));
    const levels = env.map(a => driveLevel([a, 0, 0], maxDrive));
    expect(levels[2]).toBeGreaterThan(levels[0]);   // rose
    expect(levels[2]).toBeGreaterThan(levels[4]);   // then fell
    expect(close(levels[2], 1)).toBe(true);         // peak normalized to 1
    // strictly increasing to the peak, then strictly decreasing
    expect(levels[1]).toBeGreaterThan(levels[0]);
    expect(levels[3]).toBeLessThan(levels[2]);
  });

  it("square drive stays approximately constant while on", () => {
    const fields = Array.from({ length: 5 }, () => [Math.PI, 0, 0]);
    const maxDrive = maxTransverse(fields);
    const levels = fields.map(f => driveLevel(f, maxDrive));
    for (const l of levels) expect(close(l, 1)).toBe(true);
  });

  it("zero transverse drive → level 0 (B1 hidden)", () => {
    expect(driveLevel([0, 0, 1.5], 2)).toBe(0);   // free evolution: only Δ
    expect(driveLevel(null, 2)).toBe(0);
    expect(driveLevel([1, 0, 0], 0)).toBe(0);     // no peak → 0
  });
});

describe("b1Direction (phase rotates B1)", () => {
  it("phase 0 → +X", () => {
    const d = b1Direction([2, 0, 0]);
    expect(close(d[0], 1)).toBe(true);
    expect(close(d[1], 0)).toBe(true);
    expect(d[2]).toBe(0);
  });
  it("phase π/2 → +Y", () => {
    const d = b1Direction([0, 2, 0]);
    expect(close(d[0], 0)).toBe(true);
    expect(close(d[1], 1)).toBe(true);
  });
  it("returns null when there is no transverse drive", () => {
    expect(b1Direction([0, 0, 1])).toBeNull();
    expect(b1Direction(null)).toBeNull();
  });
});

// ── Detector ──────────────────────────────────────────────────────────────────
describe("detectorLevel", () => {
  it("follows the backend signal magnitude", () => {
    expect(close(detectorLevel(0.42), 0.42)).toBe(true);
    expect(detectorLevel(1.5)).toBe(1);   // clamped
  });
  it("is idle (0) when transverse magnetization is zero", () => {
    expect(detectorLevel(0)).toBe(0);
    expect(detectorLevel(null)).toBe(0);
  });
});

describe("signalPhase", () => {
  it("computes atan2(Q, I)", () => {
    expect(close(signalPhase(1, 0), 0)).toBe(true);
    expect(close(signalPhase(0, 1), Math.PI / 2)).toBe(true);
  });
});

// ── Representative state ──────────────────────────────────────────────────────
describe("representativeArrow", () => {
  it("direction is the backend Bloch direction; length ∝ |r|", () => {
    const a = representativeArrow([0, 0, 1], 0.2);
    expect(a.direction).toEqual([0, 0, 1]);
    expect(close(a.length, 0.2)).toBe(true);
  });
  it("decoherence (reduced |r|) shortens the coherent arrow", () => {
    const pure = representativeArrow([0.6, 0, 0.8], 0.2);   // |r| = 1
    const mixed = representativeArrow([0.3, 0, 0.4], 0.2);  // |r| = 0.5
    expect(mixed.length).toBeLessThan(pure.length);
  });
  it("zero vector → zero length", () => {
    expect(representativeArrow([0, 0, 0]).length).toBe(0);
  });
});

// ── Camera (stage-driven close-up) ────────────────────────────────────────────
describe("cameraDistanceForStage", () => {
  it("dollies in only during a pulse when auto close-up is enabled", () => {
    expect(cameraDistanceForStage("pulse", true)).toBe(CAMERA_DIST.near);
    expect(cameraDistanceForStage("free", true)).toBe(CAMERA_DIST.far);
    expect(cameraDistanceForStage("measure", true)).toBe(CAMERA_DIST.far);
  });
  it("stays at normal framing when auto close-up is disabled", () => {
    expect(cameraDistanceForStage("pulse", false)).toBe(CAMERA_DIST.far);
  });
});

// ── Single-index synchronization ──────────────────────────────────────────────
describe("sampleExperimentAtIndex", () => {
  const result = {
    trajectory:                [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    field_trajectory:          [[0, 0, 0], [3, 0, 0], [0, 0, 0]],
    detector_signal_real:      [0, 1, 0],
    detector_signal_imag:      [0, 0, 1],
    detector_signal_magnitude: [0, 1, 1],
    item_index:                [0, 0, 1],
    times:                     [0, 0.5, 1],
  };
  it("reads every physical quantity from ONE index", () => {
    const s = sampleExperimentAtIndex(result, 1);
    expect(s.index).toBe(1);
    expect(s.bloch).toEqual([1, 0, 0]);
    expect(s.field).toEqual([3, 0, 0]);
    expect(s.signalReal).toBe(1);
    expect(s.signalMagnitude).toBe(1);
    expect(s.itemIndex).toBe(0);
    expect(s.time).toBe(0.5);
  });
  it("clamps out-of-range indices", () => {
    expect(sampleExperimentAtIndex(result, 99).index).toBe(2);
    expect(sampleExperimentAtIndex(result, -5).index).toBe(0);
  });
});

// ── Field sampler ─────────────────────────────────────────────────────────────
describe("fieldSampler", () => {
  it("uniform field → every seed samples the same +Z direction", () => {
    const lines = sampleFieldLines({ direction: [0, 0, 1], uniform: true });
    expect(lines.length).toBeGreaterThan(1);
    for (const ln of lines) expect(ln.direction).toEqual([0, 0, 1]);
  });
  it("exposes per-line endpoints for rendering", () => {
    const [ln] = sampleFieldLines({ zSpan: [-1, 1], seeds: [[0.2, 0]] });
    expect(ln.p0).toEqual([0.2, 0, -1]);
    expect(ln.p1).toEqual([0.2, 0, 1]);
  });
  it("supports a future non-uniform B(r) sampler", () => {
    const lines = sampleFieldLines({
      uniform: false, seeds: [[1, 0], [0, 1]],
      sample: ([x, y]) => [x, y, 0],
    });
    expect(lines[0].direction).toEqual([1, 0, 0]);
    expect(lines[1].direction).toEqual([0, 1, 0]);
    expect(isUniformField({ uniform: false })).toBe(false);
    expect(isUniformField({})).toBe(true);
  });
});
