/**
 * focusModel — pure-JS support for two-level object-focused inspection in the
 * Physical Lab (Close-up → Macro close-up).
 *
 * Provides, for each selectable object (magnet · quadrature RF coil · sample ·
 * detector): explicit per-object camera framing at two levels (target offset,
 * distance, optional viewing direction, near plane, min distance) and contextual
 * fade multipliers for the other apparatus.  The effect is achieved ONLY through
 * the camera + OrbitControls + object opacity — physical objects are never
 * enlarged or rescaled.
 *
 * The contextual card rows are built ONLY from values the backend already
 * produced at the current playIndex — no physics is computed here.
 */

// Object ids match the Selectable ids used in PhysicalLabScene.
export const FOCUS_IDS = ["system", "drive", "sample", "detector"];

export const DEFAULT_NEAR = 0.1;
export const DEFAULT_CAMERA = Object.freeze({ target: [0, 0, 0], distance: 3.95 });

function unit(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

/**
 * Explicit per-object framing.  Distances are chosen so the object fills roughly
 * 60–75 % of the viewport at Close-up and 80–90 % at Macro (perspective fov 45°),
 * while staying outside the object's geometry (macro distance ≥ minDistance).
 * Targets stay near the sample/interaction region so context is preserved.
 */
const FRAMING = {
  // Magnet: frame a pole face + the sample region; macro inspects the pole/sample gap.
  system: {
    close:     { target: [0, 0, 0.5],  distance: 1.9,  near: DEFAULT_NEAR },
    macro:     { target: [0, 0, 0.7],  distance: 1.15, near: DEFAULT_NEAR },
    direction: unit([1.1, 1.0, 0.7]),   // 3/4 elevated: shows pole + gap + sample
    minDistance: 1.0,                    // stay clear of the pole geometry
  },
  // Quadrature RF coil: coil + sample dominate; both channels + bore glyphs stay readable.
  drive: {
    close:     { target: [0, 0, 0.0],  distance: 1.5,  near: DEFAULT_NEAR },
    macro:     { target: [0, 0, 0.0],  distance: 1.0,  near: DEFAULT_NEAR },
    direction: null,                     // dolly along the user's current view
    minDistance: 0.7,                    // outside the coil rings (r≈0.3)
  },
  // Sample: vial + representative magnetization dominate; keep a little coil context.
  sample: {
    close:     { target: [0, 0, 0.0],  distance: 1.2,  near: DEFAULT_NEAR },
    macro:     { target: [0, 0, 0.0],  distance: 0.7,  near: DEFAULT_NEAR },
    direction: null,
    minDistance: 0.5,                    // outside the vial + magnetization arrow
  },
  // Detector: body + signal path dominate; keep the sample→detector path visible.
  detector: {
    close:     { target: [0, -0.55, 0], distance: 1.5, near: DEFAULT_NEAR },
    macro:     { target: [0, -0.72, 0], distance: 1.0, near: DEFAULT_NEAR },
    direction: unit([0.8, -1.0, 0.55]),  // front-side: sample→detector signal path
    minDistance: 0.6,
  },
};

/** Framing for a focus level (1 = close-up, 2 = macro). */
export function focusFraming(objectId, level) {
  const c = FRAMING[objectId];
  if (!c) return { target: [0, 0, 0], distance: DEFAULT_CAMERA.distance, near: DEFAULT_NEAR, direction: null, minDistance: 1.7 };
  const f = level >= 2 ? c.macro : c.close;
  return { target: f.target, distance: f.distance, near: f.near, direction: c.direction, minDistance: c.minDistance };
}

/** Backward-compatible close-level framing { target, distance }. */
export function focusCameraConfig(objectId) {
  const c = FRAMING[objectId];
  if (!c) return DEFAULT_CAMERA;
  return { target: c.close.target, distance: c.close.distance };
}

// ── Contextual fade (opacity multiplier per apparatus object) ────────────────
// close-up: unrelated objects remain faintly visible; macro: strongly faded but
// never hidden if required to understand the active physical interaction.
const FADE = {
  system:   { close: { system: 1, sample: 0.7, drive: 0.5, detector: 0.4 },
              macro: { system: 1, sample: 0.5, drive: 0.15, detector: 0.12 } },
  drive:    { close: { drive: 1, sample: 0.8, system: 0.5, detector: 0.4 },
              macro: { drive: 1, sample: 0.6, system: 0.2, detector: 0.12 } },
  sample:   { close: { sample: 1, drive: 0.7, system: 0.6, detector: 0.4 },
              macro: { sample: 1, drive: 0.45, system: 0.35, detector: 0.12 } },
  detector: { close: { detector: 1, sample: 0.6, drive: 0.4, system: 0.35 },
              macro: { detector: 1, sample: 0.4, drive: 0.15, system: 0.12 } },
};

const NO_FADE = { system: 1, drive: 1, sample: 1, detector: 1 };

export function focusFade(objectId, level) {
  const o = FADE[objectId];
  if (!o) return NO_FADE;
  return level >= 2 ? o.macro : o.close;
}

// ── Focus-level state transition (pure) ──────────────────────────────────────
// First click on an object → Close-up (1); second click on the SAME object →
// Macro (2); clicking a DIFFERENT object → that object's Close-up; null → exit.
export function nextFocus(current, clickedId) {
  const cur = current ?? { object: null, level: 0 };
  if (clickedId == null) return { object: null, level: 0 };
  if (cur.object === clickedId) return { object: clickedId, level: Math.min(2, (cur.level ?? 0) + 1) };
  return { object: clickedId, level: 1 };
}

export function focusLevelLabel(level) {
  return level >= 2 ? "Macro close-up" : "Close-up";
}

export function focusTitle(objectId) {
  return {
    system:   "Magnet — B₀ source",
    drive:    "Quadrature RF source",
    sample:   "Sample · magnetization",
    detector: "Detector",
  }[objectId] ?? "";
}

const f2 = (v) => (Number.isFinite(v) ? v : 0).toFixed(2);
const f3 = (v) => (Number.isFinite(v) ? v : 0).toFixed(3);

/**
 * Rows [label, value] for the focused object's contextual card.
 *
 * @param {string} objectId
 * @param {object} d  live, backend-synced values at the current playIndex.
 * @returns {[string,string][]}
 */
export function focusCardFields(objectId, d = {}) {
  switch (objectId) {
    case "system":
      return [
        ["B₀ direction", "+Z (quantization axis)"],
        ["Field", "static longitudinal (Ω rep.)"],
        ["Spatial", d.uniformField === false ? "spatially varying" : "spatially uniform"],
      ];

    case "drive": {
      const ox = d.field?.[0] ?? 0;
      const oy = d.field?.[1] ?? 0;
      return [
        ["X channel Ωx", `${f2(ox)} rad/s`],
        ["Y channel Ωy", `${f2(oy)} rad/s`],
        ["Pulse axis", d.pulseAxis ?? "—"],
        ["Envelope Ω(t)", `${f2(d.driveMagnitude)} rad/s`],
      ];
    }

    case "sample": {
      const [x, y, z] = d.bloch ?? [0, 0, 0];
      const r = Math.hypot(x, y, z);
      return [
        ["Magnetization", `(${f2(x)}, ${f2(y)}, ${f2(z)})`],
        ["|r|", f3(r)],
        ["Coherence", f3(Math.hypot(x, y))],
        ["P(0) / P(1)", `${f2((1 + z) / 2)} / ${f2((1 - z) / 2)}`],
        ["Local field", `(${f2(d.field?.[0] ?? 0)}, ${f2(d.field?.[1] ?? 0)}, ${f2(d.field?.[2] ?? 0)})`],
      ];
    }

    case "detector":
      if (d.measurementActive && d.measurementOutcome) {
        return [
          ["Mode", "projective measurement"],
          ["Outcome", d.measurementOutcome.label ?? "—"],
          ["p", f3(d.measurementOutcome.p ?? 0)],
        ];
      }
      return [
        ["Mode", "continuous acquisition"],
        ["Signal |S|", f3(d.signalMagnitude)],
        ["Phase φ", `${f2(d.signalPhase)} rad`],
      ];

    default:
      return [];
  }
}
