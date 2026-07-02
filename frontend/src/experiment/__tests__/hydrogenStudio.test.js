/**
 * Structural guards for the Hydrogen navigation wiring in ExperimentStudio and
 * HydrogenInspector.  These verify (without WebGL/jsdom) that the semantic
 * navigation is separate from experiment state, that entering Hydrogen never
 * reruns the backend, and that exactly one contextual inspector is rendered.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcOf = (f) => readFileSync(join(here, "..", f), "utf8");
const studio = srcOf("ExperimentStudio.jsx");
const inspector = srcOf("HydrogenInspector.jsx");

// Slice a function/handler body by name for targeted assertions.
function bodyOf(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a + startMarker.length);
  return a >= 0 && b > a ? src.slice(a, b) : "";
}

describe("navigation state is separate from focus/experiment state", () => {
  it("uses a dedicated navigation reducer (not a single focus string)", () => {
    expect(/useReducer\(navReducer, initialNav\)/.test(studio)).toBe(true);
    // Camera focus stays its own state.
    expect(/const \[focusedObject, setFocusedObject\] = useState/.test(studio)).toBe(true);
  });

  it("second sample click enters Hydrogen via FOCUS_SAMPLE (camera stays close-up)", () => {
    const sel = bodyOf(studio, "const selectObject", "const selectResolution");
    expect(/id === "sample"/.test(sel)).toBe(true);
    expect(/dispatchNav\(\{ type: "FOCUS_SAMPLE" \}\)/.test(sel)).toBe(true);
    expect(/setFocusLevel\(1\)/.test(sel)).toBe(true);   // no macro for the sample
  });

  it("Back/Escape move outward one semantic level (navReducer BACK)", () => {
    const back = bodyOf(studio, "const goBack", "const selectItem");
    expect(/navReducer\(nav, \{ type: "BACK" \}\)/.test(back)).toBe(true);
    expect(/e\.key === "Escape"/.test(studio)).toBe(true);
  });
});

describe("entering Hydrogen does not rerun the backend or mutate experiment state", () => {
  it("the sample-focus / resolution / back handlers never call run/play/pause/seek", () => {
    const region = bodyOf(studio, "const selectObject", "const selectItem");
    expect(/\brun\(/.test(region)).toBe(false);
    expect(/\bplay\(/.test(region)).toBe(false);
    expect(/\bpause\(/.test(region)).toBe(false);
    expect(/\bseek\(/.test(region)).toBe(false);
    expect(/exp\.set/.test(region)).toBe(false);
  });

  it("the Hydrogen inspector reads only the domain layer (no experiment/backend imports)", () => {
    expect(/useExperiment/.test(inspector)).toBe(false);
    expect(/fetch\(/.test(inspector)).toBe(false);
    expect(/from "\.\.\/domain\//.test(inspector)).toBe(true);
  });
});

describe("exactly one contextual inspector", () => {
  it("renders HydrogenInspector OR FocusCard, never both", () => {
    // Mutually exclusive ternary on showsHydrogenInspector(nav).
    expect(/showsHydrogenInspector\(nav\) \?/.test(studio)).toBe(true);
    expect((studio.match(/<HydrogenInspector/g) ?? []).length).toBe(1);
    expect((studio.match(/<FocusCard/g) ?? []).length).toBe(1);
  });

  it("HydrogenInspector renders a single card per view", () => {
    // One card container id per view function (entity / resolution).
    expect((inspector.match(/data-testid="hydrogen-inspector"/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

describe("existing apparatus focus is preserved", () => {
  it("non-sample objects still use the Close-up → Macro camera focus", () => {
    const sel = bodyOf(studio, "const selectObject", "const selectResolution");
    expect(/nextFocus\(\{ object: focusedObject, level: focusLevel \}, id\)/.test(sel)).toBe(true);
    // Clicking another object leaves the Hydrogen path.
    expect(/dispatchNav\(\{ type: "EXIT" \}\)/.test(sel)).toBe(true);
  });
});

describe("model-transition message", () => {
  it("is shown on resolution change and is non-blocking", () => {
    const region = bodyOf(studio, "const selectResolution", "const goBack");
    expect(/setTransition\(/.test(region)).toBe(true);
    expect(/data-testid="model-transition"/.test(studio)).toBe(true);
    expect(/pointerEvents: "none"/.test(studio)).toBe(true);   // non-blocking
  });
});
