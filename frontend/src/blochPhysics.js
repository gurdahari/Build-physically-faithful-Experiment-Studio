/**
 * Bloch sphere physics — pure functions, no React dependencies.
 *
 * Rotation matrices used throughout:
 *   R_x(θ) row 0: [1,  0,     0  ]
 *           row 1: [0,  cos θ, -sin θ]
 *           row 2: [0,  sin θ,  cos θ]
 *
 *   R_y(θ) row 0: [ cos θ, 0, sin θ]
 *           row 1: [  0,    1,  0   ]
 *           row 2: [-sin θ, 0, cos θ]
 *
 *   R_z(θ) row 0: [cos θ, -sin θ, 0]
 *           row 1: [sin θ,  cos θ, 0]
 *           row 2: [  0,     0,    1]
 */

export const INITIAL_STATES = {
  "|0⟩": [0,  0,  1],
  "|1⟩": [0,  0, -1],
  "|+⟩": [1,  0,  0],
};

/**
 * Rotate Bloch vector [x, y, z] by angle theta (radians) around the given
 * axis using the standard SO(3) rotation matrix.
 *
 * Note: |0⟩ and |1⟩ are eigenstates of R_z; |+⟩ is an eigenstate of R_x.
 * In those combinations the vector does not move — applyRotation returns the
 * same vector for all theta, and the trajectory guide is suppressed.
 */
/**
 * Convert spherical coordinates (θ = polar, φ = azimuthal) to a Bloch vector.
 *   x = sin(θ)·cos(φ),  y = sin(θ)·sin(φ),  z = cos(θ)
 */
export function sphericalToBloch(theta, phi) {
  return [
    Math.sin(theta) * Math.cos(phi),
    Math.sin(theta) * Math.sin(phi),
    Math.cos(theta),
  ];
}

/**
 * Convert a Bloch vector back to spherical coordinates (inverse of sphericalToBloch).
 *   theta = acos(z)  ∈ [0, π]
 *   phi   = atan2(y, x) mapped to [0, 2π)
 * Pole vectors (z = ±1) have undefined phi; returns phi = 0.
 */
export function blochToSpherical([x, y, z]) {
  const theta = Math.acos(Math.max(-1, Math.min(1, z)));
  const sinTheta = Math.sin(theta);
  const phi = sinTheta < 1e-9 ? 0 : Math.atan2(y, x);
  return [theta, phi < 0 ? phi + 2 * Math.PI : phi];
}

/**
 * Apply free evolution under H₀ = (ℏω₀/2)σz for duration τ.
 * Produces a Z-axis rotation by angle θ = ω₀ × τ.
 */
export function applyFreeEvolution(omega0, tau, vec) {
  return applyRotation("z", omega0 * tau, vec);
}

export function applyRotation(axis, theta, [x, y, z]) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  switch (axis) {
    case "x": return [x,          c * y - s * z,  s * y + c * z];
    case "y": return [c * x + s * z,  y,          -s * x + c * z];
    case "z": return [c * x - s * y,  s * x + c * y,  z         ];
    default:  return [x, y, z];
  }
}
