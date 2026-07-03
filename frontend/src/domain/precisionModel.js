/**
 * precisionModel — DECLARED data + pure mappings for the Precision Atomic
 * Structure resolution.  No physics is computed here: the backend owns all
 * precision energies, corrections, and selection rules.  These helpers only
 * describe the correction stack, build API requests / cache keys, map a
 * precision level to its (unchanged) nonrelativistic spatial orbital, and derive
 * interpretive display quantities (energy-axis magnification, spin glyphs).
 */

// ── Corrections & their honest classification ────────────────────────────────
export const CORRECTIONS = [
  { key: "fine_structure", label: "Fine structure", classification: "computed" },
  { key: "lamb_shift", label: "Lamb shift", classification: "reference-data" },
  { key: "hyperfine", label: "Hyperfine", classification: "computed" },
  { key: "zeeman", label: "Magnetic (Zeeman)", classification: "computed" },
];
export const CLASSIFICATION_LABEL = {
  computed: "computed",
  "reference-data": "reference data",
  omitted: "omitted",
};

// ── State families and the corrections each supports ─────────────────────────
export const FAMILIES = [
  { key: "fine_structure", label: "Fine structure (1S–2P)", allowed: ["fine_structure", "lamb_shift", "zeeman"] },
  { key: "ground_hyperfine", label: "Ground hyperfine (21 cm)", allowed: ["hyperfine", "zeeman"] },
];
export const FAMILY_BY_KEY = Object.fromEntries(FAMILIES.map((f) => [f.key, f]));

/** Progressive level-explorer views: each shows how degeneracies are lifted. */
export const STACK_VIEWS = [
  { key: "baseline", label: "Nonrelativistic", family: "fine_structure", corrections: [] },
  { key: "fine", label: "Fine structure", family: "fine_structure", corrections: ["fine_structure"] },
  { key: "fine_lamb", label: "Fine + Lamb", family: "fine_structure", corrections: ["fine_structure", "lamb_shift"] },
  { key: "hyperfine", label: "Hyperfine", family: "ground_hyperfine", corrections: ["hyperfine"] },
  { key: "magnetic", label: "Magnetic (Breit–Rabi)", family: "ground_hyperfine", corrections: ["hyperfine", "zeeman"] },
];

export const MAX_FIELD_TESLA = 20;

/** Only corrections allowed for a family are kept (mirrors the backend contract). */
export function allowedCorrections(family, corrections) {
  const allow = new Set(FAMILY_BY_KEY[family]?.allowed ?? []);
  return corrections.filter((c) => allow.has(c));
}

// ── Spatial orbital mapping (spatial state is UNCHANGED by precision) ─────────
/**
 * A precision level reuses the nonrelativistic orbital density as spatial
 * context.  2P1/2 and 2P3/2 share the 2p spatial representation; the F=0/F=1
 * hyperfine sublevels share the 1s density — their difference is spin/energy,
 * NOT a distinct spatial cloud.
 */
export function spatialPresetForTerm(term) {
  if (!term) return "1s";
  if (term.startsWith("1S")) return "1s";
  if (term.startsWith("2S")) return "2s";
  if (term.startsWith("2P")) return "2p0";
  return "1s";
}

export function spatialPresetForFamily(family, term) {
  if (family === "ground_hyperfine") return "1s";
  return spatialPresetForTerm(term);
}

// ── API request builders + deterministic cache keys ──────────────────────────
export function levelsBody({ family, corrections, field = 0, includeSublevels = false, fieldSweep = false, sweepBmax = null, sweepPoints = 41 }) {
  const body = {
    state_family: family,
    corrections: allowedCorrections(family, corrections),
    magnetic_field_tesla: field,
    include_sublevels: includeSublevels,
    field_sweep: fieldSweep,
    sweep_points: sweepPoints,
  };
  if (sweepBmax != null) body.sweep_bmax_tesla = sweepBmax;
  return body;
}

export function levelsCacheKey(body) {
  return [
    body.state_family, [...body.corrections].sort().join("+"),
    body.magnetic_field_tesla.toExponential(6),
    body.include_sublevels ? 1 : 0, body.field_sweep ? 1 : 0,
    body.sweep_bmax_tesla ?? "", body.sweep_points,
  ].join("|");
}

export function transitionBody({ preset = null, initial = null, final = null, type = null, corrections, field = 0 }) {
  const body = { magnetic_field_tesla: field, corrections };
  if (preset) { body.preset = preset; return body; }
  if (initial) body.initial = initial;
  if (final) body.final = final;
  if (type) body.transition_type = type;
  return body;
}

export function transitionCacheKey(body) {
  return [
    body.preset ?? "",
    body.initial ? `${body.initial.term}:${body.initial.two_F ?? ""}:${body.initial.two_mF ?? ""}` : "",
    body.final ? `${body.final.term}:${body.final.two_F ?? ""}:${body.final.two_mF ?? ""}` : "",
    body.transition_type ?? "",
    body.magnetic_field_tesla.toExponential(6),
    [...(body.corrections ?? [])].sort().join("+"),
  ].join("|");
}

// ── Energy-axis magnification (declared; tiny splittings must not be faked) ───
const MAGNIFY_THRESHOLD_EV = 1e-3;   // below this spread, declare magnification

/**
 * Map a set of energies (eV) to normalized y ∈ [0,1] for a level diagram.
 * Returns whether the axis is magnified (tiny spread) so the UI can label it.
 * Physical numeric values remain available to the caller.
 */
export function energyAxis(valuesEV) {
  if (!valuesEV.length) return { min: 0, max: 0, spread: 0, magnified: false, norm: () => 0.5 };
  const min = Math.min(...valuesEV);
  const max = Math.max(...valuesEV);
  const spread = max - min;
  const magnified = spread > 0 && spread < MAGNIFY_THRESHOLD_EV;
  const norm = (v) => (spread > 0 ? (v - min) / spread : 0.5);
  return { min, max, spread, magnified, norm };
}

// ── Interpretive spin-coupling glyph descriptors ─────────────────────────────
/**
 * Declared, INTERPRETIVE representation of the coupled electron+proton spin
 * state for a ground-hyperfine level.  Never a literal rotating classical ball.
 */
export function spinCouplingFor(twoF) {
  if (twoF === 0) {
    return {
      kind: "singlet",
      label: "F = 0 singlet",
      interpretive: true,
      description: "Coupled antiparallel quantum state (|↑↓⟩−|↓↑⟩)/√2 — a single entangled state, "
        + "not a fixed pair of opposite vectors.",
      manifold: "singlet",
      m_F: [0],
    };
  }
  return {
    kind: "triplet",
    label: "F = 1 triplet",
    interpretive: true,
    description: "Coupled spin-1 manifold with three m_F sublevels (−1, 0, +1); the m_F=0 member is "
      + "(|↑↓⟩+|↓↑⟩)/√2 — the triplet states are not identical.",
    manifold: "triplet",
    m_F: [-1, 0, 1],
  };
}
