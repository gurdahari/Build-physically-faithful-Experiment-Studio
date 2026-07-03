/**
 * Structural + domain guards for the Milestone 3 Atomic Hydrogen visualization.
 *
 * These verify (without WebGL) the non-negotiable scientific-integrity rules:
 *   • the Atomic resolution is now ACTIVE and carries VisualTruth descriptors;
 *   • the frontend requests authoritative backend fields and computes NO physics;
 *   • stale requests are cancelled and never overwrite newer state;
 *   • playback is bounded-cadence and stationary states are never animated;
 *   • no classical orbit / rotating-orbital / frontend-invented evolution exists;
 *   • the Atomic scene REPLACES the lab scene while the app shell is preserved.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isActive, RES, getContractForResolution } from "../../domain/hydrogen.js";
import { RESOLUTION_STATUS } from "../../domain/types.js";
import { listAtomicVisualTruth } from "../../domain/visualTruth.js";
import { CONTRACT } from "../../domain/hydrogen.js";

const here = dirname(fileURLToPath(import.meta.url));
const srcOf = (f) => readFileSync(join(here, "..", f), "utf8");
const scene = srcOf("AtomicHydrogenScene.jsx");
const controls = srcOf("AtomicControls.jsx");
const hook = srcOf("useAtomicHydrogen.js");
const studio = srcOf("ExperimentStudio.jsx");
const inspector = srcOf("HydrogenInspector.jsx");

function bodyOf(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a + startMarker.length);
  return a >= 0 && b > a ? src.slice(a, b) : "";
}

// ── Domain: the Atomic resolution is active with declared visual truth ────────
describe("Atomic resolution is now active", () => {
  it("reports ACTIVE status (visualization available)", () => {
    expect(isActive(RES.ATOMIC)).toBe(true);
    const contract = getContractForResolution(RES.ATOMIC);
    expect(contract.solver).toMatch(/analytic backend solver/);
  });

  it("forbids classical orbits, rotating orbitals, and material-cloud readings", () => {
    const f = getContractForResolution(RES.ATOMIC).forbiddenRepresentations.join(" ").toLowerCase();
    expect(f).toMatch(/classical electron orbit/);
    expect(f).toMatch(/rotating stationary orbital/);
    expect(f).toMatch(/material-cloud/);
    expect(f).toMatch(/frontend-invented/);
  });
});

describe("Atomic VisualTruth descriptors", () => {
  const atomic = listAtomicVisualTruth();
  it("declares density, phase, current, proton marker, energy inset, time, normalization", () => {
    const ids = atomic.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining([
      "visual.atomic.density", "visual.atomic.phase", "visual.atomic.current",
      "visual.atomic.proton_marker", "visual.atomic.energy_inset",
      "visual.atomic.time", "visual.atomic.normalization",
    ]));
  });
  it("every atomic descriptor is bound to the atomic contract and states its limits", () => {
    for (const d of atomic) {
      expect(d.modelContractId).toBe(CONTRACT.ATOMIC);
      expect(d.limitations.length).toBeGreaterThan(0);
    }
  });
  it("the density is the primary faithful representation (observable) and NOT a material cloud", () => {
    const density = atomic.find((d) => d.id === "visual.atomic.density");
    expect(density.category).toBe("observable");
    expect(density.visualScaling.toLowerCase()).toMatch(/not a material cloud/);
  });
});

// ── The hook requests backend fields and computes NO atomic physics ───────────
describe("useAtomicHydrogen requests authoritative fields, computes no physics", () => {
  it("POSTs to the backend atomic evaluate endpoint", () => {
    expect(/\/hydrogen\/atomic\/evaluate/.test(hook)).toBe(true);
    expect(/method: "POST"/.test(hook)).toBe(true);
  });

  it("never computes eigenfunctions/energies (no laguerre/harmonic special functions)", () => {
    expect(/genlaguerre|sph_harm|legendre|hermite|factorial/i.test(hook)).toBe(false);
  });

  it("cancels stale requests with AbortController and a monotonic token guard", () => {
    expect(/new AbortController\(\)/.test(hook)).toBe(true);
    expect(/abortRef\.current\.abort\(\)/.test(hook)).toBe(true);
    expect(/myToken !== tokenRef\.current/.test(hook)).toBe(true);   // stale can't replace newer
  });

  it("issues no requests while inactive and aborts in-flight on deactivation", () => {
    // Debounced state/mode/quality effect bails out when inactive.
    expect(/if \(!active\) return;/.test(hook)).toBe(true);
    const off = bodyOf(hook, "When Atomic becomes inactive", "Bounded-cadence");
    expect(/abortRef\.current\.abort\(\)/.test(off)).toBe(true);
    expect(/setPlaying\(false\)/.test(off)).toBe(true);
  });

  it("playback is bounded-cadence and only refetches for evolving states", () => {
    expect(/PLAYBACK_INTERVAL_MS/.test(hook)).toBe(true);
    expect(/setInterval\(/.test(hook)).toBe(true);
    const play = bodyOf(hook, "Bounded-cadence playback", "On pause");
    expect(/if \(evolving && !inFlightRef\.current\)/.test(play)).toBe(true);
    expect(/"preview"/.test(play)).toBe(true);                        // Preview during playback
  });

  it("bounds the response cache", () => {
    expect(/CACHE_MAX/.test(hook)).toBe(true);
    expect(/m\.size > CACHE_MAX/.test(hook)).toBe(true);
  });
});

// ── The renderer maps backend data only; no invented evolution/rotation ───────
describe("AtomicHydrogenScene renders backend samples faithfully", () => {
  it("has no per-frame animation (no useFrame ⇒ no rotating orbital / invented evolution)", () => {
    expect(/useFrame/.test(scene)).toBe(false);
  });

  it("renders the density as an additive, non-depth-writing point cloud (not a solid)", () => {
    expect(/AdditiveBlending/.test(scene)).toBe(true);
    expect(/depthWrite: false/.test(scene)).toBe(true);
    expect(/<points /.test(scene)).toBe(true);
  });

  it("places a proton localization marker and an energy inset, and never fetches", () => {
    expect(/sphereGeometry/.test(scene)).toBe(true);
    expect(/localization/i.test(scene)).toBe(true);
    expect(/data-testid="energy-inset"/.test(scene)).toBe(true);
    expect(/fetch\(/.test(scene)).toBe(false);
  });

  it("provides camera orbit + reset without frontend physics", () => {
    expect(/OrbitControls/.test(scene)).toBe(true);
    expect(/resetView/.test(scene)).toBe(true);
  });
});

// ── The controls drive only the hook (single card), honest about stationarity ─
describe("AtomicControls", () => {
  it("exposes presets, representation modes, quality tiers, and time controls", () => {
    expect(/data-testid="atomic-preset"/.test(controls)).toBe(true);
    expect(/data-testid="atomic-mode"/.test(controls)).toBe(true);
    expect(/data-testid="atomic-quality"/.test(controls)).toBe(true);
    expect(/data-testid="atomic-play"/.test(controls)).toBe(true);
  });

  it("shows an honest stationary note (density not animated) instead of fake motion", () => {
    expect(/data-testid="atomic-stationary-note"/.test(controls)).toBe(true);
    expect(/time-independent/.test(controls)).toBe(true);
  });

  it("computes no physics and issues no requests itself", () => {
    expect(/fetch\(/.test(controls)).toBe(false);
    expect(/genlaguerre|sph_harm/i.test(controls)).toBe(false);
  });
});

// ── ExperimentStudio: swap the scene, preserve the app shell + experiment ─────
describe("ExperimentStudio scene swap at the Atomic resolution", () => {
  it("activates the atomic hook at the Atomic resolution (also as Precision spatial context)", () => {
    expect(/nav\.resolutionId === RES\.ATOMIC/.test(studio)).toBe(true);
    expect(/useAtomicHydrogen\(atomicActive \|\| precisionActive\)/.test(studio)).toBe(true);
  });

  it("renders the AtomicHydrogenScene in place of the lab scene (exactly one)", () => {
    expect(/\(atomicActive \|\| precisionActive\) \? \(\s*<AtomicHydrogenScene/.test(studio)).toBe(true);
    expect((studio.match(/<AtomicHydrogenScene/g) ?? []).length).toBe(1);
    // The lab scene still exists for every other resolution.
    expect((studio.match(/<PhysicalLabScene/g) ?? []).length).toBe(1);
  });

  it("hides the mathematical Bloch view during the atomic visualization", () => {
    expect(/showMath && !atomicActive/.test(studio)).toBe(true);
  });

  it("shares ONE contextual card (the inspector carries the live atomic controls)", () => {
    expect(/atomic=\{atomicActive \? atomic : null\}/.test(studio)).toBe(true);
    // The inspector renders the controls only when the live hook is provided.
    expect(/\{atomic && <AtomicControls atomic=\{atomic\} \/>\}/.test(inspector)).toBe(true);
  });

  it("selecting the atomic resolution never reruns/plays the QuTiP experiment", () => {
    const region = bodyOf(studio, "const selectResolution", "const goBack");
    expect(/exp\.run|exp\.play|\brun\(|\bplay\(/.test(region)).toBe(false);
  });
});
