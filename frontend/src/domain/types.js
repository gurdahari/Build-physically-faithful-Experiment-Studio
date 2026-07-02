/**
 * Solver-independent, serializable domain structures for the multiscale physical
 * model system.
 *
 * These are PLAIN DATA factories — no React, Three.js, camera, WebGL, QuTiP, or
 * FastAPI dependencies.  Every object produced here serializes cleanly to JSON.
 *
 *   PhysicalEntity        — a physical thing (e.g. Hydrogen) with several resolutions
 *   PhysicalResolution    — one theoretical resolution/level of an entity
 *   ModelContract         — the honest scientific contract of a model at a resolution
 *   VisualTruthDescriptor — how one quantity is mapped to a visual, with provenance
 *   SimulationRecord      — a serializable record of one simulation run
 */

export const RESOLUTION_STATUS = Object.freeze({
  ACTIVE:      "active",
  PLACEHOLDER: "placeholder",
});

export const VISUAL_CATEGORY = Object.freeze({
  OBSERVABLE:    "observable",     // directly measured / backend observable
  MODEL_DERIVED: "model-derived",  // algebraically derived from an observable
  INTERPRETIVE:  "interpretive",   // a pedagogical/interpretive representation
});

function req(value, name) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`domain: "${name}" is required`);
  }
  return value;
}

function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new Error(`domain: "${name}" must be one of ${allowed.join(", ")} (got ${value})`);
  }
  return value;
}

const arr = (v) => (Array.isArray(v) ? [...v] : []);

// ── PhysicalEntity ────────────────────────────────────────────────────────────
export function createPhysicalEntity(spec) {
  return {
    kind: "PhysicalEntity",
    id:                 req(spec.id, "entity.id"),
    displayName:        req(spec.displayName, "entity.displayName"),
    description:        spec.description ?? "",
    resolutions:        arr(spec.resolutions),          // resolution ids, ordered
    defaultResolutionId: req(spec.defaultResolutionId, "entity.defaultResolutionId"),
    modelContractIds:   arr(spec.modelContractIds),
    version:            spec.version ?? "0.1.0",
    provenance:         spec.provenance ?? { source: "internal", references: [] },
  };
}

// ── PhysicalResolution ────────────────────────────────────────────────────────
export function createPhysicalResolution(spec) {
  return {
    kind: "PhysicalResolution",
    id:                 req(spec.id, "resolution.id"),
    entityId:           req(spec.entityId, "resolution.entityId"),
    displayName:        req(spec.displayName, "resolution.displayName"),
    description:        spec.description ?? "",
    status:             oneOf(spec.status ?? RESOLUTION_STATUS.PLACEHOLDER,
                              Object.values(RESOLUTION_STATUS), "resolution.status"),
    modelContractId:    req(spec.modelContractId, "resolution.modelContractId"),
    parentResolutionId: spec.parentResolutionId ?? null,
    childResolutionIds: arr(spec.childResolutionIds),
    limitations:        spec.limitations ?? "",       // summary string
  };
}

// ── ModelContract ─────────────────────────────────────────────────────────────
export function createModelContract(spec) {
  return {
    kind: "ModelContract",
    id:                       req(spec.id, "contract.id"),
    entityId:                 req(spec.entityId, "contract.entityId"),
    resolutionId:             req(spec.resolutionId, "contract.resolutionId"),
    modelName:                req(spec.modelName, "contract.modelName"),
    theory:                   spec.theory ?? "",
    stateRepresentation:      spec.stateRepresentation ?? "",
    governingEquations:       arr(spec.governingEquations),
    includedDegreesOfFreedom: arr(spec.includedDegreesOfFreedom),
    omittedDegreesOfFreedom:  arr(spec.omittedDegreesOfFreedom),
    solver:                   spec.solver ?? "",       // solver or data source
    approximationSet:         arr(spec.approximationSet),
    observables:              arr(spec.observables),
    derivedQuantities:        arr(spec.derivedQuantities),
    validityRange:            spec.validityRange ?? "",
    uncertaintyStatement:     spec.uncertaintyStatement ?? "",
    allowedRepresentations:   arr(spec.allowedRepresentations),
    forbiddenRepresentations: arr(spec.forbiddenRepresentations),
    limitations:              arr(spec.limitations),
    modelVersion:             spec.modelVersion ?? "0.1.0",
  };
}

// ── VisualTruthDescriptor ─────────────────────────────────────────────────────
export function createVisualTruthDescriptor(spec) {
  return {
    kind: "VisualTruthDescriptor",
    id:               req(spec.id, "visual.id"),
    quantityName:     req(spec.quantityName, "visual.quantityName"),
    category:         oneOf(req(spec.category, "visual.category"),
                            Object.values(VISUAL_CATEGORY), "visual.category"),
    mathematicalSource: spec.mathematicalSource ?? "",
    modelContractId:  req(spec.modelContractId, "visual.modelContractId"),
    units:            spec.units ?? "",
    normalization:    spec.normalization ?? "",
    spatialMeaning:   spec.spatialMeaning ?? "",
    referenceFrame:   spec.referenceFrame ?? "",
    timeScaling:      spec.timeScaling ?? "",
    visualScaling:    spec.visualScaling ?? "",
    approximation:    spec.approximation ?? "",
    limitations:      spec.limitations ?? "",
  };
}

// ── SimulationRecord ──────────────────────────────────────────────────────────
export function createSimulationRecord(spec) {
  return {
    kind: "SimulationRecord",
    id:                   req(spec.id, "record.id"),
    entityId:             req(spec.entityId, "record.entityId"),
    resolutionId:         req(spec.resolutionId, "record.resolutionId"),
    modelContractId:      req(spec.modelContractId, "record.modelContractId"),
    modelVersion:         spec.modelVersion ?? "0.1.0",
    parameters:           spec.parameters ?? {},
    initialState:         spec.initialState ?? null,
    solver:               spec.solver ?? "",
    solverConfiguration:  spec.solverConfiguration ?? {},
    observables:          arr(spec.observables),
    derivedQuantities:    arr(spec.derivedQuantities),
    approximationSet:     arr(spec.approximationSet),
    uncertaintyDiagnostics: spec.uncertaintyDiagnostics ?? {},
    visualMappings:       arr(spec.visualMappings),    // VisualTruthDescriptor ids
    provenance:           spec.provenance ?? { source: "internal" },
    createdAt:            spec.createdAt ?? new Date().toISOString(),
  };
}

/** True iff `obj` survives a JSON round-trip unchanged (no functions/cycles). */
export function isJsonSerializable(obj) {
  try {
    return JSON.stringify(JSON.parse(JSON.stringify(obj))) === JSON.stringify(obj);
  } catch {
    return false;
  }
}
