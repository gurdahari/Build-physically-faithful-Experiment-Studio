/**
 * EditExperimentDrawer — the single editing surface.  Replaces the old set of
 * permanent panels (field/pulse/decoherence/measurement/solver/diagnostics).
 *
 * Four groups only:  System · Fields & Pulses · Environment · Measurement
 * Advanced settings (quality, reference frame, diagnostics, solver) are hidden
 * until "Advanced" is opened.
 *
 * Contextual editing: `selection` (from clicking an object in the lab scene or a
 * timeline block) auto-expands the relevant group and highlights the item, so
 * selecting the magnet shows only B₀/System, selecting a pulse block shows only
 * that pulse, etc.
 */

import { useEffect, useState } from "react";
import { C, PHYS, BTN, BTN_ACTIVE, BTN_SM } from "./theme.js";
import { INIT_PRESETS } from "./useExperiment.js";
import { ItemCard, DecoherenceControls, DiagnosticsCharts, Slider } from "./editorParts.jsx";
import { FRAMES } from "../visualPhysics/visualizationTypes.js";
import { auditTrajectory } from "./trajectoryAudit.js";
import { PRESET_LIST } from "./presets.js";

const TWO_PI = 2 * Math.PI;
const GROUPS = ["system", "fields", "environment", "measurement"];
const GROUP_LABEL = {
  system:      "System",
  fields:      "Fields & Pulses",
  environment: "Environment",
  measurement: "Measurement",
};
// Which lab-object / timeline selection maps to which group.
export const SELECTION_TO_GROUP = {
  system: "system", drive: "fields", item: "fields",
  sample: "environment", detector: "measurement", measurement: "measurement",
};

function Group({ id, open, onToggle, accent, children, summary }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button onClick={() => onToggle(id)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: "9px",
        padding: "12px 16px", background: open ? "rgba(20,30,70,0.28)" : "transparent",
        border: "none", cursor: "pointer", textAlign: "left",
      }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: accent, flexShrink: 0 }} />
        <span style={{ color: open ? C.bright : C.label, fontSize: "12px", fontWeight: 600, flex: 1 }}>
          {GROUP_LABEL[id]}
        </span>
        {!open && summary && (
          <span style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace" }}>{summary}</span>
        )}
        <span style={{ color: C.dim, fontSize: "10px" }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={{ padding: "2px 16px 16px" }}>{children}</div>}
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ color: C.label, fontSize: "11px", margin: "2px 0 7px" }}>{children}</div>;
}

export default function EditExperimentDrawer({ exp, selection, onClose, onSelectItem }) {
  const {
    name, setName,
    initKey, setInitKey, customTheta, setCustomTheta, customPhi, setCustomPhi, initialBloch,
    items, addPulse, addFree, updateItem, removeItem, moveItem, applyPreset, currentItemIndex,
    quality, setQuality, frame, setFrame,
    decoherence, setDecoherence, showComparison, setShowComparison,
    measurement, setMeasurement, measurementReadout,
    autoCloseup, setAutoCloseup, showFuturePath, setShowFuturePath, modelInfo,
    result, idealResult, status,
  } = exp;

  const selectedGroup = selection ? SELECTION_TO_GROUP[selection.kind] ?? null : null;
  const [open, setOpen] = useState({ system: false, fields: true, environment: false, measurement: false });
  const [advanced, setAdvanced] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState(items[0]?.id ?? null);
  const [auditResult, setAuditResult] = useState(null);

  // Contextual: expand the group that matches the current selection.
  useEffect(() => {
    if (!selectedGroup) return;
    setOpen(prev => {
      const next = {}; GROUPS.forEach(g => { next[g] = g === selectedGroup; });
      return next;
    });
    if (selection?.kind === "item") setExpandedItemId(selection.itemId);
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setOpen(prev => ({ ...prev, [id]: !prev[id] }));
  const selectedItemId = selection?.kind === "item" ? selection.itemId : null;
  // One card expands at a time; fall back to the first item if the id is stale.
  const expandedId = items.some(i => i.id === expandedItemId) ? expandedItemId : items[0]?.id;

  return (
    <div data-testid="edit-drawer" style={{
      width: "min(360px, 90vw)", flexShrink: 0, height: "100%",
      display: "flex", flexDirection: "column", overflow: "hidden",
      background: C.panel, borderLeft: `1px solid ${C.border}`, boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <span style={{ color: C.bright, fontSize: "13px", fontWeight: 700, flex: 1 }}>Edit experiment</span>
        <button onClick={onClose} title="Close editor" style={{ ...BTN_SM, padding: "4px 9px" }}>✕</button>
      </div>

      <div data-testid="drawer-body" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minWidth: 0 }}>
        {/* Experiment name */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <FieldLabel>Experiment name</FieldLabel>
          <input value={name} onChange={e => setName(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(8,14,38,0.7)", border: `1px solid ${C.border}`,
              borderRadius: "6px", color: C.bright, padding: "7px 10px", fontSize: "13px",
            }} />

          <FieldLabel>Preset</FieldLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {PRESET_LIST.map(p => (
              <button key={p.key} onClick={() => { applyPreset(p); setExpandedItemId(null); setOpen(o => ({ ...o, fields: true })); }}
                title={p.description} style={BTN_SM}>{p.name}</button>
            ))}
          </div>
        </div>

        {/* ── System (initial state + B₀) ─────────────────────────────────── */}
        <Group id="system" open={open.system} onToggle={toggle} accent={PHYS.b0} summary={initKey}>
          <FieldLabel>Initial state (sample preparation)</FieldLabel>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "12px" }}>
            {INIT_PRESETS.map(k => (
              <button key={k} onClick={() => setInitKey(k === "Custom" ? "Custom" : k)}
                style={initKey === k ? BTN_ACTIVE : BTN_SM}>{k}</button>
            ))}
          </div>
          {initKey === "Custom" && (
            <div style={{ background: "rgba(10,16,42,0.6)", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px" }}>
              <Slider label="θ" value={customTheta} min={0} max={Math.PI} step={0.01} accentColor="#bb88ff"
                display={`${customTheta.toFixed(2)} rad`} onChange={setCustomTheta} />
              <Slider label="φ" value={customPhi} min={0} max={TWO_PI} step={0.01} accentColor="#bb88ff"
                display={`${customPhi.toFixed(2)} rad`} onChange={setCustomPhi} />
            </div>
          )}
          <div style={{ color: C.dim, fontSize: "9.5px", lineHeight: "1.6", marginTop: "10px" }}>
            <span style={{ color: PHYS.b0 }}>B₀</span> — the static longitudinal field defines the
            quantization axis (+Z). Its Larmor precession is folded out; the backend solves in the
            rotating frame.  r₀ = ({initialBloch.map(v => v.toFixed(2)).join(", ")}).
          </div>
        </Group>

        {/* ── Fields & Pulses (sequence) ──────────────────────────────────── */}
        <Group id="fields" open={open.fields} onToggle={toggle} accent={PHYS.b1}
          summary={`${items.length} item${items.length > 1 ? "s" : ""}`}>
          <FieldLabel>Pulse & free-evolution sequence</FieldLabel>
          {items.map((it, idx) => (
            <ItemCard
              key={it.id} item={it} index={idx} count={items.length}
              active={result != null && idx === currentItemIndex}
              selected={it.id === selectedItemId}
              expanded={it.id === expandedId}
              onToggle={(id) => setExpandedItemId(cur => (cur === id ? null : id))}
              onUpdate={updateItem} onRemove={removeItem} onMove={moveItem}
            />
          ))}
          <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
            <button onClick={() => { addPulse(); }} style={BTN}>+ Pulse</button>
            <button onClick={() => { addFree(); }} style={BTN}>+ Free</button>
          </div>
        </Group>

        {/* ── Environment (decoherence) ───────────────────────────────────── */}
        <Group id="environment" open={open.environment} onToggle={toggle} accent="#e0a040"
          summary={decoherence.enabled ? `T₁ ${decoherence.T1.toFixed(1)} T₂ ${decoherence.T2.toFixed(1)}` : "closed"}>
          <FieldLabel>Sample environment — T₁ / T₂ relaxation</FieldLabel>
          <DecoherenceControls
            decoherence={decoherence} setDecoherence={setDecoherence}
            showComparison={showComparison} setShowComparison={setShowComparison}
          />
        </Group>

        {/* ── Measurement (detector) ──────────────────────────────────────── */}
        <Group id="measurement" open={open.measurement} onToggle={toggle} accent={PHYS.measure}
          summary={measurement.enabled ? measurement.axis.toUpperCase() : "off"}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <button onClick={() => setMeasurement({ enabled: !measurement.enabled })}
              style={measurement.enabled ? { ...BTN_ACTIVE, borderColor: PHYS.measure, color: "#9ff0c0" } : BTN}>
              {measurement.enabled ? "● Detector ON" : "○ Detector OFF"}
            </button>
          </div>
          {measurement.enabled && (
            <>
              <FieldLabel>Measurement basis</FieldLabel>
              <div style={{ display: "flex", gap: "5px", marginBottom: "10px" }}>
                {["z", "x", "y"].map(ax => (
                  <button key={ax} onClick={() => setMeasurement({ axis: ax })}
                    style={measurement.axis === ax ? BTN_ACTIVE : BTN_SM}>{ax.toUpperCase()}</button>
                ))}
              </div>
              {measurementReadout && (
                <div style={{
                  background: "rgba(6,20,12,0.6)", border: `1px solid rgba(60,180,90,0.3)`,
                  borderRadius: "8px", padding: "9px 11px", fontFamily: "monospace", fontSize: "11px",
                }}>
                  <div style={{ color: PHYS.measure, marginBottom: "4px" }}>
                    P(+{measurement.axis}) = {measurementReadout.pPlus.toFixed(4)}
                  </div>
                  <div style={{ color: C.text }}>
                    P(−{measurement.axis}) = {measurementReadout.pMinus.toFixed(4)}
                  </div>
                </div>
              )}
              <div style={{ color: C.dim, fontSize: "9px", lineHeight: "1.55", marginTop: "8px" }}>
                Born rule P(±n̂) = (1 ± r·n̂)/2, derived from the backend Bloch vector.
                Z equals the backend pop0/pop1 exactly.
              </div>
            </>
          )}
        </Group>

        {/* ── Advanced ────────────────────────────────────────────────────── */}
        <div style={{ padding: "10px 16px" }}>
          <button onClick={() => setAdvanced(a => !a)} style={{
            width: "100%", background: "transparent", border: "none", cursor: "pointer",
            color: C.dim, fontSize: "10px", letterSpacing: "0.08em", textAlign: "left", padding: "4px 0",
          }}>
            {advanced ? "▾" : "▸"} ADVANCED
          </button>
          {advanced && (
            <div style={{ marginTop: "8px" }}>
              <FieldLabel>Solver quality</FieldLabel>
              <div style={{ display: "flex", gap: "5px", marginBottom: "12px" }}>
                {[["preview", "Preview"], ["standard", "Standard"], ["high", "High"]].map(([q, l]) => (
                  <button key={q} onClick={() => setQuality(q)} style={q === quality ? BTN_ACTIVE : BTN_SM}>{l}</button>
                ))}
              </div>

              <FieldLabel>Reference frame (visualization only)</FieldLabel>
              <div style={{ display: "flex", gap: "5px", marginBottom: "12px" }}>
                {[[FRAMES.ROTATING, "Rotating"], [FRAMES.EFFECTIVE, "Ω_eff → Z"]].map(([f, l]) => (
                  <button key={f} onClick={() => setFrame(f)} style={f === frame ? BTN_ACTIVE : BTN_SM}>{l}</button>
                ))}
              </div>

              <FieldLabel>Visualization</FieldLabel>
              <button onClick={() => setAutoCloseup(!autoCloseup)}
                style={{ ...(autoCloseup ? BTN_ACTIVE : BTN_SM), marginBottom: "6px", width: "100%" }}>
                {autoCloseup ? "◉ Auto close-up during pulse" : "○ Auto close-up during pulse"}
              </button>
              <button onClick={() => setShowFuturePath(!showFuturePath)}
                style={{ ...(showFuturePath ? BTN_ACTIVE : BTN_SM), marginBottom: "12px", width: "100%" }}>
                {showFuturePath ? "◉ Faint future-path preview" : "○ Faint future-path preview"}
              </button>

              {result && (
                <div style={{ marginBottom: "12px" }}>
                  <FieldLabel>Trajectory audit (dev)</FieldLabel>
                  <button onClick={() => setAuditResult(auditTrajectory(result, { decoherence }))} style={BTN_SM}>Run audit</button>
                  {auditResult && (
                    <div style={{ marginTop: "6px", fontFamily: "monospace", fontSize: "9px",
                      color: auditResult.ok ? "#8fe0a8" : C.danger }}>
                      {auditResult.ok
                        ? "✓ all invariants hold"
                        : auditResult.issues.map((s, i) => <div key={i}>⚠ {s}</div>)}
                      <div style={{ color: C.dim }}>
                        pts {auditResult.stats.points} · |r|∈[{auditResult.stats.minNorm}, {auditResult.stats.maxNorm}] · jump {auditResult.stats.maxJump}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {modelInfo && (
                <div style={{ marginBottom: "12px" }}>
                  <FieldLabel>Model information</FieldLabel>
                  <div style={{
                    background: "rgba(6,12,30,0.6)", border: `1px solid ${C.border}`, borderRadius: "8px",
                    padding: "9px 11px", fontFamily: "monospace", fontSize: "9.5px", color: C.text, lineHeight: "1.7",
                  }}>
                    <div>solver: {modelInfo.solver} {modelInfo.version}</div>
                    <div>time res: dt = {modelInfo.dt.toExponential(2)} s · {modelInfo.points} pts</div>
                    <div>quality: {modelInfo.quality}</div>
                    <div style={{ color: C.dim, marginTop: "4px" }}>approximations:</div>
                    {modelInfo.approximations.map((a, i) => (
                      <div key={i} style={{ color: C.label, paddingLeft: "6px" }}>· {a}</div>
                    ))}
                    <div style={{ color: C.dim, marginTop: "4px" }}>values:</div>
                    <div style={{ color: C.label, paddingLeft: "6px" }}>time {modelInfo.values.time}</div>
                    <div style={{ color: C.label, paddingLeft: "6px" }}>drive {modelInfo.values.drive}</div>
                    <div style={{ color: C.label, paddingLeft: "6px" }}>detector {modelInfo.values.detector}</div>
                    <div style={{ color: C.label, paddingLeft: "6px" }}>bloch {modelInfo.values.bloch}</div>
                  </div>
                </div>
              )}

              {result && (
                <>
                  <FieldLabel>Diagnostics</FieldLabel>
                  <DiagnosticsCharts result={result} idealResult={idealResult} />
                  <div style={{ color: C.dim, fontSize: "9px", marginTop: "8px", fontFamily: "monospace" }}>
                    {result.trajectory.length} pts · {result.total_duration.toFixed(2)} s ·
                    {" "}{result.solver_info.solver} {result.solver_info.version}
                  </div>
                </>
              )}
              {!result && (
                <div style={{ color: C.dim, fontSize: "9px" }}>Run the experiment to see diagnostics.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {status === "error" && exp.error && (
        <div style={{ color: C.danger, fontSize: "10px", padding: "8px 16px", borderTop: `1px solid ${C.border}` }}>
          ⚠ {exp.error}
        </div>
      )}
    </div>
  );
}
