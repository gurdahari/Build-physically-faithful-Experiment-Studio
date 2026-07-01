import { useState } from "react";

const TWO_PI = 2 * Math.PI;

// ── Design tokens ─────────────────────────────────────────────────────────────
const CLR = {
  bg:       "rgba(8, 12, 30, 0.55)",
  border:   "rgba(90, 130, 200, 0.22)",
  label:    "#7a96c4",
  dimText:  "#4a6494",
  text:     "#aac0ff",
  bright:   "#c0d4ff",
};

const BTN_BASE = {
  background:   "rgba(20, 28, 55, 0.88)",
  border:       "1px solid rgba(90, 130, 200, 0.40)",
  borderRadius: "6px",
  color:        "#aac0ff",
  cursor:       "pointer",
  lineHeight:   "1",
  userSelect:   "none",
};
const BTN     = { ...BTN_BASE, padding: "7px 16px",  fontSize: "13px" };
const BTN_SM  = { ...BTN_BASE, padding: "5px 11px",  fontSize: "12px" };
const BTN_XS  = { ...BTN_BASE, padding: "3px 7px",   fontSize: "11px" };
const BTN_GREEN = { ...BTN, background: "rgba(15,80,40,0.90)", borderColor: "rgba(60,180,90,0.60)", color: "#70e090", fontWeight: "600" };
const BTN_OFF   = { opacity: 0.30, cursor: "not-allowed", pointerEvents: "none" };

const AX = {
  x: { col: "#ff9090", bg: "rgba(255,80,80,0.14)",   bdr: "rgba(255,80,80,0.50)" },
  y: { col: "#70dd70", bg: "rgba(60,200,60,0.12)",   bdr: "rgba(60,200,60,0.45)" },
  z: { col: "#80b8ff", bg: "rgba(80,150,255,0.14)",  bdr: "rgba(80,150,255,0.50)" },
};

const FE = {
  col: "#40d8c0",
  bg:  "rgba(0, 200, 180, 0.12)",
  bdr: "rgba(0, 200, 180, 0.45)",
};

const PULSE_PRESETS = [
  { axis: "x", angle: Math.PI / 2, label: "X π/2" },
  { axis: "x", angle: Math.PI,     label: "X π"   },
  { axis: "y", angle: Math.PI / 2, label: "Y π/2" },
  { axis: "y", angle: Math.PI,     label: "Y π"   },
  { axis: "z", angle: Math.PI / 2, label: "Z π/2" },
  { axis: "z", angle: Math.PI,     label: "Z π"   },
];

const FREE_TAU_PRESETS = [0.5, 1.0, 2.0];
const SPEEDS = [0.5, 1, 2, 4];

function fmtAngle(a) {
  if (Math.abs(a - Math.PI / 2)     < 0.003) return "π/2";
  if (Math.abs(a - Math.PI)         < 0.003) return "π";
  if (Math.abs(a - 3 * Math.PI / 2) < 0.003) return "3π/2";
  if (Math.abs(a - TWO_PI)          < 0.003) return "2π";
  return `${a.toFixed(2)}r`;
}

function fmtVec([x, y, z]) {
  return `(${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`;
}

const Divider = () => (
  <div style={{ height: "1px", background: "rgba(90,130,200,0.14)", margin: "10px 0" }} />
);

// ── Playhead triangle ─────────────────────────────────────────────────────────
function Playhead({ col, large = false }) {
  return (
    <div style={{
      position: "absolute",
      top:  large ? -15 : -13,
      left: "50%",
      transform: "translateX(-50%)",
      width: 0, height: 0,
      borderLeft:  `${large ? 8 : 6}px solid transparent`,
      borderRight: `${large ? 8 : 6}px solid transparent`,
      borderTop:   `${large ? 11 : 9}px solid ${col}`,
      filter: `drop-shadow(0 0 5px ${col})`,
      zIndex: 2,
    }} />
  );
}

// ── Card reorder / remove controls ───────────────────────────────────────────
function CardControls({ id, index, total, disabled, onMove, onRemove, horizontal = false }) {
  const L = horizontal ? "←" : "↑";
  const R = horizontal ? "→" : "↓";
  return (
    <div style={{ display: "flex", gap: "3px", marginTop: "5px" }}>
      <button onClick={() => onMove(id, -1)}
        style={{ ...BTN_XS, ...(index === 0 || disabled ? BTN_OFF : {}) }}>{L}</button>
      <button onClick={() => onMove(id,  1)}
        style={{ ...BTN_XS, ...(index === total - 1 || disabled ? BTN_OFF : {}) }}>{R}</button>
      <button onClick={() => onRemove(id)}
        style={{ ...BTN_XS, color: "#ff8080", borderColor: "rgba(200,60,60,0.30)", ...(disabled ? BTN_OFF : {}) }}>×</button>
    </div>
  );
}

// ── Progress stripe ───────────────────────────────────────────────────────────
function ProgressStripe({ pct, col }) {
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "4px", background: "rgba(255,255,255,0.06)" }}>
      {pct > 0 && (
        <div style={{
          height: "100%", width: `${pct}%`, background: col,
          transition: pct < 100 ? "width 0.05s linear" : "none",
          borderRadius: "0 0 6px 0",
        }} />
      )}
    </div>
  );
}

// ── Pulse card ────────────────────────────────────────────────────────────────
function PulseCard({ item, index, total, isActive, isCompleted, progress,
                     isPausedAfter, disabled, onRemove, onMove, large = false }) {
  const { id, axis, angle, label } = item;
  const { col, bg: axBg, bdr } = AX[axis] ?? AX.x;

  const cardBg  = isActive ? axBg : isCompleted ? "rgba(12,22,55,0.70)" : "rgba(8,14,38,0.55)";
  const cardBdr = isActive ? `2px solid ${bdr}` : isCompleted
    ? "1px solid rgba(90,130,200,0.38)" : "1px solid rgba(90,130,200,0.18)";
  const barPct  = isActive ? Math.round(progress * 100) : isCompleted ? 100 : 0;

  return (
    <div style={{ flexShrink: 0, position: "relative" }}>
      {isActive && <Playhead col={col} large={large} />}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: large ? "6px" : "5px",
        padding: large ? "12px 16px 14px" : "10px 12px 14px",
        minWidth: large ? "100px" : "82px",
        background: cardBg, border: cardBdr, borderRadius: "10px",
        overflow: "hidden", position: "relative",
        transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
        boxShadow: isActive
          ? `0 0 18px ${col}55, inset 0 0 12px ${col}18`
          : isPausedAfter ? `0 0 10px ${col}44` : "none",
      }}>
        <div style={{ fontSize: large ? "28px" : "22px", fontWeight: "700", color: col, lineHeight: "1" }}>
          {axis.toUpperCase()}
        </div>
        <div style={{ fontFamily: "monospace", fontSize: large ? "13px" : "12px", color: "#b8d0f8" }}>
          {fmtAngle(angle)}
        </div>
        {label && (
          <div style={{
            fontSize: "10px", color: CLR.label,
            maxWidth: large ? "88px" : "72px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {label}
          </div>
        )}
        <CardControls id={id} index={index} total={total}
          disabled={disabled} onMove={onMove} onRemove={onRemove}
          horizontal={large} />
        <ProgressStripe pct={barPct} col={col} />
      </div>
    </div>
  );
}

// ── Free Evolution card ───────────────────────────────────────────────────────
function FreeEvoCard({ item, index, total, isActive, isCompleted, progress,
                       isPausedAfter, disabled, onRemove, onMove, large = false }) {
  const { id, tau, omega0, label } = item;
  const { col, bg: feBg, bdr } = FE;

  const cardBg  = isActive ? feBg : isCompleted ? "rgba(12,22,55,0.70)" : "rgba(8,14,38,0.55)";
  const cardBdr = isActive ? `2px solid ${bdr}` : isCompleted
    ? "1px solid rgba(90,130,200,0.38)" : "1px solid rgba(90,130,200,0.18)";
  const barPct  = isActive ? Math.round(progress * 100) : isCompleted ? 100 : 0;

  return (
    <div style={{ flexShrink: 0, position: "relative" }}>
      {isActive && <Playhead col={col} large={large} />}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: large ? "3px" : "4px",
        padding: large ? "12px 12px 14px" : "10px 12px 14px",
        minWidth: large ? "108px" : "86px",
        background: cardBg, border: cardBdr, borderRadius: "10px",
        overflow: "hidden", position: "relative",
        transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
        boxShadow: isActive
          ? `0 0 18px ${col}55, inset 0 0 12px ${col}18`
          : isPausedAfter ? `0 0 10px ${col}44` : "none",
      }}>
        <div style={{ fontSize: large ? "20px" : "18px", lineHeight: "1", color: col }}>∿</div>
        <div style={{
          fontSize: "9px", fontWeight: "700", letterSpacing: "0.07em",
          textTransform: "uppercase", color: col,
        }}>
          Free Evo
        </div>
        {large ? (
          <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#b8d0f8", marginTop: "1px", textAlign: "center", lineHeight: "1.55" }}>
            τ={tau.toFixed(2)}s<br />ω₀={omega0.toFixed(1)}
          </div>
        ) : (
          <>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#b8d0f8", marginTop: "1px" }}>τ={tau.toFixed(2)}s</div>
            <div style={{ fontFamily: "monospace", fontSize: "10px", color: "#b8d0f8" }}>ω₀={omega0.toFixed(1)}</div>
          </>
        )}
        {label && (
          <div style={{
            fontSize: "10px", color: CLR.label,
            maxWidth: large ? "96px" : "72px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {label}
          </div>
        )}
        <CardControls id={id} index={index} total={total}
          disabled={disabled} onMove={onMove} onRemove={onRemove}
          horizontal={large} />
        <ProgressStripe pct={barPct} col={col} />
      </div>
    </div>
  );
}

// ── Shared timeline row renderer ───────────────────────────────────────────────
function TimelineRow({ pulses, completedSteps, currentPulse, pulseProgress,
                       inPause, playing, onRemovePulse, onMovePulse, large = false }) {
  const n       = pulses.length;
  const seqOn   = completedSteps >= 0 || currentPulse >= 0 || inPause;
  const seqDone = completedSteps >= n - 1 && n > 0 && currentPulse === -1 && !inPause;
  const activeCard = currentPulse >= 0 ? currentPulse : completedSteps;

  const connW = large ? "26px" : "22px";
  const nodeS = large ? "13px" : "12px";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 0,
      paddingTop: large ? "20px" : "14px",
      paddingBottom: "4px",
    }}>
      {/* Start node */}
      <div style={{
        width: nodeS, height: nodeS, borderRadius: "50%", flexShrink: 0,
        background: seqOn ? "#aac0ff" : "rgba(90,130,200,0.35)",
        boxShadow: seqOn ? "0 0 6px #aac0ff" : "none",
      }} />

      {pulses.map((item, i) => {
        const isActive      = activeCard === i;
        const isCompleted   = i <= completedSteps;
        const isPausedAfter = inPause && i === completedSteps;
        const cardProgress  = isActive && currentPulse === i ? pulseProgress : 1;

        return (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
            <div style={{
              width: connW, height: "2px", flexShrink: 0,
              background: isCompleted ? "rgba(170,192,255,0.55)" : "rgba(90,130,200,0.22)",
            }} />
            {item.type === "free" ? (
              <FreeEvoCard item={item} index={i} total={n}
                isActive={isActive} isCompleted={isCompleted}
                progress={cardProgress} isPausedAfter={isPausedAfter}
                disabled={playing} onRemove={onRemovePulse} onMove={onMovePulse}
                large={large} />
            ) : (
              <PulseCard item={item} index={i} total={n}
                isActive={isActive} isCompleted={isCompleted}
                progress={cardProgress} isPausedAfter={isPausedAfter}
                disabled={playing} onRemove={onRemovePulse} onMove={onMovePulse}
                large={large} />
            )}
          </div>
        );
      })}

      {/* End connector + node */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
        <div style={{ width: connW, height: "2px", flexShrink: 0, background: seqDone ? "rgba(170,192,255,0.55)" : "rgba(90,130,200,0.22)" }} />
        <div style={{
          width: nodeS, height: nodeS, borderRadius: "50%", flexShrink: 0,
          background: seqDone ? "#70e090" : "rgba(90,130,200,0.35)",
          boxShadow: seqDone ? "0 0 8px #70e090" : "none",
        }} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PulseSequencePanel({
  pulses,
  playing, completedSteps, currentPulse, pulseProgress,
  inPause, pauseProgress, seqVec,
  speed, setSpeed, visualPause, setVisualPause, pauseDuration, setPauseDuration,
  onAddPulse, onAddFreeEvolution, onRemovePulse, onMovePulse, onClear,
  onPlay, onPause, onReset, onStepForward, onStepBackward,
  fullWidth = false,
}) {
  const [newAxis,   setNewAxis]   = useState("x");
  const [newAngle,  setNewAngle]  = useState(Math.PI / 2);
  const [newLabel,  setNewLabel]  = useState("");
  const [freeOmega0, setFreeOmega0] = useState(1.0);
  const [freeTau,    setFreeTau]    = useState(1.0);
  const [freeLabel,  setFreeLabel]  = useState("");
  const [addMode,    setAddMode]    = useState(null); // null | "custom" | "free"

  const n       = pulses.length;
  const nFree   = pulses.filter(p => p.type === "free").length;
  const nPulses = n - nFree;

  const seqOn   = completedSteps >= 0 || currentPulse >= 0 || inPause;
  const seqDone = completedSteps >= n - 1 && n > 0 && currentPulse === -1 && !inPause;
  const canBwd  = !playing && seqOn;
  const canFwd  = !playing && n > 0 && !seqDone;

  const currentItem   = currentPulse >= 0  ? pulses[currentPulse]  : null;
  const completedItem = completedSteps >= 0 ? pulses[completedSteps] : null;

  const countLabel = n === 0 ? "empty"
    : nFree === 0   ? `${nPulses} pulse${nPulses !== 1 ? "s" : ""}`
    : nPulses === 0 ? `${nFree} free evo`
    : `${nPulses}p · ${nFree}f`;

  const handleAddCustomPulse = () => {
    if (!isFinite(newAngle)) return;
    onAddPulse(newAxis, newAngle, newLabel.trim());
    setNewLabel("");
  };

  const handleAddFreePreset = (tau) => onAddFreeEvolution(tau, freeOmega0, "");

  const handleAddFreeCustom = () => {
    if (!isFinite(freeTau) || freeTau <= 0) return;
    onAddFreeEvolution(freeTau, freeOmega0, freeLabel.trim());
    setFreeLabel("");
  };

  const inputStyle = {
    background:   "rgba(12,18,45,0.70)",
    border:       "1px solid rgba(90,130,200,0.30)",
    borderRadius: "6px",
    color:        "#aac0ff",
    padding:      "4px 8px",
    fontSize:     "11px",
    outline:      "none",
  };

  const speedBtnStyle = (s) => ({
    ...BTN_XS,
    ...(speed === s ? {
      background:  "rgba(40,60,140,0.90)",
      borderColor: "rgba(100,160,255,0.55)",
      color:       "#ddeeff",
      fontWeight:  "700",
    } : {}),
  });

  // ── Status text (compact, for playback row) ──────────────────────────────────
  const statusText = inPause
    ? `Step ${completedSteps + 1} done — continuing…`
    : currentPulse >= 0 && currentItem
      ? currentItem.type === "free"
        ? `Step ${currentPulse+1}/${n}  ·  ∿ ${(pulseProgress*100).toFixed(0)}%  t=${(currentItem.tau*pulseProgress).toFixed(2)}s`
        : `Step ${currentPulse+1}/${n}  ·  ${currentItem.axis.toUpperCase()} ${fmtAngle(currentItem.angle)}  ${(pulseProgress*100).toFixed(0)}%`
      : seqDone
        ? `✓ All ${n} steps complete`
        : completedSteps >= 0
          ? `After step ${completedSteps+1}/${n}`
          : null;

  // ════════════════════════════════════════════════════════════════════════════
  // FULL-WIDTH TIMELINE STRIP (bottom panel)
  // ════════════════════════════════════════════════════════════════════════════
  if (fullWidth) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>

        {/* ── Row 1: Add bar ─────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap",
          padding: "7px 20px",
          borderBottom: "1px solid rgba(90,130,200,0.12)",
        }}>
          <span style={{
            color: CLR.dimText, fontSize: "9px",
            textTransform: "uppercase", letterSpacing: "0.10em",
            marginRight: "6px", flexShrink: 0,
          }}>
            Add
          </span>

          {/* Quick pulse presets */}
          {PULSE_PRESETS.map(({ axis, angle, label }) => (
            <button key={label}
              onClick={() => !playing && onAddPulse(axis, angle, "")}
              style={{ ...BTN_XS, color: AX[axis].col, borderColor: AX[axis].bdr, ...(playing ? BTN_OFF : {}) }}>
              {label}
            </button>
          ))}

          <div style={{ width: 1, height: 14, background: "rgba(90,130,200,0.20)", margin: "0 3px", flexShrink: 0 }} />

          <button
            onClick={() => setAddMode(m => m === "custom" ? null : "custom")}
            style={{ ...BTN_XS, ...(addMode === "custom" ? { background: "rgba(40,60,140,0.80)", borderColor: "rgba(100,160,255,0.55)", color: "#ddeeff" } : {}) }}>
            Custom…
          </button>

          <button
            onClick={() => setAddMode(m => m === "free" ? null : "free")}
            style={{ ...BTN_XS, color: FE.col, borderColor: FE.bdr, ...(addMode === "free" ? { background: FE.bg, fontWeight: "700" } : {}) }}>
            ∿ Free Evo
          </button>

          <div style={{ flex: 1 }} />
          <span style={{ color: CLR.dimText, fontSize: "10px", marginRight: "6px" }}>{countLabel}</span>
          <button onClick={onClear}
            style={{ ...BTN_XS, color: "#ff8080", borderColor: "rgba(200,60,60,0.30)", ...(n === 0 && !seqOn ? BTN_OFF : {}) }}>
            Clear
          </button>
        </div>

        {/* ── Row 2: Inline add form (conditional) ───────────────────────── */}
        {addMode && (
          <div style={{
            flexShrink: 0,
            display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap",
            padding: "6px 20px",
            borderBottom: "1px solid rgba(90,130,200,0.12)",
            background: "rgba(4,7,22,0.60)",
          }}>
            {addMode === "free" && (
              <>
                <span style={{ color: FE.col, fontSize: "11px", fontWeight: "700", flexShrink: 0 }}>∿ Free Evolution</span>
                <span style={{ color: CLR.dimText, fontSize: "10px" }}>H₀=(ℏω₀/2)σz</span>
                <div style={{ width: 1, height: 14, background: "rgba(0,200,180,0.20)", margin: "0 2px" }} />
                <span style={{ color: CLR.label, fontSize: "10px" }}>ω₀</span>
                <span style={{ color: FE.col, fontSize: "12px", minWidth: "40px" }}>{freeOmega0.toFixed(1)}</span>
                <input type="range" min="0.1" max="10" step="0.1" value={freeOmega0}
                  onChange={e => setFreeOmega0(Number(e.target.value))}
                  style={{ width: "88px", accentColor: FE.col, cursor: "pointer" }} />
                <div style={{ width: 1, height: 14, background: "rgba(0,200,180,0.20)", margin: "0 2px" }} />
                <span style={{ color: CLR.label, fontSize: "10px" }}>τ presets:</span>
                {FREE_TAU_PRESETS.map(tau => (
                  <button key={tau}
                    onClick={() => !playing && handleAddFreePreset(tau)}
                    style={{ ...BTN_XS, color: FE.col, borderColor: FE.bdr, ...(playing ? BTN_OFF : {}) }}>
                    {tau}s
                  </button>
                ))}
                <div style={{ width: 1, height: 14, background: "rgba(0,200,180,0.20)", margin: "0 2px" }} />
                <span style={{ color: CLR.label, fontSize: "10px" }}>custom τ</span>
                <input type="number" min="0.01" step="0.1" value={freeTau}
                  onChange={e => setFreeTau(Number(e.target.value))}
                  style={{ ...inputStyle, width: "52px" }} />
                <span style={{ color: CLR.dimText, fontSize: "10px" }}>s</span>
                <button onClick={handleAddFreeCustom}
                  style={{ ...BTN_XS, color: FE.col, borderColor: FE.bdr, ...(playing ? BTN_OFF : {}) }}>
                  + Add
                </button>
              </>
            )}
            {addMode === "custom" && (
              <>
                <span style={{ color: CLR.label, fontSize: "11px", flexShrink: 0 }}>Custom Pulse</span>
                <div style={{ display: "flex", gap: "3px" }}>
                  {["x", "y", "z"].map(ax => (
                    <button key={ax} onClick={() => setNewAxis(ax)}
                      style={{ ...BTN_XS, ...(ax === newAxis ? { background: AX[ax].bg, borderColor: AX[ax].bdr, color: AX[ax].col, fontWeight: "700" } : {}) }}>
                      {ax.toUpperCase()}
                    </button>
                  ))}
                </div>
                <span style={{ color: CLR.text, fontFamily: "monospace", fontSize: "12px", minWidth: "38px" }}>
                  {fmtAngle(newAngle)}
                </span>
                <input type="range" min="0" max={TWO_PI} step="0.01" value={newAngle}
                  onChange={e => setNewAngle(Number(e.target.value))}
                  style={{ width: "110px", accentColor: "#ff9040", cursor: "pointer" }} />
                <input type="text" placeholder="label (opt)" value={newLabel}
                  onChange={e => setNewLabel(e.target.value)} maxLength={12}
                  style={{ ...inputStyle, width: "80px" }} />
                <button onClick={handleAddCustomPulse}
                  style={{ ...BTN_GREEN, padding: "4px 12px", fontSize: "12px", ...(playing ? BTN_OFF : {}) }}>
                  + Add
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Row 3: Timeline cards ───────────────────────────────────────── */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowX: "auto",
          overflowY: "hidden",
          paddingLeft: "20px",
          paddingRight: "20px",
          paddingTop: "20px",
          paddingBottom: "4px",
        }}>
          {n === 0 ? (
            <div style={{
              height: "100%", display: "flex", alignItems: "center",
              color: CLR.dimText, fontSize: "13px", gap: "6px",
            }}>
              Use <span style={{ color: CLR.label }}>Add</span> above to build your sequence
              <span style={{ color: CLR.dimText, fontSize: "11px" }}>— quick presets, custom pulses, or free evolution blocks</span>
            </div>
          ) : (
            <TimelineRow
              pulses={pulses}
              completedSteps={completedSteps} currentPulse={currentPulse}
              pulseProgress={pulseProgress} inPause={inPause} playing={playing}
              onRemovePulse={onRemovePulse} onMovePulse={onMovePulse}
              large={true}
            />
          )}
        </div>

        {/* ── Row 4: Playback + speed + status ───────────────────────────── */}
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap",
          padding: "6px 20px",
          borderTop: "1px solid rgba(90,130,200,0.12)",
        }}>
          <button
            onClick={playing ? onPause : onPlay}
            style={{
              ...BTN_SM,
              background: playing ? "rgba(40,60,140,0.90)" : "rgba(15,80,40,0.90)",
              borderColor: playing ? "rgba(100,160,255,0.55)" : "rgba(60,180,90,0.60)",
              color:       playing ? "#ddeeff" : "#70e090",
              fontWeight: "600",
              ...(n === 0 || seqDone ? BTN_OFF : {}),
            }}>
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={onReset} style={{ ...BTN_XS, ...(n === 0 && !seqOn ? BTN_OFF : {}) }}>↺ Reset</button>
          <button onClick={onStepBackward} style={{ ...BTN_XS, ...(!canBwd ? BTN_OFF : {}) }}>← Back</button>
          <button onClick={onStepForward}  style={{ ...BTN_XS, ...(!canFwd  ? BTN_OFF : {}) }}>Fwd →</button>

          <div style={{ width: 1, height: 18, background: "rgba(90,130,200,0.20)", margin: "0 2px", flexShrink: 0 }} />

          {SPEEDS.map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={speedBtnStyle(s)}>{s}×</button>
          ))}

          <div style={{ width: 1, height: 18, background: "rgba(90,130,200,0.20)", margin: "0 2px", flexShrink: 0 }} />

          <button onClick={() => setVisualPause(!visualPause)}
            style={{ ...BTN_XS, ...(visualPause ? { background: "rgba(40,80,120,0.80)", borderColor: "rgba(80,160,220,0.60)", color: "#80d0ff" } : {}) }}>
            ⏱ {visualPause ? "ON" : "Pause"}
          </button>
          {visualPause && (
            <>
              <span style={{ color: CLR.text, fontSize: "11px" }}>{pauseDuration.toFixed(1)}s</span>
              <input type="range" min="0" max="2" step="0.1" value={pauseDuration}
                onChange={e => setPauseDuration(Number(e.target.value))}
                style={{ width: "70px", accentColor: "#5096ff", cursor: "pointer" }} />
            </>
          )}

          <div style={{ flex: 1 }} />

          {statusText && (
            <div style={{
              color:       seqDone ? "#70e090" : CLR.label,
              fontSize:    "11px",
              fontFamily:  "monospace",
              maxWidth:    "300px",
              overflow:    "hidden",
              textOverflow: "ellipsis",
              whiteSpace:  "nowrap",
            }}>
              {statusText}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ORIGINAL NARROW-PANEL MODE (sidebar, legacy / fallback)
  // ════════════════════════════════════════════════════════════════════════════
  const countLabelFull = n === 0 ? "no items yet"
    : nFree === 0   ? `${nPulses} pulse${nPulses !== 1 ? "s" : ""}`
    : nPulses === 0 ? `${nFree} free evo${nFree !== 1 ? "s" : ""}`
    : `${nPulses} pulse${nPulses !== 1 ? "s" : ""} · ${nFree} free evo`;

  return (
    <div style={{ background: CLR.bg, border: `1px solid ${CLR.border}`, borderRadius: "12px", padding: "16px 20px", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <div>
          <span style={{ color: CLR.bright, fontSize: "13px", fontWeight: "700", letterSpacing: "0.05em", textTransform: "uppercase" }}>Pulse Sequence</span>
          <span style={{ marginLeft: "10px", color: CLR.dimText, fontSize: "11px" }}>{countLabelFull}</span>
        </div>
        <button onClick={onClear} style={{ ...BTN_SM, color: "#ff8080", borderColor: "rgba(200,60,60,0.35)", ...(n === 0 && !seqOn ? BTN_OFF : {}) }}>Clear All</button>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <div style={{ color: CLR.label, fontSize: "11px", marginBottom: "6px" }}>Quick add</div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {PULSE_PRESETS.map(({ axis, angle, label }) => (
            <button key={label} onClick={() => !playing && onAddPulse(axis, angle, "")}
              style={{ ...BTN_SM, color: AX[axis].col, borderColor: AX[axis].bdr, ...(playing ? BTN_OFF : {}) }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "rgba(0,40,36,0.35)", border: "1px solid rgba(0,200,180,0.22)", borderRadius: "8px", padding: "10px 12px", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
          <span style={{ color: FE.col, fontSize: "11px", fontWeight: "700", letterSpacing: "0.06em", textTransform: "uppercase" }}>∿ Free Evolution</span>
          <span style={{ color: CLR.dimText, fontSize: "10px" }}>H₀=(ℏω₀/2)σz → Z-rotation by ω₀τ</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
          <span style={{ color: CLR.label, fontSize: "11px" }}>ω₀ =</span>
          <span style={{ color: FE.col, fontSize: "12px", fontWeight: "600", minWidth: "52px" }}>{freeOmega0.toFixed(1)} r/s</span>
          <input type="range" min="0.1" max="10" step="0.1" value={freeOmega0}
            onChange={e => setFreeOmega0(Number(e.target.value))}
            style={{ flex: 1, minWidth: "100px", accentColor: FE.col, cursor: "pointer" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span style={{ color: CLR.label, fontSize: "11px" }}>τ presets:</span>
          {FREE_TAU_PRESETS.map(tau => (
            <button key={tau} onClick={() => !playing && handleAddFreePreset(tau)}
              style={{ ...BTN_SM, color: FE.col, borderColor: FE.bdr, fontSize: "11px", padding: "4px 9px", ...(playing ? BTN_OFF : {}) }}>
              {tau}s
            </button>
          ))}
          <div style={{ width: "1px", height: "16px", background: "rgba(0,200,180,0.25)", margin: "0 4px", flexShrink: 0 }} />
          <span style={{ color: CLR.label, fontSize: "11px" }}>custom τ:</span>
          <input type="number" min="0.01" step="0.1" value={freeTau} onChange={e => setFreeTau(Number(e.target.value))}
            style={{ background: "rgba(12,18,45,0.70)", border: "1px solid rgba(90,130,200,0.30)", borderRadius: "6px", color: "#aac0ff", padding: "4px 8px", fontSize: "12px", outline: "none", width: "58px" }} />
          <span style={{ color: CLR.dimText, fontSize: "11px" }}>s</span>
          <input type="text" placeholder="label" value={freeLabel} onChange={e => setFreeLabel(e.target.value)} maxLength={12}
            style={{ background: "rgba(12,18,45,0.70)", border: "1px solid rgba(90,130,200,0.30)", borderRadius: "6px", color: "#aac0ff", padding: "4px 8px", fontSize: "12px", outline: "none", width: "72px" }} />
          <button onClick={handleAddFreeCustom}
            style={{ ...BTN_SM, color: FE.col, borderColor: FE.bdr, padding: "4px 10px", fontSize: "12px", ...(playing ? BTN_OFF : {}) }}>
            + Add
          </button>
        </div>
      </div>

      <div style={{ marginBottom: "14px" }}>
        <div style={{ color: CLR.label, fontSize: "11px", marginBottom: "6px" }}>Add custom pulse</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "3px" }}>
            {["x", "y", "z"].map(ax => (
              <button key={ax} onClick={() => setNewAxis(ax)}
                style={ax === newAxis ? { ...BTN_SM, background: AX[ax].bg, borderColor: AX[ax].bdr, color: AX[ax].col, fontWeight: "700" } : BTN_SM}>
                {ax.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "160px" }}>
            <span style={{ color: CLR.text, fontSize: "12px", whiteSpace: "nowrap" }}>α = {fmtAngle(newAngle)}</span>
            <input type="range" min="0" max={TWO_PI} step="0.01" value={newAngle} onChange={e => setNewAngle(Number(e.target.value))}
              style={{ flex: 1, accentColor: "#ff9040", cursor: "pointer" }} />
          </div>
          <input type="text" placeholder="label (opt)" value={newLabel} onChange={e => setNewLabel(e.target.value)} maxLength={12}
            style={{ background: "rgba(12,18,45,0.70)", border: "1px solid rgba(90,130,200,0.30)", borderRadius: "6px", color: "#aac0ff", padding: "5px 10px", fontSize: "12px", outline: "none", width: "88px" }} />
          <button onClick={handleAddCustomPulse}
            style={{ ...BTN_GREEN, padding: "5px 14px", fontSize: "12px", ...(playing ? BTN_OFF : {}) }}>
            + Add
          </button>
        </div>
      </div>

      <Divider />

      {n === 0 ? (
        <div style={{ color: CLR.dimText, fontSize: "12px", padding: "10px 0", textAlign: "center", marginBottom: "4px" }}>
          No items yet — add pulses or free evolutions above.
        </div>
      ) : (
        <div style={{ marginBottom: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ color: CLR.label, fontSize: "11px" }}>Timeline</span>
            {seqDone && <span style={{ color: "#70e090", fontSize: "12px", fontWeight: "600" }}>✓ Sequence complete</span>}
          </div>
          <div style={{ overflowX: "auto", paddingBottom: "4px" }}>
            <TimelineRow
              pulses={pulses}
              completedSteps={completedSteps} currentPulse={currentPulse}
              pulseProgress={pulseProgress} inPause={inPause} playing={playing}
              onRemovePulse={onRemovePulse} onMovePulse={onMovePulse}
              large={false}
            />
          </div>
        </div>
      )}

      <Divider />

      <div style={{ marginBottom: "12px" }}>
        <div style={{ color: CLR.label, fontSize: "11px", marginBottom: "8px" }}>Playback</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={playing ? onPause : onPlay}
            style={{ ...BTN, background: playing ? "rgba(40,60,140,0.90)" : "rgba(15,80,40,0.90)", borderColor: playing ? "rgba(100,160,255,0.55)" : "rgba(60,180,90,0.60)", color: playing ? "#ddeeff" : "#70e090", fontWeight: "600", ...(n === 0 ? BTN_OFF : {}) }}>
            {playing ? "⏸ Pause" : seqDone ? "▶ Done" : "▶ Play"}
          </button>
          <button onClick={onReset} style={{ ...BTN_SM, ...(n === 0 && !seqOn ? BTN_OFF : {}) }}>↺ Reset</button>
          <div style={{ width: "1px", height: "20px", background: "rgba(90,130,200,0.22)", flexShrink: 0 }} />
          <button onClick={onStepBackward} style={{ ...BTN_SM, ...(!canBwd ? BTN_OFF : {}) }}>← Back</button>
          <button onClick={onStepForward}  style={{ ...BTN_SM, ...(!canFwd  ? BTN_OFF : {}) }}>Fwd →</button>
        </div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <div style={{ color: CLR.label, fontSize: "11px", marginBottom: "8px" }}>Speed</div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {SPEEDS.map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={speedBtnStyle(s)}>{s}×</button>
          ))}
          <div style={{ width: "1px", height: "20px", background: "rgba(90,130,200,0.22)", flexShrink: 0 }} />
          <button onClick={() => setVisualPause(!visualPause)}
            style={{ ...BTN_SM, ...(visualPause ? { background: "rgba(40,80,120,0.80)", borderColor: "rgba(80,160,220,0.60)", color: "#80d0ff" } : {}) }}>
            {visualPause ? "⏱ Pause ON" : "⏱ Pause OFF"}
          </button>
          {visualPause && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: CLR.text, fontSize: "11px", whiteSpace: "nowrap" }}>{pauseDuration.toFixed(1)}s</span>
              <input type="range" min="0" max="2" step="0.1" value={pauseDuration}
                onChange={e => setPauseDuration(Number(e.target.value))}
                style={{ width: "80px", accentColor: "#5096ff", cursor: "pointer" }} />
            </div>
          )}
        </div>
        {visualPause && <div style={{ color: CLR.dimText, fontSize: "10px", marginTop: "5px" }}>Visual learning pause only — not physical free evolution</div>}
      </div>

      <Divider />

      {seqOn || playing ? (
        <div style={{ background: "rgba(6,10,28,0.70)", border: "1px solid rgba(90,130,200,0.28)", borderRadius: "8px", padding: "10px 14px" }}>
          {inPause ? (
            <div>
              <div style={{ color: "#70e090", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                ✓ Step {completedSteps + 1} completed
                <span style={{ color: CLR.dimText, fontWeight: "400", marginLeft: "10px" }}>continuing in {((1 - pauseProgress) * pauseDuration).toFixed(1)}s…</span>
              </div>
              {seqVec && <div style={{ fontFamily: "monospace", fontSize: "11px", color: CLR.label }}>r = {fmtVec(seqVec)}</div>}
            </div>
          ) : currentItem?.type === "free" ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                <span style={{ color: CLR.bright, fontSize: "12px", fontWeight: "600" }}>Step {currentPulse + 1} of {n}</span>
                <span style={{ color: FE.col, fontSize: "12px" }}>∿ Free Evolution</span>
                <span style={{ color: CLR.label, fontSize: "12px" }}>{Math.round(pulseProgress * 100)}%</span>
              </div>
              <div style={{ color: FE.col, fontSize: "11px", marginBottom: "4px" }}>
                t = {(currentItem.tau * pulseProgress).toFixed(3)}s / {currentItem.tau.toFixed(2)}s{"  ·  "}φ = {(currentItem.omega0 * currentItem.tau * pulseProgress).toFixed(3)} rad
              </div>
              <div style={{ height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "2px", marginBottom: "6px" }}>
                <div style={{ height: "100%", borderRadius: "2px", width: `${Math.round(pulseProgress * 100)}%`, background: FE.col, transition: "width 0.05s linear" }} />
              </div>
              {seqVec && <div style={{ fontFamily: "monospace", fontSize: "11px", color: CLR.label }}>r = {fmtVec(seqVec)}</div>}
            </div>
          ) : currentPulse >= 0 && currentItem ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
                <span style={{ color: CLR.bright, fontSize: "12px", fontWeight: "600" }}>Step {currentPulse + 1} of {n}</span>
                <span style={{ color: AX[currentItem.axis]?.col ?? "#aac0ff", fontSize: "12px" }}>{currentItem.axis.toUpperCase()} {fmtAngle(currentItem.angle)}</span>
                <span style={{ color: CLR.label, fontSize: "12px" }}>{Math.round(pulseProgress * 100)}%</span>
              </div>
              <div style={{ height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "2px", marginBottom: "6px" }}>
                <div style={{ height: "100%", borderRadius: "2px", width: `${Math.round(pulseProgress * 100)}%`, background: AX[currentItem.axis]?.col ?? "#aac0ff", transition: "width 0.05s linear" }} />
              </div>
              {seqVec && <div style={{ fontFamily: "monospace", fontSize: "11px", color: CLR.label }}>r = {fmtVec(seqVec)}</div>}
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: "14px", marginBottom: "4px", flexWrap: "wrap" }}>
                <span style={{ color: CLR.bright, fontSize: "12px", fontWeight: "600" }}>
                  {seqDone ? `All ${n} steps done` : `After step ${completedSteps + 1} of ${n}`}
                </span>
                {completedItem?.type === "free" ? (
                  <span style={{ color: FE.col, fontSize: "12px" }}>∿ Free Evo · ω₀={completedItem.omega0.toFixed(1)} · τ={completedItem.tau.toFixed(2)}s · φ={(completedItem.omega0 * completedItem.tau).toFixed(3)} rad</span>
                ) : completedItem ? (
                  <span style={{ color: AX[completedItem.axis]?.col ?? "#aac0ff", fontSize: "12px" }}>{completedItem.axis.toUpperCase()} {fmtAngle(completedItem.angle)}</span>
                ) : null}
              </div>
              {seqVec && <div style={{ fontFamily: "monospace", fontSize: "11px", color: CLR.label }}>r = {fmtVec(seqVec)}</div>}
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: CLR.dimText, fontSize: "11px", textAlign: "center", padding: "4px 0" }}>
          {n > 0 ? "Press Play or Step Fwd to run the sequence." : "Build a sequence above, then play it."}
        </div>
      )}
    </div>
  );
}
