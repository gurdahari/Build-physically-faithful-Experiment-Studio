/**
 * Measurement physics for the Bloch sphere — pure functions, no React.
 *
 * Born rule for Bloch vector r = (x, y, z):
 *   Z basis:  P(|0⟩)  = (1+z)/2,  P(|1⟩)  = (1-z)/2
 *   X basis:  P(|+⟩)  = (1+x)/2,  P(|−⟩)  = (1-x)/2
 *   Y basis:  P(|+i⟩) = (1+y)/2,  P(|−i⟩) = (1-y)/2
 *
 * Each basis has:
 *   proj     – extracts the relevant Bloch-vector component
 *   outcomes – display labels for each eigenstate
 *   collapse – exact Bloch vectors for the two eigenstates
 *   hint     – pedagogical description for the UI
 */

export const BASES = {
  z: {
    label:    "Z",
    hint:     "Measures ↑ north (|0⟩) or ↓ south (|1⟩) — computational basis",
    outcomes: ["|0⟩", "|1⟩"],
    collapse: [[0, 0,  1], [0, 0, -1]],
    proj:     ([, , z]) => z,
  },
  x: {
    label:    "X",
    hint:     "Measures → right (|+⟩) or ← left (|−⟩) on the equator",
    outcomes: ["|+⟩", "|−⟩"],
    collapse: [[ 1, 0, 0], [-1, 0, 0]],
    proj:     ([x])     => x,
  },
  y: {
    label:    "Y",
    hint:     "Measures ⊙ front (|+i⟩) or ⊗ back (|−i⟩) on the equator",
    outcomes: ["|+i⟩", "|−i⟩"],
    collapse: [[0,  1, 0], [0, -1, 0]],
    proj:     ([, y])   => y,
  },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Return [p0, p1] (Born-rule probabilities) for the given basis and Bloch vector.
 * Values are clamped to [0, 1] to absorb floating-point drift near ±1.
 */
export function measureProbs(basis, vec) {
  const b = BASES[basis] ?? BASES.z;
  const p0 = clamp01((1 + b.proj(vec)) / 2);
  return [p0, 1 - p0];
}

/**
 * Validate that a probability pair sums to 1 within tolerance.
 * Returns false for non-finite or negative values.
 */
export function validateProbs([p0, p1], tol = 1e-9) {
  return (
    isFinite(p0) && isFinite(p1) &&
    p0 >= 0 && p1 >= 0 &&
    Math.abs(p0 + p1 - 1) < tol
  );
}

/**
 * Sample one outcome index (0 or 1) from the probability pair.
 * Uses a single call to Math.random() for O(1) sampling.
 */
export function sampleOnce([p0]) {
  return Math.random() < p0 ? 0 : 1;
}

/**
 * Simulate n independent measurements; returns [count0, count1].
 * Runs entirely in the main thread — fast for n ≤ 10 000.
 */
export function runShots(probs, n) {
  let c0 = 0;
  for (let i = 0; i < n; i++) {
    if (sampleOnce(probs) === 0) c0++;
  }
  return [c0, n - c0];
}

/**
 * Return the post-measurement Bloch vector for outcome index k in the given basis.
 * k = 0 → first eigenstate, k = 1 → second eigenstate.
 */
export function collapseVec(basis, k) {
  return (BASES[basis]?.collapse[k]) ?? [0, 0, 1];
}
