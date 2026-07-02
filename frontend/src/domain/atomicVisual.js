/**
 * atomicVisual — DECLARED visual mappings of authoritative backend atomic data.
 *
 * The frontend never computes atomic physics.  These pure helpers only map
 * already-returned backend values to rendering attributes (opacity, size, hue,
 * arrow length) and build API requests.  Every mapping is documented in a
 * VisualTruthDescriptor (see domain/visualTruth.js).
 */

import { distinctN } from "./atomicPresets.js";

// ── Quality tiers → sampling resolution ──────────────────────────────────────
export const QUALITY_RES = { preview: 20, standard: 30, high: 40 };
export function qualityResolution(q) {
  return QUALITY_RES[q] ?? QUALITY_RES.standard;
}

export const MODES = ["density", "phase", "current", "section"];

// Declared visual framing bounds (aμ) — a rendering choice, not physics.
export function boundsForCoefficients(coefficients) {
  const anyN2 = coefficients.some((c) => /n2_/.test(c.state));
  return anyN2 ? 16 : 8;
}

/** Stationarity is decided by the BACKEND (empty beat list ⇒ stationary density). */
export function isStationaryResponse(resp) {
  return !resp || (resp.beat_frequencies_rad_s ?? []).length === 0;
}

/** Before any response, a state is time-dependent only if it spans distinct n. */
export function coefficientsAreEvolving(coefficients) {
  return distinctN(coefficients).size > 1;
}

// ── Request builder ──────────────────────────────────────────────────────────
export function buildEvaluateBody({ coefficients, time = 0, mode = "density", quality = "standard", bound }) {
  const L = bound ?? boundsForCoefficients(coefficients);
  const res = qualityResolution(quality);
  if (mode === "section") {
    return {
      coefficients, time_seconds: time,
      sampling: { type: "plane", plane: "xz", offset_amu: 0, bound_amu: L, resolution: Math.min(res * 2, 96) },
      quantities: ["abs2", "phase"],
      diagnostic_bound_amu: L,
    };
  }
  if (mode === "current") {
    return {
      coefficients, time_seconds: time,
      sampling: { type: "volume", bound_amu: L, resolution: Math.min(res, 14) },
      quantities: ["abs2", "jx", "jy", "jz"],
      diagnostic_bound_amu: L,
    };
  }
  const quantities = mode === "phase" ? ["abs2", "phase"] : ["abs2"];
  return {
    coefficients, time_seconds: time,
    sampling: { type: "volume", bound_amu: L, resolution: res },
    quantities, diagnostic_bound_amu: L,
  };
}

/** Deterministic cache key for a request (model/constants are fixed server-side). */
export function requestCacheKey(body) {
  const s = body.sampling;
  const co = body.coefficients.map((c) => `${c.state}:${c.real.toFixed(6)}:${c.imag.toFixed(6)}`).join(",");
  return [co, body.time_seconds.toExponential(6), s.type, s.plane ?? "", s.bound_amu, s.resolution,
    (body.quantities ?? []).join("+")].join("|");
}

// ── Density → per-point opacity / size (declared mapping) ────────────────────
export const DENSITY_THRESHOLD = 0.012;   // visual noise floor (fraction of max)

export function flattenVolumeField(axis, field3d) {
  const res = axis.length;
  const n = res * res * res;
  const positions = new Float32Array(n * 3);
  const values = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < res; i++)
    for (let j = 0; j < res; j++)
      for (let k = 0; k < res; k++) {
        positions[p * 3] = axis[i]; positions[p * 3 + 1] = axis[j]; positions[p * 3 + 2] = axis[k];
        values[p] = field3d[i][j][k];
        p++;
      }
  return { positions, values, count: n };
}

export function flattenVolumeScalar(axis, field3d) {
  return flattenVolumeField(axis, field3d).values;
}

/** density values → { alpha, size, maxDensity }. Low-density noise filtered. */
export function densityVisual(values, { threshold = DENSITY_THRESHOLD } = {}) {
  let max = 0;
  for (let i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
  const inv = max > 0 ? 1 / max : 0;
  const alpha = new Float32Array(values.length);
  const size = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const nrm = values[i] * inv;                 // 0..1 normalized to current max
    if (nrm > threshold) {
      alpha[i] = Math.pow(nrm, 0.55);            // gamma for perceptual visibility
      size[i] = 1.4 + 3.0 * nrm;
    }
  }
  return { alpha, size, maxDensity: max };
}

// ── Phase → hue (interpretive semantic mapping) ──────────────────────────────
function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

/** arg(ψ) ∈ [-π,π] → [r,g,b] on a cyclic hue wheel. Interpretive; not literal color in space. */
export function phaseColor(phase) {
  const h = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
  return hslToRgb(h, 0.72, 0.55);
}

// ── Probability current → sparse arrows (declared normalized magnitude) ──────
export function currentArrowsFromResponse(resp, { maxArrows = 180, densityThreshold = 0.06, jThreshold = 0.05 } = {}) {
  const s = resp?.sampling;
  if (!s || s.type !== "volume" || !s.fields.jx) return { arrows: [], maxCurrent: 0 };
  const axis = s.axis_amu, res = axis.length;
  const { jx, jy, jz, abs2 } = s.fields;
  let maxJ = 0, maxD = 0;
  for (let i = 0; i < res; i++)
    for (let j = 0; j < res; j++)
      for (let k = 0; k < res; k++) {
        const jm = Math.hypot(jx[i][j][k], jy[i][j][k], jz[i][j][k]);
        if (jm > maxJ) maxJ = jm;
        if (abs2[i][j][k] > maxD) maxD = abs2[i][j][k];
      }
  if (maxJ <= 0 || maxD <= 0) return { arrows: [], maxCurrent: maxJ };

  const raw = [];
  for (let i = 0; i < res; i++)
    for (let j = 0; j < res; j++)
      for (let k = 0; k < res; k++) {
        const jm = Math.hypot(jx[i][j][k], jy[i][j][k], jz[i][j][k]);
        if (abs2[i][j][k] / maxD > densityThreshold && jm / maxJ > jThreshold) {
          raw.push({
            x: axis[i], y: axis[j], z: axis[k],
            dx: jx[i][j][k] / jm, dy: jy[i][j][k] / jm, dz: jz[i][j][k] / jm,
            mag: jm / maxJ,
          });
        }
      }
  // Cap arrow count with a uniform stride.
  const stride = Math.max(1, Math.ceil(raw.length / maxArrows));
  const arrows = raw.filter((_, idx) => idx % stride === 0);
  return { arrows, maxCurrent: maxJ };
}

/** Honest finite-domain display string from the backend normalization diagnostics. */
export function normalizationText(resp) {
  const d = resp?.normalization_diagnostics;
  if (!d) return null;
  return {
    integral: d.numerical_integral,
    tail: d.omitted_tail_estimate,
    bound: d.domain?.box_half_extent_amu,
    status: d.status,
  };
}
