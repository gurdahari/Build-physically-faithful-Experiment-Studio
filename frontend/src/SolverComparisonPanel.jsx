/**
 * SolverComparisonPanel — compare custom RK4 vs QuTiP on the same pulse.
 *
 * Sends POST /simulate/time-dependent-pulse/compare and displays:
 *   - Final state from each solver
 *   - Euclidean final-state difference and max trajectory difference
 *   - PASS / FAIL badge (tolerance 1e-3)
 *   - Both trajectories on the Bloch sphere (gold = RK4, magenta = QuTiP)
 */

import { useState, useCallback, useMemo } from "react";

const BACKEND_URL   = "http://localhost:8000";
const FETCH_TIMEOUT = 15000;   // QuTiP is a bit slower than custom solver
const TWO_PI        = 2 * Math.PI;
const DEFAULT_STEPS = 200;

const C = {
  dim:    "#4a6494",
  label:  "#7a96c4",
  text:   "#aac0ff",
  bright: "#c8dcff",
  border: "rgba(90,130,200,0.18)",
};

const BTN = {
  background:   "rgba(20,28,55,0.88)",
  border:       "1px solid rgba(90,130,200,0.40)",
  borderRadius: "6px",
  color:        "#aac0ff",
  padding:      "6px 12px",
  cursor:       "pointer",
  fontSize:     "11px",
  lineHeight:   "1",
  userSelect:   "none",
};
const BTN_ACTIVE  = { ...BTN, background: "rgba(50,70,160,0.85)", borderColor: "rgba(110,170,255,0.55)", color: "#ddeeff", fontWeight: "600" };
const BTN_RUN     = { ...BTN, background: "rgba(10,60,40,0.80)", border: "1px solid rgba(60,180,90,0.45)", color: "#70e090", fontWeight: "600", padding: "7px 14px" };

function Row({ label, value, unit, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
      <span style={{ color: C.label, fontSize: "11px", minWidth: "48px", fontFamily: "monospace" }}>
        {label}
      </span>
      <span style={{ color: C.text, fontSize: "11px", minWidth: "54px", fontFamily: "monospace", textAlign: "right" }}>
        {value}{unit && <span style={{ color: C.dim, fontSize: "9px" }}> {unit}</span>}
      </span>
      {children}
    </div>
  );
}

function vecStr(v) {
  return `(${v[0].toFixed(3)}, ${v[1].toFixed(3)}, ${v[2].toFixed(3)})`;
}

function fmtDiff(d) {
  return d < 1e-10 ? "< 1e-10" : d.toExponential(2);
}

// ── Pass/fail badge ───────────────────────────────────────────────────────────

function PassBadge({ passed, tolerance }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: "12px",
      fontSize: "11px",
      fontWeight: "700",
      fontFamily: "monospace",
      background: passed ? "rgba(10,80,40,0.80)" : "rgba(80,20,10,0.80)",
      border: `1px solid ${passed ? "rgba(60,200,90,0.5)" : "rgba(200,80,60,0.5)"}`,
      color: passed ? "#70e090" : "#ff8060",
    }}>
      {passed ? "✓ PASS" : "✗ FAIL"}
      <span style={{ color: C.dim, fontWeight: "400", marginLeft: "6px" }}>
        tol {tolerance.toExponential(0)}
      </span>
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SolverComparisonPanel({ blochVec, onTrajectories }) {
  const [shape,    setShape]    = useState("square");
  const [amp,      setAmp]      = useState(Math.PI);
  const [phase,    setPhase]    = useState(0.0);
  const [detuning, setDetuning] = useState(0.0);
  const [duration, setDuration] = useState(1.0);
  const [sigma,    setSigma]    = useState(0.2);
  // "idle" | "loading" | "ok" | "error" | "offline"
  const [status,  setStatus]  = useState("idle");
  const [result,  setResult]  = useState(null);

  const run = useCallback(async () => {
    setStatus("loading");
    setResult(null);
    onTrajectories(null, null);

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const body = {
      initial_bloch:   blochVec,
      pulse_shape:     shape,
      amplitude:       amp,
      phase,
      detuning,
      duration,
      number_of_steps: DEFAULT_STEPS,
    };
    if (shape === "gaussian") body.sigma = sigma;

    try {
      const resp = await fetch(`${BACKEND_URL}/simulate/time-dependent-pulse/compare`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  controller.signal,
        body: JSON.stringify(body),
      });
      clearTimeout(tid);

      if (!resp.ok) {
        let detail = "Request failed";
        try { detail = (await resp.json()).detail ?? detail; } catch (_) { /* ok */ }
        setStatus("error");
        setResult({ error: detail });
        return;
      }

      const data = await resp.json();
      setStatus("ok");
      setResult(data);
      onTrajectories(data.custom_trajectory, data.qutip_trajectory);

    } catch (err) {
      clearTimeout(tid);
      if (err.name === "AbortError" || err.name === "TypeError") {
        setStatus("offline");
        setResult({ error: "Backend offline — start with: uvicorn main:app" });
      } else {
        setStatus("error");
        setResult({ error: String(err) });
      }
    }
  }, [blochVec, shape, amp, phase, detuning, duration, sigma, onTrajectories]);

  const clear = useCallback(() => {
    setStatus("idle");
    setResult(null);
    onTrajectories(null, null);
  }, [onTrajectories]);

  return (
    <div>
      {/* ── Shape selector ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "5px", marginBottom: "12px" }}>
        {["square", "gaussian"].map(s => (
          <button key={s} onClick={() => setShape(s)}
            style={s === shape ? BTN_ACTIVE : BTN}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Parameter sliders ────────────────────────────────────────── */}
      <div style={{
        background: "rgba(8,14,38,0.55)",
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        padding: "10px 12px",
        marginBottom: "12px",
      }}>
        <Row label="Ω₀" value={(amp / Math.PI).toFixed(2)} unit="π rad/s">
          <input type="range" min="0" max={4 * Math.PI} step="0.05"
            value={amp} onChange={e => setAmp(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#40c8e0", cursor: "pointer" }} />
        </Row>
        <Row label="φ" value={(phase / Math.PI).toFixed(2)} unit="π rad">
          <input type="range" min="0" max={TWO_PI} step="0.01"
            value={phase} onChange={e => setPhase(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#bb88ff", cursor: "pointer" }} />
        </Row>
        <Row label="Δ" value={(detuning / Math.PI).toFixed(2)} unit="π rad/s">
          <input type="range" min={-3 * Math.PI} max={3 * Math.PI} step="0.05"
            value={detuning} onChange={e => setDetuning(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#ff9040", cursor: "pointer" }} />
        </Row>
        <Row label="T" value={duration.toFixed(2)} unit="s">
          <input type="range" min="0.05" max="5" step="0.05"
            value={duration} onChange={e => setDuration(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#5096ff", cursor: "pointer" }} />
        </Row>
        {shape === "gaussian" && (
          <Row label="σ" value={sigma.toFixed(3)} unit="s">
            <input type="range" min="0.01" max={Math.max(0.01, duration / 2)} step="0.01"
              value={Math.min(sigma, duration / 2)}
              onChange={e => setSigma(Number(e.target.value))}
              style={{ flex: 1, accentColor: "#e0a040", cursor: "pointer" }} />
          </Row>
        )}
      </div>

      {/* ── Run / clear ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
        <button
          onClick={run}
          disabled={status === "loading"}
          style={{ ...BTN_RUN, opacity: status === "loading" ? 0.6 : 1 }}
        >
          {status === "loading" ? "Running both solvers…" : "⊛ Run comparison"}
        </button>
        {status !== "idle" && (
          <button onClick={clear} style={{ ...BTN, padding: "7px 10px" }}>✕</button>
        )}
      </div>

      {/* ── Results ─────────────────────────────────────────────────── */}
      {result && !result.error && (
        <div style={{
          background: "rgba(6,12,30,0.70)",
          border: `1px solid ${C.border}`,
          borderRadius: "8px",
          padding: "10px 12px",
          fontFamily: "monospace",
          fontSize: "10.5px",
          lineHeight: "1.8",
        }}>
          {/* Solver results */}
          <div style={{ marginBottom: "8px" }}>
            <div style={{ color: C.dim, fontSize: "9px", marginBottom: "4px", letterSpacing: "0.08em" }}>
              FINAL STATE
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{
                display: "inline-block", width: "10px", height: "10px",
                borderRadius: "50%", background: "#ffb700", flexShrink: 0,
              }} />
              <span style={{ color: C.label, minWidth: "70px" }}>Custom RK4</span>
              <span style={{ color: C.bright }}>{vecStr(result.custom_final_state)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{
                display: "inline-block", width: "10px", height: "10px",
                borderRadius: "50%", background: "#ff70c8", flexShrink: 0,
              }} />
              <span style={{ color: C.label, minWidth: "70px" }}>QuTiP</span>
              <span style={{ color: C.bright }}>{vecStr(result.qutip_final_state)}</span>
            </div>
          </div>

          {/* Differences */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "8px", marginBottom: "8px" }}>
            <div style={{ display: "flex", gap: "16px" }}>
              <div>
                <span style={{ color: C.label }}>│Δ_final│  </span>
                <span style={{ color: result.final_state_diff < 1e-3 ? "#70e090" : "#ff8060" }}>
                  {fmtDiff(result.final_state_diff)}
                </span>
              </div>
              <div>
                <span style={{ color: C.label }}>│Δ_max│  </span>
                <span style={{ color: result.max_trajectory_diff < 1e-3 ? "#70e090" : "#ff8060" }}>
                  {fmtDiff(result.max_trajectory_diff)}
                </span>
              </div>
            </div>
          </div>

          {/* Bloch norms */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "8px", marginBottom: "10px" }}>
            <span style={{ color: C.label }}>|r| RK4  </span>
            <span style={{ color: C.text }}>{result.custom_bloch_norm.toFixed(6)}</span>
            <span style={{ color: C.dim }}> · </span>
            <span style={{ color: C.label }}>|r| QuTiP  </span>
            <span style={{ color: C.text }}>{result.qutip_bloch_norm.toFixed(6)}</span>
          </div>

          {/* Pass/fail */}
          <PassBadge passed={result.passed} tolerance={result.tolerance} />

          {/* Legend */}
          <div style={{ marginTop: "10px", borderTop: `1px solid ${C.border}`, paddingTop: "8px",
                        color: C.dim, fontSize: "9.5px" }}>
            QuTiP {result.qutip_version} · {DEFAULT_STEPS} steps
            <br />
            <span style={{ color: "#ffb700" }}>●</span> gold = custom RK4 &nbsp;&nbsp;
            <span style={{ color: "#ff70c8" }}>●</span> magenta = QuTiP
          </div>
        </div>
      )}

      {result?.error && (
        <div style={{
          color: status === "offline" ? "#c08040" : "#ff8060",
          fontSize: "10px",
          padding: "6px 0",
        }}>
          {status === "offline" ? "⊘ " : "⚠ "}{result.error}
        </div>
      )}

      {/* Physics note */}
      <div style={{ color: C.dim, fontSize: "9px", marginTop: "10px", lineHeight: "1.55" }}>
        Both solvers: H(t) = 0.5·[Ω(t)cosφ σx + Ω(t)sinφ σy + Δ σz]
        <br />
        RK4: dr/dt = Ω_eff × r · QuTiP: dρ/dt = −i[H, ρ] via mesolve
      </div>
    </div>
  );
}
