import numpy as np
import plotly.graph_objects as go


def _sphere_mesh(resolution: int = 34):
    u = np.linspace(0, 2 * np.pi, resolution)
    v = np.linspace(0, np.pi, resolution)
    x = np.outer(np.cos(u), np.sin(v))
    y = np.outer(np.sin(u), np.sin(v))
    z = np.outer(np.ones_like(u), np.cos(v))
    return x, y, z


def make_clean_bloch_figure(
    state: tuple[float, float, float],
    trail_x: list = None,
    trail_y: list = None,
    trail_z: list = None,
    waypoints: list = None,
    height: int = 580,
) -> go.Figure:
    """Minimal, fast Bloch sphere used by both tabs.

    Only the essential elements are drawn so the sphere stays readable.
    uirevision='constant' keeps the user's camera angle when figure data
    updates — the sphere does not snap back on every animation frame.
    """
    BG = "rgb(8, 10, 22)"
    bx, by, bz = float(state[0]), float(state[1]), float(state[2])
    sx, sy, sz = _sphere_mesh(resolution=48)

    fig = go.Figure()

    # Semi-transparent sphere — colour gradient gives depth without clutter
    fig.add_trace(go.Surface(
        x=sx, y=sy, z=sz,
        opacity=0.18, showscale=False, hoverinfo="skip",
        colorscale=[[0, "rgb(18, 52, 130)"], [1, "rgb(130, 190, 255)"]],
        lighting={"ambient": 0.6, "diffuse": 0.85},
    ))

    # Equator — the only wireframe circle; just enough context without noise
    phi = np.linspace(0, 2 * np.pi, 100)
    fig.add_trace(go.Scatter3d(
        x=np.cos(phi), y=np.sin(phi), z=np.zeros(100),
        mode="lines", hoverinfo="skip", showlegend=False,
        line={"color": "rgba(120, 165, 255, 0.40)", "width": 2},
    ))

    # Coloured axis lines: x=red, y=green, z=blue
    for ax, ay, az, lbl, clr in [
        ([-1.3, 1.3], [0, 0], [0, 0], "X", "rgba(255, 80, 80, 0.85)"),
        ([0, 0], [-1.3, 1.3], [0, 0], "Y", "rgba(60, 200, 60, 0.85)"),
        ([0, 0], [0, 0], [-1.3, 1.3], "Z", "rgba(80, 150, 255, 0.85)"),
    ]:
        fig.add_trace(go.Scatter3d(
            x=ax, y=ay, z=az,
            mode="lines+text", text=["", lbl],
            textfont={"size": 16, "color": clr},
            hoverinfo="skip", showlegend=False,
            line={"color": clr, "width": 3},
        ))

    # |0⟩ / |1⟩ pole labels
    fig.add_trace(go.Scatter3d(
        x=[0, 0], y=[0, 0], z=[1.45, -1.45],
        mode="text", text=["<b>|0⟩</b>", "<b>|1⟩</b>"],
        textfont={"size": 20, "color": "rgba(255,255,255,0.9)"},
        hoverinfo="skip", showlegend=False,
    ))

    # Trajectory trail (continuous rotation) or connecting line (pulses)
    if trail_x and len(trail_x) >= 2:
        fig.add_trace(go.Scatter3d(
            x=trail_x[-250:], y=trail_y[-250:], z=trail_z[-250:],
            mode="lines", showlegend=False,
            line={"width": 5, "color": "rgba(80, 160, 255, 0.65)"},
        ))

    # Gold waypoint dots for pulse history
    if waypoints and len(waypoints) >= 1:
        fig.add_trace(go.Scatter3d(
            x=[p[0] for p in waypoints],
            y=[p[1] for p in waypoints],
            z=[p[2] for p in waypoints],
            mode="markers", showlegend=False,
            marker={"size": 8, "color": "gold", "opacity": 0.9},
            hoverinfo="skip",
        ))

    # Bloch vector shaft (thick, crimson)
    fig.add_trace(go.Scatter3d(
        x=[0, bx], y=[0, by], z=[0, bz],
        mode="lines", showlegend=False,
        line={"width": 11, "color": "crimson"},
        hoverinfo="skip",
    ))
    # Tip: white dot with crimson ring — distinct from every other element
    fig.add_trace(go.Scatter3d(
        x=[bx], y=[by], z=[bz],
        mode="markers", showlegend=False,
        marker={"size": 16, "color": "white",
                "line": {"color": "crimson", "width": 4}},
        hovertemplate="x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<extra></extra>",
    ))

    fig.update_layout(
        height=height,
        margin={"l": 0, "r": 0, "t": 0, "b": 0},
        paper_bgcolor=BG,
        scene={
            "xaxis": {"range": [-1.5, 1.5], "visible": False},
            "yaxis": {"range": [-1.5, 1.5], "visible": False},
            "zaxis": {"range": [-1.5, 1.5], "visible": False},
            "aspectmode": "cube",
            "bgcolor": BG,
            "camera": {"eye": {"x": 1.35, "y": 1.35, "z": 0.8}},
        },
        showlegend=False,
        # Preserve the user's camera rotation when figure data updates.
        # Without this the sphere would snap back on every animation frame.
        uirevision="constant",
    )
    return fig


def make_bloch_figure(result, index: int) -> go.Figure:
    sphere_x, sphere_y, sphere_z = _sphere_mesh()

    fig = go.Figure()
    fig.add_trace(
        go.Surface(
            x=sphere_x,
            y=sphere_y,
            z=sphere_z,
            opacity=0.12,
            showscale=False,
            hoverinfo="skip",
        )
    )

    # Coordinate axes.
    for axis_x, axis_y, axis_z, label in [
        ([-1.15, 1.15], [0, 0], [0, 0], "x"),
        ([0, 0], [-1.15, 1.15], [0, 0], "y"),
        ([0, 0], [0, 0], [-1.15, 1.15], "z"),
    ]:
        fig.add_trace(
            go.Scatter3d(
                x=axis_x,
                y=axis_y,
                z=axis_z,
                mode="lines+text",
                text=["", label],
                hoverinfo="skip",
                showlegend=False,
                line={"width": 3},
            )
        )

    # Trajectory up to the selected moment.
    fig.add_trace(
        go.Scatter3d(
            x=result.bloch_x[: index + 1],
            y=result.bloch_y[: index + 1],
            z=result.bloch_z[: index + 1],
            mode="lines",
            name="State trajectory",
            line={"width": 6},
        )
    )

    bx = float(result.bloch_x[index])
    by = float(result.bloch_y[index])
    bz = float(result.bloch_z[index])

    # Bloch vector.
    fig.add_trace(
        go.Scatter3d(
            x=[0, bx],
            y=[0, by],
            z=[0, bz],
            mode="lines+markers",
            name="Bloch vector",
            marker={"size": [2, 7]},
            line={"width": 10},
            hovertemplate=(
                "x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<extra></extra>"
            ),
        )
    )

    fig.update_layout(
        height=560,
        margin={"l": 0, "r": 0, "t": 10, "b": 0},
        scene={
            "xaxis": {"range": [-1.2, 1.2], "visible": False},
            "yaxis": {"range": [-1.2, 1.2], "visible": False},
            "zaxis": {"range": [-1.2, 1.2], "visible": False},
            "aspectmode": "cube",
            "camera": {"eye": {"x": 1.45, "y": 1.45, "z": 1.1}},
        },
        legend={"orientation": "h"},
    )
    return fig


def make_probability_figure(result, index: int) -> go.Figure:
    time_us = result.time_s * 1e6

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=time_us,
            y=result.probability_zero,
            mode="lines",
            name="P(0)",
            hovertemplate="t=%{x:.3f} µs<br>P(0)=%{y:.4f}<extra></extra>",
        )
    )
    fig.add_trace(
        go.Scatter(
            x=[time_us[index]],
            y=[result.probability_zero[index]],
            mode="markers",
            name="Current state",
            marker={"size": 12},
        )
    )
    fig.add_vline(
        x=time_us[index],
        line_dash="dash",
        annotation_text="current time",
    )
    fig.update_layout(
        height=560,
        xaxis_title="Experiment time (µs)",
        yaxis_title="Predicted probability P(0)",
        yaxis={"range": [0, 1]},
        margin={"l": 40, "r": 20, "t": 10, "b": 40},
        legend={"orientation": "h"},
    )
    return fig


def make_bloch_sphere_figure(
    state: tuple[float, float, float],
    history: list,
) -> go.Figure:
    """Large, polished Bloch sphere on a dark background.

    state   : current (x, y, z) Bloch vector
    history : list of (x, y, z) waypoints — drawn as the pulse trail
    """
    BG = "rgb(10, 10, 24)"
    bx, by, bz = float(state[0]), float(state[1]), float(state[2])

    sphere_x, sphere_y, sphere_z = _sphere_mesh(resolution=64)
    fig = go.Figure()

    # ── Sphere surface ──────────────────────────────────────────────────
    fig.add_trace(go.Surface(
        x=sphere_x, y=sphere_y, z=sphere_z,
        opacity=0.20, showscale=False, hoverinfo="skip",
        colorscale=[[0.0, "rgb( 15,  50, 130)"],
                    [0.5, "rgb( 50, 120, 220)"],
                    [1.0, "rgb(160, 205, 255)"]],
        lighting={"ambient": 0.55, "diffuse": 0.9,
                  "specular": 0.5, "roughness": 0.4},
        lightposition={"x": 2, "y": 2, "z": 3},
    ))

    # ── Meridians (great circles through the poles) ─────────────────────
    t = np.linspace(0, 2 * np.pi, 120)
    for phi in np.linspace(0, np.pi, 5)[:-1]:      # 4 meridian planes
        fig.add_trace(go.Scatter3d(
            x=np.sin(t) * np.cos(phi),
            y=np.sin(t) * np.sin(phi),
            z=np.cos(t),
            mode="lines", hoverinfo="skip", showlegend=False,
            line={"color": "rgba(110, 160, 255, 0.18)", "width": 1},
        ))

    # ── Latitude circles ────────────────────────────────────────────────
    phi_c = np.linspace(0, 2 * np.pi, 120)
    for lat_deg, alpha, w in [
        (-60, 0.12, 1), (-30, 0.15, 1),
        (  0, 0.55, 2),   # equator brighter
        ( 30, 0.15, 1), ( 60, 0.12, 1),
    ]:
        lat = np.radians(lat_deg)
        r, z_c = np.cos(lat), np.sin(lat)
        fig.add_trace(go.Scatter3d(
            x=r * np.cos(phi_c), y=r * np.sin(phi_c),
            z=np.full_like(phi_c, z_c),
            mode="lines", hoverinfo="skip", showlegend=False,
            line={"color": f"rgba(120, 170, 255, {alpha})", "width": w},
        ))

    # ── Axes (x=red, y=green, z=blue) ───────────────────────────────────
    for ax, ay, az, lbl, clr in [
        ([-1.5, 1.5], [0, 0], [0, 0], "X", "rgba(255,  90,  90, 0.9)"),
        ([0, 0], [-1.5, 1.5], [0, 0], "Y", "rgba( 80, 220,  80, 0.9)"),
        ([0, 0], [0, 0], [-1.5, 1.5], "Z", "rgba( 90, 160, 255, 0.9)"),
    ]:
        fig.add_trace(go.Scatter3d(
            x=ax, y=ay, z=az,
            mode="lines+text", text=["", lbl],
            textfont={"size": 20, "color": clr},
            hoverinfo="skip", showlegend=False,
            line={"color": clr, "width": 5},
        ))

    # ── Pole labels ──────────────────────────────────────────────────────
    fig.add_trace(go.Scatter3d(
        x=[0, 0], y=[0, 0], z=[1.58, -1.58],
        mode="text", text=["<b>|0⟩</b>", "<b>|1⟩</b>"],
        textfont={"size": 24, "color": "white"},
        hoverinfo="skip", showlegend=False,
    ))

    # ── Pulse trail ──────────────────────────────────────────────────────
    if len(history) >= 2:
        hxs = [p[0] for p in history]
        hys = [p[1] for p in history]
        hzs = [p[2] for p in history]
        fig.add_trace(go.Scatter3d(
            x=hxs, y=hys, z=hzs,
            mode="lines+markers", name="Pulse trail",
            marker={"size": 7, "color": "rgba(255, 210, 50, 0.9)"},
            line={"width": 4, "color": "rgba(255, 210, 50, 0.55)"},
        ))

    # ── Bloch vector shaft ───────────────────────────────────────────────
    fig.add_trace(go.Scatter3d(
        x=[0, bx], y=[0, by], z=[0, bz],
        mode="lines", name="Bloch vector",
        line={"width": 12, "color": "crimson"},
        hoverinfo="skip",
    ))
    # Vector tip — large white dot with red ring
    fig.add_trace(go.Scatter3d(
        x=[bx], y=[by], z=[bz],
        mode="markers",
        name=f"({bx:.3f}, {by:.3f}, {bz:.3f})",
        marker={"size": 20, "color": "white",
                "line": {"color": "crimson", "width": 5}},
        hovertemplate="x=%{x:.4f}<br>y=%{y:.4f}<br>z=%{z:.4f}<extra></extra>",
    ))

    fig.update_layout(
        height=820,
        margin={"l": 0, "r": 0, "t": 10, "b": 0},
        paper_bgcolor=BG,
        scene={
            "xaxis": {"range": [-1.7, 1.7], "visible": False},
            "yaxis": {"range": [-1.7, 1.7], "visible": False},
            "zaxis": {"range": [-1.7, 1.7], "visible": False},
            "aspectmode": "cube",
            "bgcolor": BG,
            "camera": {"eye": {"x": 1.35, "y": 1.35, "z": 0.85}},
        },
        legend={
            "x": 0.5, "y": 0.02, "xanchor": "center",
            "orientation": "h",
            "bgcolor": "rgba(0,0,0,0)",
            "font": {"color": "white", "size": 13},
        },
        font={"color": "white"},
    )
    return fig


def make_animated_bloch_figure(omega: float) -> go.Figure:
    """Bloch sphere with Plotly client-side animation for x-axis rotation.

    All N_FRAMES position frames are pre-computed and embedded in the
    figure JSON.  Plotly.js drives playback in the browser — Streamlit
    never reruns during animation, so there is zero flicker.

    omega : drive angular frequency in rad/s.  Controls how quickly
            theta advances and how simulation time maps to frame index.
    """
    N_FRAMES = 180       # frames total (3 full rotations × 60 frames)
    N_ROTATIONS = 3      # rotations encoded in the animation
    FRAME_MS = 33        # ms per frame → ~30 fps visual playback

    # θ(t) = ω · t — distribute N_FRAMES angles over N_ROTATIONS × 2π
    thetas = np.linspace(0, N_ROTATIONS * 2 * np.pi, N_FRAMES, endpoint=False)
    # Simulation time at each frame: t = θ / ω
    times = thetas / omega

    # Bloch-vector components for each frame:
    # x = 0   (rotation axis — never changes)
    # y = −sin θ
    # z =  cos θ
    bys = -np.sin(thetas)
    bzs = np.cos(thetas)

    sphere_x, sphere_y, sphere_z = _sphere_mesh()

    # ── Static traces (identical in every frame) ───────────────────────
    static = []

    # Transparent unit sphere for spatial context
    static.append(go.Surface(
        x=sphere_x, y=sphere_y, z=sphere_z,
        opacity=0.12, showscale=False, hoverinfo="skip", colorscale="Blues",
    ))
    # Labelled coordinate axes
    for ax, ay, az, label in [
        ([-1.2, 1.2], [0, 0], [0, 0], "x"),
        ([0, 0], [-1.2, 1.2], [0, 0], "y"),
        ([0, 0], [0, 0], [-1.2, 1.2], "z"),
    ]:
        static.append(go.Scatter3d(
            x=ax, y=ay, z=az,
            mode="lines+text", text=["", label],
            hoverinfo="skip", showlegend=False,
            line={"color": "grey", "width": 2},
        ))
    # North / south pole labels
    static.append(go.Scatter3d(
        x=[0, 0], y=[0, 0], z=[1.3, -1.3],
        mode="text", text=["|0⟩", "|1⟩"],
        hoverinfo="skip", showlegend=False,
    ))
    # Ghost orbit — the complete great circle the vector traces.
    # Showing this upfront is more informative than a growing trail,
    # because it reveals the full trajectory from the first frame.
    tc = np.linspace(0, 2 * np.pi, 120)
    static.append(go.Scatter3d(
        x=np.zeros(120), y=-np.sin(tc), z=np.cos(tc),
        mode="lines", name="Orbit (full circle)",
        line={"width": 2, "color": "rgba(100, 149, 237, 0.35)"},
        hoverinfo="skip",
    ))

    N_STATIC = len(static)   # traces 0 … N_STATIC-1 are never updated

    # ── Dynamic trace — Bloch vector (updated every frame) ─────────────
    vector_init = go.Scatter3d(
        x=[0, 0.0], y=[0, 0.0], z=[0, 1.0],   # initial: north pole
        mode="lines+markers", name="Bloch vector",
        marker={"size": [2, 10], "color": "crimson"},
        line={"width": 8, "color": "crimson"},
        hovertemplate="x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<extra></extra>",
    )
    VECTOR_IDX = N_STATIC   # index of the only mutable trace

    # ── Animation frames ───────────────────────────────────────────────
    # Each frame updates only the Bloch vector; static traces are untouched.
    frames = []
    for i in range(N_FRAMES):
        theta = float(thetas[i])
        t = float(times[i])
        by = float(bys[i])
        bz = float(bzs[i])
        frames.append(go.Frame(
            data=[go.Scatter3d(x=[0, 0.0], y=[0, by], z=[0, bz])],
            traces=[VECTOR_IDX],
            name=str(i),
            layout=go.Layout(title={
                "text": (
                    f"<b>θ = {theta:.3f} rad"
                    f"&nbsp;&nbsp;&nbsp;"
                    f"t = {t:.3f} s"
                    f"&nbsp;&nbsp;&nbsp;"
                    f"{theta / (2 * np.pi):.3f} rotations</b>"
                ),
                "x": 0.5,
                "font": {"size": 15},
            }),
        ))

    fig = go.Figure(data=static + [vector_init], frames=frames)

    fig.update_layout(
        height=720,
        margin={"l": 0, "r": 0, "t": 80, "b": 100},
        title={
            "text": "<b>θ = 0.000 rad&nbsp;&nbsp;&nbsp;t = 0.000 s&nbsp;&nbsp;&nbsp;0.000 rotations</b>",
            "x": 0.5,
            "font": {"size": 15},
        },
        scene={
            "xaxis": {"range": [-1.4, 1.4], "visible": False},
            "yaxis": {"range": [-1.4, 1.4], "visible": False},
            "zaxis": {"range": [-1.4, 1.4], "visible": False},
            "aspectmode": "cube",
            "camera": {"eye": {"x": 1.5, "y": 1.5, "z": 1.1}},
        },
        legend={"orientation": "h", "y": 1.05},
        # ── Play / Pause buttons live inside the Plotly chart ────────────
        # Clicking Play triggers Plotly.js animation — no Streamlit rerun.
        updatemenus=[{
            "type": "buttons",
            "showactive": False,
            "y": -0.07,
            "x": 0.5,
            "xanchor": "center",
            "yanchor": "top",
            "direction": "left",
            "buttons": [
                {
                    "label": "▶  Play",
                    "method": "animate",
                    "args": [
                        None,
                        {
                            "frame": {"duration": FRAME_MS, "redraw": True},
                            "fromcurrent": True,
                            "transition": {"duration": 0},
                        },
                    ],
                },
                {
                    "label": "⏸  Pause",
                    "method": "animate",
                    "args": [
                        [None],
                        {
                            "frame": {"duration": 0, "redraw": False},
                            "mode": "immediate",
                            "transition": {"duration": 0},
                        },
                    ],
                },
            ],
        }],
        # ── Scrub slider — lets the user jump to any frame ────────────────
        sliders=[{
            "active": 0,
            "currentvalue": {
                "prefix": "Frame ",
                "visible": True,
                "xanchor": "center",
                "font": {"size": 12},
            },
            "pad": {"t": 50, "b": 10},
            "len": 0.9,
            "x": 0.05,
            "steps": [
                {
                    "args": [
                        [str(i)],
                        {
                            "frame": {"duration": FRAME_MS, "redraw": True},
                            "mode": "immediate",
                            "transition": {"duration": 0},
                        },
                    ],
                    "label": "" if i % 30 != 0 else str(i),
                    "method": "animate",
                }
                for i in range(N_FRAMES)
            ],
        }],
    )

    return fig


def make_live_bloch_figure(
    bx: float,
    by: float,
    bz: float,
    trail_x: list,
    trail_y: list,
    trail_z: list,
) -> go.Figure:
    """3-D Bloch sphere for the live x-axis rotation simulation.

    Parameters
    ----------
    bx, by, bz : current tip of the Bloch vector
    trail_*    : lists of historical (x, y, z) positions (state trail)
    """
    sphere_x, sphere_y, sphere_z = _sphere_mesh()

    fig = go.Figure()

    # Transparent unit sphere — gives spatial context to the vector
    fig.add_trace(
        go.Surface(
            x=sphere_x,
            y=sphere_y,
            z=sphere_z,
            opacity=0.12,
            showscale=False,
            hoverinfo="skip",
            colorscale="Blues",
        )
    )

    # Coordinate axes so the viewer can orient themselves
    for ax, ay, az, label in [
        ([-1.2, 1.2], [0, 0], [0, 0], "x"),
        ([0, 0], [-1.2, 1.2], [0, 0], "y"),
        ([0, 0], [0, 0], [-1.2, 1.2], "z"),
    ]:
        fig.add_trace(
            go.Scatter3d(
                x=ax,
                y=ay,
                z=az,
                mode="lines+text",
                text=["", label],
                hoverinfo="skip",
                showlegend=False,
                line={"color": "grey", "width": 2},
            )
        )

    # Pole labels: |0⟩ is the north pole (z = +1), |1⟩ is the south pole
    fig.add_trace(
        go.Scatter3d(
            x=[0, 0],
            y=[0, 0],
            z=[1.3, -1.3],
            mode="text",
            text=["|0⟩", "|1⟩"],
            hoverinfo="skip",
            showlegend=False,
        )
    )

    # State trajectory — show the last 300 points so the trail stays readable
    tx = trail_x[-300:]
    ty = trail_y[-300:]
    tz = trail_z[-300:]
    fig.add_trace(
        go.Scatter3d(
            x=tx,
            y=ty,
            z=tz,
            mode="lines",
            name="Trajectory",
            line={"width": 4, "color": "royalblue"},
        )
    )

    # Bloch vector: arrow from origin to the current state
    fig.add_trace(
        go.Scatter3d(
            x=[0, bx],
            y=[0, by],
            z=[0, bz],
            mode="lines+markers",
            name="Bloch vector",
            marker={"size": [2, 8], "color": "crimson"},
            line={"width": 8, "color": "crimson"},
            hovertemplate=(
                "x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<extra></extra>"
            ),
        )
    )

    fig.update_layout(
        height=560,
        margin={"l": 0, "r": 0, "t": 10, "b": 0},
        scene={
            "xaxis": {"range": [-1.4, 1.4], "visible": False},
            "yaxis": {"range": [-1.4, 1.4], "visible": False},
            "zaxis": {"range": [-1.4, 1.4], "visible": False},
            "aspectmode": "cube",
            "camera": {"eye": {"x": 1.5, "y": 1.5, "z": 1.1}},
        },
        legend={"orientation": "h"},
    )
    return fig


def make_sequence_figure(result) -> go.Figure:
    boundaries = [
        (0.0, result.first_pulse_end_s, "Initial π/2 pulse"),
        (
            result.first_pulse_end_s,
            result.free_evolution_end_s,
            "Free evolution",
        ),
        (
            result.free_evolution_end_s,
            result.total_time_s,
            "Final π/2 pulse + readout",
        ),
    ]

    fig = go.Figure()
    for start, end, label in boundaries:
        fig.add_trace(
            go.Bar(
                x=[(end - start) * 1e6],
                y=["Ramsey sequence"],
                base=[start * 1e6],
                orientation="h",
                name=label,
                text=[label],
                textposition="inside",
                hovertemplate=(
                    f"{label}<br>start={start * 1e6:.3f} µs"
                    f"<br>end={end * 1e6:.3f} µs<extra></extra>"
                ),
            )
        )

    fig.update_layout(
        barmode="stack",
        height=150,
        margin={"l": 10, "r": 10, "t": 5, "b": 30},
        xaxis_title="Time (µs)",
        showlegend=False,
        yaxis={"visible": False},
    )
    return fig
