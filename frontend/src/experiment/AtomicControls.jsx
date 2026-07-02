/**
 * AtomicControls — the interactive controls for the Atomic Hydrogen resolution,
 * rendered inside the single Hydrogen inspector card.  It manipulates only the
 * useAtomicHydrogen hook (which requests authoritative backend fields); it never
 * computes atomic physics and never mutates the Proton Spin experiment.
 *
 * Groups: orbital/state presets · representation mode · quality tier · controlled
 * time evolution · a compact honest state-info readout.
 */

import { C } from "./theme.js";
import { coefficientsAreEvolving, currentArrowsFromResponse } from "../domain/atomicVisual.js";

const MODE_LABELS = [
  ["density", "Density"],
  ["phase", "Density + Phase"],
  ["current", "Prob. Current"],
  ["section", "Section View"],
];
const QUALITY_LABELS = [["preview", "Preview"], ["standard", "Standard"], ["high", "High"]];

const chip = (on) => ({
  fontSize: "9px", padding: "4px 6px", borderRadius: "6px", cursor: "pointer",
  textAlign: "center", lineHeight: "1.1", userSelect: "none",
  background: on ? "rgba(40,60,140,0.9)" : "rgba(12,20,44,0.6)",
  border: `1px solid ${on ? "rgba(100,160,255,0.55)" : C.border}`,
  color: on ? C.bright : C.text,
});

function Section({ label, children }) {
  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ color: "rgba(120,160,210,0.7)", fontSize: "8px", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "4px" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export default function AtomicControls({ atomic }) {
  const evolving = coefficientsAreEvolving(atomic.coefficients);
  // "No current" is a property of the DATA (real orbitals like 1s/2s/2p₀ or real
  // combinations), NOT of stationarity: a single m=±1 eigenstate is stationary in
  // |ψ|² yet carries a nonzero steady azimuthal current.  Decide from the backend
  // current field, and only once a genuine current response has arrived.
  const curData = atomic.mode === "current" && atomic.data?.sampling?.fields?.jx ? atomic.data : null;
  const currentIsZero = !!curData && currentArrowsFromResponse(curData).arrows.length === 0;
  const energy = atomic.data?.energy;
  const norm = atomic.data?.normalization_diagnostics;
  const activePreset = atomic.presets.find((p) => p.key === atomic.presetKey);

  return (
    <div data-testid="atomic-controls">
      {/* ── Orbital / state presets ─────────────────────────────────────────── */}
      <Section label="State (backend basis)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px" }}>
          {atomic.presets.filter((p) => !p.kind).map((p) => (
            <div key={p.key} data-testid="atomic-preset" onClick={() => atomic.selectPreset(p.key)}
              style={chip(p.key === atomic.presetKey)}>{p.label}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginTop: "4px" }}>
          {atomic.presets.filter((p) => p.kind).map((p) => (
            <div key={p.key} data-testid="atomic-preset" onClick={() => atomic.selectPreset(p.key)}
              style={chip(p.key === atomic.presetKey)} title={p.kind}>{p.label}</div>
          ))}
        </div>
      </Section>

      {/* ── Representation mode ──────────────────────────────────────────────── */}
      <Section label="Representation">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          {MODE_LABELS.map(([m, lbl]) => (
            <div key={m} data-testid="atomic-mode" onClick={() => atomic.setMode(m)}
              style={chip(m === atomic.mode)}>{lbl}</div>
          ))}
        </div>
        {currentIsZero && (
          <div data-testid="atomic-current-zero" style={{ color: C.warn, fontSize: "8.5px", marginTop: "4px", lineHeight: "1.5" }}>
            j(r) ≈ 0 for this real orbital — no arrows are drawn. (An m = ±1 eigenstate would circulate.)
          </div>
        )}
      </Section>

      {/* ── Quality tier ─────────────────────────────────────────────────────── */}
      <Section label="Quality">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px" }}>
          {QUALITY_LABELS.map(([q, lbl]) => (
            <div key={q} data-testid="atomic-quality" onClick={() => atomic.setQuality(q)}
              style={chip(q === atomic.quality)}>{lbl}</div>
          ))}
        </div>
      </Section>

      {/* ── Controlled time evolution ────────────────────────────────────────── */}
      <Section label="Time evolution">
        {evolving ? (
          <>
            <div style={{ display: "flex", gap: "4px" }}>
              <div data-testid="atomic-play" onClick={atomic.togglePlay}
                style={{ ...chip(atomic.playing), flex: 1, padding: "6px" }}>
                {atomic.playing ? "⏸ Pause" : "▶ Play"}
              </div>
              <div data-testid="atomic-reset-time" onClick={atomic.resetTime}
                style={{ ...chip(false), flex: 1, padding: "6px" }}>↺ t = 0</div>
            </div>
            <div style={{ color: C.label, fontSize: "9px", fontFamily: "monospace", marginTop: "4px" }}>
              t = {atomic.atomicTime.toExponential(2)} s
              {atomic.playing && <span style={{ color: C.warn }}> · preview</span>}
            </div>
          </>
        ) : (
          <div data-testid="atomic-stationary-note" style={{ color: "#8fe0a8", fontSize: "9px", lineHeight: "1.5" }}>
            Stationary density — |ψ(r,t)|² is time-independent, so it is fetched once and not animated.
          </div>
        )}
      </Section>

      {/* ── Honest state-info readout ────────────────────────────────────────── */}
      <div style={{ marginTop: "9px", paddingTop: "7px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ color: "rgba(120,160,210,0.7)", fontSize: "9px" }}>Selected</span>
          <span style={{ color: "#9fd0ff", fontSize: "9px" }}>{activePreset?.label ?? atomic.presetKey}</span>
        </div>
        {energy && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ color: "rgba(120,160,210,0.7)", fontSize: "9px" }}>⟨E⟩</span>
            <span style={{ color: C.text, fontSize: "9px", fontFamily: "monospace" }}>
              {energy.expectation_eV.toFixed(3)} eV{energy.std_eV > 1e-6 ? ` ± ${energy.std_eV.toFixed(2)}` : ""}
            </span>
          </div>
        )}
        {norm && (
          <div style={{ color: "rgba(150,180,220,0.7)", fontSize: "8.5px", marginTop: "3px", lineHeight: "1.5" }}>
            ∫|ψ|² ≈ {norm.numerical_integral.toFixed(3)} inside the displayed box
            (omitted tail ≈ {norm.omitted_tail_estimate.toFixed(3)}). The finite box is not exactly 100%.
          </div>
        )}
      </div>
    </div>
  );
}
