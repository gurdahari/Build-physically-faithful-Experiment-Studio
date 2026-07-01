/**
 * InfoDrawer — the legend, tucked behind a small "i" control so the default
 * scene stays clean.  Lists what each colored object/vector means and which
 * backend quantity drives it.  Hidden until opened.
 */

import { useState } from "react";
import { C, PHYS } from "./theme.js";

const LEGEND = [
  { color: PHYS.bloch,         label: "r",       desc: "Bloch state vector — backend trajectory" },
  { color: PHYS.omegaEff,      label: "Ω_eff",   desc: "Effective field / rotation axis (state space)" },
  { color: PHYS.b0,            label: "B₀",      desc: "Static field, magnet — physical space" },
  { color: PHYS.b1,            label: "B₁(t)",   desc: "Drive field, RF source — physical space" },
  { color: PHYS.measure,       label: "detector", desc: "Measurement axis & readout" },
  { color: PHYS.trajectory,    label: "path",    desc: "Ideal trajectory (gold)" },
  { color: PHYS.trajectoryAlt, label: "path",    desc: "Decohering trajectory (magenta)" },
];

export default function InfoDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", userSelect: "none" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="What am I looking at?"
        style={{
          width: "26px", height: "26px", borderRadius: "50%",
          background: "rgba(6,10,26,0.9)", border: `1px solid ${C.border}`,
          color: "rgba(150,180,225,0.85)", cursor: "pointer", fontSize: "12px",
          fontStyle: "italic", fontFamily: "Georgia, serif",
        }}
      >
        i
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40,
          width: "260px",
          background: "rgba(4,8,22,0.97)", border: `1px solid ${C.border}`,
          borderRadius: "9px", padding: "11px 13px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          <div style={{ color: "rgba(90,130,200,0.55)", fontSize: "8px", letterSpacing: "0.1em", marginBottom: "7px" }}>
            LEGEND
          </div>
          {LEGEND.map(({ color, label, desc }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: color, flexShrink: 0 }} />
              <span style={{ fontFamily: "monospace", fontSize: "9.5px", color, minWidth: "48px" }}>{label}</span>
              <span style={{ fontSize: "9px", color: "rgba(120,150,190,0.8)" }}>{desc}</span>
            </div>
          ))}
          <div style={{ color: C.dim, fontSize: "8.5px", marginTop: "7px", lineHeight: "1.5", borderTop: `1px solid ${C.border}`, paddingTop: "6px" }}>
            The physical lab shows real apparatus; the Bloch sphere is an abstract
            mathematical space, not a physical object.
          </div>
        </div>
      )}
    </div>
  );
}
