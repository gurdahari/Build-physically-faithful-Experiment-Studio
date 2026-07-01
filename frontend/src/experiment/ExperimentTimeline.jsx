/**
 * ExperimentTimeline — the large, visually central timeline.
 *
 * Blocks are laid out proportionally to their PHYSICAL duration (seconds).  It
 * shows pulse blocks, free-evolution blocks, and an optional measurement cap,
 * plus the live playhead.  It is the primary editing surface: clicking a block
 * selects it (opening only that item's editor) — there are no per-block edit
 * buttons cluttering the strip.
 *
 * Synchronization: the playhead position is driven by the backend `times`
 * array at the current playhead index, so the timeline, the physical scene and
 * the state-space view all reflect the same backend time point.
 */

import { useMemo } from "react";
import { C, PHYS } from "./theme.js";
import { formatTime } from "./stageModel.js";

const MIN_FRAC = 0.05; // minimum visual width so tiny items stay clickable

export default function ExperimentTimeline({
  items,
  currentItemIndex = null,
  currentTime = 0,
  totalDuration = null,
  progress = 0,          // 0..1 across the whole run
  selectedItemId = null,
  measurementEnabled = false,
  onSelectItem,
  onSelectMeasurement,
  hasResult = false,
}) {
  // Planned durations drive the block layout even before a run.
  const layout = useMemo(() => {
    const durations = items.map(it => Math.max(1e-6, it.duration || 0));
    const total = durations.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const blocks = items.map((it, i) => {
      const frac = Math.max(MIN_FRAC, durations[i] / total);
      const start = acc; acc += durations[i];
      return { item: it, index: i, frac, tStart: start, tEnd: acc, duration: durations[i] };
    });
    // Renormalize fracs (MIN_FRAC may push sum >1).
    const sum = blocks.reduce((a, b) => a + b.frac, 0);
    blocks.forEach(b => { b.frac /= sum; });
    return { blocks, total };
  }, [items]);

  const playPct = Math.max(0, Math.min(100, progress * 100));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header row: label + live time */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "6px 16px 4px", flexShrink: 0,
      }}>
        <span style={{
          color: "rgba(90,130,200,0.5)", fontSize: "9px", fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase",
        }}>
          Experiment timeline
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "monospace", fontSize: "11px", color: C.text }}>
          {hasResult ? formatTime(currentTime) : "—"}
          <span style={{ color: C.dim }}>
            {" / "}{totalDuration != null ? formatTime(totalDuration) : formatTime(layout.total)}
          </span>
        </span>
      </div>

      {/* Track */}
      <div style={{ flex: 1, minHeight: 0, padding: "0 16px 8px", position: "relative" }}>
        <div style={{
          position: "relative", height: "100%", minHeight: "72px",
          display: "flex", gap: "3px",
          background: "rgba(4,7,18,0.6)", borderRadius: "8px",
          border: `1px solid ${C.border}`, padding: "6px", boxSizing: "border-box",
        }}>
          {layout.blocks.map((b) => {
            const isPulse = b.item.type === "pulse";
            const isActive = hasResult && b.index === currentItemIndex;
            const isSelected = b.item.id === selectedItemId;
            const base = isPulse ? PHYS.pulse : PHYS.free;
            return (
              <button
                key={b.item.id}
                onClick={() => onSelectItem?.(b.item.id)}
                title={`${isPulse ? "Pulse" : "Free evolution"} · ${formatTime(b.duration)} — click to edit`}
                style={{
                  flex: `${b.frac} 1 0`, minWidth: 0,
                  position: "relative", cursor: "pointer",
                  borderRadius: "6px", overflow: "hidden",
                  border: `1px solid ${isSelected ? "#dfebff" : isActive ? base : "transparent"}`,
                  background: `linear-gradient(180deg, ${base}${isActive ? "cc" : "66"} 0%, ${base}${isActive ? "88" : "33"} 100%)`,
                  boxShadow: isActive ? `0 0 12px ${base}66` : "none",
                  transition: "all 0.12s",
                  padding: "6px 8px",
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                  textAlign: "left",
                }}
              >
                <span style={{
                  fontSize: "10px", fontWeight: 600, color: "#eaf2ff",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {b.index + 1}. {isPulse ? (b.item.pulse_shape === "gaussian" ? "Gauss pulse" : "Pulse") : "Free evo"}
                </span>
                <span style={{ fontSize: "9px", fontFamily: "monospace", color: "rgba(230,240,255,0.7)" }}>
                  {formatTime(b.duration)}
                </span>
              </button>
            );
          })}

          {/* Measurement cap */}
          {measurementEnabled && (
            <button
              onClick={() => onSelectMeasurement?.()}
              title="Measurement — click to edit"
              style={{
                flex: "0 0 40px", cursor: "pointer",
                borderRadius: "6px",
                border: `1px dashed ${PHYS.measure}aa`,
                background: `${PHYS.measure}22`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: PHYS.measure, fontSize: "14px",
              }}
            >
              ⟠
            </button>
          )}

          {/* Playhead — positioned within the 6px-padded track. */}
          {hasResult && (
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              left: `calc(6px + (100% - 12px) * ${playPct / 100})`,
              width: "2px", background: "#ffffff",
              boxShadow: "0 0 8px rgba(255,255,255,0.7)",
              pointerEvents: "none", zIndex: 3,
            }} />
          )}
        </div>
      </div>
    </div>
  );
}
