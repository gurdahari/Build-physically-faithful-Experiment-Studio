/**
 * Tests for pulseModel — pulse-axis labeling, physical-operation classification,
 * drive-field units, and B₁ glyph strength — plus scene guards ensuring the
 * physical lab view never renders a mathematical Ω_eff and that the timeline and
 * stage caption share one pulse-axis source of truth.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  AXIS_TOL, pulseAxisVector, pulseAxisName, pulseAxisLabel, pulseTypeLabel,
  classifyPulseOperation, isRfActive, OP,
  driveFieldLabel, b1GlyphStrength, b1GlyphsVisible,
  axisToPhase, AXIS_PRESETS, quadratureChannels, pulseArea, pulseAngleLabel,
} from "../pulseModel.js";

const HALF_PI = Math.PI / 2;
const close = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const here = dirname(fileURLToPath(import.meta.url));
const srcOf = (f) => readFileSync(join(here, "..", f), "utf8");

// ── Canonical axis mapping ────────────────────────────────────────────────────
describe("pulseAxisName / pulseAxisLabel", () => {
  it("φ = 0 → X", () => { expect(pulseAxisName(0)).toBe("X"); expect(pulseAxisLabel(0)).toBe("X"); });
  it("φ = π/2 → Y", () => { expect(pulseAxisName(HALF_PI)).toBe("Y"); });
  it("φ = π → −X", () => { expect(pulseAxisName(Math.PI)).toBe("−X"); });
  it("φ = 3π/2 → −Y", () => { expect(pulseAxisName(3 * HALF_PI)).toBe("−Y"); });
  it("φ = 2π wraps back to X", () => { expect(pulseAxisName(2 * Math.PI)).toBe("X"); });

  it("snaps within tolerance", () => {
    expect(pulseAxisName(AXIS_TOL * 0.5)).toBe("X");
    expect(pulseAxisName(HALF_PI + AXIS_TOL * 0.5)).toBe("Y");
  });

  it("arbitrary phase → compact φ label, not a canonical name", () => {
    expect(pulseAxisName(0.30 * Math.PI)).toBeNull();
    expect(pulseAxisLabel(0.30 * Math.PI)).toBe("axis φ = 0.30π");
  });

  it("axis vector is [cosφ, sinφ, 0]", () => {
    const v = pulseAxisVector(HALF_PI);
    expect(close(v[0], 0)).toBe(true);
    expect(close(v[1], 1)).toBe(true);
    expect(v[2]).toBe(0);
  });
});

// ── Full pulse label (shape + axis) ──────────────────────────────────────────
describe("pulseTypeLabel", () => {
  it("names canonical pulses", () => {
    expect(pulseTypeLabel({ type: "pulse", pulse_shape: "gaussian", phase: 0 })).toBe("Gaussian X pulse");
    expect(pulseTypeLabel({ type: "pulse", pulse_shape: "square", phase: HALF_PI })).toBe("Square Y pulse");
    expect(pulseTypeLabel({ type: "pulse", pulse_shape: "gaussian", phase: Math.PI })).toBe("Gaussian −X pulse");
    expect(pulseTypeLabel({ type: "pulse", pulse_shape: "square", phase: 3 * HALF_PI })).toBe("Square −Y pulse");
  });
  it("uses a compact axis form for arbitrary phase", () => {
    expect(pulseTypeLabel({ type: "pulse", pulse_shape: "square", phase: 0.30 * Math.PI }))
      .toBe("Square pulse · axis φ = 0.30π");
  });
  it("returns empty for non-pulse items", () => {
    expect(pulseTypeLabel({ type: "free" })).toBe("");
    expect(pulseTypeLabel(null)).toBe("");
  });
});

// ── Operation classification (transverse vs longitudinal vs virtual Z) ───────
describe("classifyPulseOperation", () => {
  it("a real transverse pulse is RF_TRANSVERSE", () => {
    expect(classifyPulseOperation({ type: "pulse", amplitude: Math.PI, phase: 0 })).toBe(OP.RF_TRANSVERSE);
  });
  it("free evolution is longitudinal (physical σz precession)", () => {
    expect(classifyPulseOperation({ type: "free", omega0: 1 })).toBe(OP.LONGITUDINAL);
  });
  it("a zero-amplitude pulse with detuning is longitudinal, not RF", () => {
    expect(classifyPulseOperation({ type: "pulse", amplitude: 0, detuning: 1.5, phase: 0 })).toBe(OP.LONGITUDINAL);
  });
  it("a zero-amplitude, zero-detuning pulse is idle", () => {
    expect(classifyPulseOperation({ type: "pulse", amplitude: 0, detuning: 0 })).toBe(OP.IDLE);
  });
  it("a virtual-Z item is VIRTUAL_Z", () => {
    expect(classifyPulseOperation({ type: "virtual_z" })).toBe(OP.VIRTUAL_Z);
    expect(classifyPulseOperation({ type: "pulse", virtual_z: true, amplitude: 1 })).toBe(OP.VIRTUAL_Z);
  });
  it("null → idle", () => { expect(classifyPulseOperation(null)).toBe(OP.IDLE); });

  it("RF coil energy is active only for a transverse pulse", () => {
    expect(isRfActive(OP.RF_TRANSVERSE)).toBe(true);
    expect(isRfActive(OP.VIRTUAL_Z)).toBe(false);      // virtual Z → no coil glow / glyphs
    expect(isRfActive(OP.LONGITUDINAL)).toBe(false);
    expect(isRfActive(OP.IDLE)).toBe(false);
  });
});

// ── Drive-field units ─────────────────────────────────────────────────────────
describe("driveFieldLabel", () => {
  it("without γ shows angular-frequency units", () => {
    expect(driveFieldLabel(3.14159)).toBe("Ω = 3.14 rad/s");
    expect(driveFieldLabel(3.14159, null)).toBe("Ω = 3.14 rad/s");
  });
  it("with γ converts to a physical B₁ field", () => {
    // Ω = 1000 rad/s, γ = 1e6 rad/s/T → B₁ = 1e-3 T = 1.00 mT
    expect(driveFieldLabel(1000, 1e6)).toBe("B₁ = 1.00 mT");
    // Ω = 1 rad/s, γ = 1e6 → 1 µT
    expect(driveFieldLabel(1, 1e6)).toBe("B₁ = 1.00 µT");
  });
});

// ── B₁ glyphs ─────────────────────────────────────────────────────────────────
describe("b1 glyph mapping", () => {
  it("Gaussian glyph strength rises then falls", () => {
    const env = [0.1, 0.5, 1.0, 0.5, 0.1];
    const s = env.map(b1GlyphStrength);
    expect(s[2]).toBeGreaterThan(s[0]);
    expect(s[2]).toBeGreaterThan(s[4]);
  });
  it("square glyph strength stays constant while active", () => {
    const s = [1, 1, 1, 1].map(b1GlyphStrength);
    for (const v of s) expect(close(v, 1)).toBe(true);
  });
  it("zero transverse drive hides all B₁ glyphs", () => {
    expect(b1GlyphsVisible(0)).toBe(false);
    expect(b1GlyphsVisible(0.01)).toBe(false);
    expect(b1GlyphsVisible(0.5)).toBe(true);
    expect(b1GlyphStrength(0)).toBe(0);
  });
});

// ── Pulse-axis segmented control → phase ─────────────────────────────────────
describe("axisToPhase (segmented control mapping)", () => {
  it("maps canonical axes to the correct phase", () => {
    expect(axisToPhase("X")).toBe(0);
    expect(close(axisToPhase("Y"), Math.PI / 2)).toBe(true);
    expect(close(axisToPhase("−X"), Math.PI)).toBe(true);
    expect(close(axisToPhase("−Y"), 3 * Math.PI / 2)).toBe(true);
  });
  it("round-trips through pulseAxisName", () => {
    for (const name of AXIS_PRESETS) {
      expect(pulseAxisName(axisToPhase(name))).toBe(name);
    }
  });
  it("Custom / unknown → null (preserves an arbitrary φ)", () => {
    expect(axisToPhase("Custom")).toBeNull();
    // An arbitrary phase is not any canonical axis → the control shows Custom.
    expect(pulseAxisName(0.3 * Math.PI)).toBeNull();
  });
});

// ── Quadrature channels (fixed hardware; field from channel amplitudes) ──────
describe("quadratureChannels", () => {
  it("X pulse → X channel only", () => {
    const c = quadratureChannels(0);
    expect(close(c.x, 1)).toBe(true);
    expect(close(c.y, 0)).toBe(true);
  });
  it("Y pulse → Y channel only", () => {
    const c = quadratureChannels(Math.PI / 2);
    expect(close(c.x, 0)).toBe(true);
    expect(close(c.y, 1)).toBe(true);
  });
  it("−X pulse → negative X channel", () => {
    expect(close(quadratureChannels(Math.PI).x, -1)).toBe(true);
  });
  it("arbitrary phase drives both channels ∝ cos/sin", () => {
    const phi = 0.3 * Math.PI;
    const c = quadratureChannels(phi);
    expect(close(c.x, Math.cos(phi))).toBe(true);
    expect(close(c.y, Math.sin(phi))).toBe(true);
  });
  it("field direction = normalized channel vector = pulseAxisVector", () => {
    const phi = 0.7;
    const c = quadratureChannels(phi);
    const v = pulseAxisVector(phi);
    expect(close(c.x, v[0])).toBe(true);
    expect(close(c.y, v[1])).toBe(true);
  });
});

// ── Pulse area / angle labels ────────────────────────────────────────────────
describe("pulseArea / pulseAngleLabel", () => {
  it("square area = Ω·T", () => {
    expect(close(pulseArea({ type: "pulse", pulse_shape: "square", amplitude: Math.PI, duration: 1 }), Math.PI)).toBe(true);
    expect(close(pulseArea({ type: "pulse", pulse_shape: "square", amplitude: Math.PI / 2, duration: 1 }), Math.PI / 2)).toBe(true);
  });
  it("labels a genuine π/2 pulse", () => {
    expect(pulseAngleLabel({ type: "pulse", pulse_shape: "square", amplitude: Math.PI / 2, phase: 0, duration: 1 }))
      .toBe("X π/2 pulse");
  });
  it("does NOT call a sub-π pulse 'π' — shows the area instead", () => {
    const label = pulseAngleLabel({ type: "pulse", pulse_shape: "gaussian", amplitude: Math.PI, phase: 0, duration: 2, sigma: 0.3 });
    expect(label).toMatch(/area = /);
    expect(label).not.toMatch(/X π pulse/);
  });
});

// ── Scene guards (structural) ─────────────────────────────────────────────────
describe("physical lab scene guards", () => {
  it("PhysicalLabScene never renders a mathematical Ω_eff / effective field", () => {
    const src = srcOf("PhysicalLabScene.jsx");
    expect(/Ω_eff|omegaEff|effectiveField/i.test(src)).toBe(false);
  });

  it("timeline and stage caption share one pulse-axis source (pulseModel)", () => {
    expect(/from "\.\/pulseModel\.js"/.test(srcOf("ExperimentTimeline.jsx"))).toBe(true);
    expect(/from "\.\/pulseModel\.js"/.test(srcOf("ExperimentStudio.jsx"))).toBe(true);
    // Same helper drives both, so the label is identical for a given item.
    const item = { type: "pulse", pulse_shape: "gaussian", phase: Math.PI };
    expect(pulseAxisLabel(item.phase)).toBe("−X");
    expect(pulseTypeLabel(item)).toContain("−X");
  });

  it("RF hardware stays fixed when φ changes (quadrature channels drive the field)", () => {
    const src = srcOf("PhysicalLabScene.jsx");
    expect(/quadratureChannels\(phase\)/.test(src)).toBe(true);          // channel-based, not coil rotation
    expect(/rotation=\{\[0, Math\.PI \/ 2, 0\]\}/.test(src)).toBe(true);  // X-channel coil: fixed orientation
    expect(/rotation=\{\[Math\.PI \/ 2, 0, 0\]\}/.test(src)).toBe(true);  // Y-channel coil: fixed orientation
    expect(/rotation=\{\[0, 0, phase\]\}/.test(src)).toBe(true);          // only the FIELD rotates with φ
  });
});
