/**
 * Enumeration constants for the Physically Faithful Visualization System.
 *
 * These are the single source of truth for all mode/frame identifiers used
 * throughout visualMappings, frameTransforms, visual components, and tests.
 */

export const VIS_MODES = Object.freeze({
  CONCEPT:    "concept",    // Bloch vector only — beginner-friendly, no field clutter
  PHYSICS:    "physics",    // + B0, B1, Ω_eff arrows + scale badge + legend
  DIAGNOSTIC: "diagnostic", // + ideal path overlay + numerical labels + detuning component
});

export const FRAMES = Object.freeze({
  ROTATING:  "rotating",   // Default: backend-native rotating frame, Ω_eff static per step
  LAB:       "lab",        // Visually slowed lab frame — adds Z rotation at ω_vis (labeled)
  EFFECTIVE: "effective",  // Rotates scene so Ω_eff → Z axis (reveals rotation axis)
});

export const FIELD_IDS = Object.freeze({
  BLOCH:     "bloch",      // Bloch state vector (always shown)
  B0:        "B0",         // Static longitudinal field along Z
  B1:        "B1",         // Transverse drive field in XY plane
  OMEGA_EFF: "omega_eff",  // Effective field = B1 + Δẑ
  DETUNING:  "detuning",   // Pure Δ component (Diagnostic only)
});

export const SCALE_TYPE = Object.freeze({
  EXACT:      "exact",      // 1:1 physical magnitude shown
  NORMALIZED: "normalized", // Physical direction only; length is visual convention
  SLOWED:     // playback time ≪ physical time
              "slowed",
  DERIVED:    "derived",    // Computed algebraically from returned Bloch components
});
