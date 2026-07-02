/**
 * HydrogenInspector — the single contextual card for the Hydrogen inspection
 * path.  Reuses the FocusCard visual approach; exactly one contextual inspector
 * is ever visible (ExperimentStudio shows either this OR the FocusCard).
 *
 * Entity level:     Hydrogen + selectable list of resolutions (with status).
 * Resolution level: model contract summary, or an honest placeholder.
 *
 * It reads only the pure domain layer — no physics, no rerun, no experiment state.
 */

import { C, PHYS } from "./theme.js";
import { RESOLUTION_STATUS } from "../domain/types.js";
import { NAV_LEVEL } from "../domain/hydrogenNav.js";
import {
  HydrogenEntity, listResolutions, getResolution, getContractForResolution,
} from "../domain/hydrogen.js";
import AtomicControls from "./AtomicControls.jsx";

const CARD = {
  position: "absolute", bottom: "12px", left: "12px", zIndex: 12,
  width: "244px", maxHeight: "70%", overflowY: "auto",
  background: "rgba(5,9,22,0.94)", border: `1px solid ${C.border}`,
  borderRadius: "10px", padding: "10px 12px", userSelect: "none",
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)", boxSizing: "border-box",
};
const HYDRO = "#9fd0ff";

function StatusBadge({ status }) {
  const active = status === RESOLUTION_STATUS.ACTIVE;
  return (
    <span style={{
      fontSize: "8px", letterSpacing: "0.06em", textTransform: "uppercase",
      padding: "1px 6px", borderRadius: "8px", flexShrink: 0,
      color: active ? "#8fe0a8" : C.warn,
      background: active ? "rgba(40,120,70,0.25)" : "rgba(120,90,30,0.25)",
      border: `1px solid ${active ? "rgba(60,180,90,0.4)" : "rgba(180,130,40,0.4)"}`,
    }}>{active ? "active" : "placeholder"}</span>
  );
}

function Header({ title, onBack, level }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: HYDRO, flexShrink: 0 }} />
      <span style={{ color: C.bright, fontSize: "11px", fontWeight: 700, flex: 1 }}>{title}</span>
      <button data-testid="hydrogen-back" onClick={onBack} title="Back one level (Esc)" style={{
        background: "rgba(20,28,55,0.85)", border: `1px solid ${C.border}`, borderRadius: "6px",
        color: C.text, fontSize: "10px", padding: "3px 8px", cursor: "pointer",
      }}>← Back</button>
    </div>
  );
}

function Row({ label, value, valueColor = C.text }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", lineHeight: "1.55" }}>
      <span style={{ color: "rgba(120,160,210,0.7)", fontSize: "9px", flexShrink: 0 }}>{label}</span>
      <span style={{ color: valueColor, fontSize: "9px", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function DofList({ label, items, color }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ marginTop: "5px" }}>
      <div style={{ color: "rgba(120,160,210,0.7)", fontSize: "8.5px", letterSpacing: "0.05em" }}>{label}</div>
      {items.map((d, i) => (
        <div key={i} style={{ color, fontSize: "9px", paddingLeft: "8px", lineHeight: "1.5" }}>· {d}</div>
      ))}
    </div>
  );
}

// ── Entity level: pick a resolution ──────────────────────────────────────────
function EntityView({ onSelectResolution, onBack }) {
  return (
    <div data-testid="hydrogen-inspector" style={CARD}>
      <Header title={HydrogenEntity.displayName} onBack={onBack} />
      <div style={{ color: "rgba(150,180,220,0.75)", fontSize: "8.5px", marginBottom: "8px" }}>
        Physical entity · one thing, several theoretical resolutions
      </div>
      {listResolutions().map((r) => (
        <button key={r.id} data-testid="hydrogen-resolution" onClick={() => onSelectResolution(r.id)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: "8px",
            background: "rgba(12,20,44,0.6)", border: `1px solid ${C.border}`, borderRadius: "7px",
            padding: "6px 8px", marginBottom: "5px", cursor: "pointer", textAlign: "left",
          }}>
          <span style={{ color: C.text, fontSize: "10px", flex: 1 }}>{r.displayName}</span>
          <StatusBadge status={r.status} />
        </button>
      ))}
    </div>
  );
}

// ── Resolution level: model contract or honest placeholder ───────────────────
function ResolutionView({ resolutionId, onBack, atomic }) {
  const res = getResolution(resolutionId);
  const contract = getContractForResolution(resolutionId);
  if (!res || !contract) {
    return (
      <div data-testid="hydrogen-inspector" style={CARD}>
        <Header title="Hydrogen" onBack={onBack} />
        <div style={{ color: C.danger, fontSize: "9px" }}>Unknown resolution.</div>
      </div>
    );
  }
  const placeholder = res.status === RESOLUTION_STATUS.PLACEHOLDER;

  return (
    <div data-testid="hydrogen-inspector" style={CARD}>
      <Header title={`Hydrogen · ${res.displayName}`} onBack={onBack} />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px" }}>
        <span style={{ color: HYDRO, fontSize: "9px" }}>{contract.modelName}</span>
        <div style={{ flex: 1 }} />
        <StatusBadge status={res.status} />
      </div>

      {placeholder ? (
        <div data-testid="hydrogen-placeholder">
          {/* Honest heading: distinguish "solver available (no visuals yet)" from "not implemented". */}
          {(/^none/i.test(contract.solver)) ? (
            <div style={{ color: C.warn, fontSize: "10px", fontWeight: 600, marginBottom: "4px" }}>
              Not yet implemented
            </div>
          ) : (
            <div data-testid="hydrogen-solver-available" style={{ color: "#8fe0a8", fontSize: "10px", fontWeight: 600, marginBottom: "4px" }}>
              Analytic solver available · visualization in Milestone 3
            </div>
          )}
          <div style={{ color: C.text, fontSize: "9px", lineHeight: "1.6", marginBottom: "6px" }}>
            {(/^none/i.test(contract.solver)) ? "Planned model: " : "Model: "}{contract.theory}.
          </div>
          <Row label="Solver / data" value={contract.solver} valueColor={C.warn} />
          <div style={{ marginTop: "6px" }}>
            {contract.limitations.map((l, i) => (
              <div key={i} style={{ color: "rgba(150,180,220,0.8)", fontSize: "9px", lineHeight: "1.55" }}>· {l}</div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {/* Interactive atomic visualization controls (only when the hook is live). */}
          {atomic && <AtomicControls atomic={atomic} />}
          <div style={{ marginTop: atomic ? "9px" : 0, paddingTop: atomic ? "7px" : 0, borderTop: atomic ? `1px solid ${C.border}` : "none" }}>
            <Row label="Solver / data" value={contract.solver} valueColor="#8fe0a8" />
            <Row label="State" value={contract.stateRepresentation} />
            <DofList label="Included DOF" items={contract.includedDegreesOfFreedom} color="#9fe0b8" />
            <DofList label="Omitted DOF" items={contract.omittedDegreesOfFreedom} color={C.warn} />
            <div style={{ marginTop: "6px", color: "rgba(150,180,220,0.85)", fontSize: "9px", lineHeight: "1.55" }}>
              Validity: {contract.validityRange}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HydrogenInspector({ nav, onSelectResolution, onBack, atomic }) {
  if (!nav) return null;
  if (nav.level === NAV_LEVEL.RESOLUTION) {
    return <ResolutionView resolutionId={nav.resolutionId} onBack={onBack} atomic={atomic} />;
  }
  if (nav.level === NAV_LEVEL.HYDROGEN) {
    return <EntityView onSelectResolution={onSelectResolution} onBack={onBack} />;
  }
  return null;
}
