/**
 * The Hydrogen physical entity — one physical thing represented at multiple
 * theoretical resolutions.  Milestone 1: architecture only.  Two resolutions are
 * active (laboratory apparatus, effective proton spin-½); three are honest
 * placeholders with no fabricated physics.
 *
 * Pure data — no solver, no React, no Three.js.
 */

import {
  RESOLUTION_STATUS,
  createPhysicalEntity, createPhysicalResolution, createModelContract,
} from "./types.js";

// ── Stable internal identifiers ───────────────────────────────────────────────
export const HYDROGEN_ENTITY_ID = "entity.hydrogen";

export const RES = Object.freeze({
  LABORATORY:      "hydrogen.res.laboratory",
  PROTON_SPIN:     "hydrogen.res.proton_spin_effective",
  ATOMIC:          "hydrogen.res.atomic_nonrelativistic",
  PRECISION:       "hydrogen.res.precision_structure",
  PROTON_INTERNAL: "hydrogen.res.proton_internal",
});

export const CONTRACT = Object.freeze({
  LABORATORY:      "hydrogen.contract.laboratory",
  PROTON_SPIN:     "hydrogen.contract.proton_spin_effective",
  ATOMIC:          "hydrogen.contract.atomic_nonrelativistic",
  PRECISION:       "hydrogen.contract.precision_structure",
  PROTON_INTERNAL: "hydrogen.contract.proton_internal",
});

const E = HYDROGEN_ENTITY_ID;

// ── Model contracts ───────────────────────────────────────────────────────────
export const HYDROGEN_CONTRACTS = {
  [CONTRACT.LABORATORY]: createModelContract({
    id: CONTRACT.LABORATORY, entityId: E, resolutionId: RES.LABORATORY,
    modelName: "Laboratory apparatus model",
    theory: "Classical control apparatus driving a two-level quantum sample",
    stateRepresentation: "Apparatus configuration + sample Bloch vector",
    governingEquations: ["Backend QuTiP master equation for the sample"],
    includedDegreesOfFreedom: ["static field B₀", "RF drive B₁(t)", "detector readout", "sample spin state"],
    omittedDegreesOfFreedom: ["electron orbital dynamics", "proton internal structure"],
    solver: "QuTiP (authoritative) via POST /simulate/experiment",
    approximationSet: ["rotating frame", "carrier folded out", "two-level sample"],
    observables: ["⟨σx⟩", "⟨σy⟩", "⟨σz⟩", "detector signal"],
    derivedQuantities: ["purity", "coherence", "populations"],
    validityRange: "Effective apparatus-scale description",
    uncertaintyStatement: "Solver tolerance per quality setting; no experimental noise model",
    allowedRepresentations: ["apparatus scene", "Bloch sphere", "timeline"],
    forbiddenRepresentations: ["atomic orbitals", "wavefunctions"],
    limitations: ["Represents the apparatus + effective sample, not full atomic Hydrogen"],
    modelVersion: "1.0.0",
  }),

  [CONTRACT.PROTON_SPIN]: createModelContract({
    id: CONTRACT.PROTON_SPIN, entityId: E, resolutionId: RES.PROTON_SPIN,
    modelName: "Effective proton nuclear-spin model",
    theory: "Effective two-level (spin-½) model of the proton nuclear spin",
    stateRepresentation: "Single qubit density matrix ρ (Hilbert-space dimension 2)",
    governingEquations: ["dρ/dt = −i[H,ρ] + Lindblad dissipator (QuTiP mesolve)"],
    includedDegreesOfFreedom: ["proton nuclear spin-½"],
    omittedDegreesOfFreedom: [
      "electron orbital dynamics",
      "complete atomic Hydrogen dynamics",
      "proton internal structure",
    ],
    solver: "QuTiP (authoritative)",
    approximationSet: ["effective spin-½", "rotating-wave / rotating frame", "Markovian Lindblad relaxation"],
    observables: ["⟨σx⟩", "⟨σy⟩", "⟨σz⟩"],
    derivedQuantities: ["purity", "coherence", "populations", "detector signal"],
    validityRange: "Effective nuclear-spin dynamics only; Hilbert-space dimension is currently two",
    uncertaintyStatement: "QuTiP solver tolerance; effective-model assumptions not independently validated here",
    allowedRepresentations: ["Bloch vector", "effective field", "spin-state readout"],
    forbiddenRepresentations: ["atomic orbital", "electron probability cloud", "quark/gluon structure"],
    limitations: [
      "This is an effective proton nuclear-spin model.",
      "Hilbert-space dimension is currently two.",
      "QuTiP is the authoritative engine.",
      "Electron orbital dynamics are omitted.",
      "Complete atomic Hydrogen dynamics are omitted.",
      "Proton internal structure is omitted.",
    ],
    modelVersion: "1.0.0",
  }),

  [CONTRACT.ATOMIC]: createModelContract({
    id: CONTRACT.ATOMIC, entityId: E, resolutionId: RES.ATOMIC,
    modelName: "Atomic nonrelativistic model",
    theory: "Nonrelativistic electron–proton Coulomb model (relative coordinate)",
    stateRepresentation: "Relative-coordinate wavefunction ψ(r); basis 1s, 2s, 2p",
    governingEquations: ["H₀ = -ℏ²/(2μ)∇² - e²/(4πε₀r)", "Ψ(t) = Σ cᵢ ψᵢ e^{-iEᵢt/ℏ}"],
    includedDegreesOfFreedom: [
      "one electron", "one proton", "electron–proton relative-coordinate motion",
      "Coulomb interaction", "bound nonrelativistic eigenstates", "coherent superpositions",
      "unitary field-free time evolution",
    ],
    omittedDegreesOfFreedom: [
      "center-of-mass dynamics", "electron spin", "proton spin", "fine structure",
      "spin-orbit coupling", "Darwin term", "relativistic kinetic corrections",
      "hyperfine structure", "Lamb shift", "vacuum polarization", "radiative self-energy",
      "external electric fields", "external magnetic fields", "collisions", "decoherence",
      "finite proton size", "proton polarizability", "proton internal structure",
    ],
    solver: "analytic backend solver (backend/hydrogen); QuTiP is NOT used here",
    approximationSet: ["nonrelativistic", "point proton", "Coulomb potential", "reduced-mass Bohr scale"],
    observables: ["energy", "L²", "Lz"],
    derivedQuantities: ["ψ", "|ψ|²", "phase", "probability current"],
    validityRange: "Bound nonrelativistic Coulomb states; finite-domain sampling omits tail probability",
    uncertaintyStatement: "Analytic closed-form amplitudes; finite-domain normalization reported by diagnostics",
    allowedRepresentations: [
      "electron position probability density |ψ(r,t)|² (sampled by backend)",
      "arg(ψ) phase hue (declared interpretive mapping)",
      "probability-current vector field (sampled by backend)",
      "planar section of the sampled fields",
    ],
    forbiddenRepresentations: [
      "classical electron orbit or electron ball circling the proton",
      "rotating stationary orbital for visual effect",
      "material-cloud interpretation of the probability density",
      "any frontend-invented quantum evolution",
    ],
    limitations: [
      "Visualizes backend-sampled |ψ|², phase, and probability current — not a photograph of an atom.",
      "The proton marker denotes localization only; it has no rendered internal structure.",
      "The displayed finite box does not contain exactly 100% of the probability (tail is reported).",
      "Not a Dirac / QED / finite-proton-size / hyperfine / environmental calculation.",
    ],
    modelVersion: "1.1.0",
  }),

  [CONTRACT.PRECISION]: createModelContract({
    id: CONTRACT.PRECISION, entityId: E, resolutionId: RES.PRECISION,
    modelName: "Precision atomic structure (layered effective model)",
    theory: "Nonrelativistic Coulomb baseline layered with fine structure, reference-data Lamb "
      + "shift, ground-state hyperfine coupling, and static-field (Zeeman / Breit–Rabi) structure",
    stateRepresentation: "Coupled angular momenta (l, s, j, I, F, m_F) + energy corrections; "
      + "spatial state still from the nonrelativistic orbital model",
    governingEquations: [
      "E_total = E_Coulomb + ΔE_fine + ΔE_recoil + ΔE_Lamb + ΔE_hyperfine + ΔE_Zeeman",
      "ΔE_fine = E_n (Zα)²/n² (n/(j+1/2) − 3/4)",
      "H_hfs = A I·J;  A = h·ν_HF",
      "Breit–Rabi diagonalization of A I·J + g_J μ_B B J_z − g_p μ_N B I_z",
    ],
    includedDegreesOfFreedom: [
      "point-nucleus Coulomb baseline", "electron spin s=1/2", "orbital angular momentum l",
      "total electronic angular momentum j", "selected fine-structure corrections",
      "selected recoil treatment (reduced-mass baseline)", "electron–proton hyperfine coupling",
      "proton spin I=1/2", "total atomic angular momentum F", "static magnetic-field splitting",
      "transition selection rules", "versioned reference values (Lamb shift, ν_HF)",
    ],
    omittedDegreesOfFreedom: [
      "full numerical bound-state QED", "arbitrary-order radiative corrections",
      "complete two-photon exchange", "full proton-polarizability calculation",
      "arbitrary excited-state hyperfine precision", "strong-field ionization",
      "time-dependent optical driving", "spontaneous-emission dynamics", "collisions",
      "environmental decoherence", "many-body effects", "molecular hydrogen",
      "proton internal real-time dynamics", "electroweak corrections",
    ],
    solver: "analytic + perturbative + versioned reference data (backend/hydrogen/precision); QuTiP is NOT used",
    approximationSet: ["leading (Zα)² fine structure", "effective A I·J hyperfine",
      "reference-data Lamb shift (2S1/2−2P1/2)", "Breit–Rabi / weak-field Zeeman"],
    observables: ["energy levels", "transition frequencies/wavelengths", "hyperfine splitting", "g-factors"],
    derivedQuantities: ["correction budget", "F/m_F structure", "state composition", "selection-rule results"],
    validityRange: "¹H, n ≤ 2 supported states; low-Z leading-order; B ≤ 20 T",
    uncertaintyStatement: "Computed terms carry truncation error; reference data carry declared dataset uncertainty",
    allowedRepresentations: [
      "energy-level diagram (interpretive lines)", "correction budget (model-derived + reference)",
      "coupled-spin (F) state diagram (interpretive)", "Breit–Rabi level plot",
      "transition arrows for ALLOWED transitions only", "reference-data overlays (labeled)",
    ],
    forbiddenRepresentations: [
      "spin as a literal rotating classical ball",
      "distinct spatial orbital clouds for spin-only / hyperfine splittings",
      "reference data presented as a first-principles calculation",
      "real-time bound-state QED / spontaneous-emission animation",
      "full Dirac-spinor spatial rendering (not implemented)",
    ],
    limitations: [
      "A layered effective model: analytic/perturbative calculations + versioned reference data.",
      "NOT a complete real-time bound-state QED simulation.",
      "Lamb shift is reference data (2S1/2−2P1/2), not a QED calculation.",
      "Hyperfine is the ground-state ¹H coupling only; excited-state hyperfine omitted.",
      "Spatial density remains the nonrelativistic orbital model; corrections are not spatially visible.",
    ],
    modelVersion: "1.0.0",
  }),

  [CONTRACT.PROTON_INTERNAL]: createModelContract({
    id: CONTRACT.PROTON_INTERNAL, entityId: E, resolutionId: RES.PROTON_INTERNAL,
    modelName: "Proton internal structure (planned)",
    theory: "Intended: sub-nucleonic (QCD) structure of the proton",
    stateRepresentation: "Not defined — placeholder",
    governingEquations: [],
    includedDegreesOfFreedom: [],
    omittedDegreesOfFreedom: ["ALL — no sub-nucleonic model is active yet"],
    solver: "none — no real-time first-principles QCD simulation is active",
    approximationSet: [],
    observables: [],
    derivedQuantities: [],
    validityRange: "Not applicable — resolution is a placeholder",
    uncertaintyStatement: "No authoritative computation exists at this resolution",
    allowedRepresentations: [],
    forbiddenRepresentations: ["real-time quark trajectories", "real-time gluon trajectories"],
    limitations: [
      "No real-time first-principles QCD simulation is active.",
      "No quark or gluon trajectories are available.",
      "Future representations require declared model or dataset provenance.",
    ],
    modelVersion: "0.0.0",
  }),
};

// ── Resolutions ───────────────────────────────────────────────────────────────
export const HYDROGEN_RESOLUTIONS = [
  createPhysicalResolution({
    id: RES.LABORATORY, entityId: E, displayName: "Laboratory Experiment",
    description: "The apparatus-level experiment: magnet, quadrature RF source, sample, detector.",
    status: RESOLUTION_STATUS.ACTIVE, modelContractId: CONTRACT.LABORATORY,
    parentResolutionId: null, childResolutionIds: [RES.PROTON_SPIN],
    limitations: "Apparatus + effective sample; not full atomic Hydrogen.",
  }),
  createPhysicalResolution({
    id: RES.PROTON_SPIN, entityId: E, displayName: "Proton Spin · Effective Model",
    description: "The existing QuTiP spin-½ experiment as an effective proton nuclear-spin model.",
    status: RESOLUTION_STATUS.ACTIVE, modelContractId: CONTRACT.PROTON_SPIN,
    parentResolutionId: RES.LABORATORY, childResolutionIds: [RES.ATOMIC],
    limitations: "Effective spin-½ (dimension 2); electron, atomic, and proton-internal DOF omitted.",
  }),
  createPhysicalResolution({
    id: RES.ATOMIC, entityId: E, displayName: "Atomic · Nonrelativistic",
    description: "Nonrelativistic electron–proton Coulomb model with interactive |ψ(r,t)|² visualization sampled from the authoritative backend solver.",
    status: RESOLUTION_STATUS.ACTIVE, modelContractId: CONTRACT.ATOMIC,
    parentResolutionId: RES.PROTON_SPIN, childResolutionIds: [RES.PRECISION],
    limitations: "Visualizes backend-sampled probability density, phase, and current; finite-domain tail is reported, not hidden.",
  }),
  createPhysicalResolution({
    id: RES.PRECISION, entityId: E, displayName: "Precision Atomic Structure",
    description: "Fine structure, reference-data Lamb shift, ground-state hyperfine (21 cm), and "
      + "static-field Breit–Rabi structure layered on the nonrelativistic baseline — an explicit "
      + "effective model with per-term provenance, not a full bound-state QED simulation.",
    status: RESOLUTION_STATUS.ACTIVE, modelContractId: CONTRACT.PRECISION,
    parentResolutionId: RES.ATOMIC, childResolutionIds: [RES.PROTON_INTERNAL],
    limitations: "Layered effective model (analytic + reference data); spatial density unchanged from the orbital model.",
  }),
  createPhysicalResolution({
    id: RES.PROTON_INTERNAL, entityId: E, displayName: "Proton Internal Structure",
    description: "Planned sub-nucleonic structure. No real-time QCD simulation is active.",
    status: RESOLUTION_STATUS.PLACEHOLDER, modelContractId: CONTRACT.PROTON_INTERNAL,
    parentResolutionId: RES.PRECISION, childResolutionIds: [],
    limitations: "Placeholder — no QCD; future work requires declared provenance.",
  }),
];

// ── Entity ────────────────────────────────────────────────────────────────────
export const HydrogenEntity = createPhysicalEntity({
  id: E, displayName: "Hydrogen",
  description: "Hydrogen represented as one physical entity across multiple theoretical resolutions.",
  resolutions: HYDROGEN_RESOLUTIONS.map(r => r.id),
  defaultResolutionId: RES.PROTON_SPIN,
  modelContractIds: Object.values(CONTRACT),
  version: "1.0.0",
  provenance: {
    source: "internal",
    notes: "Milestone 1 — architecture only. Two active resolutions, three honest placeholders.",
    references: [],
  },
});

// ── Lookups ───────────────────────────────────────────────────────────────────
const RES_BY_ID = Object.fromEntries(HYDROGEN_RESOLUTIONS.map(r => [r.id, r]));

export function listResolutions() { return HYDROGEN_RESOLUTIONS; }
export function getResolution(id) { return RES_BY_ID[id] ?? null; }
export function getContract(id) { return HYDROGEN_CONTRACTS[id] ?? null; }
export function getContractForResolution(resId) {
  const r = getResolution(resId);
  return r ? getContract(r.modelContractId) : null;
}
export function isActive(resId) { return getResolution(resId)?.status === RESOLUTION_STATUS.ACTIVE; }
