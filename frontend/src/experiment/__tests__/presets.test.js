/**
 * Tests for named experiment presets — they must produce valid requests for the
 * existing QuTiP experiment endpoint (no new engine).
 */

import { describe, it, expect } from "vitest";
import { PRESETS, PRESET_LIST } from "../presets.js";

const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);

// Mirror of the backend ExperimentSequenceItem contract.
function validItem(it) {
  if (it.type === "pulse") {
    return ["square", "gaussian"].includes(it.pulse_shape)
      && isFiniteNum(it.amplitude) && isFiniteNum(it.phase)
      && isFiniteNum(it.detuning) && isFiniteNum(it.duration) && it.duration > 0;
  }
  if (it.type === "free") {
    return isFiniteNum(it.omega0) && isFiniteNum(it.duration) && it.duration > 0;
  }
  return false;
}

describe("presets", () => {
  it("exposes the four named experiments", () => {
    expect(Object.keys(PRESETS).sort()).toEqual(["echo", "fid", "rabi", "ramsey"]);
    expect(PRESET_LIST.length).toBe(4);
  });

  it("each preset has name, description, initial state, and a non-empty sequence", () => {
    for (const p of PRESET_LIST) {
      expect(typeof p.name).toBe("string");
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.description).toBe("string");
      expect(p.description.length).toBeGreaterThan(0);
      expect(["|0⟩", "|1⟩", "|+⟩", "Custom"]).toContain(p.initKey);
      expect(Array.isArray(p.sequence)).toBe(true);
      expect(p.sequence.length).toBeGreaterThan(0);
      expect(p.sequence.length).toBeLessThanOrEqual(50); // backend max
    }
  });

  it("every sequence item is a valid backend request item", () => {
    for (const p of PRESET_LIST) {
      for (const it of p.sequence) {
        expect(validItem(it)).toBe(true);
      }
    }
  });

  it("decoherence config respects T2 ≤ 2·T1 when enabled", () => {
    for (const p of PRESET_LIST) {
      const d = p.decoherence;
      if (d?.enabled) expect(d.T2).toBeLessThanOrEqual(2 * d.T1 + 1e-9);
    }
  });

  it("Ramsey and echo use canonical pulse phases (X/Y)", () => {
    // Ramsey: two X π/2 around a free evolution.
    const ramsey = PRESETS.ramsey.sequence;
    expect(ramsey[0].phase).toBe(0);
    expect(ramsey[2].phase).toBe(0);
    // Echo: refocusing pulse is a Y pulse.
    const echo = PRESETS.echo.sequence;
    const yPulse = echo.find(it => it.type === "pulse" && Math.abs(it.phase - Math.PI / 2) < 1e-9);
    expect(yPulse).toBeTruthy();
  });
});
