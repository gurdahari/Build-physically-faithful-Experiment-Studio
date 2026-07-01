/**
 * ExperimentPanel — build a multi-item experiment and run it with QuTiP.
 *
 * All quantum evolution is computed by the backend (POST /simulate/experiment).
 * Optional open-system (Lindblad) dynamics via T1 / T2 parameters.
 * The frontend ONLY renders and animates the returned trajectory.
 *
 * Physics (open-system):
 *   C_down = √(γ_down) · σ+        energy relaxation toward equilibrium
 *   C_up   = √(γ_up)   · σ−        thermal excitation (zero at T=0)
 *   C_phi  = √(1/2Tφ)  · σz        pure dephasing
 *
 *   γ_down = (1/T1)(1+z_eq)/2     γ_up = (1/T1)(1−z_eq)/2
 *   1/Tφ   = 1/T2 − 1/(2T1)       (derived; not entered directly)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { buildScaleMetadata } from "./visualPhysics/visualScales.js";

const BACKEND_URL   = "http://localhost:8000";
const FETCH_TIMEOUT = 30000;
const TARGET_FRAMES = 120;   // ~4 s of playback regardless of quality
const FRAME_MS      = 33;    // ~30 fps

const C = {
  dim:    "#4a6494",
  label:  "#7a96c4",
  text:   "#aac0ff",
  bright: "#c8dcff",
  border: "rgba(90,130,200,0.18)",
  warn:   "#c08040",
};
const BTN = {
  background: "rgba(20,28,55,0.88)",
  border:     "1px solid rgba(90,130,200,0.40)",
  borderRadius: "6px",
  color:        "#aac0ff",
  padding:      "5px 10px",
  cursor:       "pointer",
  fontSize:     "11px",
  lineHeight:   "1",
  userSelect:   "none",
};
const BTN_ACTIVE = { ...BTN, background: "rgba(50,70,160,0.85)", borderColor: "rgba(110,170,255,0.55)", color: "#ddeeff", fontWeight: "600" };
const BTN_RUN    = { ...BTN, background: "rgba(10,60,40,0.80)", border: "1px solid rgba(60,180,90,0.45)", color: "#70e090", fontWeight: "600", padding: "7px 14px" };
const BTN_ADD    = { ...BTN, background: "rgba(16,24,60,0.80)", border: "1px solid rgba(80,120,200,0.35)", color: "#8aacdd" };
const BTN_SM     = { ...BTN, padding: "3px 8px", fontSize: "10px" };
const BTN_SM_ACT = { ...BTN_SM, ...BTN_ACTIVE };
const BTN_WARN   = { ...BTN, background: "rgba(50,30,5,0.88)", border: "1px solid rgba(180,130,40,0.40)", color: "#e0a040", padding: "7px 14px", fontWeight: "600" };

// ── Item factories ────────────────────────────────────────────────────────────
const newPulse = () => ({
  id: Math.random().toString(36).slice(2), type: "pulse", pulse_shape: "square",
  amplitude: Math.PI, phase: 0.0, detuning: 0.0, duration: 1.0, sigma: null,
});
const newFree = () => ({
  id: Math.random().toString(36).slice(2), type: "free", duration: 1.0, omega0: Math.PI / 2,
});

// ── Slider row ────────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, accentColor, display, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
      <span style={{ color: C.label, fontSize: "10px", minWidth: "26px", fontFamily: "monospace" }}>{label}</span>
      <span style={{ color: C.text,  fontSize: "10px", minWidth: "64px", fontFamily: "monospace", textAlign: "right" }}>{display}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor, cursor: "pointer" }} />
    </div>
  );
}

// ── Compact SVG line chart ────────────────────────────────────────────────────
function MiniChart({ title, series, height = 52, yMin = 0, yMax = 1 }) {
  const W = 260; const H = height;
  const PAD = { l: 24, r: 4, t: 4, b: 14 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const paths = useMemo(() => series.map(({ data, color }) => {
    if (!data || data.length < 2) return { d: "", color };
    const n  = data.length;
    const xS = iW / (n - 1);
    const yS = iH / (yMax - yMin);
    const pts = data.map((v, i) => {
      const x = PAD.l + i * xS;
      const y = PAD.t + iH - (Math.min(Math.max(v, yMin), yMax) - yMin) * yS;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { d: pts.join(" "), color };
  }), [series, iW, iH, yMin, yMax, PAD.l, PAD.t]);

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div style={{ marginBottom: "6px" }}>
      <div style={{ color: C.dim, fontSize: "9px", letterSpacing: "0.06em", marginBottom: "2px" }}>{title}</div>
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        {/* Horizontal guide lines */}
        {yTicks.map(v => {
          const y = PAD.t + iH - (v - yMin) / (yMax - yMin) * iH;
          return (
            <g key={v}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                stroke="rgba(90,130,200,0.12)" strokeWidth={1} />
              <text x={PAD.l - 2} y={y + 3} textAnchor="end"
                fill="rgba(90,130,200,0.45)" fontSize={7} fontFamily="monospace">
                {v.toFixed(1)}
              </text>
            </g>
          );
        })}
        {/* Series */}
        {paths.map(({ d, color }, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth={1.5} />
        ))}
        {/* X axis */}
        <line x1={PAD.l} y1={PAD.t + iH} x2={W - PAD.r} y2={PAD.t + iH}
          stroke="rgba(90,130,200,0.20)" strokeWidth={1} />
      </svg>
    </div>
  );
}

// ── Sequence item card ────────────────────────────────────────────────────────
function ItemCard({ item, index, activeIndex, onUpdate, onRemove }) {
  const isActive = index === activeIndex;
  const update = patch => onUpdate(item.id, patch);
  const maxSigma = Math.max(0.01, item.duration / 2);
  const effSigma = Math.min(item.sigma ?? item.duration / 6, maxSigma);

  return (
    <div style={{
      background:   isActive ? "rgba(20,35,90,0.55)" : "rgba(8,14,38,0.55)",
      border:       `1px solid ${isActive ? "rgba(80,140,255,0.40)" : C.border}`,
      borderRadius: "7px", padding: "8px 10px", marginBottom: "6px",
      transition:   "background 0.15s, border-color 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
        <span style={{ color: isActive ? "#80b8ff" : C.dim, fontSize: "9px", fontFamily: "monospace", minWidth: "14px" }}>
          {index + 1}
        </span>
        {["pulse", "free"].map(t => (
          <button key={t} onClick={() => {
            if (item.type !== t) onUpdate(item.id, { ...(t === "pulse" ? newPulse() : newFree()), id: item.id });
          }} style={item.type === t ? BTN_SM_ACT : BTN_SM}>{t}</button>
        ))}
        {item.type === "pulse" && (
          <>
            <span style={{ color: C.dim, fontSize: "9px" }}>·</span>
            {["square", "gaussian"].map(s => (
              <button key={s} onClick={() => update({ pulse_shape: s })}
                style={item.pulse_shape === s ? BTN_SM_ACT : BTN_SM}>
                {s === "square" ? "sq" : "gauss"}
              </button>
            ))}
          </>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => onRemove(item.id)} style={{ ...BTN_SM, padding: "2px 6px", color: "#885050", borderColor: "rgba(120,60,60,0.35)" }}>×</button>
      </div>

      {item.type === "pulse" ? (
        <>
          <Slider label="Ω₀" value={item.amplitude} min={0} max={4 * Math.PI} step={0.05} accentColor="#40c8e0"
            display={`${(item.amplitude / Math.PI).toFixed(2)}π r/s`} onChange={v => update({ amplitude: v })} />
          <Slider label="φ"  value={item.phase}     min={0} max={2 * Math.PI} step={0.01} accentColor="#bb88ff"
            display={`${(item.phase / Math.PI).toFixed(2)}π`} onChange={v => update({ phase: v })} />
          <Slider label="Δ"  value={item.detuning}  min={-3 * Math.PI} max={3 * Math.PI} step={0.05} accentColor="#ff9040"
            display={`${(item.detuning / Math.PI).toFixed(2)}π r/s`} onChange={v => update({ detuning: v })} />
          <Slider label="T"  value={item.duration}  min={0.05} max={5} step={0.05} accentColor="#5096ff"
            display={`${item.duration.toFixed(2)} s`} onChange={v => update({ duration: v })} />
          {item.pulse_shape === "gaussian" && (
            <Slider label="σ" value={effSigma} min={0.01} max={maxSigma} step={0.01} accentColor="#e0a040"
              display={`${effSigma.toFixed(2)} s`} onChange={v => update({ sigma: v })} />
          )}
        </>
      ) : (
        <>
          <Slider label="ω₀" value={item.omega0}   min={-2 * Math.PI} max={2 * Math.PI} step={0.05} accentColor="#3cc83c"
            display={`${(item.omega0 / Math.PI).toFixed(2)}π r/s`} onChange={v => update({ omega0: v })} />
          <Slider label="T"  value={item.duration} min={0.05} max={5} step={0.05} accentColor="#5096ff"
            display={`${item.duration.toFixed(2)} s`} onChange={v => update({ duration: v })} />
        </>
      )}
    </div>
  );
}

// ── Decoherence controls (collapsed by default) ───────────────────────────────
function DecoherenceSection({ enabled, T1, T2, zEq, onChange }) {
  const [open, setOpen] = useState(false);

  // Derived Tφ
  const invTphi = T2 > 0 && T1 > 0 ? 1 / T2 - 1 / (2 * T1) : null;
  const Tphi    = invTphi > 1e-12 ? 1 / invTphi : Infinity;
  const t2Err   = T2 > 2 * T1 + 1e-9;

  return (
    <div style={{
      background:   "rgba(8,14,38,0.55)",
      border:       `1px solid ${enabled ? "rgba(200,130,40,0.40)" : C.border}`,
      borderRadius: "7px",
      marginBottom: "8px",
      overflow:     "hidden",
    }}>
      {/* Header */}
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: "8px",
        padding: "8px 10px", background: "transparent", border: "none",
        cursor: "pointer", textAlign: "left",
      }}>
        <span style={{ color: enabled ? "#e0a040" : C.dim, fontSize: "10px" }}>
          {open ? "▾" : "▸"}
        </span>
        <span style={{ color: enabled ? "#e0a040" : C.label, fontSize: "11px", fontWeight: enabled ? "600" : "400" }}>
          Decoherence
        </span>
        {enabled && (
          <span style={{ color: "#e0a040", fontSize: "9px", fontFamily: "monospace" }}>
            T1={T1.toFixed(2)}s  T2={T2.toFixed(2)}s
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* Toggle */}
        <button
          onClick={e => { e.stopPropagation(); onChange({ enabled: !enabled }); }}
          style={{
            ...BTN_SM, padding: "3px 10px",
            background:  enabled ? "rgba(50,30,5,0.80)" : "rgba(20,28,55,0.88)",
            borderColor: enabled ? "rgba(180,130,40,0.50)" : "rgba(90,130,200,0.40)",
            color:       enabled ? "#e0a040" : C.dim,
            fontWeight:  enabled ? "700" : "400",
          }}>
          {enabled ? "ON" : "OFF"}
        </button>
      </button>

      {open && (
        <div style={{ padding: "0 10px 10px" }}>
          {/* Helper text */}
          <div style={{ color: C.dim, fontSize: "9px", lineHeight: "1.55", marginBottom: "8px" }}>
            T1 controls population relaxation along Z (energy decay).<br />
            T2 controls transverse coherence decay (includes T1 contribution).<br />
            Tφ = pure dephasing time — derived as 1/Tφ = 1/T2 − 1/(2T1).
          </div>

          <Slider label="T1" value={T1} min={0.1} max={10} step={0.05} accentColor="#e0a040"
            display={`${T1.toFixed(2)} s`} onChange={v => onChange({ T1: v })} />
          <Slider label="T2" value={T2} min={0.05} max={Math.min(10, 2 * T1)} step={0.05}
            accentColor="#ff9040"
            display={`${T2.toFixed(2)} s`} onChange={v => onChange({ T2: v })} />

          {t2Err && (
            <div style={{ color: "#ff8060", fontSize: "9px", marginBottom: "4px" }}>
              ⚠ T2 must be ≤ 2·T1 = {(2 * T1).toFixed(2)} s
            </div>
          )}

          <div style={{ color: C.dim, fontSize: "9px", fontFamily: "monospace", marginBottom: "8px" }}>
            Tφ = {isFinite(Tphi) ? Tphi.toFixed(3) + " s" : "∞ (no pure dephasing)"}
          </div>

          <Slider label="z_eq" value={zEq} min={-1} max={1} step={0.01} accentColor="#5096ff"
            display={`${zEq.toFixed(2)}`} onChange={v => onChange({ zEq: v })} />
          <div style={{ color: C.dim, fontSize: "9px" }}>
            equilibrium_z: +1 = ground (|0⟩), −1 = excited (|1⟩), 0 = infinite temperature
          </div>
        </div>
      )}
    </div>
  );
}

// ── Compact diagnostics plots ─────────────────────────────────────────────────
function DiagnosticsSection({ result, idealResult }) {
  const [open, setOpen] = useState(false);
  if (!result) return null;

  const puritySeries = [
    { data: result.purity,    color: "#ff9040" },
    ...(idealResult ? [{ data: idealResult.purity, color: "#ffb700" }] : []),
  ];
  const normSeries = [
    { data: result.bloch_norm,    color: "#40c8e0" },
    ...(idealResult ? [{ data: idealResult.bloch_norm, color: "#ffb700" }] : []),
  ];
  const popSeries = [
    { data: result.pop0, color: "#5096ff" },
    { data: result.pop1, color: "#ff5050" },
  ];
  const cohSeries = [
    { data: result.coherence,    color: "#bb88ff" },
    ...(idealResult ? [{ data: idealResult.coherence, color: "#ffb70070" }] : []),
  ];

  const fd = result.final_diagnostics;

  return (
    <div style={{
      background:   "rgba(6,12,30,0.70)",
      border:       `1px solid ${C.border}`,
      borderRadius: "8px",
      marginBottom: "8px",
      overflow:     "hidden",
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: "8px",
        padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer",
      }}>
        <span style={{ color: C.dim, fontSize: "10px" }}>{open ? "▾" : "▸"}</span>
        <span style={{ color: C.label, fontSize: "11px" }}>Diagnostics</span>
        <span style={{ color: C.dim, fontSize: "9px", fontFamily: "monospace" }}>
          purity={fd.purity.toFixed(4)}  |r|={fd.bloch_norm.toFixed(4)}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 10px 10px" }}>
          {idealResult && (
            <div style={{ color: C.dim, fontSize: "9px", marginBottom: "6px" }}>
              <span style={{ color: "#ffb700" }}>●</span> ideal &nbsp;
              <span style={{ color: "#ff9040" }}>●</span> with decoherence
            </div>
          )}

          <MiniChart title="PURITY  Tr(ρ²)" series={puritySeries} />
          <MiniChart title="|r|  BLOCH NORM" series={normSeries} />
          <MiniChart title="POPULATIONS  P(|0⟩) blue  P(|1⟩) red" series={popSeries} />
          <MiniChart title="COHERENCE  √(x²+y²)" series={cohSeries} yMax={1} />

          {/* Final diagnostics */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "6px", marginTop: "4px" }}>
            <div style={{ color: C.dim, fontSize: "9px", letterSpacing: "0.06em", marginBottom: "3px" }}>
              FINAL STATE
            </div>
            <div style={{ fontFamily: "monospace", fontSize: "9.5px", color: C.text, lineHeight: "1.7" }}>
              Tr(ρ)  = {fd.trace.toFixed(8)}<br />
              purity = {fd.purity.toFixed(8)}<br />
              |r|    = {fd.bloch_norm.toFixed(8)}<br />
              λ      = [{fd.eigenvalues.map(e => e.toFixed(5)).join(", ")}]
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ExperimentPanel({ blochVec, onState, onTrajectory, onCurrentField, onScaleMeta }) {
  const [items, setItems] = useState([newPulse()]);
  const [quality, setQuality] = useState("standard");

  // Decoherence params
  const [decEnabled, setDecEnabled] = useState(false);
  const [T1,         setT1]         = useState(2.0);
  const [T2,         setT2]         = useState(1.0);
  const [zEq,        setZEq]        = useState(1.0);

  // Comparison toggle: fetch ideal alongside decohering
  const [showComparison, setShowComparison] = useState(false);

  // Status
  const [status,      setStatus]      = useState("idle");
  const [result,      setResult]      = useState(null);
  const [idealResult, setIdealResult] = useState(null);

  // Playback
  const [playing,   setPlaying]   = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const intervalRef = useRef(null);

  const t2Err = decEnabled && T2 > 2 * T1 + 1e-9;

  // ── Item helpers ─────────────────────────────────────────────────────────
  const addPulse = () => setItems(prev => [...prev, newPulse()]);
  const addFree  = () => setItems(prev => [...prev, newFree()]);

  const updateItem = useCallback((id, patch) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it)), []);
  const removeItem = useCallback((id) =>
    setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== id) : prev), []);

  // ── Animation ────────────────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing || !result) return;
    const traj  = result.trajectory;
    const fldTr = result.field_trajectory ?? null;
    const step  = Math.max(1, Math.round(traj.length / TARGET_FRAMES));
    intervalRef.current = setInterval(() => {
      setPlayIndex(prev => {
        const next = prev + step;
        if (next >= traj.length) {
          stopPlayback();
          onState(traj[traj.length - 1]);
          if (onCurrentField) onCurrentField(fldTr ? fldTr[traj.length - 1] : null);
          return traj.length - 1;
        }
        onState(traj[next]);
        if (onCurrentField) onCurrentField(fldTr ? fldTr[next] : null);
        return next;
      });
    }, FRAME_MS);
    return () => clearInterval(intervalRef.current);
  }, [playing, result, onState, onCurrentField, stopPlayback]);

  const startPlayback = useCallback(() => {
    if (!result) return;
    setPlayIndex(0);
    onState(result.trajectory[0]);
    if (onCurrentField) onCurrentField(result.field_trajectory?.[0] ?? null);
    setPlaying(true);
  }, [result, onState, onCurrentField]);

  // ── Build request body ────────────────────────────────────────────────────
  const buildBody = useCallback((withDecoherence) => {
    const sequence = items.map(it => {
      if (it.type === "pulse") {
        const b = { type: "pulse", pulse_shape: it.pulse_shape,
                    amplitude: it.amplitude, phase: it.phase,
                    detuning: it.detuning, duration: it.duration };
        if (it.pulse_shape === "gaussian") b.sigma = it.sigma ?? it.duration / 6;
        return b;
      }
      return { type: "free", duration: it.duration, omega0: it.omega0 };
    });
    const body = { initial_bloch: blochVec, sequence, quality };
    if (withDecoherence && decEnabled) {
      body.enable_decoherence = true;
      body.T1 = T1; body.T2 = T2; body.equilibrium_z = zEq;
    }
    return body;
  }, [blochVec, items, quality, decEnabled, T1, T2, zEq]);

  // ── Run ──────────────────────────────────────────────────────────────────
  const run = useCallback(async () => {
    if (t2Err) return;
    stopPlayback();
    setStatus("loading");
    setResult(null);
    setIdealResult(null);
    onTrajectory(null);

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const fetchExp = (body) => fetch(`${BACKEND_URL}/simulate/experiment`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: controller.signal, body: JSON.stringify(body),
    });

    try {
      // Always fetch the main experiment
      const mainBody = buildBody(true);
      const mainResp = await fetchExp(mainBody);
      clearTimeout(tid);

      if (!mainResp.ok) {
        let detail = "Request failed";
        try { detail = (await mainResp.json()).detail ?? detail; } catch (_) { /* ok */ }
        setStatus("error"); setResult({ error: detail }); return;
      }
      const data = await mainResp.json();
      setStatus("ok");
      setResult(data);
      onState(data.final_state);
      // Emit initial field state and scale metadata for visualization
      if (onCurrentField) onCurrentField(data.field_trajectory?.[data.field_trajectory.length - 1] ?? null);
      if (onScaleMeta) {
        onScaleMeta(buildScaleMetadata({
          frame:            "rotating",
          physicalDuration: data.total_duration,
          numPoints:        data.trajectory.length,
          hasDecoherence:   mainBody.enable_decoherence ?? false,
        }));
      }

      // If comparison mode, also fetch ideal (no decoherence)
      if (showComparison && decEnabled) {
        const idealBody = buildBody(false);
        idealBody.enable_decoherence = false;
        const ic2 = new AbortController();
        const tid2 = setTimeout(() => ic2.abort(), FETCH_TIMEOUT);
        try {
          const idealResp = await fetch(`${BACKEND_URL}/simulate/experiment`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            signal: ic2.signal, body: JSON.stringify(idealBody),
          });
          clearTimeout(tid2);
          if (idealResp.ok) {
            const idealData = await idealResp.json();
            setIdealResult(idealData);
            // Show decohering trajectory in magenta, ideal in gold
            onTrajectory({ primary: data.trajectory, ideal: idealData.trajectory });
            return;
          }
        } catch (_) { clearTimeout(tid2); }
      }

      onTrajectory(data.trajectory);

    } catch (err) {
      clearTimeout(tid);
      if (err.name === "AbortError" || err.name === "TypeError") {
        setStatus("offline"); setResult({ error: "Backend offline — start with: uvicorn main:app" });
      } else {
        setStatus("error"); setResult({ error: String(err) });
      }
    }
  }, [buildBody, decEnabled, showComparison, onState, onTrajectory, stopPlayback, t2Err]);

  const clear = useCallback(() => {
    stopPlayback();
    setStatus("idle"); setResult(null); setIdealResult(null);
    onTrajectory(null);
    if (onCurrentField) onCurrentField(null);
    if (onScaleMeta)    onScaleMeta(null);
  }, [onTrajectory, onCurrentField, onScaleMeta, stopPlayback]);

  const activeItemIndex = result && playing ? (result.item_index[playIndex] ?? null) : null;
  const progressPct = result ? Math.round((playIndex / Math.max(1, result.trajectory.length - 1)) * 100) : 0;

  return (
    <div>
      {/* ── Quality ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "5px", marginBottom: "10px", alignItems: "center" }}>
        <span style={{ color: C.label, fontSize: "10px", marginRight: "2px" }}>Quality</span>
        {[["preview", "Preview"], ["standard", "Standard"], ["high", "High"]].map(([q, l]) => (
          <button key={q} onClick={() => setQuality(q)} style={q === quality ? BTN_ACTIVE : BTN}>{l}</button>
        ))}
      </div>

      {/* ── Sequence items ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: "8px" }}>
        {items.map((item, idx) => (
          <ItemCard key={item.id} item={item} index={idx} activeIndex={activeItemIndex}
            onUpdate={updateItem} onRemove={removeItem} />
        ))}
      </div>
      <div style={{ display: "flex", gap: "5px", marginBottom: "10px" }}>
        <button onClick={addPulse} style={BTN_ADD}>+ Pulse</button>
        <button onClick={addFree}  style={BTN_ADD}>+ Free evolution</button>
      </div>

      {/* ── Decoherence ──────────────────────────────────────────────────── */}
      <DecoherenceSection
        enabled={decEnabled} T1={T1} T2={T2} zEq={zEq}
        onChange={({ enabled, T1: t1, T2: t2, zEq: z }) => {
          if (enabled !== undefined) setDecEnabled(enabled);
          if (t1 !== undefined) { setT1(t1); if (T2 > 2 * t1) setT2(t1); }
          if (t2 !== undefined) setT2(t2);
          if (z  !== undefined) setZEq(z);
        }}
      />

      {/* ── Comparison toggle (only meaningful when decoherence is on) ───── */}
      {decEnabled && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <button onClick={() => setShowComparison(v => !v)}
            style={showComparison ? BTN_ACTIVE : BTN}>
            {showComparison ? "◉ Ideal overlay ON" : "○ Compare ideal"}
          </button>
          {showComparison && (
            <span style={{ color: C.dim, fontSize: "9px" }}>
              gold = ideal · magenta = decoherence
            </span>
          )}
        </div>
      )}

      {/* ── Run / clear ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
        <button onClick={run} disabled={status === "loading" || t2Err}
          style={{
            ...(decEnabled ? BTN_WARN : BTN_RUN),
            opacity: (status === "loading" || t2Err) ? 0.5 : 1,
          }}>
          {status === "loading" ? "Running QuTiP…"
            : decEnabled ? "⊛ Run (with decoherence)"
            : "⊛ Run experiment"}
        </button>
        {status !== "idle" && (
          <button onClick={clear} style={{ ...BTN, padding: "7px 10px" }}>✕</button>
        )}
      </div>

      {t2Err && (
        <div style={{ color: "#ff8060", fontSize: "9px", marginBottom: "6px" }}>
          ⚠ T2 ({T2.toFixed(2)} s) must be ≤ 2·T1 ({(2*T1).toFixed(2)} s)
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {result && !result.error && (
        <div>
          {/* State after each item */}
          <div style={{
            background: "rgba(6,12,30,0.70)", border: `1px solid ${C.border}`,
            borderRadius: "8px", padding: "8px 10px", marginBottom: "8px",
            fontFamily: "monospace", fontSize: "10px",
          }}>
            <div style={{ color: C.dim, fontSize: "9px", marginBottom: "5px", letterSpacing: "0.08em" }}>
              FINAL STATE AFTER EACH ITEM
            </div>
            {result.state_after_items.map((state, i) => {
              const act = activeItemIndex === i;
              const norm = Math.sqrt(state.reduce((s, c) => s + c * c, 0));
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "2px 4px", borderRadius: "4px", marginBottom: "2px",
                  background: act ? "rgba(40,70,180,0.25)" : "transparent",
                  transition: "background 0.15s",
                }}>
                  <span style={{ color: act ? "#80b8ff" : C.dim, minWidth: "16px" }}>{i + 1}.</span>
                  <span style={{ color: act ? "#70e090" : C.dim, minWidth: "38px", fontSize: "9px" }}>
                    {items[i]?.type ?? "?"}
                  </span>
                  <span style={{ color: act ? C.bright : C.text }}>
                    ({state.map(v => v.toFixed(3)).join(", ")})
                  </span>
                  <span style={{ color: act ? "#70e090" : C.dim, fontSize: "9px" }}>
                    |r|={norm.toFixed(4)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Diagnostics plots */}
          <DiagnosticsSection result={result} idealResult={idealResult} />

          {/* Playback */}
          <div style={{
            background: "rgba(6,12,30,0.70)", border: `1px solid ${C.border}`,
            borderRadius: "8px", padding: "8px 10px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <button onClick={playing ? stopPlayback : startPlayback} style={{
                ...BTN,
                background:  playing ? "rgba(40,60,120,0.80)" : "rgba(10,60,40,0.80)",
                borderColor: playing ? "rgba(90,140,220,0.50)" : "rgba(60,180,90,0.45)",
                color:       playing ? "#aac8ff" : "#70e090",
                fontWeight:  "600",
              }}>
                {playing ? "⏸ Pause" : "▶ Play"}
              </button>
              {!playing && playIndex > 0 && (
                <button onClick={() => { setPlayIndex(0); onState(result.trajectory[0]); }} style={BTN}>↩ Start</button>
              )}
              {!playing && (
                <button onClick={() => { const l = result.trajectory.length - 1; setPlayIndex(l); onState(result.trajectory[l]); }} style={BTN}>↪ End</button>
              )}
            </div>
            <div style={{ height: "3px", background: "rgba(60,90,180,0.20)", borderRadius: "2px", marginBottom: "5px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: decEnabled ? "linear-gradient(90deg,#e0a040,#ff9040)" : "linear-gradient(90deg,#5096ff,#40c8e0)", borderRadius: "2px", transition: "width 0.1s linear" }} />
            </div>
            <div style={{ color: C.dim, fontSize: "9px", fontFamily: "monospace" }}>
              {playing
                ? `item ${(activeItemIndex ?? 0) + 1}/${items.length} · frame ${playIndex}/${result.trajectory.length - 1}`
                : `${result.trajectory.length} pts · ${result.total_duration.toFixed(2)} s · ${result.solver_info.solver} ${result.solver_info.version}`
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Offline / error ───────────────────────────────────────────────── */}
      {result?.error && (
        <div style={{ color: status === "offline" ? C.warn : "#ff8060", fontSize: "10px", padding: "6px 0", lineHeight: "1.5" }}>
          {status === "offline" ? "⊘ " : "⚠ "}{result.error}
          {status === "offline" && (
            <div style={{ color: C.dim, fontSize: "9px", marginTop: "3px" }}>
              All quantum evolution requires the QuTiP backend. No JS fallback is used.
            </div>
          )}
        </div>
      )}

      <div style={{ color: C.dim, fontSize: "9px", marginTop: "10px", lineHeight: "1.55" }}>
        {decEnabled
          ? `Open-system: dρ/dt = −i[H,ρ] + D[C](ρ) · T1=${T1.toFixed(2)}s  T2=${T2.toFixed(2)}s`
          : "Closed-system: dρ/dt = −i[H,ρ] · QuTiP mesolve · density matrix chained across items"}
      </div>
    </div>
  );
}
