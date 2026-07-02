/**
 * FocusCard — the single compact contextual card shown while an object is
 * focused in the Physical Lab.  Read-only; every value comes from the backend at
 * the current playIndex (passed in as pre-formatted rows).  Includes the small
 * "Back" control that returns to the default lab framing.
 */

import { C, PHYS } from "./theme.js";
import { focusLevelLabel } from "./focusModel.js";

const ACCENT = {
  system:   PHYS.b0,
  drive:    PHYS.b1,
  sample:   "#ffcf90",
  detector: PHYS.measure,
};

export default function FocusCard({ objectId, title, fields, level = 1, onBack }) {
  if (!objectId) return null;
  const accent = ACCENT[objectId] ?? C.text;
  return (
    <div data-testid="focus-card" style={{
      position: "absolute", bottom: "12px", left: "12px", zIndex: 12,
      width: "216px", background: "rgba(5,9,22,0.92)",
      border: `1px solid ${C.border}`, borderRadius: "10px",
      padding: "10px 12px", userSelect: "none",
      boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <span style={{ color: C.bright, fontSize: "11px", fontWeight: 700, flex: 1 }}>{title}</span>
        <button data-testid="focus-back" onClick={onBack} title="Back to lab view (Esc)" style={{
          background: "rgba(20,28,55,0.85)", border: `1px solid ${C.border}`, borderRadius: "6px",
          color: C.text, fontSize: "10px", padding: "3px 8px", cursor: "pointer",
        }}>← Back</button>
      </div>
      {/* Minimal focus-level label (no separate control — a second click deepens). */}
      <div data-testid="focus-level" style={{ color: accent, fontSize: "9px", letterSpacing: "0.06em",
        textTransform: "uppercase", marginBottom: "8px", marginLeft: "16px" }}>
        {focusLevelLabel(level)}
      </div>
      <div>
        {fields.map(([label, value], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "10px", lineHeight: "1.7" }}>
            <span style={{ color: "rgba(90,130,200,0.7)", fontSize: "9.5px" }}>{label}</span>
            <span style={{ color: C.text, fontSize: "9.5px", fontFamily: "monospace", textAlign: "right" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
