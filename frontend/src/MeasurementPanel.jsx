import { useState } from "react";
import {
  BASES, measureProbs, validateProbs, sampleOnce, runShots, collapseVec,
} from "./blochMeasure.js";

// ── Tokens (self-contained — no shared import) ────────────────────────────────
const C = {
  border: "rgba(90, 130, 200, 0.20)",
  label:  "#7a96c4",
  dim:    "#4a6494",
  text:   "#aac0ff",
  bright: "#c8dcff",
  amber:  "#ffb840",
};

// Outcome colors: first eigenstate blue, second eigenstate purple
const OCOL = ["#5096ff", "#a060e0"];

const BTN_BASE = {
  background:   "rgba(20, 28, 55, 0.88)",
  border:       "1px solid rgba(90, 130, 200, 0.40)",
  borderRadius: "6px",
  color:        "#aac0ff",
  cursor:       "pointer",
  lineHeight:   "1",
  userSelect:   "none",
  fontSize:     "13px",
  padding:      "7px 16px",
};
const BTN_SM  = { ...BTN_BASE, padding: "5px 10px", fontSize: "12px" };
const BTN_OFF = { opacity: 0.30, cursor: "not-allowed", pointerEvents: "none" };

const INPUT = {
  background:   "rgba(12, 18, 45, 0.70)",
  border:       "1px solid rgba(90, 130, 200, 0.30)",
  borderRadius: "6px",
  color:        "#aac0ff",
  padding:      "5px 9px",
  fontSize:     "12px",
  outline:      "none",
};

// ── Horizontal probability bar ─────────────────────────────────────────────────
function ProbBar({ label, prob, col }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
      <span style={{ fontFamily: "monospace", fontSize: "12px", color: C.bright, minWidth: "44px" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: "10px", background: "rgba(90,130,200,0.10)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${Math.round(prob * 10000) / 100}%`,
          background: col,
          transition: "width 0.12s ease",
        }} />
      </div>
      <span style={{ color: C.text, fontSize: "11px", minWidth: "38px", textAlign: "right" }}>
        {(prob * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ── Shot histogram bar ─────────────────────────────────────────────────────────
function ShotBar({ label, count, total, col }) {
  const pct = total > 0 ? count / total : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
      <span style={{ fontFamily: "monospace", fontSize: "12px", color: C.bright, minWidth: "44px" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: "12px", background: "rgba(90,130,200,0.10)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: col }} />
      </div>
      <span style={{ color: C.text, fontSize: "11px", minWidth: "38px", textAlign: "right" }}>
        {(pct * 100).toFixed(0)}%
      </span>
      <span style={{ color: C.dim, fontSize: "11px", minWidth: "54px", textAlign: "right", fontFamily: "monospace" }}>
        {count}/{total}
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MeasurementPanel({ blochVec, seqPlaying, onPauseSequence, onCollapse }) {
  const [basis,       setBasis]       = useState("z");
  const [collapse,    setCollapse]    = useState(false);
  const [shotResult,  setShotResult]  = useState(null);   // 0 | 1 | null
  const [counts,      setCounts]      = useState(null);   // [c0, c1] | null
  const [shotsStr,    setShotsStr]    = useState("100");
  const [shotsOpen,   setShotsOpen]   = useState(false);

  // Fallback to |0⟩ if vec is undefined/null
  const vec   = (blochVec && blochVec.every(isFinite)) ? blochVec : [0, 0, 1];
  const probs = measureProbs(basis, vec);
  const valid = validateProbs(probs);
  const bInfo = BASES[basis];

  const shotsN     = parseInt(shotsStr, 10);
  const shotsValid = Number.isInteger(shotsN) && shotsN >= 1 && shotsN <= 10000;

  const handleBasisChange = (b) => {
    setBasis(b);
    setShotResult(null);
    setCounts(null);
  };

  const handleMeasureOnce = () => {
    // Auto-pause sequence if it is playing so the measurement captures the current state
    if (seqPlaying) onPauseSequence?.();
    if (!valid) return;
    const k = sampleOnce(probs);
    setShotResult(k);
    setCounts(null);
    if (collapse && onCollapse) {
      onCollapse(collapseVec(basis, k));
    }
  };

  const handleRunShots = () => {
    if (seqPlaying) onPauseSequence?.();
    if (!valid || !shotsValid) return;
    setCounts(runShots(probs, shotsN));
    setShotResult(null);
  };

  // Basis toggle button style
  const basisBtn = (b) => ({
    ...BTN_SM,
    ...(b === basis ? {
      background:  "rgba(255, 184, 64, 0.18)",
      borderColor: C.amber,
      color:       "#ffd080",
      fontWeight:  "700",
    } : {}),
  });

  return (
    <div>
      {/* ── Basis selector ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
        <span style={{ color: C.label, fontSize: "11px" }}>Basis</span>
        {["z", "x", "y"].map(b => (
          <button key={b} onClick={() => handleBasisChange(b)} style={basisBtn(b)}>
            {BASES[b].label}
          </button>
        ))}
      </div>

      {/* ── Basis hint ──────────────────────────────────────────────────── */}
      <div style={{ color: C.dim, fontSize: "10px", marginBottom: "12px", lineHeight: "1.5" }}>
        {bInfo.hint}
      </div>

      {/* ── Theoretical probabilities ────────────────────────────────────── */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ color: C.dim, fontSize: "10px", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "7px" }}>
          Theoretical  ·  Born rule
        </div>
        {probs.map((p, i) => (
          <ProbBar key={i} label={bInfo.outcomes[i]} prob={p} col={OCOL[i]} />
        ))}
      </div>

      {/* ── Measure once + collapse toggle ──────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
        <button onClick={handleMeasureOnce}
          style={{ ...BTN_BASE, padding: "6px 14px", fontSize: "12px" }}>
          Measure once
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={collapse} onChange={e => setCollapse(e.target.checked)}
            style={{ accentColor: C.amber, cursor: "pointer", width: "13px", height: "13px" }} />
          <span style={{ color: C.label, fontSize: "11px" }}>Collapse state</span>
        </label>
      </div>

      {/* ── Single-shot result ──────────────────────────────────────────── */}
      {shotResult !== null && (
        <div style={{
          background:   "rgba(10, 20, 50, 0.80)",
          border:       `1px solid rgba(255, 184, 64, 0.38)`,
          borderRadius: "8px",
          padding:      "9px 14px",
          marginBottom: "10px",
          display:      "flex",
          alignItems:   "center",
          gap:          "12px",
        }}>
          <span style={{ color: OCOL[shotResult], fontFamily: "monospace", fontSize: "22px", fontWeight: "700", lineHeight: "1" }}>
            {bInfo.outcomes[shotResult]}
          </span>
          <div>
            <div style={{ color: C.amber, fontSize: "11px", fontWeight: "600", marginBottom: "2px" }}>
              Single-shot outcome
            </div>
            <div style={{ color: C.dim, fontSize: "10px" }}>
              One random sample · P = {(probs[shotResult] * 100).toFixed(1)}%
            </div>
            {collapse && (
              <div style={{ color: C.dim, fontSize: "10px" }}>
                State collapsed to {bInfo.outcomes[shotResult]}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Run shots (collapsible) ──────────────────────────────────────── */}
      <button onClick={() => setShotsOpen(o => !o)}
        style={{
          ...BTN_SM,
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          justifyContent: "flex-start",
          color: C.label,
          marginBottom: shotsOpen ? "6px" : "0",
        }}>
        <span style={{ fontSize: "10px" }}>{shotsOpen ? "▾" : "▸"}</span>
        Run shots
        {counts && !shotsOpen && (
          <span style={{ marginLeft: "auto", color: C.dim, fontSize: "10px" }}>
            {shotsN} shots
          </span>
        )}
      </button>

      {shotsOpen && (
        <div style={{
          background:   "rgba(8, 14, 38, 0.55)",
          border:       `1px solid ${C.border}`,
          borderRadius: "8px",
          padding:      "10px 12px",
        }}>
          {/* Controls row */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
            <input
              type="number" min="1" max="10000" value={shotsStr}
              onChange={e => setShotsStr(e.target.value)}
              style={{ ...INPUT, width: "64px" }}
            />
            <span style={{ color: C.dim, fontSize: "11px" }}>shots</span>
            <button onClick={handleRunShots}
              style={{ ...BTN_SM, ...(!shotsValid ? BTN_OFF : {}) }}>
              Run
            </button>
            {!shotsValid && shotsStr !== "" && (
              <span style={{ color: "#ff7070", fontSize: "10px" }}>1 – 10 000</span>
            )}
          </div>

          {/* Histogram */}
          {counts ? (
            <>
              <div style={{ color: C.dim, fontSize: "10px", marginBottom: "7px" }}>
                {shotsN.toLocaleString()} shots  ·  simulated outcomes
              </div>
              {counts.map((c, i) => (
                <ShotBar key={i} label={bInfo.outcomes[i]} count={c} total={shotsN} col={OCOL[i]} />
              ))}
              <div style={{ marginTop: "6px", display: "flex", gap: "16px" }}>
                {counts.map((c, i) => (
                  <span key={i} style={{ color: OCOL[i], fontSize: "10px", fontFamily: "monospace" }}>
                    {bInfo.outcomes[i]}: {(c / shotsN * 100).toFixed(1)}%
                    <span style={{ color: C.dim }}> (theory {(probs[i] * 100).toFixed(1)}%)</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: C.dim, fontSize: "10px", textAlign: "center", padding: "6px 0" }}>
              Press Run to simulate
            </div>
          )}
        </div>
      )}

      {/* ── Playing hint ────────────────────────────────────────────────── */}
      {seqPlaying && (
        <div style={{ color: C.dim, fontSize: "10px", textAlign: "center", marginTop: "8px" }}>
          Measuring will pause sequence playback
        </div>
      )}

      {/* ── Key ─────────────────────────────────────────────────────────── */}
      <div style={{
        marginTop:    "10px",
        paddingTop:   "8px",
        borderTop:    `1px solid rgba(90,130,200,0.12)`,
        color:        C.dim,
        fontSize:     "9px",
        lineHeight:   "1.6",
      }}>
        <span style={{ color: OCOL[0] }}>■</span> first eigenstate
        {"  "}
        <span style={{ color: OCOL[1] }}>■</span> second eigenstate
        {"  ·  "}
        Theoretical = Born rule · Shot statistics = random outcomes
      </div>
    </div>
  );
}
