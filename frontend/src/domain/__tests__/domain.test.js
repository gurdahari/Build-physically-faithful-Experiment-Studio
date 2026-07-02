/**
 * Tests for the solver-independent domain layer: Hydrogen entity, resolution
 * hierarchy, model contracts, visual-truth descriptors, and the spin adapter.
 */

import { describe, it, expect } from "vitest";
import {
  RESOLUTION_STATUS, VISUAL_CATEGORY,
  createVisualTruthDescriptor, createSimulationRecord, isJsonSerializable,
} from "../types.js";
import {
  HydrogenEntity, HYDROGEN_RESOLUTIONS, HYDROGEN_CONTRACTS, RES, CONTRACT,
  getResolution, getContract, getContractForResolution, isActive, listResolutions,
} from "../hydrogen.js";
import { HYDROGEN_VISUAL_TRUTH } from "../visualTruth.js";
import { buildProtonSpinRecord } from "../spinAdapter.js";

// ── Entity + resolution hierarchy ─────────────────────────────────────────────
describe("HydrogenEntity", () => {
  it("is Hydrogen with five resolutions and an active default", () => {
    expect(HydrogenEntity.displayName).toBe("Hydrogen");
    expect(HydrogenEntity.resolutions).toHaveLength(5);
    expect(HydrogenEntity.defaultResolutionId).toBe(RES.PROTON_SPIN);
    expect(isActive(HydrogenEntity.defaultResolutionId)).toBe(true);
  });

  it("has stable, unique resolution identifiers", () => {
    const ids = HYDROGEN_RESOLUTIONS.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Stable string ids (not array indices).
    expect(RES.PROTON_SPIN).toBe("hydrogen.res.proton_spin_effective");
    for (const id of ids) expect(typeof id).toBe("string");
  });

  it("encodes the parent → child resolution hierarchy", () => {
    expect(getResolution(RES.LABORATORY).parentResolutionId).toBeNull();
    expect(getResolution(RES.PROTON_SPIN).parentResolutionId).toBe(RES.LABORATORY);
    expect(getResolution(RES.ATOMIC).parentResolutionId).toBe(RES.PROTON_SPIN);
    expect(getResolution(RES.PRECISION).parentResolutionId).toBe(RES.ATOMIC);
    expect(getResolution(RES.PROTON_INTERNAL).parentResolutionId).toBe(RES.PRECISION);
    expect(getResolution(RES.LABORATORY).childResolutionIds).toContain(RES.PROTON_SPIN);
  });

  it("associates a model contract with every resolution", () => {
    for (const r of listResolutions()) {
      const c = getContractForResolution(r.id);
      expect(c).toBeTruthy();
      expect(c.id).toBe(r.modelContractId);
      expect(c.resolutionId).toBe(r.id);
      expect(c.entityId).toBe(HydrogenEntity.id);
    }
  });

  it("marks correct active vs placeholder statuses", () => {
    expect(getResolution(RES.LABORATORY).status).toBe(RESOLUTION_STATUS.ACTIVE);
    expect(getResolution(RES.PROTON_SPIN).status).toBe(RESOLUTION_STATUS.ACTIVE);
    // Milestone 3 activates the Atomic resolution (interactive |ψ|² visualization).
    expect(getResolution(RES.ATOMIC).status).toBe(RESOLUTION_STATUS.ACTIVE);
    expect(getResolution(RES.PRECISION).status).toBe(RESOLUTION_STATUS.PLACEHOLDER);
    expect(getResolution(RES.PROTON_INTERNAL).status).toBe(RESOLUTION_STATUS.PLACEHOLDER);
  });
});

// ── Model contracts — honest declarations ─────────────────────────────────────
describe("Proton Spin contract", () => {
  const c = getContract(CONTRACT.PROTON_SPIN);
  it("declares QuTiP as authoritative and dimension two", () => {
    expect(c.solver).toMatch(/QuTiP/i);
    expect(c.limitations.join(" ")).toMatch(/QuTiP is the authoritative engine/i);
    expect(c.limitations.join(" ")).toMatch(/dimension is currently two/i);
    expect(c.stateRepresentation).toMatch(/dimension 2/i);
  });
  it("declares the omitted atomic degrees of freedom", () => {
    const omitted = c.omittedDegreesOfFreedom.join(" ");
    expect(omitted).toMatch(/electron orbital/i);
    expect(omitted).toMatch(/complete atomic Hydrogen/i);
    expect(omitted).toMatch(/proton internal structure/i);
  });
});

describe("Atomic contract", () => {
  const c = getContract(CONTRACT.ATOMIC);
  it("declares the analytic backend solver and an active, honest |ψ|² visualization (Milestone 3)", () => {
    expect(c.solver).toMatch(/analytic backend solver/i);
    expect(c.solver).not.toMatch(/QuTiP is used/i);
    expect(c.theory).toMatch(/nonrelativistic electron.?proton Coulomb/i);
    const lim = c.limitations.join(" ");
    // Visualizes backend-sampled fields — not a photograph, not a material cloud.
    expect(lim).toMatch(/Visualizes backend-sampled/i);
    expect(lim).toMatch(/not a photograph/i);
    expect(lim).toMatch(/does NOT contain exactly 100%/i);
    // Forbids the classical/rotating/material-cloud misreadings.
    const forb = c.forbiddenRepresentations.join(" ");
    expect(forb).toMatch(/classical electron orbit/i);
    expect(forb).toMatch(/rotating stationary orbital/i);
    // The resolution is now active.
    expect(getResolution(RES.ATOMIC).status).toBe(RESOLUTION_STATUS.ACTIVE);
  });
});

describe("Proton Internal contract", () => {
  const c = getContract(CONTRACT.PROTON_INTERNAL);
  it("rejects real-time QCD / quark / gluon claims", () => {
    const lim = c.limitations.join(" ");
    expect(lim).toMatch(/No real-time first-principles QCD simulation is active/i);
    expect(lim).toMatch(/No quark or gluon trajectories are available/i);
    expect(c.forbiddenRepresentations.join(" ")).toMatch(/quark/i);
    expect(c.forbiddenRepresentations.join(" ")).toMatch(/gluon/i);
    expect(lim).toMatch(/declared model or dataset provenance/i);
  });
});

// ── Visual-truth descriptors ──────────────────────────────────────────────────
describe("VisualTruthDescriptor", () => {
  it("validates the category enum", () => {
    expect(() => createVisualTruthDescriptor({
      id: "x", quantityName: "q", category: "bogus", modelContractId: CONTRACT.PROTON_SPIN,
    })).toThrow();
    const ok = createVisualTruthDescriptor({
      id: "x", quantityName: "q", category: VISUAL_CATEGORY.OBSERVABLE, modelContractId: CONTRACT.PROTON_SPIN,
    });
    expect(ok.category).toBe("observable");
  });

  it("provides descriptors for the core existing elements with valid categories", () => {
    const names = HYDROGEN_VISUAL_TRUTH.map(v => v.quantityName).join(" | ");
    expect(names).toMatch(/B₀/);
    expect(names).toMatch(/B₁/);
    expect(names).toMatch(/Bloch/);
    expect(names).toMatch(/Detector/);
    expect(names).toMatch(/proton.?spin/i);
    for (const v of HYDROGEN_VISUAL_TRUTH) {
      expect(Object.values(VISUAL_CATEGORY)).toContain(v.category);
      expect(v.modelContractId).toBe(CONTRACT.PROTON_SPIN);
    }
  });
});

// ── SimulationRecord + spin adapter ───────────────────────────────────────────
describe("SimulationRecord + spinAdapter", () => {
  it("serializes cleanly to JSON", () => {
    const rec = createSimulationRecord({
      id: "r1", entityId: HydrogenEntity.id, resolutionId: RES.PROTON_SPIN,
      modelContractId: CONTRACT.PROTON_SPIN,
    });
    expect(isJsonSerializable(rec)).toBe(true);
    expect(JSON.parse(JSON.stringify(rec)).id).toBe("r1");
  });

  it("builds a record from existing spin metadata linked to the contract", () => {
    const rec = buildProtonSpinRecord({
      initialBloch: [0, 0, 1],
      sequence: [{ type: "pulse", pulse_shape: "square", amplitude: Math.PI, phase: 0, duration: 1 }],
      decoherence: { enabled: false },
      quality: "standard",
      solverInfo: { solver: "qutip", version: "5.x" },
      finalDiagnostics: { trace: 1, purity: 1, bloch_norm: 1, eigenvalues: [1, 0] },
      totalDuration: 1,
    });
    expect(rec.kind).toBe("SimulationRecord");
    expect(rec.entityId).toBe(HydrogenEntity.id);
    expect(rec.resolutionId).toBe(RES.PROTON_SPIN);
    expect(rec.modelContractId).toBe(CONTRACT.PROTON_SPIN);
    expect(rec.solver).toBe("qutip");
    expect(rec.initialState.bloch).toEqual([0, 0, 1]);
    expect(rec.observables).toContain("⟨σz⟩");
    expect(rec.visualMappings.length).toBeGreaterThan(0);
    expect(isJsonSerializable(rec)).toBe(true);
  });

  it("all static domain objects are JSON-serializable", () => {
    expect(isJsonSerializable(HydrogenEntity)).toBe(true);
    for (const r of HYDROGEN_RESOLUTIONS) expect(isJsonSerializable(r)).toBe(true);
    for (const c of Object.values(HYDROGEN_CONTRACTS)) expect(isJsonSerializable(c)).toBe(true);
    for (const v of HYDROGEN_VISUAL_TRUTH) expect(isJsonSerializable(v)).toBe(true);
  });
});
