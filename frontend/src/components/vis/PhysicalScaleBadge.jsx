/**
 * PhysicalScaleBadge — compact HTML overlay that makes every visual scaling
 * decision explicit to the user.
 *
 * "Every visual scaling, slowed time, normalized amplitude, hidden carrier,
 *  or transformed reference frame must be explicitly labeled."
 */

import { getFrameLabel, getFrameWarning } from "../../visualPhysics/visualMappings.js";
import { SCALE_TYPE } from "../../visualPhysics/visualizationTypes.js";

const S = {
  root: {
    position:   "absolute",
    top:        "50px",
    left:       "12px",
    background: "rgba(4, 8, 24, 0.88)",
    border:     "1px solid rgba(90, 130, 200, 0.28)",
    borderRadius: "7px",
    padding:    "8px 11px",
    fontSize:   "9px",
    fontFamily: "monospace",
    color:      "rgba(140, 170, 220, 0.85)",
    userSelect: "none",
    lineHeight: "1.75",
    maxWidth:   "200px",
    zIndex:     5,
  },
  section: { marginBottom: "4px" },
  label:   { color: "rgba(90, 130, 200, 0.55)", fontSize: "8px", letterSpacing: "0.07em" },
  val:     { color: "#aac0ff" },
  warn:    { color: "#c08040", fontSize: "8px", marginTop: "4px", lineHeight: "1.5" },
};

function Row({ label, value }) {
  return (
    <div>
      <span style={S.label}>{label} </span>
      <span style={S.val}>{value}</span>
    </div>
  );
}

export default function PhysicalScaleBadge({ scaleMeta }) {
  if (!scaleMeta) return null;

  const { frame, timeScale, fieldArrowScale, hasDecoherence, carrierSlowFactor } = scaleMeta;
  const frameWarning = getFrameWarning(frame);

  const tsScale = timeScale?.scaleFactor;
  const scaleStr = tsScale != null
    ? tsScale >= 1
      ? `${tsScale.toFixed(0)}× slower`
      : `${(1 / tsScale).toFixed(0)}× faster`
    : "—";

  return (
    <div style={S.root}>
      <div style={{ ...S.label, marginBottom: "4px" }}>SCALE INFO</div>

      <Row label="Frame"   value={getFrameLabel(frame)} />
      <Row label="Arrows"  value="normalized (not to scale)" />
      {timeScale && (
        <Row
          label="Time"
          value={`${timeScale.physicalTime?.toFixed(2) ?? "?"} s → ${timeScale.playbackTime?.toFixed(2) ?? "?"} s (${scaleStr})`}
        />
      )}
      {hasDecoherence && <Row label="System" value="open (Lindblad)" />}
      {carrierSlowFactor != null && (
        <Row label="Carrier" value={`slowed ×${carrierSlowFactor}`} />
      )}

      {frameWarning && (
        <div style={S.warn}>{frameWarning}</div>
      )}
    </div>
  );
}
