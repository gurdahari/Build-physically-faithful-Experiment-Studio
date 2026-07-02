/**
 * spinAdapter — a minimal, non-invasive bridge from the EXISTING proton-spin
 * experiment to the domain layer.  It does NOT replace the current execution path
 * or trajectory format; it only produces a serializable SimulationRecord that
 * links a run's metadata to the Proton Spin ModelContract.
 *
 * Pure data in → pure data out.  No React / Three.js / QuTiP objects.
 */

import { createSimulationRecord } from "./types.js";
import { HYDROGEN_ENTITY_ID, RES, CONTRACT, getContract } from "./hydrogen.js";
import { HYDROGEN_VISUAL_TRUTH } from "./visualTruth.js";

let _seq = 0;
const uid = () => `simrec.${Date.now().toString(36)}.${(_seq++).toString(36)}`;

/**
 * Build a SimulationRecord from existing spin-experiment metadata.
 *
 * @param {object} meta
 * @param {number[]} [meta.initialBloch]   initial Bloch vector
 * @param {object[]} [meta.sequence]       pulse/free sequence (config items)
 * @param {object}   [meta.decoherence]    { enabled, T1, T2, zEq }
 * @param {string}   [meta.quality]        preview | standard | high
 * @param {object}   [meta.solverInfo]     { solver, version } from the backend
 * @param {object}   [meta.finalDiagnostics] backend final_diagnostics
 * @param {number}   [meta.totalDuration]
 * @param {string}   [meta.createdAt]
 */
export function buildProtonSpinRecord(meta = {}) {
  const contract = getContract(CONTRACT.PROTON_SPIN);
  return createSimulationRecord({
    id: uid(),
    entityId: HYDROGEN_ENTITY_ID,
    resolutionId: RES.PROTON_SPIN,
    modelContractId: CONTRACT.PROTON_SPIN,
    modelVersion: contract.modelVersion,
    parameters: {
      sequence: meta.sequence ?? [],
      decoherence: meta.decoherence ?? { enabled: false },
      quality: meta.quality ?? "standard",
      totalDuration: meta.totalDuration ?? null,
    },
    initialState: {
      representation: "Bloch vector",
      bloch: meta.initialBloch ?? [0, 0, 1],
    },
    solver: meta.solverInfo?.solver ?? "qutip",
    solverConfiguration: {
      engine: meta.solverInfo?.solver ?? "qutip",
      version: meta.solverInfo?.version ?? null,
      quality: meta.quality ?? "standard",
    },
    observables: contract.observables,
    derivedQuantities: contract.derivedQuantities,
    approximationSet: contract.approximationSet,
    uncertaintyDiagnostics: meta.finalDiagnostics
      ? {
          trace: meta.finalDiagnostics.trace,
          purity: meta.finalDiagnostics.purity,
          blochNorm: meta.finalDiagnostics.bloch_norm,
          eigenvalues: meta.finalDiagnostics.eigenvalues,
        }
      : {},
    visualMappings: HYDROGEN_VISUAL_TRUTH.map(v => v.id),
    provenance: {
      source: "experiment-studio",
      adapter: "spinAdapter.buildProtonSpinRecord",
      note: "Effective proton spin-½ run; QuTiP authoritative. Trajectory format unchanged.",
    },
    createdAt: meta.createdAt ?? new Date().toISOString(),
  });
}
