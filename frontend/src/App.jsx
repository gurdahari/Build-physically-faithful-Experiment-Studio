import { useEffect, useState, useCallback } from "react";
import BlochSphere from "./BlochSphere";
import { useBlochAnimation } from "./useBlochAnimation";
import { useSequencePlayback } from "./useSequencePlayback";
import { useVerifiedSimulation } from "./useVerifiedSimulation.js";
import PulseSequencePanel from "./PulseSequencePanel";
import MeasurementPanel from "./MeasurementPanel";
import StatePanel from "./StatePanel";
import HamiltonianPanel from "./HamiltonianPanel.jsx";
import PulseDesignPanel from "./PulseDesignPanel.jsx";
import SolverComparisonPanel from "./SolverComparisonPanel.jsx";
import ExperimentPanel from "./ExperimentPanel.jsx";
import VisControlPanel from "./VisControlPanel.jsx";
import ExperimentStudio from "./experiment/ExperimentStudio.jsx";
import { VIS_MODES, FRAMES } from "./visualPhysics/visualizationTypes.js";
import { buildScaleMetadata } from "./visualPhysics/visualScales.js";

const TWO_PI = 2 * Math.PI;

// ── Shared design tokens ───────────────────────────────────────────────────────
const C = {
  bg:       "#05070f",
  border:   "rgba(90, 130, 200, 0.16)",
  label:    "#7a96c4",
  dim:      "#3a5480",
  dimDark:  "#2a3f60",
  text:     "#aac0ff",
  bright:   "#c8dcff",
};

const BTN = {
  background:   "rgba(20, 28, 55, 0.88)",
  border:       "1px solid rgba(90, 130, 200, 0.40)",
  borderRadius: "6px",
  color:        "#aac0ff",
  padding:      "7px 16px",
  cursor:       "pointer",
  fontSize:     "13px",
  lineHeight:   "1",
  userSelect:   "none",
};
const BTN_ACTIVE = { ...BTN, background: "rgba(40,60,140,0.90)", borderColor: "rgba(100,160,255,0.55)", color: "#ddeeff" };
const BTN_GREEN  = { ...BTN, background: "rgba(15,80,40,0.90)",  borderColor: "rgba(60,180,90,0.60)",  color: "#70e090", fontWeight: "600" };
const BTN_SM     = { ...BTN, padding: "5px 10px", fontSize: "12px" };
const BTN_SM_ACT = { ...BTN_SM, background: "rgba(40,60,140,0.90)", borderColor: "rgba(100,160,255,0.55)", color: "#ddeeff" };

const AX_ACTIVE = {
  x: { background: "rgba(255,80,80,0.20)",  borderColor: "#ff5050", color: "#ff9090", fontWeight: "700" },
  y: { background: "rgba(60,200,60,0.18)",  borderColor: "#3cc83c", color: "#70dd70", fontWeight: "700" },
  z: { background: "rgba(80,150,255,0.20)", borderColor: "#5096ff", color: "#80b8ff", fontWeight: "700" },
};
const INIT_ACTIVE = { ...BTN, background: "rgba(160,185,255,0.18)", borderColor: "rgba(160,190,255,0.65)", color: "#d8e8ff", fontWeight: "700" };
const PRESET_ACT  = { background: "rgba(220,170,30,0.22)", borderColor: "rgba(240,200,60,0.65)", color: "#ffd84a", fontWeight: "700" };

const INIT_OPTS = ["|0⟩", "|1⟩", "|+⟩", "Custom"];
const AXES      = ["x", "y", "z"];

function fmtAngle(a) {
  if (Math.abs(a - Math.PI / 2)     < 0.003) return "π/2";
  if (Math.abs(a - Math.PI)         < 0.003) return "π";
  if (Math.abs(a - 3 * Math.PI / 2) < 0.003) return "3π/2";
  if (Math.abs(a - TWO_PI)          < 0.003) return "2π";
  return `${a.toFixed(3)} rad`;
}
function vecStr([x, y, z]) {
  return `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
}

// ── Explore-mode layout helpers ────────────────────────────────────────────────
const VDiv = () => (
  <div style={{ width: "1px", height: "22px", background: "rgba(90,130,200,0.22)", flexShrink: 0, margin: "0 4px" }} />
);

// ── Accordion step component ───────────────────────────────────────────────────
function AccordionStep({ stepNum, title, subtitle, badge, open, onToggle, children }) {
  return (
    <div style={{ borderBottom: "1px solid rgba(90,130,200,0.10)" }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "11px",
          padding: "11px 18px",
          background: open ? "rgba(20,30,70,0.30)" : "transparent",
          border: "none", cursor: "pointer", textAlign: "left",
          transition: "background 0.15s",
        }}
      >
        {/* Step number badge */}
        <div style={{
          width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0,
          background:  open ? "rgba(80,150,255,0.22)" : "rgba(90,130,200,0.09)",
          border:      `1px solid ${open ? "rgba(100,160,255,0.45)" : "rgba(90,130,200,0.22)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "9px", fontWeight: "700",
          color: open ? "#aac0ff" : "#4a6494",
        }}>
          {stepNum}
        </div>

        {/* Title + collapsed subtitle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color:      open ? "#c8dcff" : "#7a96c4",
            fontSize:   "12px",
            fontWeight: "600",
            letterSpacing: "0.01em",
          }}>
            {title}
          </div>
          {!open && subtitle && (
            <div style={{
              color: "#3a5480", fontSize: "10px", marginTop: "1px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {subtitle}
            </div>
          )}
        </div>

        {/* Badge (when collapsed) */}
        {!open && badge && (
          <div style={{ color: "#5096ff", fontSize: "10px", fontFamily: "monospace", flexShrink: 0, marginRight: "4px" }}>
            {badge}
          </div>
        )}

        {/* Arrow */}
        <span style={{ color: "#4a6494", fontSize: "10px", flexShrink: 0 }}>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {/* Content */}
      {open && (
        <div style={{ padding: "2px 18px 18px" }}>
          {subtitle && (
            <p style={{ color: "#3a5480", fontSize: "10px", margin: "0 0 14px", lineHeight: "1.5" }}>
              {subtitle}
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

// ── Section label ──────────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return (
    <div style={{ color: C.label, fontSize: "11px", marginBottom: "7px" }}>{children}</div>
  );
}

// ── Main app ───────────────────────────────────────────────────────────────────
function App() {
  const [mode, setMode] = useState("explore");
  const [message, setMessage] = useState("");

  // Accordion open state — only "prepare" open by default
  const [openSteps, setOpenSteps] = useState({ prepare: true, observe: false, pulse: false, measure: false, state: false, hamiltonian: false, tdpulse: false, comparison: false, experiment: false });

  // Shared trajectories — gold = RK4/Hamiltonian, magenta = QuTiP overlay
  const [sphereTrajectory,    setSphereTrajectory]    = useState(null);
  const [sphereTrajectoryAlt, setSphereTrajectoryAlt] = useState(null);

  // Experiment panel: authoritative QuTiP state (overrides animState when set)
  const [experimentState, setExperimentState] = useState(null);

  // Visualization system state
  const [visMode,       setVisMode]       = useState(VIS_MODES.CONCEPT);
  const [visFrame,      setVisFrame]      = useState(FRAMES.ROTATING);
  const [currentField,  setCurrentField]  = useState(null);
  const [expScaleMeta,  setExpScaleMeta]  = useState(null);

  const toggleStep = useCallback((key) => {
    setOpenSteps(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Precession animation
  const {
    state: animState, time, theta, omega,
    playing: precPlaying, axis, initKey, initialVec,
    customTheta, customPhi,
    play: precPlay, pause: precPause, reset: precReset,
    setOmega, setAxis, setInitialState, setCustomTheta, setCustomPhi, applyPulse, forceState,
  } = useBlochAnimation();

  // Single pulse
  const [pulseAxis,   setPulseAxis]   = useState("x");
  const [pulseAngle,  setPulseAngle]  = useState(Math.PI / 2);
  const [pulseResult, setPulseResult] = useState(null);

  // Sequence playback
  const {
    pulses, playing: seqPlaying,
    completedSteps, currentPulse, pulseProgress,
    inPause, pauseProgress, seqVec,
    speed, setSpeed, visualPause, setVisualPause, pauseDuration, setPauseDuration,
    addPulse, addFreeEvolution, removePulse, movePulse, clearSequence,
    play: seqPlay, pause: seqPause, resetSequence, stepForward, stepBackward,
  } = useSequencePlayback();

  // Backend verification
  const { status: verifyStatus, result: verifyResult, runVerified, reset: resetVerify } = useVerifiedSimulation();

  useEffect(() => {
    fetch("http://localhost:8000")
      .then(r => r.json())
      .then(d => setMessage(d.message))
      .catch(() => setMessage("offline"));
  }, []);

  const handleApplyPulse = () => {
    const before = animState;
    const after  = applyPulse(pulseAxis, pulseAngle, before);
    setPulseResult({ before, after, axis: pulseAxis, angle: pulseAngle });
  };

  const handleSeqPlay = () => {
    precPause();
    seqPlay(animState);
  };
  const handleSeqStepFwd = () => {
    precPause();
    stepForward(animState);
  };

  const handleCollapse = (vec) => {
    if (seqVec !== null) resetSequence();
    forceState(vec);
  };

  // Display routing — experiment overrides sequence which overrides animation
  const seqActive    = seqVec !== null;
  const expActive    = experimentState !== null;
  const displayState = expActive ? experimentState : (seqActive ? seqVec : animState);
  const displayTime  = (expActive || seqActive) ? null  : time;
  const displayTheta = (expActive || seqActive) ? null  : theta;
  const displayKey   = expActive ? "exp" : (seqActive ? "seq" : initKey);

  const isHalfPi = Math.abs(pulseAngle - Math.PI / 2) < 0.003;
  const isPi     = Math.abs(pulseAngle - Math.PI)     < 0.003;

  // Visualization is active only when experiment data is available
  const visActive = expActive;

  const sphereProps = {
    state: displayState, time: displayTime, theta: displayTheta,
    axis, initKey: displayKey, initialVec,
    suppressGuide: seqActive || expActive,
    trajectory: sphereTrajectory,
    trajectoryAlt: sphereTrajectoryAlt,
    // Visualization extensions
    visMode:      visActive ? visMode      : VIS_MODES.CONCEPT,
    visFrame:     visActive ? visFrame     : FRAMES.ROTATING,
    currentField: visActive ? currentField : null,
    scaleMeta:    visActive ? expScaleMeta : null,
  };

  const seqPanelProps = {
    pulses,
    playing: seqPlaying, completedSteps, currentPulse, pulseProgress,
    inPause, pauseProgress, seqVec,
    speed, setSpeed, visualPause, setVisualPause, pauseDuration, setPauseDuration,
    onAddPulse: addPulse, onAddFreeEvolution: addFreeEvolution,
    onRemovePulse: removePulse, onMovePulse: movePulse, onClear: clearSequence,
    onPlay: handleSeqPlay, onPause: seqPause,
    onReset: resetSequence,
    onStepForward: handleSeqStepFwd, onStepBackward: stepBackward,
  };

  // ── Badge helpers for collapsed accordion steps ──────────────────────────────
  const prepareBadge = initKey === "custom"
    ? `θ=${customTheta.toFixed(2)}`
    : initKey;
  const observeBadge = `${axis.toUpperCase()}  ${omega.toFixed(1)}/s`;
  const pulseBadge   = `${pulseAxis.toUpperCase()}  ${fmtAngle(pulseAngle)}`;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: C.bg, overflow: "hidden",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header style={{
        height: "50px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px",
        background: "rgba(4,6,18,0.97)",
        borderBottom: `1px solid ${C.border}`,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ color: C.bright, fontSize: "15px", fontWeight: "700", letterSpacing: "-0.01em" }}>
            Quantum Experiment Studio
          </span>
          {message === "offline"
            ? <span style={{ color: "#9a5030", fontSize: "10px" }}>● backend offline</span>
            : message
              ? <span style={{ color: C.dim, fontSize: "11px" }}>{message}</span>
              : null
          }
        </div>

        {/* Mode toggle */}
        <div style={{
          display: "flex", background: "rgba(8,12,30,0.80)", borderRadius: "22px",
          padding: "3px", border: "1px solid rgba(90,130,200,0.20)", gap: "2px",
        }}>
          {[["explore", "◎  Explore"], ["build", "⚙  Build"], ["experiment", "🔬  Experiment"]].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              ...BTN_SM, padding: "5px 18px", borderRadius: "18px", border: "none",
              fontSize: "12px", letterSpacing: "0.01em",
              ...(mode === m
                ? { background: "rgba(40,60,140,0.88)", color: "#ddeeff", fontWeight: "600" }
                : { background: "transparent", color: C.label }),
            }}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════════════
          EXPERIMENT MODE — redesigned, physically faithful studio
      ════════════════════════════════════════════════════════════════════════ */}
      {mode === "experiment" ? (
        <ExperimentStudio />

      ) : /* ══════════════════════════════════════════════════════════════════════
          EXPLORE MODE
      ════════════════════════════════════════════════════════════════════════ */
      mode === "explore" ? (
        <>
          <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
            <BlochSphere {...sphereProps} height="100%" />
          </div>

          {initKey === "custom" && (
            <div style={{
              display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
              padding: "6px 24px",
              background: "rgba(4,6,18,0.97)",
              borderTop: "1px solid rgba(90,130,200,0.10)",
              flexShrink: 0,
            }}>
              <span style={{ color: C.label, fontSize: "11px" }}>θ</span>
              <span style={{ color: C.text, fontSize: "11px", minWidth: "50px" }}>{customTheta.toFixed(3)}</span>
              <input type="range" min="0" max={Math.PI} step="0.01" value={customTheta}
                onChange={e => setCustomTheta(Number(e.target.value))}
                style={{ width: "110px", accentColor: "#bb88ff", cursor: "pointer" }} />
              <VDiv />
              <span style={{ color: C.label, fontSize: "11px" }}>φ</span>
              <span style={{ color: C.text, fontSize: "11px", minWidth: "50px" }}>{customPhi.toFixed(3)}</span>
              <input type="range" min="0" max={TWO_PI} step="0.01" value={customPhi}
                onChange={e => setCustomPhi(Number(e.target.value))}
                style={{ width: "110px", accentColor: "#bb88ff", cursor: "pointer" }} />
              <span style={{ fontFamily: "monospace", fontSize: "10px", color: C.dim }}>
                r₀ = {vecStr(initialVec)}
              </span>
            </div>
          )}

          <div style={{
            display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
            padding: "10px 24px",
            background: "rgba(4,6,18,0.97)",
            borderTop: `1px solid ${C.border}`,
            flexShrink: 0,
          }}>
            <button onClick={precPlaying ? precPause : precPlay} style={precPlaying ? BTN_ACTIVE : BTN}>
              {precPlaying ? "⏸ Pause" : "▶ Play"}
            </button>
            <button onClick={precReset} style={BTN}>↺ Reset</button>
            <VDiv />
            <span style={{ color: C.label, fontSize: "11px" }}>State</span>
            {INIT_OPTS.map(k => (
              <button key={k} onClick={() => setInitialState(k)}
                style={k === initKey
                  ? { ...INIT_ACTIVE, padding: "5px 11px", fontSize: "12px" }
                  : { ...BTN_SM, padding: "5px 11px" }}>
                {k}
              </button>
            ))}
            <VDiv />
            <span style={{ color: C.label, fontSize: "11px" }}>Axis</span>
            {AXES.map(ax => (
              <button key={ax} onClick={() => setAxis(ax)}
                style={ax === axis
                  ? { ...BTN_SM, padding: "5px 12px", ...AX_ACTIVE[ax] }
                  : { ...BTN_SM, padding: "5px 12px" }}>
                {ax.toUpperCase()}
              </button>
            ))}
            <VDiv />
            <span style={{ color: C.label, fontSize: "11px" }}>ω</span>
            <span style={{ color: C.text, fontSize: "12px", minWidth: "58px" }}>{omega.toFixed(1)} r/s</span>
            <input type="range" min="0.5" max="10" step="0.5" value={omega}
              onChange={e => setOmega(Number(e.target.value))}
              style={{ width: "90px", accentColor: "#5096ff", cursor: "pointer" }} />
          </div>
        </>

      ) : (
        /* ═════════════════════════════════════════════════════════════════════
           BUILD MODE — accordion sidebar + full-width timeline strip
        ═════════════════════════════════════════════════════════════════════ */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>

          {/* ── Top zone: Sphere + Accordion sidebar ──────────────────────── */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

            {/* Bloch sphere */}
            <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
              <BlochSphere
                {...sphereProps}
                height="100%"
                visControls={visActive ? (
                  <VisControlPanel
                    visMode={visMode}
                    visFrame={visFrame}
                    onChange={({ mode, frame }) => {
                      if (mode  !== undefined) setVisMode(mode);
                      if (frame !== undefined) setVisFrame(frame);
                    }}
                  />
                ) : null}
              />
            </div>

            {/* Accordion sidebar */}
            <div style={{
              width: "320px", flexShrink: 0,
              overflowY: "auto", overflowX: "hidden",
              background: "rgba(3,5,16,0.97)",
              borderLeft: `1px solid ${C.border}`,
              boxSizing: "border-box",
            }}>

              {/* ── STEP 1: Prepare State ──────────────────────────────────── */}
              <AccordionStep
                stepNum="1" title="Prepare State"
                subtitle="Set the qubit's starting position on the Bloch sphere."
                badge={prepareBadge}
                open={openSteps.prepare}
                onToggle={() => toggleStep("prepare")}
              >
                <FieldLabel>Initial state</FieldLabel>
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "16px" }}>
                  {INIT_OPTS.map(k => (
                    <button key={k} onClick={() => setInitialState(k)}
                      style={k === initKey
                        ? { ...INIT_ACTIVE, padding: "6px 12px", fontSize: "12px" }
                        : { ...BTN_SM, padding: "6px 12px" }}>
                      {k}
                    </button>
                  ))}
                </div>

                {initKey === "custom" && (
                  <div style={{
                    background: "rgba(10,16,42,0.60)",
                    border: "1px solid rgba(90,130,200,0.16)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                  }}>
                    {[
                      ["θ (polar)",   customTheta, Math.PI, setCustomTheta],
                      ["φ (azimuth)", customPhi,   TWO_PI,  setCustomPhi],
                    ].map(([lbl, val, max, setter]) => (
                      <div key={lbl} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <span style={{ color: C.label, fontSize: "11px", minWidth: "72px" }}>{lbl}</span>
                        <span style={{ color: C.text,  fontSize: "11px", minWidth: "48px" }}>{val.toFixed(3)}</span>
                        <input type="range" min="0" max={max} step="0.01" value={val}
                          onChange={e => setter(Number(e.target.value))}
                          style={{ flex: 1, accentColor: "#bb88ff", cursor: "pointer" }} />
                      </div>
                    ))}
                    <div style={{ fontFamily: "monospace", fontSize: "10px", color: C.dim }}>
                      r₀ = {vecStr(initialVec)}
                    </div>
                  </div>
                )}
              </AccordionStep>

              {/* ── STEP 2: Observe (Continuous Rotation) ─────────────────── */}
              <AccordionStep
                stepNum="2" title="Observe Precession"
                subtitle="Watch the state rotate continuously under a fixed field."
                badge={observeBadge}
                open={openSteps.observe}
                onToggle={() => toggleStep("observe")}
              >
                <FieldLabel>Rotation axis</FieldLabel>
                <div style={{ display: "flex", gap: "5px", marginBottom: "16px" }}>
                  {AXES.map(ax => (
                    <button key={ax} onClick={() => setAxis(ax)}
                      style={ax === axis
                        ? { ...BTN, padding: "6px 16px", ...AX_ACTIVE[ax] }
                        : { ...BTN, padding: "6px 16px" }}>
                      {ax.toUpperCase()}
                    </button>
                  ))}
                </div>

                <FieldLabel>Speed  ω = {omega.toFixed(1)} rad/s</FieldLabel>
                <input type="range" min="0.5" max="10" step="0.5" value={omega}
                  onChange={e => setOmega(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#5096ff", cursor: "pointer", marginBottom: "16px" }} />

                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={precPlaying ? precPause : precPlay}
                    style={precPlaying ? BTN_ACTIVE : BTN}>
                    {precPlaying ? "⏸ Pause" : "▶ Play"}
                  </button>
                  <button onClick={precReset} style={BTN}>↺ Reset</button>
                </div>
              </AccordionStep>

              {/* ── STEP 3: Single Pulse ───────────────────────────────────── */}
              <AccordionStep
                stepNum="3" title="Single Pulse"
                subtitle="Apply one instantaneous rotation to the current state."
                badge={pulseBadge}
                open={openSteps.pulse}
                onToggle={() => toggleStep("pulse")}
              >
                <FieldLabel>Axis</FieldLabel>
                <div style={{ display: "flex", gap: "5px", marginBottom: "16px" }}>
                  {AXES.map(ax => (
                    <button key={ax} onClick={() => setPulseAxis(ax)}
                      style={ax === pulseAxis
                        ? { ...BTN, padding: "6px 16px", ...AX_ACTIVE[ax] }
                        : { ...BTN, padding: "6px 16px" }}>
                      {ax.toUpperCase()}
                    </button>
                  ))}
                </div>

                <FieldLabel>Angle = {fmtAngle(pulseAngle)}</FieldLabel>
                <div style={{ display: "flex", gap: "5px", alignItems: "center", marginBottom: "8px" }}>
                  <button onClick={() => setPulseAngle(Math.PI / 2)}
                    style={{ ...BTN_SM, ...(isHalfPi ? PRESET_ACT : {}) }}>π/2</button>
                  <button onClick={() => setPulseAngle(Math.PI)}
                    style={{ ...BTN_SM, ...(isPi ? PRESET_ACT : {}) }}>π</button>
                </div>
                <input type="range" min="0" max={TWO_PI} step="0.01" value={pulseAngle}
                  onChange={e => setPulseAngle(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#ff9040", cursor: "pointer", marginBottom: "16px" }} />

                <button onClick={handleApplyPulse} style={BTN_GREEN}>Apply Pulse</button>

                {pulseResult && (
                  <div style={{
                    background: "rgba(6,20,12,0.70)",
                    border: "1px solid rgba(60,180,90,0.28)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    marginTop: "12px",
                  }}>
                    <div style={{ color: "#70e090", fontSize: "11px", fontWeight: "600", marginBottom: "4px" }}>
                      {pulseResult.axis.toUpperCase()} · {fmtAngle(pulseResult.angle)}
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: "10px", color: C.label }}>
                      {vecStr(pulseResult.before)} → {vecStr(pulseResult.after)}
                    </div>
                  </div>
                )}
              </AccordionStep>

              {/* ── STEP 4: Measure ───────────────────────────────────────── */}
              <AccordionStep
                stepNum="4" title="Measure"
                subtitle="Sample an observable — Born-rule probabilities and random outcomes."
                open={openSteps.measure}
                onToggle={() => toggleStep("measure")}
              >
                <MeasurementPanel
                  blochVec={displayState}
                  seqPlaying={seqPlaying}
                  onPauseSequence={seqPause}
                  onCollapse={handleCollapse}
                />
              </AccordionStep>

              {/* ── STEP 5: State Details ──────────────────────────────────── */}
              <AccordionStep
                stepNum="5" title="State Details"
                subtitle="Quantum amplitudes α, β and Bloch angles — mathematical description."
                open={openSteps.state}
                onToggle={() => toggleStep("state")}
              >
                <StatePanel blochVec={displayState} />
              </AccordionStep>

              {/* ── STEP 6: Hamiltonian Simulation ────────────────────────── */}
              {/* ── STEP 6: Hamiltonian Simulation ────────────────────────── */}
              <AccordionStep
                stepNum="6" title="Hamiltonian Simulation"
                subtitle="Backend: evolve under H=(ħ/2)(Ωx σx+Ωy σy+Ωz σz) — trajectory shown in gold."
                open={openSteps.hamiltonian}
                onToggle={() => {
                  if (openSteps.hamiltonian) { setSphereTrajectory(null); setSphereTrajectoryAlt(null); }
                  toggleStep("hamiltonian");
                }}
              >
                <HamiltonianPanel
                  blochVec={displayState}
                  onTrajectory={t => { setSphereTrajectory(t); setSphereTrajectoryAlt(null); }}
                />
              </AccordionStep>

              {/* ── STEP 7: Pulse Design (time-dependent) ─────────────────── */}
              <AccordionStep
                stepNum="7" title="Pulse Design"
                subtitle="Backend: RK4 integration of H(t)=(ħ/2)[Ω(t)cos(φ)σx+Ω(t)sin(φ)σy+Δσz]."
                open={openSteps.tdpulse}
                onToggle={() => {
                  if (openSteps.tdpulse) { setSphereTrajectory(null); setSphereTrajectoryAlt(null); }
                  toggleStep("tdpulse");
                }}
              >
                <PulseDesignPanel
                  blochVec={displayState}
                  onTrajectory={t => { setSphereTrajectory(t); setSphereTrajectoryAlt(null); }}
                />
              </AccordionStep>

              {/* ── STEP 8: Solver Comparison ─────────────────────────────── */}
              <AccordionStep
                stepNum="8" title="Solver Comparison"
                subtitle="Compare custom RK4 vs QuTiP — gold/magenta overlay on sphere."
                open={openSteps.comparison}
                onToggle={() => {
                  if (openSteps.comparison) { setSphereTrajectory(null); setSphereTrajectoryAlt(null); }
                  toggleStep("comparison");
                }}
              >
                <SolverComparisonPanel
                  blochVec={displayState}
                  onTrajectories={(custom, qt) => {
                    setSphereTrajectory(custom);
                    setSphereTrajectoryAlt(qt);
                  }}
                />
              </AccordionStep>

              {/* ── STEP 9: Experiment (unified QuTiP authoritative) ─────────── */}
              <AccordionStep
                stepNum="9" title="Experiment"
                subtitle="QuTiP is the authoritative engine — backend computes all evolution, frontend animates."
                open={openSteps.experiment}
                onToggle={() => {
                  if (openSteps.experiment) {
                    setSphereTrajectory(null);
                    setSphereTrajectoryAlt(null);
                    setExperimentState(null);
                    setCurrentField(null);
                    setExpScaleMeta(null);
                  }
                  toggleStep("experiment");
                }}
              >
                <ExperimentPanel
                  blochVec={displayState}
                  onState={setExperimentState}
                  onTrajectory={t => {
                    if (!t) {
                      setSphereTrajectory(null);
                      setSphereTrajectoryAlt(null);
                    } else if (t.primary) {
                      // Comparison mode: ideal = gold, decohering = magenta
                      setSphereTrajectory(t.ideal ?? null);
                      setSphereTrajectoryAlt(t.primary);
                    } else {
                      setSphereTrajectory(t);
                      setSphereTrajectoryAlt(null);
                    }
                  }}
                  onCurrentField={setCurrentField}
                  onScaleMeta={setExpScaleMeta}
                />
              </AccordionStep>

            </div>{/* end accordion sidebar */}
          </div>{/* end top zone */}

          {/* ── Timeline strip (full width, below sphere + sidebar) ─────────── */}
          <div style={{
            flexShrink: 0,
            borderTop: "1px solid rgba(90,130,200,0.20)",
            background: "rgba(3,5,14,0.98)",
            minHeight: "206px",
            display: "flex",
            flexDirection: "column",
          }}>
            {/* Strip header */}
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "6px 20px 4px",
              flexShrink: 0,
            }}>
              <span style={{
                color: "rgba(90,130,200,0.40)",
                fontSize: "9px",
                fontWeight: "700",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>
                Sequence Timeline
              </span>

              {/* Verify button */}
              <button
                onClick={() => {
                  resetVerify();
                  runVerified(animState, pulses);
                }}
                disabled={pulses.length === 0 || verifyStatus === "loading"}
                title="Send sequence to Python backend and compare results"
                style={{
                  padding: "3px 9px",
                  fontSize: "10px",
                  fontFamily: "monospace",
                  background: verifyStatus === "ok"      ? "rgba(15,80,40,0.70)"
                            : verifyStatus === "mismatch" ? "rgba(80,20,10,0.70)"
                            : verifyStatus === "offline"  ? "rgba(50,30,10,0.70)"
                            : "rgba(20,28,55,0.70)",
                  border: `1px solid ${
                            verifyStatus === "ok"       ? "rgba(60,180,90,0.45)"
                          : verifyStatus === "mismatch" ? "rgba(200,80,60,0.50)"
                          : verifyStatus === "offline"  ? "rgba(160,100,30,0.45)"
                          : "rgba(90,130,200,0.35)"}`,
                  borderRadius: "5px",
                  color: verifyStatus === "ok"       ? "#70e090"
                       : verifyStatus === "mismatch" ? "#ff8060"
                       : verifyStatus === "offline"  ? "#c08040"
                       : "#7a96c4",
                  cursor: pulses.length === 0 ? "not-allowed" : "pointer",
                  opacity: pulses.length === 0 ? 0.4 : 1,
                  transition: "all 0.15s",
                }}
              >
                {verifyStatus === "loading" ? "Verifying…"
                 : verifyStatus === "ok"      ? "✓ Verified"
                 : verifyStatus === "mismatch" ? "⚠ Mismatch"
                 : verifyStatus === "offline"  ? "⊘ Offline"
                 : verifyStatus === "error"    ? "⚠ Error"
                 : "⊛ Run verified simulation"}
              </button>

              {/* Inline result */}
              {verifyResult && !verifyResult.error && (
                <span style={{ fontFamily: "monospace", fontSize: "9.5px", color: "rgba(90,130,200,0.55)" }}>
                  backend ({verifyResult.backendFinal.map(v => v.toFixed(3)).join(", ")})
                  {"  |Δ| = "}
                  <span style={{ color: verifyResult.delta <= verifyResult.tolerance ? "#70e090" : "#ff8060" }}>
                    {verifyResult.delta.toExponential(1)}
                  </span>
                  {verifyResult.delta > verifyResult.tolerance && (
                    <span style={{ color: "#ff8060", marginLeft: "8px" }}>
                      {`exceeds tol ${verifyResult.tolerance.toExponential(0)}`}
                    </span>
                  )}
                </span>
              )}
              {verifyResult?.error && verifyStatus !== "offline" && (
                <span style={{ color: "#ff8060", fontSize: "9.5px" }}>
                  ⚠ {verifyResult.error}
                </span>
              )}
              {verifyStatus === "offline" && (
                <span style={{ color: "#c08040", fontSize: "9.5px" }}>
                  Backend unreachable — start with: uvicorn main:app
                </span>
              )}

              <div style={{ flex: 1 }} />
              {seqVec && (
                <span style={{ color: "rgba(90,130,200,0.35)", fontSize: "9px", fontFamily: "monospace" }}>
                  r = ({seqVec[0].toFixed(2)}, {seqVec[1].toFixed(2)}, {seqVec[2].toFixed(2)})
                </span>
              )}
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              <PulseSequencePanel {...seqPanelProps} fullWidth />
            </div>
          </div>

        </div>/* end build mode */
      )}
    </div>
  );
}

export default App;
