/**
 * ExperimentStudio — the redesigned Experiment experience.
 *
 * Default screen (calm, minimal): experiment name · physical lab scene ·
 * optional compact Bloch view · large timeline · one Play/Pause · one Reset ·
 * one Edit Experiment · current time · current stage · one scale/frame badge.
 * Everything else lives behind the Edit drawer, the info "i", or the scale badge.
 *
 * The physical lab scene and the Bloch state space are kept visually separate.
 * Field arrows are context-aware (only the active field is prominent), and the
 * timeline, both scenes, the stage label and the time readout are all driven by
 * the same backend playhead index — so they stay synchronized.
 */

import { useState, useCallback, useMemo, useEffect, useReducer } from "react";
import { useExperiment } from "./useExperiment.js";
import PhysicalLabScene from "./PhysicalLabScene.jsx";
import StateSphere from "./StateSphere.jsx";
import ExperimentTimeline from "./ExperimentTimeline.jsx";
import EditExperimentDrawer from "./EditExperimentDrawer.jsx";
import ScaleFrameBadge from "./ScaleFrameBadge.jsx";
import InfoDrawer from "./InfoDrawer.jsx";
import { hypot3, MEASURE_AXES, physicalCaption, effectiveFieldMagnitude } from "./stageModel.js";
import { classifyPulseOperation, isRfActive, pulseTypeLabel, pulseAngleLabel, pulseAxisName, pulseAxisLabel, driveFieldLabel, OP } from "./pulseModel.js";
import { focusTitle, focusCardFields, nextFocus } from "./focusModel.js";
import FocusCard from "./FocusCard.jsx";
import HydrogenInspector from "./HydrogenInspector.jsx";
import { navReducer, initialNav, NAV_LEVEL, showsHydrogenInspector } from "../domain/hydrogenNav.js";
import { getContractForResolution, isActive } from "../domain/hydrogen.js";
import { FRAMES } from "../visualPhysics/visualizationTypes.js";
import { C, PHYS, BTN, BTN_ACTIVE, BTN_PRIMARY, BTN_ICON } from "./theme.js";

// Which physical object to highlight for a given selection.
function labSelectedFor(selection, items) {
  if (!selection) return null;
  const { kind, itemId } = selection;
  if (["system", "drive", "sample", "detector"].includes(kind)) return kind;
  if (kind === "measurement") return "detector";
  if (kind === "item") {
    const it = items.find(i => i.id === itemId);
    return it?.type === "free" ? "system" : "drive";
  }
  return null;
}

export default function ExperimentStudio() {
  const exp = useExperiment();

  const [editorOpen, setEditorOpen] = useState(true);
  const [showMath, setShowMath]     = useState(false);
  const [focus, setFocus]           = useState(false);   // full-screen focus mode
  const [selection, setSelection]   = useState(null);    // { kind, itemId? }
  const [focusedObject, setFocusedObject] = useState(null); // camera-focused object
  const [focusLevel, setFocusLevel] = useState(1);          // 1 = close-up, 2 = macro
  // Semantic model-navigation state — kept SEPARATE from camera/focus state.
  const [nav, dispatchNav] = useReducer(navReducer, initialNav);
  const [transition, setTransition] = useState(null);       // model-change message (transient)

  const clearCameraFocus = useCallback(() => {
    setFocusedObject(null); setFocusLevel(1); setSelection(null);
  }, []);

  // Clicking a lab object. The SAMPLE drives the Hydrogen navigation hierarchy:
  // first click → Sample Close-up; clicking the focused sample again → Hydrogen
  // Entity inspection (the camera stays at the sample close-up). Other objects
  // use the existing Close-up → Macro camera focus and leave the Hydrogen path.
  const selectObject = useCallback((id) => {
    if (id == null) { dispatchNav({ type: "EXIT" }); clearCameraFocus(); return; }
    if (id === "sample") {
      dispatchNav({ type: "FOCUS_SAMPLE" });   // LAB→SAMPLE, then SAMPLE→HYDROGEN
      setSelection({ kind: "sample" });
      setFocusedObject("sample");
      setFocusLevel(1);                          // sample stays at close-up (no macro)
      return;
    }
    dispatchNav({ type: "EXIT" });              // leave the Hydrogen path
    const next = nextFocus({ object: focusedObject, level: focusLevel }, id);
    setSelection({ kind: id });
    setFocusedObject(next.object);
    setFocusLevel(next.level);
  }, [clearCameraFocus, focusedObject, focusLevel]);

  // Select a resolution inside the Hydrogen inspector; show a compact,
  // non-blocking model-transition message. Does NOT touch experiment state.
  const selectResolution = useCallback((resolutionId) => {
    const fromName = nav.resolutionId
      ? getContractForResolution(nav.resolutionId)?.modelName
      : "Laboratory apparatus model";
    const toContract = getContractForResolution(resolutionId);
    const toName = toContract?.modelName ?? resolutionId;
    // Status reflects the contract, not just the (visual) resolution status:
    // an analytic solver may exist even while the visualization is still pending.
    const solverNone = /^none/i.test(toContract?.solver ?? "none");
    const status = isActive(resolutionId)
      ? null
      : solverNone ? "Solver not yet implemented"
      : "Analytic solver available (visualization pending)";
    dispatchNav({ type: "SELECT_RESOLUTION", resolutionId });
    setTransition({ from: fromName, to: toName, status });
  }, [nav.resolutionId]);

  // Back / Escape: move outward one semantic level along the Hydrogen path;
  // otherwise release camera focus. Returning to the lab preserves all state.
  const goBack = useCallback(() => {
    if (nav.level !== NAV_LEVEL.LAB) {
      const next = navReducer(nav, { type: "BACK" });
      dispatchNav({ type: "BACK" });
      if (next.level === NAV_LEVEL.LAB) clearCameraFocus();
    } else if (focusedObject) {
      clearCameraFocus();
    }
  }, [nav, focusedObject, clearCameraFocus]);

  const selectItem = useCallback((itemId) => {
    setSelection({ kind: "item", itemId });
    setEditorOpen(true);
  }, []);
  const selectMeasurement = useCallback(() => {
    setSelection({ kind: "measurement" });
    setEditorOpen(true);
  }, []);

  // Escape moves outward one semantic level (keyboard accessibility).
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") goBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack]);

  // Auto-dismiss the transient model-transition message.
  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setTransition(null), 2800);
    return () => clearTimeout(t);
  }, [transition]);

  const {
    playing, status, isStale, result,
    currentBloch, currentBlochRaw, currentField, currentItemIndex,
    currentTime, progress, stage, emphasis,
    displayTrajectory, trajectoryToNow, segmentBreaks, displayTrajectoryAlt, scaleMeta, frame,
    measurement, items, decoherence,
    driveLevel, driveMagnitude, signalMagnitude, signalPhase, measurementSample, measurementReadout,
    autoCloseup, showFuturePath,
  } = exp;

  const mixedness = useMemo(() => {
    if (!currentBlochRaw) return 0;
    return 1 - hypot3(currentBlochRaw[0], currentBlochRaw[1], currentBlochRaw[2]);
  }, [currentBlochRaw]);

  const labSelected = labSelectedFor(selection, items);
  const measureAxisVec = measurement.enabled ? MEASURE_AXES[measurement.axis] : null;
  const stateMeasureAxis = emphasis.measure > 0.4 ? measureAxisVec : null;
  const showEffectiveArrow = frame !== FRAMES.EFFECTIVE && emphasis.omegaEff >= 0.5 && !!currentField;
  const omegaEffMag = showEffectiveArrow ? effectiveFieldMagnitude(currentField) : null;

  // Active sequence item → physical operation (transverse RF vs longitudinal vs
  // virtual Z). The RF coil/field is shown only for a real transverse pulse.
  const currentItem = result && currentItemIndex != null ? items[currentItemIndex] : null;
  const operation = classifyPulseOperation(currentItem);
  const rfActive = isRfActive(operation);
  const pulsePhase = currentItem?.type === "pulse" ? (currentItem.phase ?? 0) : 0;

  // Close-up camera during a pulse (stage-driven; Advanced preference).
  const closeup = autoCloseup && stage.stage === "pulse";

  // Continuous acquisition (transverse magnetization) vs projective measurement.
  const measurementActive = measurement.enabled && stage.stage === "measure";

  // Scene caption: pulse angle + axis + drive units · virtual Z · else stage caption.
  const caption =
    operation === OP.VIRTUAL_Z ? "Virtual Z rotation · frame update"
    : rfActive && currentItem   ? `${pulseAngleLabel(currentItem)} · ${driveFieldLabel(driveMagnitude)}`
    : physicalCaption(stage.stage, { signalLevel: signalMagnitude });

  // Compact current-operation chip (outside the sphere): X pulse / Free Z / …
  const operationLabel =
    operation === OP.RF_TRANSVERSE ? `${pulseAxisName(pulsePhase) ?? "RF"} pulse`
    : operation === OP.VIRTUAL_Z   ? "Virtual Z"
    : stage.stage === "measure"    ? "Measurement"
    : (stage.stage === "free" || operation === OP.LONGITUDINAL)
        ? (decoherence.enabled ? "Relaxation" : "Free Z evolution")
    : stage.label;
  const measurementOutcome = useMemo(() => {
    if (!measurementActive) return null;
    if (measurement.axis === "z" && measurementSample) {
      return { basis: "z", label: measurementSample.label, p: measurementSample.p0 != null
        ? (measurementSample.outcome === 0 ? measurementSample.p0 : measurementSample.p1) : null, derived: false };
    }
    // Non-Z basis: derived projection of the backend Bloch vector (labeled derived).
    if (measurementReadout) {
      const outcome = measurementReadout.pPlus >= measurementReadout.pMinus ? "+" : "−";
      return {
        basis: measurement.axis, derived: true,
        label: `${outcome}${measurement.axis}`,
        p: Math.max(measurementReadout.pPlus, measurementReadout.pMinus),
      };
    }
    return null;
  }, [measurementActive, measurement.axis, measurementSample, measurementReadout]);

  // One compact contextual card for the focused object — all values are the same
  // backend-synced quantities at the current playIndex (no new physics).
  const focusFields = focusedObject
    ? focusCardFields(focusedObject, {
        bloch: currentBlochRaw,
        field: currentField,
        driveMagnitude,
        pulseAxis: rfActive ? pulseAxisLabel(pulsePhase) : "—",
        signalMagnitude,
        signalPhase,
        measurementActive,
        measurementOutcome,
        uniformField: true,
      })
    : [];

  const playLabel = status === "loading" ? "Running…" : playing ? "⏸ Pause" : (isStale && result ? "▶ Re-run" : "▶ Play");
  const showEditor = editorOpen && !focus;
  // Old trajectory belongs to a previous configuration — dim it, don't present as current.
  const staleView = isStale && !!result && status !== "loading";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: C.bg }}>

      {/* ── Top bar (hidden in focus mode) ─────────────────────────────────── */}
      {!focus && (
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "8px 18px", flexShrink: 0,
          borderBottom: `1px solid ${C.border}`, background: "rgba(4,6,16,0.9)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ color: C.bright, fontSize: "14px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {exp.name || "Untitled experiment"}
            </span>
          </div>

          {/* Stage + time (center) */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "14px" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "7px",
              background: "rgba(8,14,34,0.8)", border: `1px solid ${C.border}`,
              borderRadius: "20px", padding: "4px 12px",
            }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: stageColor(stage.stage) }} />
              <span style={{ color: C.text, fontSize: "11px" }}>{operationLabel}</span>
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Right controls */}
          <InfoDrawer />
          <ScaleFrameBadge scaleMeta={scaleMeta} frame={frame} />
          <button onClick={() => setShowMath(m => !m)} style={showMath ? BTN_ACTIVE : BTN} title="Toggle the mathematical Bloch view">
            {showMath ? "◉ Math view" : "○ Math view"}
          </button>
          <button onClick={() => setFocus(true)} style={BTN_ICON} title="Enter focus mode">⤢ Focus</button>
          <button onClick={() => setEditorOpen(o => !o)} style={showEditor ? BTN_ACTIVE : BTN}>
            {showEditor ? "✕ Close editor" : "✎ Edit experiment"}
          </button>
        </div>
      )}

      {/* ── Stage row: scenes (+ optional editor) ──────────────────────────── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{
          flex: 1, display: "flex", minWidth: 0, gap: "1px", position: "relative",
          opacity: staleView ? 0.5 : 1, filter: staleView ? "grayscale(0.35)" : "none",
          transition: "opacity 0.2s, filter 0.2s",
        }}>
          {staleView && (
            <div style={{
              position: "absolute", top: "12px", left: "50%", transform: "translateX(-50%)", zIndex: 20,
              background: "rgba(40,30,6,0.9)", border: "1px solid rgba(180,130,40,0.5)", borderRadius: "16px",
              padding: "5px 14px", color: C.warn, fontSize: "11px", userSelect: "none", pointerEvents: "none",
            }}>
              ⚠ Stale result — press Re-run
            </div>
          )}
          {/* Compact, non-blocking model-transition message (changing resolution). */}
          {transition && (
            <div data-testid="model-transition" style={{
              position: "absolute", top: "44px", left: "50%", transform: "translateX(-50%)", zIndex: 26,
              background: "rgba(8,14,34,0.95)", border: "1px solid rgba(120,160,230,0.4)", borderRadius: "10px",
              padding: "8px 14px", userSelect: "none", pointerEvents: "none", textAlign: "center",
              boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
            }}>
              <div style={{ color: "rgba(150,180,220,0.7)", fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Changing physical resolution
              </div>
              <div style={{ color: C.dim, fontSize: "10px", marginTop: "3px" }}>
                From: <span style={{ color: C.text }}>{transition.from}</span>
              </div>
              <div style={{ color: C.dim, fontSize: "10px" }}>
                To: <span style={{ color: "#9fd0ff" }}>{transition.to}</span>
              </div>
              {transition.status && (
                <div style={{ color: C.warn, fontSize: "9px", marginTop: "2px" }}>Status: {transition.status}</div>
              )}
            </div>
          )}
          {/* Physical lab (always) */}
          <div style={{ flex: showMath ? "1 1 50%" : "1 1 100%", minWidth: 0, position: "relative" }}>
            <PhysicalLabScene
              emphasis={emphasis}
              driveLevel={driveLevel}
              rfActive={rfActive}
              pulsePhase={pulsePhase}
              signalLevel={signalMagnitude}
              signalPhase={signalPhase}
              mixedness={mixedness}
              stateVec={currentBlochRaw}
              hasResult={!!result}
              measurementActive={measurementActive}
              measurementOutcome={measurementOutcome}
              closeup={closeup}
              focusedObject={focusedObject}
              focusLevel={focusLevel}
              selected={labSelected}
              onSelect={selectObject}
              caption={caption}
              hud={
                showsHydrogenInspector(nav) ? (
                  <HydrogenInspector nav={nav} onSelectResolution={selectResolution} onBack={goBack} />
                ) : focusedObject ? (
                  <FocusCard
                    objectId={focusedObject}
                    title={focusTitle(focusedObject)}
                    fields={focusFields}
                    level={focusLevel}
                    onBack={goBack}
                  />
                ) : null
              }
            />
          </div>

          {/* Mathematical state space (optional) */}
          {showMath && (
            <div style={{ flex: "1 1 50%", minWidth: 0, borderLeft: `1px solid ${C.border}` }}>
              <StateSphere
                bloch={currentBloch}
                trajectory={trajectoryToNow}
                futureTrajectory={showFuturePath ? displayTrajectory : null}
                segmentBreaks={segmentBreaks}
                trajectoryAlt={displayTrajectoryAlt}
                field={currentField}
                showEffective={showEffectiveArrow}
                measureAxis={stateMeasureAxis}
                hud={<StateHud bloch={currentBlochRaw} readout={exp.measurementReadout} axis={measurement.axis} omegaEffMag={omegaEffMag} />}
              />
            </div>
          )}
        </div>

        {/* Contextual editor (collapsible; hidden in focus mode) */}
        {showEditor && (
          <EditExperimentDrawer
            exp={exp}
            selection={selection}
            onClose={() => setEditorOpen(false)}
            onSelectItem={selectItem}
          />
        )}
      </div>

      {/* ── Transport ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 18px", flexShrink: 0, borderTop: `1px solid ${C.border}`,
        background: "rgba(4,6,16,0.9)",
      }}>
        <button onClick={exp.togglePlay} disabled={exp.t2Err || status === "loading"}
          style={{ ...(playing ? BTN_ACTIVE : BTN_PRIMARY), opacity: (exp.t2Err || status === "loading") ? 0.55 : 1, minWidth: "104px" }}>
          {playLabel}
        </button>
        <button onClick={exp.reset} style={BTN} title="Reset playhead to start">↺ Reset</button>

        {focus && (
          <>
            <span style={{ marginLeft: "8px", display: "inline-flex", alignItems: "center", gap: "7px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: stageColor(stage.stage) }} />
              <span style={{ color: C.text, fontSize: "11px" }}>{operationLabel}</span>
            </span>
            <span style={{ color: C.dim, fontFamily: "monospace", fontSize: "11px" }}>
              {result ? `${currentTime.toFixed(3)} s` : "—"}
            </span>
          </>
        )}

        <div style={{ flex: 1 }} />

        {exp.isStale && result && status !== "loading" && (
          <span style={{ color: C.warn, fontSize: "10px" }}>config changed — Play to re-run</span>
        )}
        {(status === "offline" || status === "error") && (
          <span style={{ color: C.danger, fontSize: "10px" }}>{exp.error}</span>
        )}

        {focus && (
          <button onClick={() => setFocus(false)} style={BTN} title="Exit focus mode">⤡ Exit focus</button>
        )}
        {!focus && !showMath && (
          <button onClick={() => setShowMath(true)} style={BTN_ICON} title="Show the mathematical Bloch view">
            ◍ Show math view
          </button>
        )}
      </div>

      {/* ── Timeline (large, central) ──────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, height: "132px",
        borderTop: `1px solid ${C.border}`, background: "rgba(3,5,14,0.98)",
      }}>
        <ExperimentTimeline
          items={items}
          currentItemIndex={currentItemIndex}
          currentTime={currentTime}
          totalDuration={result?.total_duration ?? null}
          progress={progress}
          selectedItemId={selection?.kind === "item" ? selection.itemId : null}
          measurementEnabled={measurement.enabled}
          onSelectItem={selectItem}
          onSelectMeasurement={selectMeasurement}
          hasResult={!!result}
        />
      </div>
    </div>
  );
}

// ── State-space HUD chips (outside the canvas, no overlapping labels) ─────────
function StateHud({ bloch, readout, axis, omegaEffMag }) {
  const norm = bloch ? hypot3(bloch[0], bloch[1], bloch[2]) : 0;
  const purity = (1 + norm * norm) / 2;
  return (
    <div style={{
      position: "absolute", bottom: "12px", left: "12px",
      background: "rgba(6,10,26,0.85)", border: `1px solid ${C.border}`,
      borderRadius: "8px", padding: "8px 11px", fontFamily: "monospace",
      fontSize: "10px", lineHeight: "1.7", userSelect: "none",
    }}>
      <div style={{ color: PHYS.bloch }}>
        r = ({bloch.map(v => v.toFixed(2)).join(", ")})
      </div>
      <div style={{ color: C.label }}>|r| = {norm.toFixed(3)} · purity = {purity.toFixed(3)}</div>
      {omegaEffMag != null && (
        <div style={{ color: PHYS.omegaEff }}>
          Ω_eff |Ω| = {omegaEffMag.toFixed(2)} rad/s
        </div>
      )}
      {readout && (
        <div style={{ color: PHYS.measure }}>
          P(+{axis}) = {readout.pPlus.toFixed(3)}
        </div>
      )}
    </div>
  );
}

function stageColor(stage) {
  switch (stage) {
    case "pulse":   return PHYS.b1;
    case "free":    return PHYS.b0;
    case "measure": return PHYS.measure;
    default:        return C.dim;
  }
}
