/**
 * hydrogenNav — a deterministic navigation state machine for the semantic model
 * hierarchy.  It is intentionally SEPARATE from camera/focus state so navigation
 * meaning is not encoded in one focus string.  Pure and testable without WebGL.
 *
 *   Laboratory → Sample Close-up → Hydrogen Entity → Selected Resolution
 *
 * Actions:
 *   FOCUS_SAMPLE      — LAB→SAMPLE (first sample click); SAMPLE→HYDROGEN (second)
 *   SELECT_RESOLUTION — HYDROGEN/RESOLUTION → RESOLUTION(id)
 *   BACK / ESCAPE     — move outward exactly one semantic level
 *   EXIT              — leave the Hydrogen path entirely (e.g. focus another object)
 */

export const NAV_LEVEL = Object.freeze({
  LAB:        "lab",
  SAMPLE:     "sample",
  HYDROGEN:   "hydrogen",
  RESOLUTION: "resolution",
});

export const initialNav = Object.freeze({ level: NAV_LEVEL.LAB, resolutionId: null });

/** One level outward, for BACK / ESCAPE. */
export function outerLevel(level) {
  switch (level) {
    case NAV_LEVEL.RESOLUTION: return NAV_LEVEL.HYDROGEN;
    case NAV_LEVEL.HYDROGEN:   return NAV_LEVEL.SAMPLE;
    case NAV_LEVEL.SAMPLE:     return NAV_LEVEL.LAB;
    default:                   return NAV_LEVEL.LAB;
  }
}

export function navReducer(state = initialNav, action = {}) {
  switch (action.type) {
    case "FOCUS_SAMPLE":
      if (state.level === NAV_LEVEL.LAB)    return { level: NAV_LEVEL.SAMPLE, resolutionId: null };
      if (state.level === NAV_LEVEL.SAMPLE) return { level: NAV_LEVEL.HYDROGEN, resolutionId: null };
      return state; // already at HYDROGEN or RESOLUTION — stay

    case "SELECT_RESOLUTION":
      if (!action.resolutionId) return state;
      if (state.level === NAV_LEVEL.HYDROGEN || state.level === NAV_LEVEL.RESOLUTION) {
        return { level: NAV_LEVEL.RESOLUTION, resolutionId: action.resolutionId };
      }
      return state;

    case "BACK":
    case "ESCAPE": {
      const next = outerLevel(state.level);
      return next === NAV_LEVEL.LAB ? { ...initialNav } : { level: next, resolutionId: null };
    }

    case "EXIT":
      return { ...initialNav };

    default:
      return state;
  }
}

/** True while the user is anywhere on the Hydrogen inspection path (not LAB). */
export function inHydrogenPath(state) {
  return !!state && state.level !== NAV_LEVEL.LAB;
}

/** Whether the semantic level shows the Hydrogen inspector (vs the sample focus card). */
export function showsHydrogenInspector(state) {
  return !!state && (state.level === NAV_LEVEL.HYDROGEN || state.level === NAV_LEVEL.RESOLUTION);
}
