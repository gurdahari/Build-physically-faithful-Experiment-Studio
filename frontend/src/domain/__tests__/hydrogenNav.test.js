/**
 * Tests for the deterministic Hydrogen navigation state machine (no WebGL).
 * Covers the Laboratory → Sample → Hydrogen → Resolution hierarchy and the
 * level-by-level Back/Escape behavior.
 */

import { describe, it, expect } from "vitest";
import {
  NAV_LEVEL, initialNav, navReducer, outerLevel, inHydrogenPath, showsHydrogenInspector,
} from "../hydrogenNav.js";
import { RES } from "../hydrogen.js";

const FOCUS = { type: "FOCUS_SAMPLE" };
const BACK = { type: "BACK" };
const ESC = { type: "ESCAPE" };

describe("navReducer — sample entry", () => {
  it("starts in the laboratory", () => {
    expect(initialNav.level).toBe(NAV_LEVEL.LAB);
    expect(initialNav.resolutionId).toBeNull();
  });

  it("first sample click enters Sample Close-up", () => {
    const s = navReducer(initialNav, FOCUS);
    expect(s.level).toBe(NAV_LEVEL.SAMPLE);
  });

  it("second sample click enters Hydrogen Entity", () => {
    const s = navReducer(navReducer(initialNav, FOCUS), FOCUS);
    expect(s.level).toBe(NAV_LEVEL.HYDROGEN);
  });

  it("further sample clicks stay in Hydrogen Entity", () => {
    let s = navReducer(navReducer(initialNav, FOCUS), FOCUS);
    s = navReducer(s, FOCUS);
    expect(s.level).toBe(NAV_LEVEL.HYDROGEN);
  });
});

describe("navReducer — resolution selection", () => {
  const hydrogen = navReducer(navReducer(initialNav, FOCUS), FOCUS); // → HYDROGEN

  it("Proton Spin selection opens that resolution", () => {
    const s = navReducer(hydrogen, { type: "SELECT_RESOLUTION", resolutionId: RES.PROTON_SPIN });
    expect(s.level).toBe(NAV_LEVEL.RESOLUTION);
    expect(s.resolutionId).toBe(RES.PROTON_SPIN);
  });

  it("placeholder selection opens that (placeholder) resolution", () => {
    const s = navReducer(hydrogen, { type: "SELECT_RESOLUTION", resolutionId: RES.ATOMIC });
    expect(s.level).toBe(NAV_LEVEL.RESOLUTION);
    expect(s.resolutionId).toBe(RES.ATOMIC);
  });

  it("can switch between resolutions", () => {
    let s = navReducer(hydrogen, { type: "SELECT_RESOLUTION", resolutionId: RES.ATOMIC });
    s = navReducer(s, { type: "SELECT_RESOLUTION", resolutionId: RES.PROTON_SPIN });
    expect(s.resolutionId).toBe(RES.PROTON_SPIN);
  });

  it("ignores resolution selection outside the Hydrogen path", () => {
    expect(navReducer(initialNav, { type: "SELECT_RESOLUTION", resolutionId: RES.ATOMIC }))
      .toEqual(initialNav);
  });
});

describe("navReducer — Back / Escape move outward one level", () => {
  it("Back steps Resolution → Hydrogen → Sample → Lab", () => {
    let s = navReducer(navReducer(initialNav, FOCUS), FOCUS);        // HYDROGEN
    s = navReducer(s, { type: "SELECT_RESOLUTION", resolutionId: RES.PROTON_SPIN }); // RESOLUTION
    s = navReducer(s, BACK); expect(s.level).toBe(NAV_LEVEL.HYDROGEN);
    expect(s.resolutionId).toBeNull();
    s = navReducer(s, BACK); expect(s.level).toBe(NAV_LEVEL.SAMPLE);
    s = navReducer(s, BACK); expect(s.level).toBe(NAV_LEVEL.LAB);
    s = navReducer(s, BACK); expect(s.level).toBe(NAV_LEVEL.LAB);   // idempotent at lab
  });

  it("Escape behaves identically to Back", () => {
    let s = navReducer(navReducer(initialNav, FOCUS), FOCUS);        // HYDROGEN
    s = navReducer(s, ESC); expect(s.level).toBe(NAV_LEVEL.SAMPLE);
    s = navReducer(s, ESC); expect(s.level).toBe(NAV_LEVEL.LAB);
  });

  it("EXIT jumps straight back to the laboratory", () => {
    let s = navReducer(navReducer(initialNav, FOCUS), FOCUS);        // HYDROGEN
    s = navReducer(s, { type: "SELECT_RESOLUTION", resolutionId: RES.ATOMIC });
    expect(navReducer(s, { type: "EXIT" })).toEqual(initialNav);
  });

  it("outerLevel helper is correct", () => {
    expect(outerLevel(NAV_LEVEL.RESOLUTION)).toBe(NAV_LEVEL.HYDROGEN);
    expect(outerLevel(NAV_LEVEL.HYDROGEN)).toBe(NAV_LEVEL.SAMPLE);
    expect(outerLevel(NAV_LEVEL.SAMPLE)).toBe(NAV_LEVEL.LAB);
    expect(outerLevel(NAV_LEVEL.LAB)).toBe(NAV_LEVEL.LAB);
  });
});

describe("nav predicates", () => {
  it("inHydrogenPath is false only at the laboratory", () => {
    expect(inHydrogenPath(initialNav)).toBe(false);
    expect(inHydrogenPath({ level: NAV_LEVEL.SAMPLE })).toBe(true);
    expect(inHydrogenPath({ level: NAV_LEVEL.RESOLUTION })).toBe(true);
  });
  it("showsHydrogenInspector only at Hydrogen/Resolution (not Sample)", () => {
    expect(showsHydrogenInspector({ level: NAV_LEVEL.SAMPLE })).toBe(false);
    expect(showsHydrogenInspector({ level: NAV_LEVEL.HYDROGEN })).toBe(true);
    expect(showsHydrogenInspector({ level: NAV_LEVEL.RESOLUTION })).toBe(true);
  });
});
