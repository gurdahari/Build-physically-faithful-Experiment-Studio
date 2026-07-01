/**
 * VisControlPanel — compact floating panel for switching visualization modes
 * and reference frames.  Rendered as an absolute-positioned overlay inside
 * the BlochSphere container via the `visControls` slot prop.
 */

import { VIS_MODES, FRAMES } from "./visualPhysics/visualizationTypes.js";

const MODES  = [
  [VIS_MODES.CONCEPT,    "Concept",    "Bloch vector only"],
  [VIS_MODES.PHYSICS,    "Physics",    "Adds B₀, B₁, Ω_eff arrows"],
  [VIS_MODES.DIAGNOSTIC, "Diagnostic", "Full overlay + diagnostics"],
];

const FRAME_LIST = [
  [FRAMES.ROTATING,  "Rotating", "Backend native (default)"],
  [FRAMES.EFFECTIVE, "Ω_eff → Z", "Effective-field frame"],
  [FRAMES.LAB,       "Lab (visual)", "Slowed carrier rotation"],
];

const S = {
  root: {
    position:   "absolute",
    top:        "12px",
    left:       "12px",
    zIndex:     10,
    display:    "flex",
    flexDirection: "column",
    gap:        "5px",
    userSelect: "none",
  },
  group: {
    background:   "rgba(4, 8, 24, 0.88)",
    border:       "1px solid rgba(90, 130, 200, 0.28)",
    borderRadius: "7px",
    padding:      "5px 7px",
    display:      "flex",
    gap:          "3px",
    alignItems:   "center",
  },
  groupLabel: {
    color:       "rgba(90, 130, 200, 0.45)",
    fontSize:    "8px",
    letterSpacing: "0.07em",
    marginRight: "3px",
    flexShrink: 0,
  },
  btn: {
    background:   "transparent",
    border:       "1px solid transparent",
    borderRadius: "4px",
    color:        "rgba(120, 150, 200, 0.60)",
    padding:      "3px 8px",
    cursor:       "pointer",
    fontSize:     "10px",
    lineHeight:   "1",
    transition:   "all 0.12s",
  },
  btnActive: {
    background:   "rgba(40, 60, 140, 0.75)",
    border:       "1px solid rgba(100, 160, 255, 0.45)",
    color:        "#ddeeff",
    fontWeight:   "600",
  },
};

function ToggleGroup({ label, items, value, onChange }) {
  return (
    <div style={S.group} title={`${label}: ${items.find(([k]) => k === value)?.[2] ?? ""}`}>
      <span style={S.groupLabel}>{label}</span>
      {items.map(([key, display]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          title={items.find(([k]) => k === key)?.[2] ?? ""}
          style={value === key ? { ...S.btn, ...S.btnActive } : S.btn}
        >
          {display}
        </button>
      ))}
    </div>
  );
}

export default function VisControlPanel({ visMode, visFrame, onChange }) {
  return (
    <div style={S.root}>
      <ToggleGroup
        label="MODE"
        items={MODES}
        value={visMode}
        onChange={mode => onChange({ mode })}
      />
      <ToggleGroup
        label="FRAME"
        items={FRAME_LIST}
        value={visFrame}
        onChange={frame => onChange({ frame })}
      />
    </div>
  );
}
