/**
 * Pure-mapping tests for the DECLARED atomic visual mappings.  These verify that
 * the frontend only maps already-computed backend samples to rendering
 * attributes and builds correct requests — it never computes atomic physics.
 */

import { describe, it, expect } from "vitest";
import {
  QUALITY_RES, qualityResolution, MODES, boundsForCoefficients,
  isStationaryResponse, coefficientsAreEvolving, buildEvaluateBody, requestCacheKey,
  DENSITY_THRESHOLD, flattenVolumeField, densityVisual, phaseColor,
  currentArrowsFromResponse, normalizationText,
} from "../atomicVisual.js";
import { KEYS } from "../atomicPresets.js";

// ── Test helpers: synthetic BACKEND responses (never computed in the frontend) ──
function volResponse({ res = 5, L = 8, beat = [], abs2fn = () => 1, jfn = null } = {}) {
  const axis = Array.from({ length: res }, (_, i) => -L + (2 * L * i) / (res - 1));
  const mk3 = (fn) => axis.map((x) => axis.map((y) => axis.map((z) => fn(x, y, z))));
  const fields = { abs2: mk3(abs2fn) };
  if (jfn) {
    fields.jx = mk3((x, y, z) => jfn(x, y, z).jx);
    fields.jy = mk3((x, y, z) => jfn(x, y, z).jy);
    fields.jz = mk3((x, y, z) => jfn(x, y, z).jz);
  }
  return {
    beat_frequencies_rad_s: beat,
    sampling: { type: "volume", bound_amu: L, resolution: res, axis_amu: axis, shape: [res, res, res], fields },
    normalization_diagnostics: { numerical_integral: 0.983, omitted_tail_estimate: 0.017, status: "ok", domain: { box_half_extent_amu: L } },
  };
}

describe("quality → resolution", () => {
  it("maps the three tiers monotonically and defaults safely", () => {
    expect(qualityResolution("preview")).toBe(QUALITY_RES.preview);
    expect(qualityResolution("high")).toBe(QUALITY_RES.high);
    expect(QUALITY_RES.preview).toBeLessThan(QUALITY_RES.standard);
    expect(QUALITY_RES.standard).toBeLessThan(QUALITY_RES.high);
    expect(qualityResolution("nonsense")).toBe(QUALITY_RES.standard);
  });
});

describe("declared framing bounds", () => {
  it("uses a larger box for n=2 states than for 1s", () => {
    const b1 = boundsForCoefficients([{ state: KEYS.s1, real: 1, imag: 0 }]);
    const b2 = boundsForCoefficients([{ state: KEYS.p0, real: 1, imag: 0 }]);
    expect(b2).toBeGreaterThan(b1);
  });
});

describe("stationarity is decided by the backend", () => {
  it("empty (or missing) beat list ⇒ stationary; nonempty ⇒ evolving", () => {
    expect(isStationaryResponse(null)).toBe(true);
    expect(isStationaryResponse({ beat_frequencies_rad_s: [] })).toBe(true);
    expect(isStationaryResponse({ beat_frequencies_rad_s: [1e16] })).toBe(false);
  });

  it("pre-response evolving hint = spans distinct principal quantum numbers", () => {
    expect(coefficientsAreEvolving([{ state: KEYS.p_p1, real: 1, imag: 0 }, { state: KEYS.p_m1, real: 1, imag: 0 }])).toBe(false);
    expect(coefficientsAreEvolving([{ state: KEYS.s1, real: 1, imag: 0 }, { state: KEYS.p0, real: 1, imag: 0 }])).toBe(true);
  });
});

describe("buildEvaluateBody", () => {
  const coeffs = [{ state: KEYS.p0, real: 1, imag: 0 }];

  it("density: volume + abs2 only at the tier resolution", () => {
    const body = buildEvaluateBody({ coefficients: coeffs, mode: "density", quality: "standard" });
    expect(body.sampling.type).toBe("volume");
    expect(body.sampling.resolution).toBe(QUALITY_RES.standard);
    expect(body.quantities).toEqual(["abs2"]);
  });

  it("phase: volume requesting abs2 + phase", () => {
    const body = buildEvaluateBody({ coefficients: coeffs, mode: "phase", quality: "standard" });
    expect(body.quantities).toEqual(["abs2", "phase"]);
  });

  it("current: bounded-resolution volume requesting the current components", () => {
    const body = buildEvaluateBody({ coefficients: coeffs, mode: "current", quality: "high" });
    expect(body.sampling.type).toBe("volume");
    expect(body.sampling.resolution).toBeLessThanOrEqual(14);
    expect(body.quantities).toEqual(["abs2", "jx", "jy", "jz"]);
  });

  it("section: an xz plane at a bounded resolution", () => {
    const body = buildEvaluateBody({ coefficients: coeffs, mode: "section", quality: "high" });
    expect(body.sampling.type).toBe("plane");
    expect(body.sampling.plane).toBe("xz");
    expect(body.sampling.resolution).toBeLessThanOrEqual(96);
    expect(body.quantities).toEqual(["abs2", "phase"]);
  });

  it("passes the requested time and an explicit diagnostic bound", () => {
    const body = buildEvaluateBody({ coefficients: coeffs, time: 3e-16, mode: "density", quality: "preview", bound: 20 });
    expect(body.time_seconds).toBe(3e-16);
    expect(body.sampling.bound_amu).toBe(20);
    expect(body.diagnostic_bound_amu).toBe(20);
  });

  it("MODES covers exactly the four representations", () => {
    expect(MODES).toEqual(["density", "phase", "current", "section"]);
  });
});

describe("requestCacheKey", () => {
  const coeffs = [{ state: KEYS.s1, real: 1, imag: 0 }];
  it("is deterministic for identical requests", () => {
    const a = requestCacheKey(buildEvaluateBody({ coefficients: coeffs, mode: "density", quality: "standard" }));
    const b = requestCacheKey(buildEvaluateBody({ coefficients: coeffs, mode: "density", quality: "standard" }));
    expect(a).toBe(b);
  });
  it("distinguishes time, mode, and quality", () => {
    const base = buildEvaluateBody({ coefficients: coeffs, mode: "density", quality: "standard" });
    const t = buildEvaluateBody({ coefficients: coeffs, time: 1e-16, mode: "density", quality: "standard" });
    const m = buildEvaluateBody({ coefficients: coeffs, mode: "phase", quality: "standard" });
    const q = buildEvaluateBody({ coefficients: coeffs, mode: "density", quality: "high" });
    const k = requestCacheKey(base);
    expect(requestCacheKey(t)).not.toBe(k);
    expect(requestCacheKey(m)).not.toBe(k);
    expect(requestCacheKey(q)).not.toBe(k);
  });
});

describe("flattenVolumeField", () => {
  it("emits res³ points in (i,j,k) order matching the axis", () => {
    const axis = [-1, 0, 1];
    const field = axis.map((_, i) => axis.map((__, j) => axis.map((___, k) => i * 100 + j * 10 + k)));
    const { positions, values, count } = flattenVolumeField(axis, field);
    expect(count).toBe(27);
    expect(positions.length).toBe(27 * 3);
    // First point is (axis0,axis0,axis0) with value field[0][0][0] = 0.
    expect([positions[0], positions[1], positions[2]]).toEqual([-1, -1, -1]);
    expect(values[0]).toBe(0);
    // Point index 5 = (i=0,j=1,k=2) → value 12, position (-1, 0, 1).
    expect(values[5]).toBe(12);
    expect([positions[15], positions[16], positions[17]]).toEqual([-1, 0, 1]);
  });
});

describe("densityVisual", () => {
  it("max-normalizes to opacity, filters the noise floor, and grows size with density", () => {
    const { alpha, size, maxDensity } = densityVisual([0, 0.5, 1, DENSITY_THRESHOLD * 0.5]);
    expect(maxDensity).toBe(1);
    expect(alpha[2]).toBeCloseTo(1, 6);          // peak → full opacity
    expect(size[2]).toBeGreaterThan(size[1]);      // denser → larger point
    expect(alpha[1]).toBeGreaterThan(0);
    expect(alpha[1]).toBeLessThan(1);
    expect(alpha[3]).toBe(0);                       // below threshold → invisible
    expect(size[3]).toBe(0);
    expect(alpha[0]).toBe(0);
  });
});

describe("phaseColor", () => {
  it("is 2π-cyclic and returns rgb within [0,1]", () => {
    const a = phaseColor(0.3);
    const b = phaseColor(0.3 + 2 * Math.PI);
    for (let i = 0; i < 3; i++) {
      expect(a[i]).toBeCloseTo(b[i], 6);
      expect(a[i]).toBeGreaterThanOrEqual(0);
      expect(a[i]).toBeLessThanOrEqual(1);
    }
  });
  it("distinguishes opposite phases", () => {
    expect(phaseColor(0)).not.toEqual(phaseColor(Math.PI));
  });
});

describe("currentArrowsFromResponse", () => {
  it("returns NO arrows when the backend current is zero (stationary real orbital)", () => {
    const resp = volResponse({ jfn: () => ({ jx: 0, jy: 0, jz: 0 }) });
    expect(currentArrowsFromResponse(resp).arrows).toHaveLength(0);
  });

  it("returns no arrows when current components are absent", () => {
    expect(currentArrowsFromResponse(volResponse()).arrows).toHaveLength(0);
  });

  it("shows OPPOSITE circulation for opposite m (sign of the swirl flips)", () => {
    const swirl = (s) => volResponse({ res: 5, jfn: (x, y) => ({ jx: -y * s, jy: x * s, jz: 0 }) });
    const circ = (arrows) => arrows.reduce((a, r) => a + (r.x * r.dy - r.y * r.dx), 0);
    const plus = currentArrowsFromResponse(swirl(+1)).arrows;
    const minus = currentArrowsFromResponse(swirl(-1)).arrows;
    expect(plus.length).toBeGreaterThan(0);
    expect(Math.sign(circ(plus))).toBe(1);
    expect(Math.sign(circ(minus))).toBe(-1);
  });

  it("caps the number of arrows", () => {
    const resp = volResponse({ res: 12, jfn: (x, y) => ({ jx: -y, jy: x, jz: 0.001 }) });
    expect(currentArrowsFromResponse(resp, { maxArrows: 20 }).arrows.length).toBeLessThanOrEqual(20);
  });
});

describe("normalizationText", () => {
  it("reports the finite-domain integral and omitted tail honestly", () => {
    const n = normalizationText(volResponse());
    expect(n.integral).toBeCloseTo(0.983, 6);
    expect(n.tail).toBeCloseTo(0.017, 6);
    expect(n.integral).toBeLessThan(1);            // finite box is NOT exactly 100%
    expect(normalizationText(null)).toBe(null);
  });
});
