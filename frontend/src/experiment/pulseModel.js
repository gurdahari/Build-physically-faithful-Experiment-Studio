/**
 * pulseModel — pure-JS derivation of the pulse AXIS, the OPERATION KIND, and
 * the drive-field UNITS from the authoritative backend / sequence parameters.
 *
 * No physics: it only interprets the drive phase φ and amplitude that the
 * backend already uses in H_drive(t) ∝ Ω(t)[cosφ σx + sinφ σy] + Δ σz.
 *
 * Key distinctions this module encodes (see docs/EXPERIMENT_STUDIO.md):
 *   • transverse RF pulse  → a real B₁ field in the lab (X / Y / −X / −Y / arbitrary φ)
 *   • longitudinal control → Δ σz or free precession under B₀ (along lab Z)
 *   • virtual Z rotation   → a frame/phase update; NO physical B₁ field
 * A transverse pulse is never labeled a "Z pulse".
 */

const TWO_PI = 2 * Math.PI;

// Angular tolerance (rad) for snapping φ to a canonical axis (~3.4°).
export const AXIS_TOL = 0.06;

function norm2pi(p) { return ((p % TWO_PI) + TWO_PI) % TWO_PI; }
function nearAngle(a, b, tol = AXIS_TOL) {
  let d = Math.abs(a - b);
  d = Math.min(d, TWO_PI - d);
  return d <= tol;
}

// ── Pulse axis ────────────────────────────────────────────────────────────────

/** Transverse rotation axis n̂ = [cosφ, sinφ, 0] for the drive phase φ. */
export function pulseAxisVector(phase) {
  return [Math.cos(phase), Math.sin(phase), 0];
}

/** Canonical axis name for φ (X/Y/−X/−Y within tolerance), or null. */
export function pulseAxisName(phase) {
  const p = norm2pi(phase);
  if (nearAngle(p, 0) || nearAngle(p, TWO_PI)) return "X";
  if (nearAngle(p, Math.PI / 2)) return "Y";
  if (nearAngle(p, Math.PI)) return "−X";
  if (nearAngle(p, 3 * Math.PI / 2)) return "−Y";
  return null;
}

/** Human-readable axis: a canonical name, or a compact arbitrary-phase form. */
export function pulseAxisLabel(phase) {
  const name = pulseAxisName(phase);
  if (name) return name;
  return `axis φ = ${(norm2pi(phase) / Math.PI).toFixed(2)}π`;
}

/**
 * Full pulse label combining shape + axis:
 *   "Gaussian X pulse" · "Square Y pulse" · "Square pulse · axis φ = 0.30π".
 */
export function pulseTypeLabel(item) {
  if (!item || item.type !== "pulse") return "";
  const shape = item.pulse_shape === "gaussian" ? "Gaussian" : "Square";
  const name = pulseAxisName(item.phase ?? 0);
  if (name) return `${shape} ${name} pulse`;
  return `${shape} pulse · axis φ = ${(norm2pi(item.phase ?? 0) / Math.PI).toFixed(2)}π`;
}

// ── Axis presets (segmented control → phase) ─────────────────────────────────

export const AXIS_PRESETS = ["X", "Y", "−X", "−Y"];

/** Map a canonical axis name to its drive phase; null for a non-canonical/custom axis. */
export function axisToPhase(name) {
  switch (name) {
    case "X":              return 0;
    case "Y":              return Math.PI / 2;
    case "−X": case "-X":  return Math.PI;
    case "−Y": case "-Y":  return 3 * Math.PI / 2;
    default:               return null;
  }
}

// ── Pulse area & angle (classical ∫Ω(t)dt of the input signal) ───────────────

/**
 * Integrated pulse area θ = ∫₀ᵀ Ω(t) dt of the CLASSICAL drive envelope (not a
 * quantum result).  Square: Ω·T. Gaussian: numeric integral of the envelope.
 * Used only to label the rotation angle honestly.
 */
export function pulseArea(item) {
  if (!item || item.type !== "pulse") return 0;
  const amp = Math.abs(item.amplitude ?? 0);
  const T = item.duration ?? 0;
  if (item.pulse_shape !== "gaussian") return amp * T;
  const sigma = item.sigma && item.sigma > 0 ? item.sigma : T / 6;
  const N = 240, dt = T / N, c = T / 2, inv = 1 / (2 * sigma * sigma);
  let s = 0;
  for (let i = 0; i <= N; i++) {
    const t = i * dt;
    const v = amp * Math.exp(-((t - c) ** 2) * inv);
    s += (i === 0 || i === N ? 0.5 : 1) * v;
  }
  return s * dt;
}

const ANGLE_TOL = 0.05; // rad on the integrated area
const NAMED_ANGLES = [[Math.PI / 2, "π/2"], [Math.PI, "π"], [3 * Math.PI / 2, "3π/2"], [2 * Math.PI, "2π"]];

/**
 * Human label combining axis + rotation angle, only calling a pulse π/π2 when the
 * integrated area actually supports it:
 *   "X π/2 pulse" · "Y π pulse" · "Gaussian X pulse · area = 0.48π".
 */
export function pulseAngleLabel(item) {
  if (!item || item.type !== "pulse") return "";
  const axisName = pulseAxisName(item.phase ?? 0);
  const axisStr = axisName ?? `axis φ = ${(norm2pi(item.phase ?? 0) / Math.PI).toFixed(2)}π`;
  const area = pulseArea(item);
  const named = NAMED_ANGLES.find(([a]) => Math.abs(area - a) <= ANGLE_TOL);
  if (named && axisName) return `${axisName} ${named[1]} pulse`;
  const shape = item.pulse_shape === "gaussian" ? "Gaussian " : "";
  return `${shape}${axisStr} pulse · area = ${(area / Math.PI).toFixed(2)}π`;
}

// ── Quadrature RF channels (fixed hardware; field from channel amplitudes) ────

/**
 * Signed quadrature drive-channel weights for a phase φ.  The hardware is FIXED:
 *   Ωx(t) = Ω(t) cosφ  → X channel
 *   Ωy(t) = Ω(t) sinφ  → Y channel
 * The transverse field direction is the vector sum of the two channels — it is
 * the channels that change with φ, not the physical coil orientation.
 */
export function quadratureChannels(phase) {
  return { x: Math.cos(phase), y: Math.sin(phase) };
}

// ── Operation kind ────────────────────────────────────────────────────────────

export const OP = Object.freeze({
  RF_TRANSVERSE: "rf_transverse", // real transverse B₁ field (glow coil, show glyphs)
  LONGITUDINAL:  "longitudinal",  // Δ σz or free precession under B₀ (lab Z)
  VIRTUAL_Z:     "virtual_z",     // frame/phase update; no physical B₁
  IDLE:          "idle",
});

const AMP_EPS = 1e-9;

/**
 * Classify a sequence item into a physical operation kind.  A "pulse" with zero
 * transverse amplitude is NOT a transverse RF pulse (it is longitudinal if it
 * carries a detuning, else idle) — so we never glow the RF coil for it.
 */
export function classifyPulseOperation(item) {
  if (!item) return OP.IDLE;
  if (item.type === "virtual_z" || item.virtual_z === true) return OP.VIRTUAL_Z;
  if (item.type === "free") return OP.LONGITUDINAL;
  if (item.type === "pulse") {
    const amp = Math.abs(item.amplitude ?? 0);
    if (amp <= AMP_EPS) {
      return Math.abs(item.detuning ?? 0) > AMP_EPS ? OP.LONGITUDINAL : OP.IDLE;
    }
    return OP.RF_TRANSVERSE;
  }
  return OP.IDLE;
}

/** RF coil energy (glow + B₁ glyphs) is shown ONLY for a real transverse pulse. */
export function isRfActive(op) {
  return op === OP.RF_TRANSVERSE;
}

// ── Drive-field units (angular frequency vs physical B₁) ─────────────────────

export const FIELD_UNITS_NOTE =
  "Control field · angular-frequency representation (Ω rad/s; no γ → no tesla conversion)";

/**
 * Label the drive strength.  Without a gyromagnetic ratio the value is the
 * Hamiltonian drive strength in angular-frequency units (rad/s); with γ it is
 * converted to a physical B₁ field via B₁ = Ω / γ.
 *
 * @param {number} omega  angular-frequency drive strength (rad/s)
 * @param {number|null} [gamma]  gyromagnetic ratio (rad/s/T), if the preset provides it
 */
export function driveFieldLabel(omega, gamma = null) {
  if (gamma && isFinite(gamma) && gamma > 0) {
    const B = omega / gamma; // tesla
    const a = Math.abs(B);
    if (a >= 1)    return `B₁ = ${B.toFixed(2)} T`;
    if (a >= 1e-3) return `B₁ = ${(B * 1e3).toFixed(2)} mT`;
    return `B₁ = ${(B * 1e6).toFixed(2)} µT`;
  }
  return `Ω = ${omega.toFixed(2)} rad/s`;
}

// ── B₁ field glyphs (spatial field visualization) ────────────────────────────

/** Single documented mapping: normalized B₁ magnitude → glyph strength ∈ [0,1]. */
export function b1GlyphStrength(driveLevel) {
  return Math.max(0, Math.min(1, driveLevel ?? 0));
}

/** Whether B₁ field glyphs are shown at all (hidden when transverse drive ≈ 0). */
export function b1GlyphsVisible(driveLevel, eps = 0.02) {
  return (driveLevel ?? 0) > eps;
}
