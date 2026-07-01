/**
 * HamiltonianPanel — backend Hamiltonian simulation test panel.
 *
 * Sends a POST /simulate/hamiltonian request with the current Bloch vector as
 * the initial state and returns the full trajectory for display on the sphere.
 *
 * Intentionally isolated from the main animation; offline-safe.
 */

import { useState, useCallback } from "react";

const BACKEND_URL     = "http://localhost:8000";
const FETCH_TIMEOUT   = 5000;
const DEFAULT_STEPS   = 80;

const C = {
  dim:    "#4a6494",
  label:  "#7a96c4",
  text:   "#aac0ff",
  bright: "#c8dcff",
  border: "rgba(90,130,200,0.18)",
};

const BTN = {
  background: "rgba(20,28,55,0.88)",
  border:     "1px solid rgba(90,130,200,0.40)",
  borderRadius: "6px",
  color:      "#aac0ff",
  padding:    "7px 14px",
  cursor:     "pointer",
  fontSize:   "12px",
  lineHeight: "1",
  userSelect: "none",
};

const BTN_RUN = {
  ...BTN,
  background:  "rgba(10,60,40,0.80)",
  border:      "1px solid rgba(60,180,90,0.45)",
  color:       "#70e090",
  fontWeight:  "600",
};

function OmegaRow({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
      <span style={{ color: C.label, fontSize: "11px", minWidth: "22px", fontFamily: "monospace" }}>
        {label}
      </span>
      <span style={{ color: C.text, fontSize: "11px", minWidth: "50px", fontFamily: "monospace", textAlign: "right" }}>
        {value.toFixed(2)}
      </span>
      <input
        type="range" min="-10" max="10" step="0.1"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: "#bb88ff", cursor: "pointer" }}
      />
    </div>
  );
}

function vecStr(v) {
  return `(${v[0].toFixed(3)}, ${v[1].toFixed(3)}, ${v[2].toFixed(3)})`;
}

function fmtAngle(r) {
  const turns = r / (2 * Math.PI);
  if (turns >= 0.01) return `${r.toFixed(3)} rad (${turns.toFixed(2)} turns)`;
  return `${r.toFixed(4)} rad`;
}

export default function HamiltonianPanel({ blochVec, onTrajectory }) {
  const [omegaX,   setOmegaX]   = useState(Math.PI);
  const [omegaY,   setOmegaY]   = useState(0);
  const [omegaZ,   setOmegaZ]   = useState(0);
  const [duration, setDuration] = useState(1.0);
  // "idle" | "loading" | "ok" | "error" | "offline"
  const [status,   setStatus]   = useState("idle");
  const [result,   setResult]   = useState(null);

  const run = useCallback(async () => {
    setStatus("loading");
    setResult(null);
    onTrajectory(null);

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const resp = await fetch(`${BACKEND_URL}/simulate/hamiltonian`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  controller.signal,
        body: JSON.stringify({
          initial_bloch:    blochVec,
          omega_x:          omegaX,
          omega_y:          omegaY,
          omega_z:          omegaZ,
          duration:         duration,
          number_of_steps:  DEFAULT_STEPS,
        }),
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
      onTrajectory(data.trajectory);

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
  }, [blochVec, omegaX, omegaY, omegaZ, duration, onTrajectory]);

  const clear = useCallback(() => {
    setStatus("idle");
    setResult(null);
    onTrajectory(null);
  }, [onTrajectory]);

  const omegaMag = Math.sqrt(omegaX**2 + omegaY**2 + omegaZ**2);

  return (
    <div>
      {/* ── Ω sliders ────────────────────────────────────────────────── */}
      <div style={{
        background: "rgba(8,14,38,0.55)",
        border: `1px solid ${C.border}`,
        borderRadius: "8px",
        padding: "10px 12px",
        marginBottom: "12px",
      }}>
        <OmegaRow label="Ωx" value={omegaX} onChange={setOmegaX} />
        <OmegaRow label="Ωy" value={omegaY} onChange={setOmegaY} />
        <OmegaRow label="Ωz" value={omegaZ} onChange={setOmegaZ} />
        <div style={{ color: C.dim, fontSize: "9.5px", marginTop: "4px", fontFamily: "monospace" }}>
          |Ω| = {omegaMag.toFixed(3)} rad/s
          {omegaMag > 0 && (
            <span style={{ marginLeft: "10px" }}>
              n̂ = ({(omegaX/omegaMag).toFixed(2)}, {(omegaY/omegaMag).toFixed(2)}, {(omegaZ/omegaMag).toFixed(2)})
            </span>
          )}
        </div>
      </div>

      {/* ── Duration ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <span style={{ color: C.label, fontSize: "11px", minWidth: "58px" }}>Duration</span>
        <span style={{ color: C.text, fontSize: "11px", minWidth: "50px", fontFamily: "monospace", textAlign: "right" }}>
          {duration.toFixed(2)} s
        </span>
        <input
          type="range" min="0.05" max="10" step="0.05"
          value={duration}
          onChange={e => setDuration(Number(e.target.value))}
          style={{ flex: 1, accentColor: "#5096ff", cursor: "pointer" }}
        />
      </div>

      {/* Predicted total angle */}
      <div style={{ color: C.dim, fontSize: "9.5px", marginBottom: "12px", fontFamily: "monospace" }}>
        Predicted θ = {fmtAngle(omegaMag * duration)}
      </div>

      {/* ── Buttons ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
        <button
          onClick={run}
          disabled={status === "loading"}
          style={{ ...BTN_RUN, opacity: status === "loading" ? 0.6 : 1 }}
        >
          {status === "loading" ? "Running…" : "▶ Run Hamiltonian simulation"}
        </button>
        {status !== "idle" && (
          <button onClick={clear} style={{ ...BTN, padding: "7px 10px" }}>✕</button>
        )}
      </div>

      {/* ── Result ───────────────────────────────────────────────────── */}
      {result && !result.error && (
        <div style={{
          background: "rgba(8,20,12,0.60)",
          border: "1px solid rgba(60,180,90,0.25)",
          borderRadius: "8px",
          padding: "10px 12px",
          fontFamily: "monospace",
          fontSize: "10.5px",
          lineHeight: "1.7",
        }}>
          <div style={{ color: "#70e090", fontWeight: "600", marginBottom: "4px" }}>
            ✓ Simulation complete
          </div>
          <div style={{ color: C.label }}>
            Final state: <span style={{ color: C.bright }}>{vecStr(result.final_state)}</span>
          </div>
          {result.rotation_axis && (
            <div style={{ color: C.label }}>
              Axis n̂: <span style={{ color: C.text }}>{vecStr(result.rotation_axis)}</span>
            </div>
          )}
          <div style={{ color: C.label }}>
            |Ω|: <span style={{ color: C.text }}>{result.omega_magnitude.toFixed(4)} rad/s</span>
          </div>
          <div style={{ color: C.label }}>
            Total θ: <span style={{ color: C.text }}>{fmtAngle(result.total_angle)}</span>
          </div>
          <div style={{ color: C.label }}>
            Steps: <span style={{ color: C.text }}>{result.trajectory.length}</span>
            {" · "}
            <span style={{ color: "rgba(90,130,200,0.50)" }}>trajectory shown on sphere</span>
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
      <div style={{ color: C.dim, fontSize: "9px", marginTop: "10px", lineHeight: "1.5" }}>
        H = (ħ/2)(Ωx σx + Ωy σy + Ωz σz)
        <br />
        Bloch vector rotates around Ω/|Ω| by |Ω|·t (Rodrigues' formula)
      </div>
    </div>
  );
}
