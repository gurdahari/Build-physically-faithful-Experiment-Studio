/**
 * stageModel — pure-JS mapping from backend experiment data to the current
 * "experiment stage" and the context-aware visual emphasis of each physical
 * object.  Contains NO quantum physics: it only classifies which sequence
 * item is active and derives display-only quantities (Born-rule projection of
 * an already-computed Bloch vector, effective-field magnitude, etc.).
 *
 * Every value here is derived from authoritative backend arrays
 * (`item_index`, `field_trajectory`, `trajectory`) or the user's sequence
 * configuration — never invented.
 *
 * See docs/EXPERIMENT_STUDIO.md for the full quantity → source → visual table.
 */

// ── Stage constants ───────────────────────────────────────────────────────────
export const STAGE = Object.freeze({
  IDLE:    "idle",     // no result yet / not started
  FREE:    "free",     // free evolution (B0-dominated precession / relaxation)
  PULSE:   "pulse",    // driven pulse (B1 / Ω_eff active)
  MEASURE: "measure",  // detector reads the final state
});

const TRANSVERSE_EPS = 1e-9;

// ── Small vector helpers (display math only) ─────────────────────────────────
export function hypot3(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }

/** Transverse drive magnitude |(Ωx,Ωy)| from a backend field vector. */
export function transverseAmplitude(field) {
  if (!field) return 0;
  return Math.hypot(field[0] ?? 0, field[1] ?? 0);
}

/** |Ω_eff| = √(Ωx²+Ωy²+Δ²) from a backend field vector [Ωx,Ωy,Δ]. */
export function effectiveFieldMagnitude(field) {
  if (!field) return 0;
  return hypot3(field[0] ?? 0, field[1] ?? 0, field[2] ?? 0);
}

/** Drive phase φ = atan2(Ωy, Ωx) — the direction of B1 in the XY plane. */
export function drivePhase(field) {
  if (!field) return 0;
  return Math.atan2(field[1] ?? 0, field[0] ?? 0);
}

// ── Stage classification ──────────────────────────────────────────────────────
/**
 * Classify the active experiment stage.
 *
 * @param {object|null} item   sequence config item ({type:'pulse'|'free', ...}) or null
 * @param {number[]|null} field backend field_trajectory[i] = [Ωx,Ωy,Δ]
 * @param {object} opts
 * @param {boolean} opts.atEnd  playhead is at the final trajectory point
 * @param {boolean} opts.measurementEnabled detector configured to read out
 * @param {boolean} opts.hasResult a backend result exists
 * @returns {{stage:string,label:string,detail:string}}
 */
export function classifyStage(item, field, { atEnd = false, measurementEnabled = false, hasResult = false } = {}) {
  if (!hasResult || !item) {
    return { stage: STAGE.IDLE, label: "Ready", detail: "Press Play to run the experiment" };
  }
  if (atEnd && measurementEnabled) {
    return { stage: STAGE.MEASURE, label: "Measurement", detail: "Detector reads the final state" };
  }

  // Prefer the configured item type; fall back to the backend field signature.
  const transverse = transverseAmplitude(field);
  const isPulse = item.type === "pulse" && transverse > TRANSVERSE_EPS;

  if (isPulse) {
    const shape = item.pulse_shape === "gaussian" ? "Gaussian" : "square";
    return {
      stage:  STAGE.PULSE,
      label:  "Drive pulse",
      detail: `${shape} pulse · |Ω| = ${transverse.toFixed(2)} rad/s`,
    };
  }
  // Free evolution (or a zero-amplitude pulse, which is physically free).
  const detuning = field ? Math.abs(field[2] ?? 0) : 0;
  return {
    stage:  STAGE.FREE,
    label:  "Free evolution",
    detail: detuning > TRANSVERSE_EPS
      ? `Precession about B₀ · Δ = ${(field[2]).toFixed(2)} rad/s`
      : "Idle precession / relaxation about B₀",
  };
}

// ── Context-aware visual emphasis ─────────────────────────────────────────────
/**
 * Weight ∈ [0,1] for each physical object given the active stage.  Components
 * multiply opacity / arrow presence by these weights so only the physically
 * relevant object is prominent (req: "de-emphasize or hide inactive vectors").
 *
 * @param {string} stage STAGE constant
 * @returns {{b0:number,b1:number,omegaEff:number,measure:number}}
 */
export function emphasisForStage(stage) {
  switch (stage) {
    case STAGE.PULSE:   return { b0: 0.18, b1: 1.0,  omegaEff: 1.0,  measure: 0.0 };
    case STAGE.FREE:    return { b0: 1.0,  b1: 0.0,  omegaEff: 0.28, measure: 0.0 };
    case STAGE.MEASURE: return { b0: 0.20, b1: 0.0,  omegaEff: 0.0,  measure: 1.0 };
    case STAGE.IDLE:
    default:            return { b0: 0.55, b1: 0.0,  omegaEff: 0.0,  measure: 0.0 };
  }
}

// ── Measurement (declared display-only projection of backend Bloch vector) ────
export const MEASURE_AXES = Object.freeze({
  z: [0, 0, 1],
  x: [1, 0, 0],
  y: [0, 1, 0],
});

/**
 * Born-rule outcome probabilities for a projective measurement along `axis`,
 * computed from the ALREADY-COMPUTED backend Bloch vector:
 *
 *     P(+n̂) = (1 + r·n̂) / 2 ,   P(−n̂) = (1 − r·n̂) / 2
 *
 * For the Z axis this equals the backend's pop0 / pop1 exactly.  X and Y are a
 * declared projection of the same backend vector (labeled "derived"), not an
 * independent physics computation.
 *
 * @param {number[]} bloch backend Bloch vector [x,y,z]
 * @param {string} axisKey 'x' | 'y' | 'z'
 * @returns {{pPlus:number,pMinus:number,axis:number[],projection:number}}
 */
export function measurementProbabilities(bloch, axisKey = "z") {
  const axis = MEASURE_AXES[axisKey] ?? MEASURE_AXES.z;
  const [x, y, z] = bloch ?? [0, 0, 0];
  const proj = x * axis[0] + y * axis[1] + z * axis[2];
  const clamped = Math.max(-1, Math.min(1, proj));
  return {
    pPlus:  (1 + clamped) / 2,
    pMinus: (1 - clamped) / 2,
    axis,
    projection: clamped,
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────
export function formatTime(t) {
  if (t == null || !isFinite(t)) return "—";
  if (Math.abs(t) < 1e-3 && t !== 0) return `${(t * 1e3).toFixed(1)} ms`;
  return `${t.toFixed(3)} s`;
}

export function formatScaleFactor(scaleFactor) {
  if (scaleFactor == null || !isFinite(scaleFactor)) return "—";
  return scaleFactor >= 1
    ? `${scaleFactor.toFixed(0)}× slower`
    : `${(1 / scaleFactor).toFixed(0)}× faster`;
}
