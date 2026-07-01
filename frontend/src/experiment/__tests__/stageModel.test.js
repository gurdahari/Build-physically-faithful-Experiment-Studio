/**
 * Tests for stageModel — the pure-JS mapping from backend experiment data to
 * the active stage, context-aware visual emphasis, and derived measurement
 * probabilities.  No React / Three.js; runs in plain Node via Vitest.
 */

import { describe, it, expect } from "vitest";
import {
  STAGE,
  hypot3, transverseAmplitude, effectiveFieldMagnitude, drivePhase,
  classifyStage, emphasisForStage, physicalCaption,
  measurementProbabilities, MEASURE_AXES,
  formatTime, formatScaleFactor,
} from "../stageModel.js";

const close = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

// ── vector helpers ────────────────────────────────────────────────────────────
describe("vector helpers", () => {
  it("hypot3 computes magnitude", () => {
    expect(close(hypot3(3, 4, 0), 5)).toBe(true);
    expect(close(hypot3(0, 0, 0), 0)).toBe(true);
  });

  it("transverseAmplitude ignores the Δ (z) component", () => {
    expect(close(transverseAmplitude([3, 4, 99]), 5)).toBe(true);
    expect(transverseAmplitude(null)).toBe(0);
  });

  it("effectiveFieldMagnitude includes all three components", () => {
    expect(close(effectiveFieldMagnitude([3, 0, 4]), 5)).toBe(true);
    expect(effectiveFieldMagnitude(null)).toBe(0);
  });

  it("drivePhase returns φ = atan2(Ωy, Ωx)", () => {
    expect(close(drivePhase([1, 0, 0]), 0)).toBe(true);
    expect(close(drivePhase([0, 1, 0]), Math.PI / 2)).toBe(true);
  });
});

// ── stage classification ──────────────────────────────────────────────────────
describe("classifyStage", () => {
  it("returns IDLE when there is no result / no item", () => {
    const s = classifyStage(null, null, { hasResult: false });
    expect(s.stage).toBe(STAGE.IDLE);
    const s2 = classifyStage(null, [1, 0, 0], { hasResult: true });
    expect(s2.stage).toBe(STAGE.IDLE);
  });

  it("classifies a driven pulse from transverse field", () => {
    const s = classifyStage(
      { type: "pulse", pulse_shape: "square" },
      [2.0, 0, 0],
      { hasResult: true }
    );
    expect(s.stage).toBe(STAGE.PULSE);
    expect(s.detail).toContain("2.00");
  });

  it("treats a zero-amplitude pulse as free evolution", () => {
    const s = classifyStage({ type: "pulse" }, [0, 0, 1.5], { hasResult: true });
    expect(s.stage).toBe(STAGE.FREE);
  });

  it("classifies free evolution", () => {
    const s = classifyStage({ type: "free" }, [0, 0, 0.5], { hasResult: true });
    expect(s.stage).toBe(STAGE.FREE);
  });

  it("prefers MEASURE at the end when measurement is enabled", () => {
    const s = classifyStage(
      { type: "pulse" }, [2, 0, 0],
      { hasResult: true, atEnd: true, measurementEnabled: true }
    );
    expect(s.stage).toBe(STAGE.MEASURE);
  });

  it("does not go to MEASURE at the end when measurement is disabled", () => {
    const s = classifyStage(
      { type: "free" }, [0, 0, 0],
      { hasResult: true, atEnd: true, measurementEnabled: false }
    );
    expect(s.stage).toBe(STAGE.FREE);
  });
});

// ── emphasis ──────────────────────────────────────────────────────────────────
describe("emphasisForStage", () => {
  it("free evolution emphasizes B0, hides B1", () => {
    const e = emphasisForStage(STAGE.FREE);
    expect(e.b0).toBe(1.0);
    expect(e.b1).toBe(0.0);
  });

  it("pulse emphasizes B1 and Ω_eff, dims B0", () => {
    const e = emphasisForStage(STAGE.PULSE);
    expect(e.b1).toBe(1.0);
    expect(e.omegaEff).toBe(1.0);
    expect(e.b0).toBeLessThan(0.5);
  });

  it("measurement emphasizes the detector only", () => {
    const e = emphasisForStage(STAGE.MEASURE);
    expect(e.measure).toBe(1.0);
    expect(e.b1).toBe(0.0);
  });

  it("never shows B0, B1 and Ω_eff all at full weight together", () => {
    for (const st of [STAGE.IDLE, STAGE.FREE, STAGE.PULSE, STAGE.MEASURE]) {
      const e = emphasisForStage(st);
      const full = [e.b0, e.b1, e.omegaEff].filter(w => w >= 0.9).length;
      expect(full).toBeLessThanOrEqual(2); // at most B1+Ω_eff together (same pulse axis)
    }
  });
});

// ── physical caption ──────────────────────────────────────────────────────────
describe("physicalCaption", () => {
  it("gives a plain-language phrase per stage", () => {
    expect(physicalCaption(STAGE.PULSE)).toMatch(/RF pulse/i);
    expect(physicalCaption(STAGE.FREE)).toMatch(/precession/i);
    expect(physicalCaption(STAGE.MEASURE)).toBe("Measurement");
    expect(physicalCaption(STAGE.IDLE)).toMatch(/ready/i);
  });
});

// ── measurement ───────────────────────────────────────────────────────────────
describe("measurementProbabilities", () => {
  it("Z basis matches backend pop0/pop1 exactly", () => {
    const z = 0.6;
    const r = measurementProbabilities([0, 0, z], "z");
    expect(close(r.pPlus, (1 + z) / 2)).toBe(true);   // pop0
    expect(close(r.pMinus, (1 - z) / 2)).toBe(true);  // pop1
  });

  it("projects onto the X axis for an X-eigenstate", () => {
    const r = measurementProbabilities([1, 0, 0], "x");
    expect(close(r.pPlus, 1)).toBe(true);
    expect(close(r.pMinus, 0)).toBe(true);
  });

  it("gives 50/50 for a state orthogonal to the basis", () => {
    const r = measurementProbabilities([0, 0, 1], "x"); // |0> measured in X
    expect(close(r.pPlus, 0.5)).toBe(true);
    expect(close(r.pMinus, 0.5)).toBe(true);
  });

  it("probabilities always sum to 1 and stay in [0,1]", () => {
    for (const ax of ["x", "y", "z"]) {
      const r = measurementProbabilities([0.3, -0.4, 0.5], ax);
      expect(close(r.pPlus + r.pMinus, 1)).toBe(true);
      expect(r.pPlus).toBeGreaterThanOrEqual(0);
      expect(r.pPlus).toBeLessThanOrEqual(1);
    }
  });

  it("exposes the standard basis axes", () => {
    expect(MEASURE_AXES.z).toEqual([0, 0, 1]);
    expect(MEASURE_AXES.x).toEqual([1, 0, 0]);
    expect(MEASURE_AXES.y).toEqual([0, 1, 0]);
  });
});

// ── formatting ────────────────────────────────────────────────────────────────
describe("formatting", () => {
  it("formatTime handles seconds and null", () => {
    expect(formatTime(1.2345)).toBe("1.234 s");
    expect(formatTime(null)).toBe("—");
  });

  it("formatScaleFactor labels slower vs faster", () => {
    expect(formatScaleFactor(5)).toBe("5× slower");
    expect(formatScaleFactor(0.5)).toBe("2× faster");
    expect(formatScaleFactor(null)).toBe("—");
  });
});
