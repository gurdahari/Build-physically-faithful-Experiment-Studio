/**
 * Qubit state representation — pure functions, no React.
 *
 * Convention: α is chosen real and non-negative (global phase fixed).
 *   |ψ⟩ = α|0⟩ + β|1⟩
 *   α = cos(θ/2)                    (real, ≥ 0)
 *   β = exp(iφ) sin(θ/2)            (complex)
 *
 * From Bloch vector (x, y, z):
 *   θ = arccos(z)    ∈ [0, π]
 *   φ = atan2(y, x)  ∈ (−π, π]  (undefined at poles → 0)
 *
 * Pole safety: when sin(θ) < ε, φ is undefined; we set φ = 0.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function blochToAngles([x, y, z]) {
  const theta = Math.acos(clamp(z, -1, 1));
  const phi   = Math.sin(theta) < 1e-9 ? 0 : Math.atan2(y, x);
  return { theta, phi };
}

export function blochToAmplitudes(vec) {
  const { theta, phi } = blochToAngles(vec);
  const cosH = Math.cos(theta / 2);
  const sinH = Math.sin(theta / 2);
  return {
    alpha: { re: cosH,                 im: 0                   },
    beta:  { re: sinH * Math.cos(phi), im: sinH * Math.sin(phi) },
    theta,
    phi,
    prob0: clamp(cosH * cosH, 0, 1),
    prob1: clamp(sinH * sinH, 0, 1),
  };
}

// Absorb floating-point noise near zero to prevent "-0.000" in display
const ZERO_THRESH = 5e-4;
function cleanV(v) { return Math.abs(v) < ZERO_THRESH ? 0 : v; }

/**
 * Format a complex number { re, im } as a readable string.
 * Avoids "-0.000", omits zero parts, uses "−" (minus sign) for subtraction.
 */
export function fmtComplex({ re, im }, digits = 3) {
  const r = cleanV(re);
  const i = cleanV(im);
  const rs = r.toFixed(digits);
  const ia = Math.abs(i).toFixed(digits);
  if (r === 0 && i === 0) return "0";
  if (i === 0) return rs;
  if (r === 0) return `${i < 0 ? "−" : ""}${ia}i`;
  return i < 0 ? `${rs} − ${ia}i` : `${rs} + ${ia}i`;
}

/**
 * Check that |α|² + |β|² ≈ 1 (normalization invariant).
 */
export function validateAmplitudes({ alpha, beta }) {
  const n2 = alpha.re ** 2 + alpha.im ** 2 + beta.re ** 2 + beta.im ** 2;
  return isFinite(n2) && Math.abs(n2 - 1) < 1e-6;
}
