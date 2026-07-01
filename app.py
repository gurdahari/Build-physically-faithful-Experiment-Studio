"""Quantum Experiment Studio."""

import time
import numpy as np
import streamlit as st

from physics.bloch_rotation import apply_rotation, bloch_vector
from visualization.plots import make_clean_bloch_figure

st.set_page_config(
    page_title="Quantum Experiment Studio",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Tighten Streamlit's default padding so everything fits without scrolling
st.markdown(
    """
    <style>
    .block-container { padding-top: 0.8rem !important;
                       padding-bottom: 0.3rem !important; }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown("## Quantum Experiment Studio")

# ── Session state ──────────────────────────────────────────────────────────────
_D = {
    # Rotation tab
    "playing":   False,
    "sim_time":  0.0,
    "wall_time": None,
    "omega":     2.0,
    "rot_tx": [0.0], "rot_ty": [0.0], "rot_tz": [1.0],
    # Pulse tab
    "ps_state":   (0.0, 0.0, 1.0),
    "ps_history": [(0.0, 0.0, 1.0)],
    "ps_log":     [],
}
for k, v in _D.items():
    if k not in st.session_state:
        st.session_state[k] = v
ss = st.session_state

# ── Tabs ───────────────────────────────────────────────────────────────────────
tab_rot, tab_pulse = st.tabs(["⟳  Continuous Rotation", "⚡  Pulse Explorer"])


# ═══════════════════════════════════════════════════════════════════════════════
# TAB 1 — Continuous Rotation
# The entire tab lives inside @st.fragment so that:
#   • Play/Pause clicks only rerun this fragment (not the whole page)
#   • The chart key is stable → Plotly updates in-place → no flicker
# ═══════════════════════════════════════════════════════════════════════════════
with tab_rot:

    @st.fragment(run_every=0.08)
    def _rot() -> None:
        # ── Controls ──────────────────────────────────────────────────────
        c1, c2, c3 = st.columns([1.5, 7, 1], vertical_alignment="bottom")

        with c1:
            lbl = "⏸  Pause" if ss.playing else "▶  Play"
            if st.button(lbl, type="primary", use_container_width=True, key="rot_btn"):
                ss.playing = not ss.playing
                if ss.playing:
                    ss.wall_time = time.time()

        with c2:
            new_omega = st.slider(
                "Angular frequency  ω  (rad/s)",
                min_value=0.5, max_value=10.0,
                value=float(ss.omega), step=0.5,
                format="ω = %.1f rad/s",
                key="omega_sl",
            )
            ss.omega = new_omega

        with c3:
            if st.button("↺  Reset", use_container_width=True, key="rot_rst"):
                ss.playing   = False
                ss.sim_time  = 0.0
                ss.wall_time = None
                ss.rot_tx = [0.0]; ss.rot_ty = [0.0]; ss.rot_tz = [1.0]

        # ── Advance physics ────────────────────────────────────────────────
        # θ(t) = ω · t  →  (x, y, z) = (0, −sin θ, cos θ)
        if ss.playing:
            now = time.time()
            if ss.wall_time is not None:
                dt = min(now - ss.wall_time, 0.25)   # cap to absorb lag spikes
                ss.sim_time += dt
                _x, _y, _z = bloch_vector(ss.sim_time, ss.omega)
                ss.rot_tx.append(_x)
                ss.rot_ty.append(_y)
                ss.rot_tz.append(_z)
                if len(ss.rot_tx) > 400:
                    ss.rot_tx = ss.rot_tx[-400:]
                    ss.rot_ty = ss.rot_ty[-400:]
                    ss.rot_tz = ss.rot_tz[-400:]
            ss.wall_time = time.time()

        # ── Live metrics (plain HTML — no Streamlit underlines) ────────────
        t     = ss.sim_time
        bx, by, bz = bloch_vector(t, ss.omega)
        theta = ss.omega * t

        st.markdown(
            f"<div style='font-size:0.88rem;color:#bbb;margin:0.2rem 0 0.3rem'>"
            f"<b style='color:#fff;font-size:1.05rem'>θ = {theta:.3f} rad</b>"
            f"&emsp;t = {t:.3f} s"
            f"&emsp;{theta / (2 * np.pi):.3f} rotations"
            f"&emsp;<span style='color:#888'>({bx:.3f},&thinsp;{by:.3f},&thinsp;{bz:.3f})</span>"
            f"</div>",
            unsafe_allow_html=True,
        )

        # ── Bloch sphere ───────────────────────────────────────────────────
        # Stable key → Streamlit updates the existing Plotly component
        # in-place (Plotly.react) instead of destroying and recreating it.
        fig = make_clean_bloch_figure(
            (bx, by, bz),
            ss.rot_tx, ss.rot_ty, ss.rot_tz,
            height=575,
        )
        st.plotly_chart(fig, use_container_width=True, key="rot_chart")

    _rot()


# ═══════════════════════════════════════════════════════════════════════════════
# TAB 2 — Pulse Explorer
# Static display: one Streamlit rerun per button click, no fragment needed.
# ═══════════════════════════════════════════════════════════════════════════════
with tab_pulse:

    ANGLES = {
        "π/6  (30°)":   np.pi / 6,
        "π/4  (45°)":   np.pi / 4,
        "π/3  (60°)":   np.pi / 3,
        "π/2  (90°)":   np.pi / 2,
        "2π/3 (120°)":  2 * np.pi / 3,
        "3π/4 (135°)":  3 * np.pi / 4,
        "π    (180°)":  np.pi,
        "3π/2 (270°)":  3 * np.pi / 2,
        "2π   (360°)":  2 * np.pi,
    }

    # ── One compact control row ────────────────────────────────────────────
    ca, cb, cc, cd, ce = st.columns([2, 3, 2, 1.2, 1.2], vertical_alignment="bottom")

    with ca:
        ax_ch = st.radio(
            "Rotation axis", ["X", "Y", "Z"],
            horizontal=True, key="p_ax",
        )
    with cb:
        ang_ch = st.selectbox(
            "Angle", list(ANGLES.keys()),
            index=3, key="p_ang",
        )
    with cc:
        dir_ch = st.radio(
            "Direction", ["+  CCW", "−  CW"],
            horizontal=True, key="p_dir",
        )
    with cd:
        do_apply = st.button(
            "▶  Apply", type="primary",
            use_container_width=True, key="p_apply",
        )
    with ce:
        do_reset = st.button(
            "↺  Reset",
            use_container_width=True, key="p_reset",
        )

    # ── Resolve controls ───────────────────────────────────────────────────
    axis      = ax_ch.lower()
    base_ang  = ANGLES[ang_ch]
    sgn       = +1 if dir_ch.startswith("+") else -1
    pulse_ang = sgn * base_ang
    ang_lbl   = ang_ch.split()[0]
    sgn_str   = "+" if sgn > 0 else "−"

    # ── Handle actions ─────────────────────────────────────────────────────
    if do_apply:
        # r_new = R_axis(angle) · r_old
        new_s = apply_rotation(ss.ps_state, axis, pulse_ang)
        ss.ps_state = new_s
        ss.ps_history.append(new_s)
        ss.ps_log.append(f"R_{axis}({sgn_str}{ang_lbl})")

    if do_reset:
        ss.ps_state   = (0.0, 0.0, 1.0)
        ss.ps_history = [(0.0, 0.0, 1.0)]
        ss.ps_log     = []

    # ── State display ──────────────────────────────────────────────────────
    bx, by, bz = ss.ps_state
    th_deg = float(np.degrees(np.arccos(np.clip(bz, -1.0, 1.0))))
    last_entry = (
        f"&emsp;<span style='color:#999;font-style:italic'>last: {ss.ps_log[-1]}</span>"
        if ss.ps_log else ""
    )
    st.markdown(
        f"<div style='font-size:0.88rem;color:#bbb;margin:0.2rem 0 0.3rem'>"
        f"<b style='color:#fff;font-size:1.05rem'>"
        f"({bx:+.3f},&thinsp;{by:+.3f},&thinsp;{bz:+.3f})</b>"
        f"&emsp;θ = {th_deg:.1f}°"
        f"&emsp;pulses: {len(ss.ps_log)}"
        f"{last_entry}</div>",
        unsafe_allow_html=True,
    )

    # ── Bloch sphere ───────────────────────────────────────────────────────
    h = ss.ps_history
    fig2 = make_clean_bloch_figure(
        ss.ps_state,
        trail_x=[p[0] for p in h],
        trail_y=[p[1] for p in h],
        trail_z=[p[2] for p in h],
        waypoints=h[:-1] if len(h) > 1 else None,   # dots at previous states
        height=565,
    )
    st.plotly_chart(fig2, use_container_width=True, key="pulse_chart")

    # Pulse log in a closed expander — visible on demand, no scroll on entry
    if ss.ps_log:
        with st.expander(
            f"Pulse history — {len(ss.ps_log)} pulse{'s' if len(ss.ps_log) > 1 else ''}",
            expanded=False,
        ):
            st.markdown(
                " &nbsp;→&nbsp; ".join(["|0⟩"] + ss.ps_log),
                unsafe_allow_html=True,
            )
