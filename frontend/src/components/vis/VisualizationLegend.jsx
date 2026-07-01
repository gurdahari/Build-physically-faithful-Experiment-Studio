/**
 * VisualizationLegend — compact HTML overlay identifying every colored arrow
 * in the 3D scene.  Only rendered in Physics/Diagnostic modes.
 */

import { getModeConfig } from "../../visualPhysics/visualMappings.js";
import { VIS_MODES } from "../../visualPhysics/visualizationTypes.js";

const ITEMS = [
  { color: "#dc143c", label: "r",      desc: "Bloch vector (quantum state)" },
  { color: "#5096ff", label: "B₀",     desc: "Static field (−Z axis, rotating frame)" },
  { color: "#40c8e0", label: "B₁(t)",  desc: "Drive field in XY plane" },
  { color: "#ff9040", label: "Ω_eff",  desc: "Effective field = B₁ + Δẑ (rotation axis)" },
  { color: "#bb88ff", label: "Δ",      desc: "Detuning component (Diagnostic only)" },
];

const TRAJ_ITEMS = [
  { color: "#ffb700", label: "—", desc: "Ideal trajectory (gold)" },
  { color: "#ff70c8", label: "—", desc: "Decohering trajectory (magenta)" },
];

const S = {
  root: {
    position:     "absolute",
    bottom:       "72px",
    left:         "12px",
    background:   "rgba(4, 8, 24, 0.88)",
    border:       "1px solid rgba(90, 130, 200, 0.22)",
    borderRadius: "7px",
    padding:      "8px 11px",
    fontSize:     "9px",
    userSelect:   "none",
    lineHeight:   "1.75",
    zIndex:       5,
  },
  row:   { display: "flex", alignItems: "center", gap: "7px" },
  dot:   { width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0 },
  lbl:   { fontFamily: "monospace", minWidth: "36px", fontSize: "9px" },
  desc:  { color: "rgba(100, 130, 180, 0.75)", fontSize: "8.5px" },
  hdr:   { color: "rgba(90, 130, 200, 0.45)", fontSize: "8px", letterSpacing: "0.07em", marginBottom: "3px" },
};

export default function VisualizationLegend({ visMode, showTrajectories = false }) {
  if (!visMode || visMode === VIS_MODES.CONCEPT) return null;

  const config    = getModeConfig(visMode);
  const isDiag    = visMode === VIS_MODES.DIAGNOSTIC;

  const visibleArrows = ITEMS.filter(item => {
    if (item.label === "Δ")     return isDiag && config.showDetuning;
    if (item.label === "B₀")    return config.showB0;
    if (item.label === "B₁(t)") return config.showB1;
    if (item.label === "Ω_eff") return config.showOmegaEff;
    return true; // Bloch vector always shown
  });

  return (
    <div style={S.root}>
      <div style={S.hdr}>LEGEND</div>
      {visibleArrows.map(({ color, label, desc }) => (
        <div key={label} style={S.row}>
          <div style={{ ...S.dot, background: color }} />
          <span style={{ ...S.lbl, color }}>{label}</span>
          <span style={S.desc}>{desc}</span>
        </div>
      ))}
      {showTrajectories && (
        <>
          <div style={{ ...S.hdr, marginTop: "5px" }}>TRAJECTORIES</div>
          {TRAJ_ITEMS.map(({ color, desc }) => (
            <div key={desc} style={S.row}>
              <div style={{ ...S.dot, background: color, borderRadius: "2px", height: "2px" }} />
              <span style={S.desc}>{desc}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
