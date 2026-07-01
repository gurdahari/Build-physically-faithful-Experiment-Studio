/**
 * editorParts — reusable controls for the Edit Experiment drawer: labeled
 * sliders, the sequence-item card, the decoherence section, and the compact
 * diagnostics charts.  Pure UI; all values come from the useExperiment hook.
 */

import { useMemo } from "react";
import { C, PHYS, BTN, BTN_ACTIVE, BTN_SM } from "./theme.js";
import { newPulse, newFree } from "./useExperiment.js";

const BTN_SM_ACT = { ...BTN_SM, ...BTN_ACTIVE };

// ── Slider row ────────────────────────────────────────────────────────────────
export function Slider({ label, value, min, max, step, accentColor, display, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
      <span style={{ color: C.label, fontSize: "10px", minWidth: "26px", fontFamily: "monospace" }}>{label}</span>
      <span style={{ color: C.text, fontSize: "10px", minWidth: "66px", fontFamily: "monospace", textAlign: "right" }}>{display}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor, cursor: "pointer" }} />
    </div>
  );
}

// ── Sequence-item card ────────────────────────────────────────────────────────
export function ItemCard({ item, index, count, active, selected, onUpdate, onRemove, onMove }) {
  const update = patch => onUpdate(item.id, patch);
  const maxSigma = Math.max(0.01, item.duration / 2);
  const effSigma = Math.min(item.sigma ?? item.duration / 6, maxSigma);
  const isPulse = item.type === "pulse";

  const borderColor = selected ? "#dfebff" : active ? PHYS.pulse : C.border;

  return (
    <div style={{
      background: selected ? "rgba(24,40,96,0.6)" : active ? "rgba(20,35,90,0.45)" : "rgba(8,14,38,0.55)",
      border: `1px solid ${borderColor}`,
      borderRadius: "8px", padding: "9px 10px", marginBottom: "7px",
      transition: "all 0.12s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "7px" }}>
        <span style={{ color: active ? "#80b8ff" : C.dim, fontSize: "10px", fontFamily: "monospace", minWidth: "16px" }}>
          {index + 1}
        </span>
        {["pulse", "free"].map(t => (
          <button key={t} onClick={() => {
            if (item.type !== t) onUpdate(item.id, { ...(t === "pulse" ? newPulse() : newFree()), id: item.id });
          }} style={item.type === t ? BTN_SM_ACT : BTN_SM}>{t}</button>
        ))}
        {isPulse && (
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
        <button onClick={() => onMove(item.id, -1)} disabled={index === 0}
          style={{ ...BTN_SM, padding: "2px 6px", opacity: index === 0 ? 0.35 : 1 }}>↑</button>
        <button onClick={() => onMove(item.id, 1)} disabled={index === count - 1}
          style={{ ...BTN_SM, padding: "2px 6px", opacity: index === count - 1 ? 0.35 : 1 }}>↓</button>
        <button onClick={() => onRemove(item.id)}
          style={{ ...BTN_SM, padding: "2px 7px", color: "#c07070", borderColor: "rgba(120,60,60,0.4)" }}>×</button>
      </div>

      {isPulse ? (
        <>
          <Slider label="Ω₀" value={item.amplitude} min={0} max={4 * Math.PI} step={0.05} accentColor={PHYS.b1}
            display={`${(item.amplitude / Math.PI).toFixed(2)}π r/s`} onChange={v => update({ amplitude: v })} />
          <Slider label="φ" value={item.phase} min={0} max={2 * Math.PI} step={0.01} accentColor={PHYS.detuning}
            display={`${(item.phase / Math.PI).toFixed(2)}π`} onChange={v => update({ phase: v })} />
          <Slider label="Δ" value={item.detuning} min={-3 * Math.PI} max={3 * Math.PI} step={0.05} accentColor={PHYS.omegaEff}
            display={`${(item.detuning / Math.PI).toFixed(2)}π r/s`} onChange={v => update({ detuning: v })} />
          <Slider label="T" value={item.duration} min={0.05} max={5} step={0.05} accentColor={PHYS.b0}
            display={`${item.duration.toFixed(2)} s`} onChange={v => update({ duration: v })} />
          {item.pulse_shape === "gaussian" && (
            <Slider label="σ" value={effSigma} min={0.01} max={maxSigma} step={0.01} accentColor="#e0a040"
              display={`${effSigma.toFixed(2)} s`} onChange={v => update({ sigma: v })} />
          )}
        </>
      ) : (
        <>
          <Slider label="ω₀" value={item.omega0} min={-2 * Math.PI} max={2 * Math.PI} step={0.05} accentColor={PHYS.free}
            display={`${(item.omega0 / Math.PI).toFixed(2)}π r/s`} onChange={v => update({ omega0: v })} />
          <Slider label="T" value={item.duration} min={0.05} max={5} step={0.05} accentColor={PHYS.b0}
            display={`${item.duration.toFixed(2)} s`} onChange={v => update({ duration: v })} />
        </>
      )}
    </div>
  );
}

// ── Decoherence controls ──────────────────────────────────────────────────────
export function DecoherenceControls({ decoherence, setDecoherence, showComparison, setShowComparison }) {
  const { enabled, T1, T2, zEq } = decoherence;
  const invTphi = T2 > 0 && T1 > 0 ? 1 / T2 - 1 / (2 * T1) : null;
  const Tphi = invTphi > 1e-12 ? 1 / invTphi : Infinity;
  const t2Err = T2 > 2 * T1 + 1e-9;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <button
          onClick={() => setDecoherence({ enabled: !enabled })}
          style={{
            ...BTN_SM, padding: "4px 12px",
            background: enabled ? "rgba(50,30,5,0.8)" : "rgba(20,28,55,0.88)",
            borderColor: enabled ? "rgba(180,130,40,0.5)" : "rgba(90,130,200,0.4)",
            color: enabled ? "#e0a040" : C.dim, fontWeight: enabled ? 700 : 400,
          }}>
          {enabled ? "● Decoherence ON" : "○ Decoherence OFF"}
        </button>
      </div>

      {enabled && (
        <>
          <div style={{ color: C.dim, fontSize: "9px", lineHeight: "1.55", marginBottom: "8px" }}>
            T₁ = energy relaxation (Z). T₂ = transverse coherence. Tφ derived as 1/Tφ = 1/T₂ − 1/(2T₁).
          </div>
          <Slider label="T₁" value={T1} min={0.1} max={10} step={0.05} accentColor="#e0a040"
            display={`${T1.toFixed(2)} s`} onChange={v => setDecoherence({ T1: v })} />
          <Slider label="T₂" value={T2} min={0.05} max={Math.min(10, 2 * T1)} step={0.05} accentColor={PHYS.omegaEff}
            display={`${T2.toFixed(2)} s`} onChange={v => setDecoherence({ T2: v })} />
          {t2Err && (
            <div style={{ color: C.danger, fontSize: "9px", marginBottom: "4px" }}>
              ⚠ T₂ must be ≤ 2·T₁ = {(2 * T1).toFixed(2)} s
            </div>
          )}
          <div style={{ color: C.dim, fontSize: "9px", fontFamily: "monospace", marginBottom: "8px" }}>
            Tφ = {isFinite(Tphi) ? Tphi.toFixed(3) + " s" : "∞ (no pure dephasing)"}
          </div>
          <Slider label="z_eq" value={zEq} min={-1} max={1} step={0.01} accentColor={PHYS.b0}
            display={`${zEq.toFixed(2)}`} onChange={v => setDecoherence({ zEq: v })} />
          <div style={{ color: C.dim, fontSize: "9px", marginBottom: "10px" }}>
            equilibrium z: +1 = ground |0⟩, −1 = excited |1⟩, 0 = infinite temperature
          </div>
          <button onClick={() => setShowComparison(!showComparison)}
            style={showComparison ? BTN_ACTIVE : BTN}>
            {showComparison ? "◉ Ideal overlay ON" : "○ Compare vs ideal"}
          </button>
          {showComparison && (
            <div style={{ color: C.dim, fontSize: "9px", marginTop: "6px" }}>
              gold = ideal · magenta = with decoherence
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Compact SVG chart + diagnostics (Advanced) ───────────────────────────────
function MiniChart({ title, series, height = 48, yMin = 0, yMax = 1 }) {
  const W = 252, H = height;
  const PAD = { l: 22, r: 4, t: 4, b: 12 };
  const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;
  const paths = useMemo(() => series.map(({ data, color }) => {
    if (!data || data.length < 2) return { d: "", color };
    const n = data.length, xS = iW / (n - 1), yS = iH / (yMax - yMin);
    const pts = data.map((v, i) => {
      const x = PAD.l + i * xS;
      const y = PAD.t + iH - (Math.min(Math.max(v, yMin), yMax) - yMin) * yS;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { d: pts.join(" "), color };
  }), [series, iW, iH, yMin, yMax]);
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  return (
    <div style={{ marginBottom: "6px" }}>
      <div style={{ color: C.dim, fontSize: "9px", marginBottom: "2px" }}>{title}</div>
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        {yTicks.map(v => {
          const y = PAD.t + iH - (v - yMin) / (yMax - yMin) * iH;
          return (
            <g key={v}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(90,130,200,0.12)" strokeWidth={1} />
              <text x={PAD.l - 2} y={y + 3} textAnchor="end" fill="rgba(90,130,200,0.45)" fontSize={7} fontFamily="monospace">{v.toFixed(1)}</text>
            </g>
          );
        })}
        {paths.map(({ d, color }, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={1.5} />)}
        <line x1={PAD.l} y1={PAD.t + iH} x2={W - PAD.r} y2={PAD.t + iH} stroke="rgba(90,130,200,0.2)" strokeWidth={1} />
      </svg>
    </div>
  );
}

export function DiagnosticsCharts({ result, idealResult }) {
  if (!result) return null;
  const fd = result.final_diagnostics;
  const puritySeries = [
    { data: result.purity, color: PHYS.omegaEff },
    ...(idealResult ? [{ data: idealResult.purity, color: PHYS.trajectory }] : []),
  ];
  const normSeries = [
    { data: result.bloch_norm, color: PHYS.b1 },
    ...(idealResult ? [{ data: idealResult.bloch_norm, color: PHYS.trajectory }] : []),
  ];
  const popSeries = [
    { data: result.pop0, color: PHYS.b0 },
    { data: result.pop1, color: PHYS.bloch },
  ];
  const cohSeries = [{ data: result.coherence, color: PHYS.detuning }];
  return (
    <div>
      <MiniChart title="PURITY Tr(ρ²)" series={puritySeries} />
      <MiniChart title="|r| BLOCH NORM" series={normSeries} />
      <MiniChart title="POPULATIONS  P(0) blue · P(1) red" series={popSeries} />
      <MiniChart title="COHERENCE √(x²+y²)" series={cohSeries} />
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "6px", marginTop: "4px", fontFamily: "monospace", fontSize: "9.5px", color: C.text, lineHeight: "1.7" }}>
        Tr(ρ) = {fd.trace.toFixed(6)}<br />
        purity = {fd.purity.toFixed(6)}<br />
        |r| = {fd.bloch_norm.toFixed(6)}<br />
        λ = [{fd.eigenvalues.map(e => e.toFixed(4)).join(", ")}]
      </div>
    </div>
  );
}
