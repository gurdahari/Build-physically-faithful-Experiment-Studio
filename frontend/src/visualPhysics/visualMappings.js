/**
 * Maps physical backend data to visual properties for the 3D scene.
 *
 * Each function returns a descriptor that a visual component can render
 * without containing any quantum physics logic.  When data is unavailable
 * from the backend, `available: false` is returned — components MUST check
 * this and must not fall back to invented values.
 */

import { VIS_MODES, FRAMES, FIELD_IDS, SCALE_TYPE } from "./visualizationTypes.js";
import { ARROW_DISPLAY_LENGTH, normalizeVec } from "./visualScales.js";
import { toEffectiveFrame, vecMagnitude } from "./frameTransforms.js";

// ── Mode configuration ────────────────────────────────────────────────────────

/**
 * Which visual elements are active for a given visualization mode.
 * Components must respect these flags; they must not render elements
 * that are not authorized by the current mode.
 *
 * @param {string} visMode - VIS_MODES constant
 * @returns {object} feature flags
 */
export function getModeConfig(visMode) {
  const isPhysics    = visMode === VIS_MODES.PHYSICS || visMode === VIS_MODES.DIAGNOSTIC;
  const isDiagnostic = visMode === VIS_MODES.DIAGNOSTIC;
  return {
    showB0:         isPhysics,
    showB1:         isPhysics,
    showOmegaEff:   isPhysics,
    showDetuning:   isDiagnostic,
    showScaleBadge: isPhysics,
    showLegend:     isPhysics,
    showWhy:        true,
    showIdealPath:  isDiagnostic,
    showNumerics:   isDiagnostic,
  };
}

// ── Per-field visual descriptors ──────────────────────────────────────────────

/**
 * B0 — static longitudinal field along +Z.
 * In the rotating frame, B0 is the residual static field along the quantization
 * axis.  It is always along +Z regardless of the sequence step.
 *
 * @param {string} visFrame - current reference frame
 * @returns {object} visual descriptor
 */
export function mapB0ToVisual(visFrame) {
  // In the effective-field frame, B0 is transformed along with the scene.
  // We still draw it at [0,0,1] in rotating/lab frames.
  const direction = visFrame === FRAMES.EFFECTIVE ? [0, 0, 1] : [0, 0, 1];
  return {
    fieldId:       FIELD_IDS.B0,
    available:     true,
    direction,
    visualLength:  ARROW_DISPLAY_LENGTH,
    color:         "#5096ff",
    label:         "B₀",
    scaleType:     SCALE_TYPE.NORMALIZED,
    physicalInfo:  "Static field along quantization axis (+Z)",
    frameDependent: false,
  };
}

/**
 * B1(t) — transverse drive field in the XY plane.
 * Derived from the backend's field_trajectory entry: [Ωx(t), Ωy(t), Δ].
 * The XY component magnitude is |Ω(t)| and the direction is at phase φ.
 *
 * @param {number[] | null} fieldVec - [Ωx, Ωy, Δ] from backend at current t
 * @param {string} visFrame
 * @returns {object} visual descriptor
 */
export function mapB1ToVisual(fieldVec, visFrame) {
  if (!fieldVec) {
    return { fieldId: FIELD_IDS.B1, available: false, reason: "No field_trajectory from backend" };
  }

  const [fx, fy] = fieldVec;
  const transAmp = Math.sqrt(fx * fx + fy * fy);

  if (transAmp < 1e-12) {
    return { fieldId: FIELD_IDS.B1, available: false, reason: "Drive amplitude is zero (free evolution)" };
  }

  const direction = [fx / transAmp, fy / transAmp, 0];

  return {
    fieldId:          FIELD_IDS.B1,
    available:        true,
    direction,
    visualLength:     ARROW_DISPLAY_LENGTH * 0.80,
    color:            "#40c8e0",
    label:            "B₁(t)",
    scaleType:        SCALE_TYPE.NORMALIZED,
    physicalMagnitude: transAmp,
    physicalInfo:     `Rabi amplitude |Ω| = ${transAmp.toFixed(3)} rad/s`,
    frameDependent:   true,
  };
}

/**
 * Ω_eff — effective field = (Ωcosφ, Ωsinφ, Δ).
 * The rotation axis in the rotating frame.  Returned from backend's
 * field_trajectory as [Ωx, Ωy, Δ] exactly.
 *
 * @param {number[] | null} fieldVec - [Ωx, Ωy, Δ] from backend
 * @returns {object} visual descriptor
 */
export function mapOmegaEffToVisual(fieldVec) {
  if (!fieldVec) {
    return { fieldId: FIELD_IDS.OMEGA_EFF, available: false, reason: "No field_trajectory from backend" };
  }

  const [fx, fy, fz] = fieldVec;
  const mag = Math.sqrt(fx * fx + fy * fy + fz * fz);

  if (mag < 1e-12) {
    return { fieldId: FIELD_IDS.OMEGA_EFF, available: false, reason: "Zero effective field (all components = 0)" };
  }

  return {
    fieldId:          FIELD_IDS.OMEGA_EFF,
    available:        true,
    direction:        [fx / mag, fy / mag, fz / mag],
    visualLength:     ARROW_DISPLAY_LENGTH * 1.05,
    color:            "#ff9040",
    label:            "Ω_eff",
    scaleType:        SCALE_TYPE.NORMALIZED,
    physicalMagnitude: mag,
    physicalInfo:     `|Ω_eff| = ${mag.toFixed(3)} rad/s = √(|Ω|² + Δ²)`,
    frameDependent:   false,
  };
}

/**
 * Detuning component — pure Δ along Z (Diagnostic mode only).
 *
 * @param {number[] | null} fieldVec
 * @returns {object} visual descriptor
 */
export function mapDetuningToVisual(fieldVec) {
  if (!fieldVec) {
    return { fieldId: FIELD_IDS.DETUNING, available: false, reason: "No field_trajectory from backend" };
  }
  const [, , fz] = fieldVec;
  if (Math.abs(fz) < 1e-12) {
    return { fieldId: FIELD_IDS.DETUNING, available: false, reason: "Detuning is zero" };
  }
  const direction = fz >= 0 ? [0, 0, 1] : [0, 0, -1];
  const absLen    = Math.min(ARROW_DISPLAY_LENGTH * 0.65, Math.abs(fz) * 0.3 + 0.15);
  return {
    fieldId:          FIELD_IDS.DETUNING,
    available:        true,
    direction,
    visualLength:     absLen,
    color:            "#bb88ff",
    label:            "Δ",
    scaleType:        SCALE_TYPE.NORMALIZED,
    physicalMagnitude: Math.abs(fz),
    physicalInfo:     `Detuning Δ = ${fz.toFixed(3)} rad/s`,
    frameDependent:   false,
  };
}

// ── Frame labels and warnings ─────────────────────────────────────────────────

export function getFrameLabel(frame) {
  switch (frame) {
    case FRAMES.ROTATING:  return "Rotating frame";
    case FRAMES.LAB:       return "Lab frame (visual)";
    case FRAMES.EFFECTIVE: return "Effective-field frame";
    default: return frame;
  }
}

export function getFrameWarning(frame) {
  switch (frame) {
    case FRAMES.LAB:
      return "Lab-frame view uses a visually slowed carrier — actual microwave/optical carrier is far too fast to animate.";
    case FRAMES.EFFECTIVE:
      return "Scene rotated so Ω_eff → Z axis.  Bloch rotation about Ω_eff now appears as rotation about Z.";
    default:
      return null;
  }
}

// ── Mode descriptions (for 'Why am I seeing this?' panel) ────────────────────

export function getModeDescription(visMode) {
  switch (visMode) {
    case VIS_MODES.CONCEPT:
      return {
        title: "Concept mode",
        body:  "Shows only the Bloch vector — the minimum needed to understand the quantum state.  Use Physics mode to see the fields driving the evolution.",
      };
    case VIS_MODES.PHYSICS:
      return {
        title: "Physics mode",
        body:  "Adds field arrows (B₀, B₁, Ω_eff) sourced directly from the backend's field_trajectory.  Arrow lengths are normalized to fit the unit sphere — not to scale.  See the scale badge for physical values.",
      };
    case VIS_MODES.DIAGNOSTIC:
      return {
        title: "Diagnostic mode",
        body:  "Full overlay: field arrows + detuning component + ideal/decohering comparison path + numerical labels from the backend trajectory arrays.",
      };
    default: return { title: visMode, body: "" };
  }
}

// ── Missing-data placeholder ──────────────────────────────────────────────────

/**
 * Returns a standardized descriptor for a field that has no backend data.
 * Visual components MUST not invent values when a field is unavailable.
 */
export function getMissingDataDescriptor(fieldId, reason) {
  return {
    fieldId,
    available: false,
    reason:    reason ?? `${fieldId}: not returned by current backend request`,
  };
}
