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

export function listVisualTruth() { return HYDROGEN_VISUAL_TRUTH; }
