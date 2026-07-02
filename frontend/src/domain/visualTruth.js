/**
 * Initial VisualTruthDescriptors for a small set of existing scientific elements
 * of the effective proton-spin experiment.  Each descriptor declares how a
 * quantity is visualized, its provenance, and its limitations.  Not every scene
 * object is annotated — only this representative set (Milestone 1).
 *
 * Pure data — no rendering dependencies.
 */

import { createVisualTruthDescriptor, VISUAL_CATEGORY } from "./types.js";
import { CONTRACT } from "./hydrogen.js";

const C = CONTRACT.PROTON_SPIN;
const A = CONTRACT.ATOMIC;

// ── Atomic Hydrogen visualization (Milestone 3) ───────────────────────────────
// Every atomic visual maps ALREADY-COMPUTED backend samples to rendering
// attributes.  The frontend computes no eigenfunctions, energies, evolution, or
// current; it only declares these mappings.
export const ATOMIC_VISUAL_TRUTH = [
  createVisualTruthDescriptor({
    id: "visual.atomic.density", quantityName: "Electron position probability density |ψ(r,t)|²",
    category: VISUAL_CATEGORY.OBSERVABLE,
    mathematicalSource: "backend sampling.fields.abs2 = |Σ cᵢ ψᵢ(r) e^{-iEᵢt/ℏ}|² on a volume grid",
    modelContractId: A,
    units: "probability density (per aμ³ on the sampled grid)",
    normalization: "per-frame max-normalized to point opacity; γ=0.55 perceptual curve",
    spatialMeaning: "relative electron–proton coordinate; the primary faithful representation",
    referenceFrame: "atomic rest frame (relative coordinate)",
    timeScaling: "stationary: fetched once; unequal-energy: backend time frames at bounded cadence",
    visualScaling: "point opacity ∝ |ψ|^{2·0.55}, size grows with density; NOT a material cloud",
    approximation: "finite-resolution grid; low-density noise floor filtered for legibility",
    limitations: "Not a photograph; a point-sampled visualization of the backend density field.",
  }),
  createVisualTruthDescriptor({
    id: "visual.atomic.phase", quantityName: "Wavefunction phase arg(ψ)",
    category: VISUAL_CATEGORY.MODEL_DERIVED,
    mathematicalSource: "backend sampling.fields.phase = arg(Σ cᵢ ψᵢ e^{-iEᵢt/ℏ})",
    modelContractId: A,
    units: "radians ∈ [-π, π]",
    normalization: "cyclic hue = (arg(ψ)/2π mod 1); saturation/lightness fixed",
    spatialMeaning: "local complex phase co-located with the density points",
    referenceFrame: "atomic rest frame",
    timeScaling: "same backend frame as the density",
    visualScaling: "interpretive hue wheel; color is NOT a literal color in space",
    approximation: "hue mapping is a declared interpretive choice",
    limitations: "Phase is meaningful only relative; the hue wheel is pedagogical.",
  }),
  createVisualTruthDescriptor({
    id: "visual.atomic.current", quantityName: "Probability current j(r,t)",
    category: VISUAL_CATEGORY.OBSERVABLE,
    mathematicalSource: "backend sampling.fields.jx/jy/jz = (ℏ/m)·Im(ψ*∇ψ)",
    modelContractId: A,
    units: "probability flux (backend units); magnitude max-normalized for arrows",
    normalization: "arrow direction = ĵ; length/opacity ∝ |j|/max|j|",
    spatialMeaning: "local flow of probability; circulation for m=±1 (opposite senses)",
    referenceFrame: "atomic rest frame",
    timeScaling: "same backend frame as the density",
    visualScaling: "sparse capped arrow set; NO arrows are drawn where the backend j≈0",
    approximation: "sampled/strided glyphs, not a continuous streamline field",
    limitations: "Zero for a stationary real orbital (1s/2s/2p₀) — correctly shown as no arrows.",
  }),
  createVisualTruthDescriptor({
    id: "visual.atomic.proton_marker", quantityName: "Proton localization marker",
    category: VISUAL_CATEGORY.INTERPRETIVE,
    mathematicalSource: "origin of the relative coordinate (r = 0)",
    modelContractId: A,
    units: "none (a positional marker)",
    normalization: "fixed small glyph at the origin",
    spatialMeaning: "denotes where the proton sits in the relative-coordinate frame",
    referenceFrame: "atomic rest frame",
    timeScaling: "static",
    visualScaling: "small sphere; size is a visual convention, not the proton radius",
    approximation: "point proton; no rendered internal structure",
    limitations: "A localization marker only — NOT a resolved proton and NOT to scale.",
  }),
  createVisualTruthDescriptor({
    id: "visual.atomic.energy_inset", quantityName: "Energy-level inset",
    category: VISUAL_CATEGORY.OBSERVABLE,
    mathematicalSource: "backend participating_states energies, populations, and beat_frequencies_rad_s",
    modelContractId: A,
    units: "eV (levels); rad/s (beat frequency)",
    normalization: "exact backend values; no rescaling",
    spatialMeaning: "none — a data inset, not a spatial object",
    referenceFrame: "n/a",
    timeScaling: "populations/beat reflect the current backend response",
    visualScaling: "text/level readout",
    approximation: "shows participating levels only",
    limitations: "Displays the bound nonrelativistic Coulomb spectrum of the selected state.",
  }),
  createVisualTruthDescriptor({
    id: "visual.atomic.time", quantityName: "Controlled atomic time evolution",
    category: VISUAL_CATEGORY.MODEL_DERIVED,
    mathematicalSource: "backend Ψ(t) = Σ cᵢ ψᵢ e^{-iEᵢt/ℏ}; frames requested at bounded cadence",
    modelContractId: A,
    units: "seconds (atomic time, separate from the experiment timeline)",
    normalization: "beat period sampled at fixed ticks; one request per tick, never per render frame",
    spatialMeaning: "n/a",
    referenceFrame: "atomic rest frame",
    timeScaling: "stationary states are never animated; only distinct-n superpositions evolve",
    visualScaling: "Preview quality during playback, Standard after pause",
    approximation: "temporal sampling of the true continuous evolution",
    limitations: "Frontend interpolates/caches backend frames; it never computes the evolution itself.",
  }),
  createVisualTruthDescriptor({
    id: "visual.atomic.normalization", quantityName: "Finite-domain normalization honesty",
    category: VISUAL_CATEGORY.MODEL_DERIVED,
    mathematicalSource: "backend normalization_diagnostics (numerical_integral, omitted_tail_estimate)",
    modelContractId: A,
    units: "probability (dimensionless)",
    normalization: "reports ∫|ψ|² inside the box and the omitted exponential tail",
    spatialMeaning: "the displayed finite region, not all of space",
    referenceFrame: "atomic rest frame",
    timeScaling: "per backend response",
    visualScaling: "text readout in the scale indicator and state info",
    approximation: "finite box truncates the exponential tail",
    limitations: "The displayed box does NOT contain exactly 100% of the probability.",
  }),
];

export const HYDROGEN_VISUAL_TRUTH = [
  createVisualTruthDescriptor({
    id: "visual.b0", quantityName: "B₀ static field",
    category: VISUAL_CATEGORY.INTERPRETIVE,
    mathematicalSource: "Model convention: quantization axis +Z (folded-out Larmor precession)",
    modelContractId: C,
    units: "angular frequency (rad/s); no γ → not tesla",
    normalization: "normalized direction; length is a visual convention",
    spatialMeaning: "lab Z axis through the sample (spatially uniform)",
    referenceFrame: "rotating frame (static residual)",
    timeScaling: "none",
    visualScaling: "normalized arrow + finite sampled field lines",
    approximation: "spatially uniform B₀",
    limitations: "Not a measured field; a pedagogical representation of the quantization axis.",
  }),
  createVisualTruthDescriptor({
    id: "visual.b1", quantityName: "B₁(t) drive field",
    category: VISUAL_CATEGORY.MODEL_DERIVED,
    mathematicalSource: "field_trajectory transverse part [Ωx(t), Ωy(t)] = Ω(t)[cosφ, sinφ]",
    modelContractId: C,
    units: "angular frequency (rad/s)",
    normalization: "direction from φ; opacity/glyph strength from |Ω(t)|",
    spatialMeaning: "transverse field through the sample (quadrature RF)",
    referenceFrame: "rotating frame",
    timeScaling: "envelope only — RF carrier folded out",
    visualScaling: "normalized glyph field; opacity ∝ backend magnitude",
    approximation: "rotating-wave / envelope view",
    limitations: "Shows the drive envelope, not the physical carrier oscillation.",
  }),
  createVisualTruthDescriptor({
    id: "visual.bloch", quantityName: "Bloch vector r",
    category: VISUAL_CATEGORY.OBSERVABLE,
    mathematicalSource: "backend trajectory: r = (⟨σx⟩, ⟨σy⟩, ⟨σz⟩)",
    modelContractId: C,
    units: "dimensionless (|r| ≤ 1)",
    normalization: "exact — |r| = 1 is a pure state",
    spatialMeaning: "state-space (mathematical), not laboratory space",
    referenceFrame: "rotating (or selected display frame)",
    timeScaling: "playback interpolates backend points",
    visualScaling: "exact (unit sphere)",
    approximation: "none (authoritative observable)",
    limitations: "Represents the effective spin-½ state only.",
  }),
  createVisualTruthDescriptor({
    id: "visual.detector", quantityName: "Detector signal",
    category: VISUAL_CATEGORY.OBSERVABLE,
    mathematicalSource: "detector_signal_* = (⟨σx⟩, ⟨σy⟩, √(⟨σx⟩²+⟨σy⟩²))",
    modelContractId: C,
    units: "normalized (|r_⊥| ≤ 1)",
    normalization: "normalized representative ensemble signal",
    spatialMeaning: "transverse magnetization picked up at the detector",
    referenceFrame: "rotating frame",
    timeScaling: "same playIndex as the trajectory",
    visualScaling: "detector glow/beam ∝ |signal|",
    approximation: "representative ensemble; no absolute voltage scale",
    limitations: "No physical voltage scale for a single spin-½.",
  }),
  createVisualTruthDescriptor({
    id: "visual.proton_spin_state", quantityName: "Proton-spin state representation",
    category: VISUAL_CATEGORY.MODEL_DERIVED,
    mathematicalSource: "representative magnetization arrow from backend Bloch vector; length ∝ |r|",
    modelContractId: C,
    units: "dimensionless",
    normalization: "direction = r̂; length ∝ |r| (relaxation shortens it)",
    spatialMeaning: "representative ensemble magnetization inside the sample",
    referenceFrame: "rotating frame",
    timeScaling: "same playIndex as the trajectory",
    visualScaling: "arrow inside the sample vial (not to physical scale)",
    approximation: "effective spin-½ ensemble; not literal individual particles",
    limitations: "Not a wavefunction; not an orbital; an effective-spin representation.",
  }),
];

export function listVisualTruth() { return [...HYDROGEN_VISUAL_TRUTH, ...ATOMIC_VISUAL_TRUTH]; }
export function listAtomicVisualTruth() { return ATOMIC_VISUAL_TRUTH; }
