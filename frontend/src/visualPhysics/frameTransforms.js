/**
 * Reference-frame transformations for the Physically Faithful Visualization System.
 *
 * The backend solves all physics in the ROTATING frame (QuTiP Hamiltonian already
 * written in rotating frame).  These functions transform already-returned data into
 * other display frames; they perform NO quantum physics calculations.
 *
 * Frames:
 *   rotating  — backend native; Ω_eff is static within each sequence item
 *   lab       — adds a visual Z-rotation at ω_vis (slowed carrier, clearly labeled)
 *   effective — rotates so that Ω_eff → +Z, revealing the natural rotation axis
 */

// ── Low-level helpers ─────────────────────────────────────────────────────────

export function vecMagnitude([x, y, z]) {
  return Math.sqrt(x * x + y * y + z * z);
}

export function normalizeVec3([x, y, z]) {
  const mag = Math.sqrt(x * x + y * y + z * z);
  if (mag < 1e-12) return [0, 0, 0];
  return [x / mag, y / mag, z / mag];
}

/** Rodrigues' rotation: rotate `vec` by `angle` radians about unit `axis`. */
function rodrigues([vx, vy, vz], [ax, ay, az], angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = vx * ax + vy * ay + vz * az;
  return [
    vx * cos + (ay * vz - az * vy) * sin + ax * dot * (1 - cos),
    vy * cos + (az * vx - ax * vz) * sin + ay * dot * (1 - cos),
    vz * cos + (ax * vy - ay * vx) * sin + az * dot * (1 - cos),
  ];
}

// ── Drive-field helpers ───────────────────────────────────────────────────────

/**
 * Convert a phase angle to the corresponding unit vector in the XY plane.
 * B1 lies at angle φ: n̂ = (cos φ, sin φ, 0).
 *
 * @param {number} phase - φ in radians
 * @returns {[number, number, number]}
 */
export function phaseToXYDirection(phase) {
  return [Math.cos(phase), Math.sin(phase), 0];
}

/**
 * Construct the effective-field vector [Ωcosφ, Ωsinφ, Δ] from pulse parameters.
 * This is the classical Hamiltonian coefficient, not a quantum result.
 *
 * @param {number} amplitude - Ω₀ (peak Rabi frequency, rad/s)
 * @param {number} phase - φ (radians)
 * @param {number} detuning - Δ (rad/s)
 * @returns {[number, number, number]}
 */
export function effectiveFieldVector(amplitude, phase, detuning) {
  return [amplitude * Math.cos(phase), amplitude * Math.sin(phase), detuning];
}

// ── Frame transforms ──────────────────────────────────────────────────────────

/**
 * Rotating → Lab frame: add a visual Z-rotation at `carrierFreqVis`.
 *
 * The actual lab-frame carrier (microwave or optical) oscillates far too fast
 * to animate.  `carrierFreqVis` is a user-adjustable "slowed" frequency that
 * makes the precession visible; it MUST be labeled as such in the UI.
 *
 * @param {[number,number,number]} blochVec - rotating-frame Bloch vector
 * @param {number} t - physical time (seconds)
 * @param {number} carrierFreqVis - visual carrier frequency (rad/s)
 * @returns {[number, number, number]}
 */
export function rotatingToLab(blochVec, t, carrierFreqVis) {
  const angle = carrierFreqVis * t;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [x, y, z] = blochVec;
  return [x * cos - y * sin, x * sin + y * cos, z];
}

/**
 * Effective-field frame: rotate scene so that `omegaEff` maps to the +Z axis.
 *
 * In this frame the Bloch vector's rotation about Ω_eff appears as rotation
 * about Z, making the dynamics maximally intuitive.
 *
 * @param {[number,number,number]} vec - vector to transform (Bloch or field)
 * @param {[number,number,number]} omegaEff - effective-field vector [Ωx,Ωy,Δ]
 * @returns {[number, number, number]}
 */
export function toEffectiveFrame(vec, omegaEff) {
  const mag = vecMagnitude(omegaEff);
  if (mag < 1e-12) return [...vec];

  const nHat = omegaEff.map(c => c / mag);

  // Already aligned with +Z?
  if (Math.abs(nHat[2] - 1.0) < 1e-9) return [...vec];

  // Anti-parallel to +Z?
  if (Math.abs(nHat[2] + 1.0) < 1e-9) {
    // 180° rotation about X: (x,y,z) → (x,−y,−z)
    return [vec[0], -vec[1], -vec[2]];
  }

  // Rotation axis = nHat × ẑ, rotation angle = -(arccos(nHat·ẑ))
  const cross = [
    nHat[1] * 1 - nHat[2] * 0,   // ny·1 − nz·0
    nHat[2] * 0 - nHat[0] * 1,   // nz·0 − nx·1
    nHat[0] * 0 - nHat[1] * 0,   // nx·0 − ny·0 = 0
  ];
  // cross = [-nHat[1], nHat[0], 0]  (corrected)
  const axisX = -nHat[1];
  const axisY =  nHat[0];
  const axisMag = Math.sqrt(axisX * axisX + axisY * axisY);
  if (axisMag < 1e-12) return [...vec];
  const axisHat = [axisX / axisMag, axisY / axisMag, 0];

  const cosAngle = Math.max(-1, Math.min(1, nHat[2])); // nHat · ẑ
  const angle    = -Math.acos(cosAngle); // negative: rotate nHat TO +Z

  return rodrigues(vec, axisHat, angle);
}

/**
 * Apply a frame transform to an entire trajectory array.
 * Returns a new array; the original is not mutated.
 *
 * @param {[number,number,number][]} trajectory
 * @param {string} frame - FRAMES constant
 * @param {[number,number,number] | null} omegaEff - required for EFFECTIVE frame
 * @param {number[]} times - required for LAB frame
 * @param {number} carrierFreqVis - required for LAB frame
 * @returns {[number,number,number][]}
 */
export function transformTrajectory(trajectory, frame, { omegaEff, times, carrierFreqVis } = {}) {
  if (!trajectory || trajectory.length === 0) return trajectory;

  if (frame === "effective" && omegaEff) {
    return trajectory.map(p => toEffectiveFrame(p, omegaEff));
  }
  if (frame === "lab" && times && carrierFreqVis != null) {
    return trajectory.map((p, i) => rotatingToLab(p, times[i] ?? 0, carrierFreqVis));
  }
  return trajectory; // rotating frame: no-op
}
