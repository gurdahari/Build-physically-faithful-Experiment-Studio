/**
 * ScaleFrameBadge — one compact chip that makes every visual transformation
 * explicit, per the "never invent physics / always label scaling" rule.
 *
 * Collapsed: a single small chip (frame · playback speed).
 * Expanded (on click): physical time, playback time & scale factor, reference
 * frame, whether the carrier is shown, and that field arrows are normalized.
 */

import { useState } from "react";
import { C } from "./theme.js";
import { formatScaleFactor } from "./stageModel.js";
import { getFrameLabel, getFrameWarning } from "../visualPhysics/visualMappings.js";

function Row({ label, value, valueColor = C.text }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", lineHeight: "1.7" }}>
      <span style={{ color: "rgba(90,130,200,0.6)", fontSize: "9px", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ color: valueColor, fontSize: "9.5px", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

export default function ScaleFrameBadge({ scaleMeta, frame }) {
  const [open, setOpen] = useState(false);

  const ts = scaleMeta?.timeScale;
  const speedStr = ts ? formatScaleFactor(ts.scaleFactor) : "—";
  const frameShort = frame === "effective" ? "Ω_eff frame" : frame === "lab" ? "lab (visual)" : "rotating";
  const warning = getFrameWarning(frame);

  return (
    <div style={{ position: "relative", userSelect: "none" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Show scale & reference-frame details"
        style={{
          display: "flex", alignItems: "center", gap: "7px",
          background: "rgba(6,10,26,0.9)", border: `1px solid ${C.border}`,
          borderRadius: "20px", padding: "4px 11px", cursor: "pointer",
          color: "rgba(150,180,225,0.85)", fontSize: "10px", fontFamily: "monospace",
        }}
      >
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#5b7bd0" }} />
        {frameShort} · {speedStr}
        <span style={{ color: C.dim, fontSize: "9px" }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40,
          width: "230px",
          background: "rgba(4,8,22,0.97)", border: `1px solid ${C.border}`,
          borderRadius: "9px", padding: "10px 12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          <div style={{ color: "rgba(90,130,200,0.55)", fontSize: "8px", letterSpacing: "0.1em", marginBottom: "6px" }}>
            SCALE & FRAME
          </div>
          <Row label="Reference frame" value={getFrameLabel(frame)} />
          {ts && <Row label="Physical time" value={`${ts.physicalTime?.toFixed(2)} s`} />}
          {ts && <Row label="Playback time" value={`${ts.playbackTime?.toFixed(2)} s`} />}
          {ts && <Row label="Time scale" value={speedStr} valueColor="#ffcf90" />}
          <Row label="Field arrows" value="normalized" valueColor="#ffcf90" />
          <Row label="Bloch |r|" value="exact (physical)" valueColor="#8fe0a8" />
          <Row label="Carrier" value={frame === "lab" ? "shown (slowed)" : "folded out"} />
          {scaleMeta?.hasDecoherence && <Row label="System" value="open (Lindblad)" valueColor="#e0a040" />}
          {warning && (
            <div style={{ color: C.warn, fontSize: "8.5px", marginTop: "6px", lineHeight: "1.5" }}>
              {warning}
            </div>
          )}
          <div style={{ color: C.dim, fontSize: "8px", marginTop: "6px", lineHeight: "1.5" }}>
            Field-arrow lengths show direction only, not magnitude. All state
            evolution is computed by the QuTiP backend.
          </div>
        </div>
      )}
    </div>
  );
}
