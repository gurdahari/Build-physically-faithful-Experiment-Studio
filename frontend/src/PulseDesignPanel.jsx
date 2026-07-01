/**
 * PulseDesignPanel — time-dependent pulse simulation panel.
 *
 * Physics: H(t) = (ħ/2)[Ω(t)cos(φ) σx + Ω(t)sin(φ) σy + Δ σz]
 * Integrates dr/dt = Ω_eff(t) × r via RK4 on the backend.
 * Offline-safe; envelope chart computed locally for live preview.
 */

import { useState, useCallback, useMemo } from "react";

const BACKEND_URL   = "http://localhost:8000";
const FETCH_TIMEOUT = 8000;
const TWO_PI        = 2 * Math.PI;
const DEFAULT_STEPS = 400;

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
const BTN_ACTIVE = { ...BTN, background: "rgba(50,70,160,0.85)", borderColor: "rgba(110,170,255,0.55)", color: "#ddeeff", fontWeight: "600" };
const BTN_RUN    = { ...BTN, background: "rgba(10,60,40,0.80)", border: "1px solid rgba(60,180,90,0.45)", color: "#70e090", fontWeight: "600", padding: "7px 14px" };
const BTN_GAUSS  = { ...BTN, accentColor: "#e0a040" };

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

// ── Live envelope SVG chart ───────────────────────────────────────────────────

function EnvelopeChart({ shape, amplitude, sigma, duration }) {
  const N_PTS = 120;
  const W = 268, H = 74;
  const ml = 34, mr = 8, mt = 6, mb = 20;
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  const pts = useMemo(() => {
    const arr = [];
    for (let i = 0; i < N_PTS; i++) {
      const t = (i / (N_PTS - 1)) * duration;
      let omega;
      if (shape === "gaussian") {
        const sig = sigma > 0 ? sigma : duration / 6;
        omega = amplitude * Math.exp(-((t - duration / 2) ** 2) / (2 * sig * sig));
      } else {
        omega = amplitude;
      }
      arr.push([t, omega]);
    }
    return arr;
  }, [shape, amplitude, sigma, duration]);

  const maxVal = Math.max(...pts.map(([, o]) => Math.abs(o)), 0.001);

  const toSVG = ([t, omega]) => {
    const x = ml + (t / duration) * pw;
    const y = mt + ph - (omega / maxVal) * ph;
    return [x, y];
  };

  const polyPts = pts.map(p => toSVG(p).join(",")).join(" ");
  const [x0] = toSVG([0, 0]);
  const [x1] = toSVG([duration, 0]);
  const fillPts = `${x0},${mt + ph} ${polyPts} ${x1},${mt + ph}`;

  const areaLabel = shape === "gaussian"
    ? `area ≈ ${(amplitude * (sigma > 0 ? sigma : duration/6) * Math.sqrt(TWO_PI)).toFixed(3)} rad`
    : `area = ${(amplitude * duration).toFixed(3)} rad`;

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible", marginBottom: "10px" }}>
      <polygon points={fillPts} fill="rgba(64,200,224,0.12)" />
      <polyline points={polyPts} fill="none" stroke="#40c8e0" strokeWidth="1.6" />
      <line x1={ml} y1={mt + ph} x2={ml + pw} y2={mt + ph} stroke="rgba(90,130,200,0.25)" strokeWidth="0.5" />
      <line x1={ml} y1={mt}      x2={ml}       y2={mt + ph} stroke="rgba(90,130,200,0.25)" strokeWidth="0.5" />
      <text x={ml}       y={H - 3} fill="rgba(90,130,200,0.45)" fontSize="8.5" textAnchor="middle">0</text>
      <text x={ml + pw}  y={H - 3} fill="rgba(90,130,200,0.45)" fontSize="8.5" textAnchor="middle">{duration.toFixed(2)}s</text>
      <text x={ml - 3}   y={mt + 4}      fill="rgba(90,130,200,0.45)" fontSize="8.5" textAnchor="end">{maxVal.toFixed(2)}</text>
      <text x={ml - 3}   y={mt + ph}     fill="rgba(90,130,200,0.45)" fontSize="8.5" textAnchor="end">0</text>
      <text x={ml + pw/2} y={H - 2}      fill="rgba(64,200,224,0.35)" fontSize="8" textAnchor="middle">{areaLabel}</text>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function vecStr(v) {
  return `(${v[0].toFixed(3)}, ${v[1].toFixed(3)}, ${v[2].toFixed(3)})`;
}

export default function PulseDesignPanel({ blochVec, onTrajectory }) {
  const [shape,    setShape]    = useState("square");
  const [amp,      setAmp]      = useState(Math.PI);
  const [phase,    setPhase]    = useState(0.0);
  const [detuning, setDetuning] = useState(0.0);
  const [duration, setDuration] = useState(1.0);
  const [sigma,    setSigma]    = useState(0.2);
  // "idle" | "loading" | "ok" | "error" | "offline"
  const [status,  setStatus]   = useState("idle");
  const [result,  setResult]   = useState(null);

  const run = useCallback(async () => {
    setStatus("loading");
    setResult(null);
    onTrajectory(null);

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
      const resp = await fetch(`${BACKEND_URL}/simulate/time-dependent-pulse`, {
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
  }, [blochVec, shape, amp, phase, detuning, duration, sigma, onTrajectory]);

  const clear = useCallback(() => {
    setStatus("idle");
    setResult(null);
    onTrajectory(null);
  }, [onTrajectory]);

  // Effective field at peak (t=T/2 for Gaussian, always for square)
  const effMag = Math.sqrt(amp * amp + detuning * detuning);
  const peakAxis = effMag > 1e-12
    ? [amp * Math.cos(phase) / effMag, amp * Math.sin(phase) / effMag, detuning / effMag]
    : null;

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
        marginBottom: "10px",
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
        {peakAxis && (
          <div style={{ color: C.dim, fontSize: "9.5px", fontFamily: "monospace", marginTop: "4px" }}>
            |Ω_eff| = {effMag.toFixed(3)} rad/s
            {" · "}n̂ = ({peakAxis.map(v => v.toFixed(2)).join(", ")})
          </div>
        )}
      </div>

      {/* ── Live envelope chart ──────────────────────────────────────── */}
      <EnvelopeChart
        shape={shape}
        amplitude={amp}
        sigma={sigma}
        duration={duration}
      />

      {/* ── Run / clear ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
        <button
          onClick={run}
          disabled={status === "loading"}
          style={{ ...BTN_RUN, opacity: status === "loading" ? 0.6 : 1 }}
        >
          {status === "loading" ? "Running…" : "▶ Run pulse simulation"}
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
          <div style={{ color: C.label }}>
            Pulse area: <span style={{ color: C.text }}>{result.pulse_area.toFixed(4)} rad</span>
            <span style={{ color: C.dim }}> ({(result.pulse_area / Math.PI).toFixed(3)}π)</span>
          </div>
          <div style={{ color: C.label }}>
            Peak |Ω|: <span style={{ color: C.text }}>{result.max_amplitude.toFixed(4)} rad/s</span>
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
      <div style={{ color: C.dim, fontSize: "9px", marginTop: "10px", lineHeight: "1.55" }}>
        H(t) = (ħ/2)[Ω(t)cos(φ) σx + Ω(t)sin(φ) σy + Δ σz]
        <br />
        φ=0 → X rotation  ·  φ=π/2 → Y rotation  ·  Δ≠0 tilts axis toward Z
        <br />
        Integrated with RK4  ·  {DEFAULT_STEPS} steps
      </div>
    </div>
  );
}
