/**
 * Atomic-state presets — backend-valid normalized coefficient sets.
 *
 * These are plain DATA (coefficients over the supported basis keys); the backend
 * computes all physics.  Two superposition presets are included: one unequal-
 * energy (time-dependent interference) and one degenerate (stationary density).
 */

export const KEYS = {
  s1: "hydrogen.state.n1_l0_m0",
  s2: "hydrogen.state.n2_l0_m0",
  p_m1: "hydrogen.state.n2_l1_m-1",
  p0: "hydrogen.state.n2_l1_m0",
  p_p1: "hydrogen.state.n2_l1_m1",
};

const c = (state, real, imag = 0) => ({ state, real, imag });
const INV2 = 1 / Math.sqrt(2);

export const ATOMIC_PRESETS = [
  { key: "1s", label: "1s", coefficients: [c(KEYS.s1, 1)] },
  { key: "2s", label: "2s", coefficients: [c(KEYS.s2, 1)] },
  { key: "2p-1", label: "2p₋₁", coefficients: [c(KEYS.p_m1, 1)] },
  { key: "2p0", label: "2p₀", coefficients: [c(KEYS.p0, 1)] },
  { key: "2p+1", label: "2p₊₁", coefficients: [c(KEYS.p_p1, 1)] },
  {
    key: "sup_uneq", label: "(1s + 2p₀)/√2", kind: "unequal-energy",
    coefficients: [c(KEYS.s1, INV2), c(KEYS.p0, INV2)],
  },
  {
    key: "sup_degen", label: "(2p₊₁ + 2p₋₁)/√2", kind: "degenerate",
    coefficients: [c(KEYS.p_p1, INV2), c(KEYS.p_m1, INV2)],
  },
];

export const PRESET_BY_KEY = Object.fromEntries(ATOMIC_PRESETS.map((p) => [p.key, p]));

/** Distinct principal quantum numbers among coefficient keys (energy depends on n). */
export function distinctN(coefficients) {
  const ns = new Set();
  for (const co of coefficients) {
    const mo = /n(\d+)_/.exec(co.state);
    if (mo) ns.add(Number(mo[1]));
  }
  return ns;
}
