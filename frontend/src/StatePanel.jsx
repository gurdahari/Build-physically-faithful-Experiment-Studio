import { useState } from "react";
import { blochToAmplitudes, fmtComplex, validateAmplitudes } from "./blochState.js";

const C = {
  border: "rgba(90, 130, 200, 0.18)",
  dim:    "#4a6494",
  text:   "#aac0ff",
  bright: "#c8dcff",
  label:  "#7a96c4",
};
const ALPHA_COL = "#5096ff";
const BETA_COL  = "#a060e0";

// ── Probability bar ────────────────────────────────────────────────────────────
function ProbBar({ label, prob, col }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" }}>
      <span style={{ fontFamily: "monospace", fontSize: "11px", color: C.bright, minWidth: "36px" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: "8px", background: "rgba(90,130,200,0.10)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${Math.round(prob * 10000) / 100}%`,
          background: col,
          transition: "width 0.09s ease",
        }} />
      </div>
      <span style={{ color: C.text, fontSize: "11px", minWidth: "36px", textAlign: "right" }}>
        {(prob * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ── SVG arrow with filled arrowhead ───────────────────────────────────────────
function Arrow({ x1, y1, x2, y2, color, fade = false }) {
  const dx = x2 - x1; const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 3) return null;
  const ang = Math.atan2(dy, dx);
  const AH = 5;
  const ax = x2 - AH * Math.cos(ang - 0.42);
  const ay = y2 - AH * Math.sin(ang - 0.42);
  const bx = x2 - AH * Math.cos(ang + 0.42);
  const by = y2 - AH * Math.sin(ang + 0.42);
  return (
    <g opacity={fade ? 0.50 : 1}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={fade ? 1.2 : 1.8} />
      <polygon points={`${x2},${y2} ${ax},${ay} ${bx},${by}`} fill={color} />
    </g>
  );
}

// ── Phasor diagram ─────────────────────────────────────────────────────────────
// α is always real ≥ 0 (positive real axis, faded).
// β carries the relative phase φ shown as a dashed arc from the real axis.
// Arrow lengths = amplitude magnitudes scaled to unit radius R.
function PhaseDiagram({ alpha, beta, phi }) {
  const W = 174, H = 102, CX = W / 2, CY = H / 2, R = 36;

  const aLen = Math.hypot(alpha.re, alpha.im);
  const bLen = Math.hypot(beta.re, beta.im);

  // α always on positive real axis
  const ax2 = CX + aLen * R;
  const ay2 = CY;

  // β: x = Re(β)*R, y flipped because SVG y-axis points down
  const bx2 = CX + bLen * R * Math.cos(phi);
  const by2 = CY - bLen * R * Math.sin(phi);

  // Phase arc from positive real axis (angle 0) to angle phi
  const arcR  = 13;
  const showArc = bLen > 0.06 && Math.abs(phi) > 0.06;
  const arcEndX  = CX + arcR * Math.cos(phi);
  const arcEndY  = CY - arcR * Math.sin(phi);
  // Math CCW (phi>0) → screen CW after y-flip → SVG sweep=1
  // Math CW  (phi<0) → screen CCW             → SVG sweep=0
  const sweepFlag = phi < 0 ? 1 : 0;
  const arcPath   = `M ${CX + arcR} ${CY} A ${arcR} ${arcR} 0 0 ${sweepFlag} ${arcEndX} ${arcEndY}`;

  // Label φ at the arc midpoint, slightly outward
  const midAng = phi / 2;
  const lR = arcR + 9;
  const phiLX = CX + lR * Math.cos(midAng);
  const phiLY = CY - lR * Math.sin(midAng);

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {/* Dashed unit circle */}
      <circle cx={CX} cy={CY} r={R}
        fill="none" stroke="rgba(90,130,200,0.18)" strokeWidth="1" strokeDasharray="3,3" />
      {/* Axes */}
      <line x1={CX - R - 4} y1={CY} x2={CX + R + 14} y2={CY}
        stroke="rgba(90,130,200,0.15)" strokeWidth="1" />
      <line x1={CX} y1={CY + R + 4} x2={CX} y2={CY - R - 9}
        stroke="rgba(90,130,200,0.15)" strokeWidth="1" />
      <text x={CX + R + 16} y={CY + 3}
        fill="rgba(90,130,200,0.30)" fontSize="8" fontFamily="monospace">Re</text>
      <text x={CX + 3} y={CY - R - 10}
        fill="rgba(90,130,200,0.30)" fontSize="8" fontFamily="monospace">Im</text>
      {/* Phase arc */}
      {showArc && (
        <path d={arcPath}
          fill="none" stroke={BETA_COL} strokeWidth="1.2" opacity="0.55" strokeDasharray="2,2" />
      )}
      {/* φ label */}
      {showArc && (
        <text x={phiLX - 3} y={phiLY + 3}
          fill={BETA_COL} fontSize="9" fontFamily="monospace" opacity="0.85">φ</text>
      )}
      {/* α arrow — faded because always real */}
      <Arrow x1={CX} y1={CY} x2={ax2} y2={ay2} color={ALPHA_COL} fade />
      {/* β arrow */}
      <Arrow x1={CX} y1={CY} x2={bx2} y2={by2} color={BETA_COL} />
      {/* Labels */}
      {aLen * R > 5 && (
        <text x={ax2 + 3} y={CY + 11} fill={ALPHA_COL} fontSize="9" fontFamily="monospace" opacity="0.8">α</text>
      )}
      {bLen * R > 5 && (
        <text
          x={bx2 + 4 * Math.cos(phi) + (Math.cos(phi) < 0 ? -14 : 0)}
          y={by2 - 4 * Math.sin(phi) + (by2 < CY ? -3 : 10)}
          fill={BETA_COL} fontSize="9" fontFamily="monospace">β</text>
      )}
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StatePanel({ blochVec }) {
  const [phaseOpen, setPhaseOpen] = useState(false);

  const vec   = (blochVec && blochVec.every(isFinite)) ? blochVec : [0, 0, 1];
  const { alpha, beta, theta, phi, prob0, prob1 } = blochToAmplitudes(vec);
  const valid = validateAmplitudes({ alpha, beta });

  // Display φ in [0, 2π) for the angle row; keep atan2's (−π, π] for SVG internals
  const phiDisplay = phi < 0 ? phi + 2 * Math.PI : phi;

  return (
    <div>
      {/* State equation */}
      <div style={{
        fontFamily: "monospace", fontSize: "12px",
        color: C.bright, marginBottom: "9px", letterSpacing: "0.01em",
      }}>
        |ψ⟩ = α|0⟩ + β|1⟩
      </div>

      {/* Amplitude grid: symbol | value | |x|² percentage */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "14px 1fr auto",
        alignItems: "center",
        gap: "4px 8px",
        marginBottom: "10px",
      }}>
        <span style={{ color: ALPHA_COL, fontFamily: "monospace", fontSize: "11px", fontWeight: "700" }}>α</span>
        <span style={{ color: C.bright,  fontFamily: "monospace", fontSize: "11px" }}>{fmtComplex(alpha)}</span>
        <span style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace", whiteSpace: "nowrap" }}>
          |α|² = {(prob0 * 100).toFixed(1)}%
        </span>

        <span style={{ color: BETA_COL,  fontFamily: "monospace", fontSize: "11px", fontWeight: "700" }}>β</span>
        <span style={{ color: C.bright,  fontFamily: "monospace", fontSize: "11px" }}>{fmtComplex(beta)}</span>
        <span style={{ color: C.dim, fontSize: "10px", fontFamily: "monospace", whiteSpace: "nowrap" }}>
          |β|² = {(prob1 * 100).toFixed(1)}%
        </span>
      </div>

      {/* Population bars */}
      <div style={{ marginBottom: "9px" }}>
        <div style={{ color: C.dim, fontSize: "9.5px", marginBottom: "5px", letterSpacing: "0.03em" }}>
          population  ·  |α|² + |β|² = 1
        </div>
        <ProbBar label="|0⟩" prob={prob0} col={ALPHA_COL} />
        <ProbBar label="|1⟩" prob={prob1} col={BETA_COL} />
      </div>

      {/* Bloch angles */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "7px" }}>
        <span style={{ fontSize: "10px", fontFamily: "monospace", color: C.dim }}>
          θ = <span style={{ color: C.text }}>{theta.toFixed(3)}</span> rad
        </span>
        <span style={{ fontSize: "10px", fontFamily: "monospace", color: C.dim }}>
          φ = <span style={{ color: C.text }}>{phiDisplay.toFixed(3)}</span> rad
        </span>
      </div>

      {/* Phase note */}
      <div style={{
        color: C.dim, fontSize: "9.5px", fontStyle: "italic",
        marginBottom: "8px", lineHeight: "1.4",
      }}>
        Relative phase φ affects interference — invisible in Z-basis probabilities alone
      </div>

      {/* Phase diagram toggle */}
      <button
        onClick={() => setPhaseOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "4px",
          background: "transparent",
          border: `1px solid ${C.border}`,
          borderRadius: "5px",
          color: C.label,
          fontSize: "11px",
          padding: "4px 9px",
          cursor: "pointer",
          userSelect: "none",
          marginBottom: phaseOpen ? "8px" : 0,
        }}>
        <span style={{ fontSize: "9px" }}>{phaseOpen ? "▾" : "▸"}</span>
        Phase diagram
      </button>

      {phaseOpen && (
        <div style={{
          background: "rgba(8, 14, 38, 0.55)",
          border: `1px solid ${C.border}`,
          borderRadius: "8px",
          padding: "10px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
        }}>
          <PhaseDiagram alpha={alpha} beta={beta} phi={phi} />
          <div style={{
            color: C.dim, fontSize: "9px",
            textAlign: "center", lineHeight: "1.5",
          }}>
            <span style={{ color: ALPHA_COL }}>■</span> α{" · "}
            <span style={{ color: BETA_COL }}>■</span> β
            {"  —  "}arrow length = magnitude · dashed arc = phase φ
          </div>
        </div>
      )}

      {!valid && (
        <div style={{ color: "#ff7070", fontSize: "9px", marginTop: "6px" }}>
          ⚠ Normalization drift detected
        </div>
      )}
    </div>
  );
}
