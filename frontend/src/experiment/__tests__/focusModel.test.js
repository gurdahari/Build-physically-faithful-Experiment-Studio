/**
 * Tests for object-focused inspection (focusModel) + structural guards ensuring
 * exactly one contextual card is rendered and no new permanent controls appear.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FOCUS_IDS, DEFAULT_CAMERA, focusCameraConfig, focusTitle, focusCardFields,
  focusFraming, focusFade, nextFocus, focusLevelLabel,
} from "../focusModel.js";

const here = dirname(fileURLToPath(import.meta.url));
const srcOf = (f) => readFileSync(join(here, "..", f), "utf8");

// ── Each object can be focused (has a camera framing + card) ─────────────────
describe("focusCameraConfig", () => {
  it("gives a distinct framing for each of the four objects", () => {
    expect(FOCUS_IDS).toEqual(["system", "drive", "sample", "detector"]);
    const dists = FOCUS_IDS.map(id => focusCameraConfig(id).distance);
    for (const id of FOCUS_IDS) {
      const cfg = focusCameraConfig(id);
      expect(Array.isArray(cfg.target)).toBe(true);
      expect(cfg.target.length).toBe(3);
      expect(cfg.distance).toBeGreaterThan(0.9);
      // Substantially closer than the default framing.
      expect(cfg.distance).toBeLessThan(DEFAULT_CAMERA.distance * 0.7);
    }
    // Framings are not all identical (they actually move the camera).
    expect(new Set(dists).size).toBeGreaterThan(1);
  });

  it("keeps the sample in view (targets stay near the origin/sample)", () => {
    for (const id of FOCUS_IDS) {
      const t = focusCameraConfig(id).target;
      expect(Math.hypot(t[0], t[1], t[2])).toBeLessThan(0.8);
    }
  });

  it("null / unknown returns the DEFAULT framing (camera returns)", () => {
    expect(focusCameraConfig(null)).toEqual(DEFAULT_CAMERA);
    expect(focusCameraConfig("nope")).toEqual(DEFAULT_CAMERA);
    expect(DEFAULT_CAMERA.target).toEqual([0, 0, 0]);
  });
});

// ── Contextual card fields per object ────────────────────────────────────────
describe("focusCardFields", () => {
  const data = {
    bloch: [0.6, 0, 0.8], field: [1.5, 0.5, 0.2], driveMagnitude: 1.58,
    pulseAxis: "X", signalMagnitude: 0.42, signalPhase: -1.2,
    measurementActive: false, measurementOutcome: null, uniformField: true,
  };

  it("magnet: B0 direction + uniform/varying", () => {
    const rows = focusCardFields("system", data);
    const text = rows.flat().join(" ");
    expect(text).toMatch(/B₀/);
    expect(text).toMatch(/\+Z/);
    expect(text).toMatch(/uniform/);
  });

  it("RF coil: X/Y quadrature channels, axis, envelope", () => {
    const rows = focusCardFields("drive", data);
    const labels = rows.map(r => r[0]).join(" ");
    expect(labels).toMatch(/Ωx/);
    expect(labels).toMatch(/Ωy/);
    expect(labels).toMatch(/axis/i);
    expect(labels).toMatch(/Envelope/i);
    // Values come from the backend field vector.
    expect(rows.find(r => r[0].includes("Ωx"))[1]).toContain("1.50");
    expect(rows.find(r => r[0].includes("Ωy"))[1]).toContain("0.50");
  });

  it("sample: magnetization, |r|, coherence, populations, local field", () => {
    const rows = focusCardFields("sample", data);
    const labels = rows.map(r => r[0]).join(" ");
    expect(labels).toMatch(/Magnetization/);
    expect(labels).toMatch(/\|r\|/);
    expect(labels).toMatch(/Coherence/);
    expect(labels).toMatch(/P\(0\)/);
    expect(labels).toMatch(/Local field/);
    // |r| = 1 for this pure state.
    expect(rows.find(r => r[0] === "|r|")[1]).toBe("1.000");
  });

  it("detector: continuous acquisition shows |S| and phase", () => {
    const rows = focusCardFields("detector", data);
    const text = rows.flat().join(" ");
    expect(text).toMatch(/continuous acquisition/);
    expect(text).toMatch(/0.420/);           // signal magnitude
    expect(text).toMatch(/-1.20 rad/);
  });

  it("detector: projective measurement shows the backend outcome (distinct mode)", () => {
    const rows = focusCardFields("detector", {
      ...data, measurementActive: true,
      measurementOutcome: { label: "|0⟩", p: 0.85, basis: "z" },
    });
    const text = rows.flat().join(" ");
    expect(text).toMatch(/projective measurement/);
    expect(text).toMatch(/\|0⟩/);
    expect(text).not.toMatch(/continuous/);   // acquisition vs projective are distinct
  });

  it("unknown object → no rows", () => {
    expect(focusCardFields("nope", data)).toEqual([]);
  });
});

// ── Two focus levels: close-up vs macro ──────────────────────────────────────
describe("focusFraming (close-up vs macro)", () => {
  it("macro is substantially closer than close-up for every object", () => {
    for (const id of FOCUS_IDS) {
      const close = focusFraming(id, 1);
      const macro = focusFraming(id, 2);
      expect(macro.distance).toBeLessThan(close.distance);
      // and both closer than the default framing
      expect(close.distance).toBeLessThan(DEFAULT_CAMERA.distance);
    }
  });

  it("macro distance never enters the object (≥ per-object minDistance)", () => {
    for (const id of FOCUS_IDS) {
      const macro = focusFraming(id, 2);
      expect(macro.distance).toBeGreaterThanOrEqual(macro.minDistance);
      expect(macro.near).toBeGreaterThan(0.02);   // not an excessively small near plane
    }
  });

  it("exposes explicit per-object config fields", () => {
    for (const id of FOCUS_IDS) {
      const f = focusFraming(id, 1);
      expect(f).toHaveProperty("target");
      expect(f).toHaveProperty("distance");
      expect(f).toHaveProperty("near");
      expect(f).toHaveProperty("minDistance");
      expect(f).toHaveProperty("direction");   // may be null (optional)
    }
    // At least one object uses an explicit viewing direction.
    expect(FOCUS_IDS.some(id => focusFraming(id, 1).direction)).toBe(true);
  });
});

// ── Focus-level state machine ────────────────────────────────────────────────
describe("nextFocus", () => {
  it("first click on an object enters Close-up (level 1)", () => {
    expect(nextFocus({ object: null, level: 0 }, "sample")).toEqual({ object: "sample", level: 1 });
  });
  it("second click on the same object enters Macro (level 2)", () => {
    expect(nextFocus({ object: "sample", level: 1 }, "sample")).toEqual({ object: "sample", level: 2 });
  });
  it("further clicks stay at Macro (capped at 2)", () => {
    expect(nextFocus({ object: "sample", level: 2 }, "sample")).toEqual({ object: "sample", level: 2 });
  });
  it("clicking a different object resets to that object's Close-up", () => {
    expect(nextFocus({ object: "sample", level: 2 }, "detector")).toEqual({ object: "detector", level: 1 });
  });
  it("null click exits focus (both levels)", () => {
    expect(nextFocus({ object: "sample", level: 2 }, null)).toEqual({ object: null, level: 0 });
  });
});

// ── Contextual fade rules ────────────────────────────────────────────────────
describe("focusFade", () => {
  it("the focused object is always fully opaque", () => {
    for (const id of FOCUS_IDS) {
      expect(focusFade(id, 1)[id]).toBe(1);
      expect(focusFade(id, 2)[id]).toBe(1);
    }
  });
  it("unrelated apparatus fades MORE at macro than at close-up", () => {
    // Detector is unrelated to the magnet; it should fade further at macro.
    expect(focusFade("system", 2).detector).toBeLessThan(focusFade("system", 1).detector);
    // RF is unrelated to the magnet inspection; strongly faded at macro.
    expect(focusFade("system", 2).drive).toBeLessThan(focusFade("system", 1).drive);
  });
  it("never fully hides an object needed to understand the interaction", () => {
    for (const id of FOCUS_IDS) {
      for (const lvl of [1, 2]) {
        for (const v of Object.values(focusFade(id, lvl))) expect(v).toBeGreaterThan(0.1);
      }
    }
  });
  it("unknown object → no fade", () => {
    expect(focusFade("nope", 2)).toEqual({ system: 1, drive: 1, sample: 1, detector: 1 });
  });
});

describe("focusLevelLabel", () => {
  it("labels the two levels", () => {
    expect(focusLevelLabel(1)).toBe("Close-up");
    expect(focusLevelLabel(2)).toBe("Macro close-up");
  });
});

// ── Structural guards ─────────────────────────────────────────────────────────
describe("focus wiring guards", () => {
  it("only one contextual focus card can be rendered (gated on focusedObject)", () => {
    const src = srcOf("ExperimentStudio.jsx");
    // FocusCard is rendered exactly once, conditional on focusedObject.
    const matches = src.match(/<FocusCard/g) ?? [];
    expect(matches.length).toBe(1);
    expect(/focusedObject \? \(/.test(src)).toBe(true);
  });

  it("Escape and empty-space and Back all return to the default framing", () => {
    const src = srcOf("ExperimentStudio.jsx");
    expect(/e\.key === "Escape"/.test(src)).toBe(true);   // keyboard
    expect(/onBack=\{clearFocus\}/.test(src)).toBe(true); // Back control
    expect(/clearFocus/.test(src)).toBe(true);            // empty-space via selectObject(null)
  });

  it("focusing does not pause playback (no pause call in the focus path)", () => {
    const src = srcOf("ExperimentStudio.jsx");
    // selectObject only sets selection/focus; it must not call pause().
    const selectObjectBody = src.slice(src.indexOf("const selectObject"), src.indexOf("const selectItem"));
    expect(/pause\(/.test(selectObjectBody)).toBe(false);
  });

  it("FocusCard shows the current focus level", () => {
    const src = srcOf("FocusCard.jsx");
    expect(/focusLevelLabel\(level\)/.test(src)).toBe(true);
    expect(/data-testid="focus-level"/.test(src)).toBe(true);
    // Studio passes the level down.
    expect(/level=\{focusLevel\}/.test(srcOf("ExperimentStudio.jsx"))).toBe(true);
  });

  it("manual object focus overrides automatic pulse framing", () => {
    const src = srcOf("PhysicalLabScene.jsx");
    // framing is derived from focusedObject first; pulse close-up is the fallback.
    expect(/focusedObject \? focusFraming\(focusedObject, focusLevel\)/.test(src)).toBe(true);
    expect(/framing \? framing\.distance : \(closeup \? CAMERA_DIST\.near/.test(src)).toBe(true);
    // OrbitControls minDistance drops while focused so the rig can dolly in.
    expect(/minDistance=\{minDist\}/.test(src)).toBe(true);
  });

  it("contextual fade is threaded into each apparatus component", () => {
    const src = srcOf("PhysicalLabScene.jsx");
    expect(/fade=\{fade\?\.system \?\? 1\}/.test(src)).toBe(true);
    expect(/fade=\{fade\?\.drive \?\? 1\}/.test(src)).toBe(true);
    expect(/fade=\{fade\?\.sample \?\? 1\}/.test(src)).toBe(true);
    expect(/fade=\{fade\?\.detector \?\? 1\}/.test(src)).toBe(true);
  });
});
