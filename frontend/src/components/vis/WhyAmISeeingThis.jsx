/**
 * WhyAmISeeingThis — toggleable explanation panel that describes each visible
 * element in the current visualization mode and reference frame.
 */

import { useState } from "react";
import { getModeDescription, getFrameLabel, getFrameWarning } from "../../visualPhysics/visualMappings.js";
import { VIS_MODES } from "../../visualPhysics/visualizationTypes.js";

const S = {
  trigger: {
    position:     "absolute",
    bottom:       "16px",
    left:         "50%",
    transform:    "translateX(-50%)",
    background:   "rgba(4, 8, 24, 0.80)",
    border:       "1px solid rgba(90, 130, 200, 0.25)",
    borderRadius: "5px",
    color:        "rgba(120, 150, 200, 0.55)",
    fontSize:     "9px",
    padding:      "3px 10px",
    cursor:       "pointer",
    userSelect:   "none",
    zIndex:       6,
  },
  panel: {
    position:     "absolute",
    bottom:       "38px",
    left:         "50%",
    transform:    "translateX(-50%)",
    width:        "280px",
    background:   "rgba(4, 8, 24, 0.95)",
    border:       "1px solid rgba(90, 130, 200, 0.30)",
    borderRadius: "9px",
    padding:      "12px 14px",
    fontSize:     "10px",
    color:        "#aac0ff",
    lineHeight:   "1.65",
    zIndex:       7,
    userSelect:   "none",
  },
  title:   { fontWeight: "700", marginBottom: "5px", color: "#c8dcff" },
  body:    { color: "rgba(140, 170, 220, 0.80)", fontSize: "9.5px", marginBottom: "8px" },
  hdr:     { color: "rgba(90, 130, 200, 0.50)", fontSize: "8px", letterSpacing: "0.07em", marginBottom: "3px" },
  warn:    { color: "#c08040", fontSize: "9px", marginTop: "6px" },
  close:   { position: "absolute", top: "8px", right: "10px", color: "rgba(90,130,200,0.45)", cursor: "pointer", fontSize: "13px" },
};

const ELEMENT_EXPLANATIONS = {
  "B₀":    "The static longitudinal field along +Z defines the quantization axis.  In the rotating frame it appears static even though in the lab frame it oscillates at the Larmor frequency.",
  "B₁(t)": "The transverse control field sourced from the backend's field_trajectory.  Its direction in the XY plane is the pulse phase φ, its magnitude is the Rabi amplitude Ω(t).",
  "Ω_eff": "The effective field = (Ωcosφ, Ωsinφ, Δ).  The Bloch vector rotates about this axis.  Its length (|Ω_eff|=√(Ω²+Δ²)) sets the rotation speed.",
  "Δ":     "(Diagnostic) The detuning Δ — the Z-component of Ω_eff that shifts the resonance condition.",
};

export default function WhyAmISeeingThis({ visMode, visFrame }) {
  const [open, setOpen] = useState(false);

  if (visMode === VIS_MODES.CONCEPT) return null;

  const modeDesc   = getModeDescription(visMode);
  const frameWarn  = getFrameWarning(visFrame);
  const frameLabel = getFrameLabel(visFrame);

  return (
    <>
      <button style={S.trigger} onClick={() => setOpen(o => !o)}>
        {open ? "▾ Close" : "? Why am I seeing this?"}
      </button>

      {open && (
        <div style={S.panel}>
          <button style={S.close} onClick={() => setOpen(false)}>✕</button>

          <div style={S.title}>{modeDesc.title}</div>
          <div style={S.body}>{modeDesc.body}</div>

          <div style={S.hdr}>REFERENCE FRAME</div>
          <div style={{ ...S.body, marginBottom: "6px" }}>
            <strong style={{ color: "#c8dcff" }}>{frameLabel}</strong>
            {frameWarn && <> — {frameWarn}</>}
          </div>

          {Object.entries(ELEMENT_EXPLANATIONS).map(([name, text]) => (
            <div key={name} style={{ marginBottom: "5px" }}>
              <div style={{ ...S.hdr, display: "inline" }}>{name}: </div>
              <span style={{ color: "rgba(140,170,220,0.75)", fontSize: "9px" }}>{text}</span>
            </div>
          ))}

          <div style={S.warn}>
            Arrow lengths are normalized — not physically to scale.
          </div>
        </div>
      )}
    </>
  );
}
