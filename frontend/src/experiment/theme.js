/**
 * Shared design tokens for the redesigned Experiment Studio.
 *
 * Kept in one place so every studio component (physical lab scene, state-space
 * view, timeline, edit drawer, badges) shares a single restrained visual
 * hierarchy.  Colors carry physical meaning — see docs/EXPERIMENT_STUDIO.md.
 */

// ── Palette ────────────────────────────────────────────────────────────────
export const C = {
  bg:        "#05070f",
  panel:     "rgba(3,5,16,0.97)",
  panelSoft: "rgba(6,12,30,0.70)",
  border:    "rgba(90,130,200,0.18)",
  borderHi:  "rgba(100,160,255,0.45)",
  dim:       "#4a6494",
  dimDark:   "#2a3f60",
  label:     "#7a96c4",
  text:      "#aac0ff",
  bright:    "#c8dcff",
  warn:      "#c08040",
  danger:    "#ff8060",
};

/**
 * Physical-quantity colors.  A single color per physical object/vector, reused
 * identically in the lab scene, the state-space view, the timeline, and the
 * legend so the user learns one color = one physical meaning.
 */
export const PHYS = {
  bloch:    "#dc143c", // Bloch state vector r (strongest element)
  b0:       "#5096ff", // static longitudinal field B0 (magnet)
  b1:       "#40c8e0", // transverse drive B1(t) (RF/MW source)
  omegaEff: "#ff9040", // effective field Ω_eff (rotation axis, state space)
  detuning: "#bb88ff", // detuning Δ component
  measure:  "#70e090", // measurement axis / detector
  trajectory:    "#ffb700", // primary backend trajectory (gold)
  trajectoryAlt: "#ff70c8", // comparison / decohering trajectory (magenta)
  free:     "#5b7bd0", // free-evolution timeline block
  pulse:    "#2fb6c8", // pulse timeline block
};

// ── Button styles ────────────────────────────────────────────────────────────
export const BTN = {
  background:   "rgba(20,28,55,0.88)",
  border:       "1px solid rgba(90,130,200,0.40)",
  borderRadius: "7px",
  color:        C.text,
  padding:      "7px 14px",
  cursor:       "pointer",
  fontSize:     "12px",
  lineHeight:   "1",
  userSelect:   "none",
  transition:   "all 0.12s",
};

export const BTN_ACTIVE = {
  ...BTN,
  background:   "rgba(40,60,140,0.90)",
  borderColor:  "rgba(100,160,255,0.55)",
  color:        C.bright,
  fontWeight:   "600",
};

export const BTN_PRIMARY = {
  ...BTN,
  background:   "rgba(10,60,40,0.85)",
  border:       "1px solid rgba(60,180,90,0.50)",
  color:        "#7fe6a0",
  fontWeight:   "600",
  padding:      "8px 18px",
};

export const BTN_SM = { ...BTN, padding: "4px 9px", fontSize: "11px", borderRadius: "6px" };
export const BTN_ICON = {
  ...BTN,
  padding: "6px 9px",
  fontSize: "13px",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};
