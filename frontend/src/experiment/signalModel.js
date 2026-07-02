/**
 * signalModel — pure-JS mapping from authoritative backend arrays to the
 * restrained visual properties of the live pulse field, the representative
 * state, the detector signal, and the close-up camera.
 *
 * Contains NO physics: it selects/normalizes values the backend already
 * computed (field_trajectory, trajectory, detector_signal_*) at a single
 * playIndex.  The frontend must never re-derive drive envelopes, spin dynamics,
 * or detector physics — those come from the backend.
 *
 * See docs/EXPERIMENT_STUDIO.md §"Scientific approximation contract".
 */

// ── Drive envelope (live pulse field) ─────────────────────────────────────────

/** Peak transverse drive |(Ωx,Ωy)| over a whole run — used to normalize arrows. */
export function maxTransverse(fieldTrajectory) {
  if (!fieldTrajectory || !fieldTrajectory.length) return 0;
  let m = 0;
  for (const f of fieldTrajectory) {
    const t = Math.hypot(f[0] ?? 0, f[1] ?? 0);
    if (t > m) m = t;
  }
  return m;
}

/**
 * Normalized drive level ∈ [0,1] at the current field sample.  For a Gaussian
 * pulse this rises then falls; for a square pulse it stays ~constant while the
 * pulse is on and is 0 otherwise.  Derived only from the backend field vector.
 */
export function driveLevel(field, maxDrive) {
  if (!field || !maxDrive || maxDrive < 1e-12) return 0;
  const t = Math.hypot(field[0] ?? 0, field[1] ?? 0);
  return Math.max(0, Math.min(1, t / maxDrive));
}

/** Unit direction of B₁ in the XY plane, from the backend field vector; null if off. */
export function b1Direction(field) {
  if (!field) return null;
  const t = Math.hypot(field[0] ?? 0, field[1] ?? 0);
  if (t < 1e-12) return null;
  return [field[0] / t, field[1] / t, 0];
}

// ── Detector signal (continuous acquisition) ─────────────────────────────────

/** Detector intensity ∈ [0,1] from the backend transverse-magnetization signal. */
export function detectorLevel(signalMagnitude) {
  if (signalMagnitude == null || !isFinite(signalMagnitude)) return 0;
  return Math.max(0, Math.min(1, signalMagnitude));
}

/** Quadrature phase of the detector signal (rad). */
export function signalPhase(signalReal, signalImag) {
  return Math.atan2(signalImag ?? 0, signalReal ?? 0);
}

// ── Representative state / ensemble magnetization ────────────────────────────

/**
 * Direction and (relaxation-aware) length of the representative magnetization
 * arrow shown inside the sample.  Direction = backend Bloch vector; length ∝
 * |r| so that decoherence (reduced |r|) shortens the coherent arrow — a
 * documented visual mapping, not independent spin dynamics.
 */
export function representativeArrow(bloch, scale = 0.24) {
  const [x, y, z] = bloch ?? [0, 0, 0];
  const mag = Math.hypot(x, y, z);
  if (mag < 1e-9) return { direction: [0, 0, 1], length: 0, mag: 0 };
  return { direction: [x / mag, y / mag, z / mag], length: mag * scale, mag };
}

// ── Close-up camera (stage-driven, not time-scripted) ────────────────────────

export const CAMERA_DIST = Object.freeze({ near: 2.75, far: 3.95 });

/**
 * Target camera distance for the current stage.  Only a PULSE stage (with
 * auto-close-up enabled) dollies in; every other stage returns to the normal
 * framing.  Purely a function of stage + preference — no elapsed-time scripting.
 */
export function cameraDistanceForStage(stage, autoCloseup, dist = CAMERA_DIST) {
  return autoCloseup && stage === "pulse" ? dist.near : dist.far;
}

// ── Single-index synchronization ─────────────────────────────────────────────

/**
 * Sample every physical quantity at ONE backend index.  All physical views
 * (lab scene, state space, timeline, detector) read from this same index, which
 * is what keeps them synchronized.
 */
export function sampleExperimentAtIndex(result, idx) {
  if (!result) return null;
  const n = result.trajectory.length;
  const i = Math.max(0, Math.min(n - 1, idx));
  return {
    index:           i,
    bloch:           result.trajectory[i],
    field:           result.field_trajectory?.[i] ?? null,
    signalReal:      result.detector_signal_real?.[i] ?? null,
    signalImag:      result.detector_signal_imag?.[i] ?? null,
    signalMagnitude: result.detector_signal_magnitude?.[i] ?? null,
    itemIndex:       result.item_index?.[i] ?? null,
    time:            result.times?.[i] ?? null,
  };
}
