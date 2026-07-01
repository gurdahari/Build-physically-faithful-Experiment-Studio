/**
 * Scale-metadata helpers for the Physically Faithful Visualization System.
 *
 * "Scale metadata" is the explicit record of every transformation applied
 * between a physical quantity and its visual representation.  It is surfaced
 * to the user via PhysicalScaleBadge so that nothing is hidden.
 */

import { FRAMES, SCALE_TYPE } from "./visualizationTypes.js";

// Visual arrow length on the unit Bloch sphere (normalized, not physical)
export const ARROW_DISPLAY_LENGTH = 1.35;

// Target playback frame count (matches ExperimentPanel TARGET_FRAMES = 120)
const TARGET_FRAMES = 120;
const FRAME_MS      = 33; // ~30 fps

/**
 * Compute how many seconds of wall-clock time represent one second of
 * physical simulation time.
 *
 * @param {number} physicalDuration - total physical duration in seconds
 * @param {number} numPoints - total trajectory points
 * @returns {{ physicalTime, playbackTime, scaleFactor, scaleType }}
 */
export function computeTimeScale(physicalDuration, numPoints) {
  const step        = Math.max(1, Math.round(numPoints / TARGET_FRAMES));
  const frames      = Math.ceil(numPoints / step);
  const playbackTime = (frames * FRAME_MS) / 1000; // seconds
  const scaleFactor  = playbackTime > 0 ? physicalDuration / playbackTime : 1;
  return {
    physicalTime:  physicalDuration,
    playbackTime,
    scaleFactor,
    scaleType: SCALE_TYPE.SLOWED,
  };
}

/**
 * Build the full scale-metadata object passed to PhysicalScaleBadge.
 *
 * @param {object} opts
 * @param {string}  opts.frame
 * @param {number}  opts.physicalDuration
 * @param {number}  opts.numPoints
 * @param {boolean} opts.hasDecoherence
 * @param {number}  [opts.carrierSlowFactor] - only for lab frame
 * @returns {object}
 */
export function buildScaleMetadata({ frame, physicalDuration, numPoints, hasDecoherence, carrierSlowFactor }) {
  return {
    frame,
    timeScale:        computeTimeScale(physicalDuration, numPoints),
    fieldArrowScale:  SCALE_TYPE.NORMALIZED,
    blochVectorScale: SCALE_TYPE.EXACT,  // exact: |r| = 1 means pure state
    diagnosticsScale: SCALE_TYPE.DERIVED,
    hasDecoherence,
    carrierSlowFactor: frame === FRAMES.LAB ? (carrierSlowFactor ?? null) : null,
  };
}

/**
 * Normalize a 3-vector to unit length, returning both direction and magnitude.
 *
 * @param {[number, number, number]} vec
 * @returns {{ direction: number[], physicalMagnitude: number, available: boolean }}
 */
export function normalizeVec(vec) {
  const [x, y, z] = vec;
  const mag = Math.sqrt(x * x + y * y + z * z);
  if (mag < 1e-12) return { direction: [0, 0, 1], physicalMagnitude: 0, available: false };
  return {
    direction:        [x / mag, y / mag, z / mag],
    physicalMagnitude: mag,
    available:         true,
  };
}
