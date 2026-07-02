"""
Unified experiment simulation using QuTiP as the authoritative physics engine.

Supports both unitary (closed-system) and open-system (Lindblad) evolution.

Collapse operators for T1 / T2 decoherence:

    C_down = sqrt(γ_down) · σ+         energy relaxation toward equilibrium
    C_up   = sqrt(γ_up)   · σ-         thermal excitation (zero at T=0)
    C_phi  = sqrt(1/(2T_φ)) · σz       pure dephasing

where:
    γ_down    = (1/T1) · (1 + z_eq) / 2
    γ_up      = (1/T1) · (1 - z_eq) / 2
    1/T_φ     = 1/T2 − 1/(2·T1)          (Tφ derived, not user-entered)

Constraint: T2 ≤ 2·T1  →  1/T_φ ≥ 0.
"""

from __future__ import annotations

import math
from typing import Literal, Optional

import numpy as np

Vec3 = list[float]

QUALITY_STEPS: dict[str, int] = {
    "preview":  50,
    "standard": 200,
    "high":     1000,
}


# ── Density-matrix helpers ────────────────────────────────────────────────────

def _build_rho0(x: float, y: float, z: float):
    from qutip import qeye, sigmax, sigmay, sigmaz
    return 0.5 * (qeye(2) + x * sigmax() + y * sigmay() + z * sigmaz())


def _pulse_envelope(pulse_shape: str, amplitude: float, duration: float, sigma):
    if pulse_shape == "square":
        return lambda t: float(amplitude)
    eff_sigma = sigma if (sigma is not None and sigma > 0) else duration / 6.0
    t_center = duration / 2.0
    inv2s2 = 1.0 / (2.0 * eff_sigma * eff_sigma)
    return lambda t: float(amplitude * math.exp(-((t - t_center) ** 2) * inv2s2))


def _bloch_from_states(states, sx, sy, sz):
    from qutip import expect
    ex = np.real(expect(sx, states))
    ey = np.real(expect(sy, states))
    ez = np.real(expect(sz, states))
    return ex, ey, ez


# ── Collapse operators ────────────────────────────────────────────────────────

def _build_collapse_operators(T1: float, T2: float, equilibrium_z: float) -> list:
    """
    Build Lindblad collapse operators.

    QuTiP convention: |0⟩ is north pole (z=+1), |1⟩ is south pole (z=−1).
      sigmap() = |0⟩⟨1| → lowers excited (|1⟩) to ground (|0⟩)  [σ+ in index space]
      sigmam() = |1⟩⟨0| → raises ground  (|0⟩) to excited (|1⟩) [σ− in index space]
    """
    from qutip import sigmap, sigmam, sigmaz

    c_ops = []

    gamma_down = (1.0 / T1) * (1.0 + equilibrium_z) / 2.0
    gamma_up   = (1.0 / T1) * (1.0 - equilibrium_z) / 2.0

    if gamma_down > 1e-20:
        c_ops.append(math.sqrt(gamma_down) * sigmap())

    if gamma_up > 1e-20:
        c_ops.append(math.sqrt(gamma_up) * sigmam())

    # Pure dephasing: 1/T_phi = 1/T2 − 1/(2*T1)
    inv_T_phi = 1.0 / T2 - 1.0 / (2.0 * T1)
    if inv_T_phi > 1e-20:
        gamma_phi = inv_T_phi / 2.0          # = 1 / (2·T_phi)
        c_ops.append(math.sqrt(gamma_phi) * sigmaz())

    return c_ops


# ── Per-step and final diagnostics ───────────────────────────────────────────

def _step_diagnostics(ex: np.ndarray, ey: np.ndarray, ez: np.ndarray) -> dict:
    """Compute diagnostic time series from Bloch component arrays."""
    r_sq = ex**2 + ey**2 + ez**2
    return {
        "purity":      ((1.0 + r_sq) / 2.0).tolist(),
        "bloch_norm":  np.sqrt(np.clip(r_sq, 0.0, None)).tolist(),
        "pop0":        ((1.0 + ez) / 2.0).tolist(),
        "pop1":        ((1.0 - ez) / 2.0).tolist(),
        "coherence":   np.sqrt(np.clip(ex**2 + ey**2, 0.0, None)).tolist(),
        "trace_check": np.ones(len(ex)).tolist(),
    }


def _final_diagnostics(rho, final_state: Vec3) -> dict:
    """Compute final-state density-matrix diagnostics."""
    x, y, z = final_state
    r = math.sqrt(x*x + y*y + z*z)
    evals = sorted(
        np.real(np.linalg.eigvalsh(rho.full())).tolist(),
        reverse=True,
    )
    return {
        "trace":       float(np.real(rho.tr())),
        "purity":      (1.0 + r * r) / 2.0,
        "bloch_norm":  r,
        "eigenvalues": evals,
    }


# ── Projective measurement (distinct from continuous acquisition) ─────────────

def _sample_projective_measurement(final_state: Vec3) -> dict:
    """Sample a single projective Z-basis measurement outcome for the final state.

    Uses the Born rule P(|0⟩) = (1 + z)/2 with QuTiP's convention |0⟩ = z=+1.
    A backend-generated sampled outcome (0 → |0⟩, 1 → |1⟩) is returned alongside
    the probabilities so the frontend can show a genuine collapse result rather
    than reusing the continuous-signal animation.
    """
    z = float(final_state[2])
    p0 = max(0.0, min(1.0, (1.0 + z) / 2.0))
    p1 = 1.0 - p0
    rng = np.random.default_rng()
    outcome = 0 if rng.random() < p0 else 1
    return {
        "basis":   "z",
        "p0":      p0,
        "p1":      p1,
        "outcome": outcome,
        "label":   "|0⟩" if outcome == 0 else "|1⟩",
    }


# ── Classical drive-field helper ─────────────────────────────────────────────

def _field_at_tlist(item: dict, tlist: np.ndarray) -> list[list[float]]:
    """Return [[Ωx, Ωy, Δ], ...] — classical effective-field vector at each time step.

    This evaluates the *input* control signal only; the quantum evolution (ρ(t))
    is still computed exclusively by mesolve.  Free-evolution items have Ωx=Ωy=0.
    """
    if item["type"] == "free":
        omega0 = float(item.get("omega0", 0.0))
        return [[0.0, 0.0, omega0]] * len(tlist)

    amplitude   = float(item.get("amplitude", 0.0))
    phase       = float(item.get("phase",     0.0))
    detuning    = float(item.get("detuning",  0.0))
    duration    = float(item["duration"])
    envelope    = _pulse_envelope(
        item.get("pulse_shape", "square"), amplitude, duration, item.get("sigma")
    )
    cos_phi, sin_phi = math.cos(phase), math.sin(phase)
    env_vals = [float(envelope(t)) for t in tlist]
    return [[env_vals[i] * cos_phi, env_vals[i] * sin_phi, detuning] for i in range(len(tlist))]


# ── Main simulation ───────────────────────────────────────────────────────────

def simulate_experiment(
    initial_bloch: Vec3,
    sequence: list[dict],
    quality: Literal["preview", "standard", "high"] = "standard",
    enable_decoherence: bool = False,
    T1: Optional[float] = None,
    T2: Optional[float] = None,
    equilibrium_z: float = 1.0,
) -> dict:
    import qutip
    from qutip import mesolve, sigmax, sigmay, sigmaz

    n_per_item = QUALITY_STEPS[quality]
    sx, sy, sz = sigmax(), sigmay(), sigmaz()

    # Build collapse operators once; shared by every mesolve call.
    c_ops: list = []
    if enable_decoherence and T1 is not None and T2 is not None:
        c_ops = _build_collapse_operators(T1, T2, equilibrium_z)

    # Global accumulators
    all_times:          list[float]       = []
    all_trajectory:     list[Vec3]        = []
    all_field_traj:     list[list[float]] = []
    all_item_index:     list[int]         = []
    all_local_progress: list[float]       = []
    state_after_items:  list[Vec3]        = []

    _diag_keys = ("purity", "bloch_norm", "pop0", "pop1", "coherence", "trace_check")
    all_diag: dict[str, list[float]] = {k: [] for k in _diag_keys}

    x0, y0, z0 = initial_bloch
    rho = _build_rho0(x0, y0, z0)
    last_rho = rho
    time_offset = 0.0

    for item_idx, item in enumerate(sequence):
        item_type = item["type"]
        duration  = float(item["duration"])
        tlist     = np.linspace(0.0, duration, n_per_item)

        if item_type == "pulse":
            amplitude   = float(item.get("amplitude", 0.0))
            phase       = float(item.get("phase",     0.0))
            detuning    = float(item.get("detuning",  0.0))
            pulse_shape = item.get("pulse_shape", "square")
            sigma       = item.get("sigma", None)

            cos_phi  = math.cos(phase)
            sin_phi  = math.sin(phase)
            envelope = _pulse_envelope(pulse_shape, amplitude, duration, sigma)

            H_static = 0.5 * detuning * sz
            H_drive  = 0.5 * (cos_phi * sx + sin_phi * sy)
            H = [H_static, [H_drive, envelope]]

        else:  # free evolution
            omega0 = float(item.get("omega0", 0.0))
            H = 0.5 * omega0 * sz

        result = mesolve(H, rho, tlist, c_ops=c_ops, e_ops=[])
        states = result.states

        ex, ey, ez = _bloch_from_states(states, sx, sy, sz)
        item_diag  = _step_diagnostics(ex, ey, ez)

        item_fld = _field_at_tlist(item, tlist)
        start = 1 if item_idx > 0 else 0
        for i in range(start, n_per_item):
            local_t  = float(tlist[i])
            progress = local_t / duration if duration > 1e-15 else 1.0
            all_times.append(time_offset + local_t)
            all_trajectory.append([float(ex[i]), float(ey[i]), float(ez[i])])
            all_field_traj.append(item_fld[i])
            all_item_index.append(item_idx)
            all_local_progress.append(progress)
            for k in _diag_keys:
                all_diag[k].append(item_diag[k][i])

        final_bloch: Vec3 = [float(ex[-1]), float(ey[-1]), float(ez[-1])]
        state_after_items.append(final_bloch)

        last_rho     = states[-1]
        rho          = last_rho
        time_offset += duration

    final_state = state_after_items[-1] if state_after_items else list(initial_bloch)

    # ── Detector signal (continuous acquisition observable) ──────────────────
    # For an NMR-like experiment the detector picks up the transverse
    # magnetization: the quadrature signal (<σx>, <σy>).  These are exactly the
    # already-computed Bloch x/y components — derived here in the response layer
    # so the frontend never re-derives detector physics.
    #   signal_real(t)      = <σx>(t) = trajectory_x
    #   signal_imag(t)      = <σy>(t) = trajectory_y
    #   signal_magnitude(t) = √(signal_real² + signal_imag²)   (== coherence)
    # Normalized representative ensemble signal: |signal| ≤ 1 (no physical
    # voltage scale is defined for a single spin-½).
    det_real = [p[0] for p in all_trajectory]
    det_imag = [p[1] for p in all_trajectory]
    det_mag  = [math.hypot(p[0], p[1]) for p in all_trajectory]

    measurement_sample = _sample_projective_measurement(final_state)

    return {
        "times":             all_times,
        "trajectory":        all_trajectory,
        "field_trajectory":  all_field_traj,
        "item_index":        all_item_index,
        "local_progress":    all_local_progress,
        "state_after_items": state_after_items,
        "final_state":       final_state,
        "total_duration":    time_offset,
        "solver_info":       {"solver": "qutip", "version": qutip.__version__},
        # Diagnostic arrays (always present; meaningful even for unitary evolution)
        **all_diag,
        "final_diagnostics": _final_diagnostics(last_rho, final_state),
        # Detector signal (continuous acquisition) — same time indexing as trajectory
        "detector_signal_real":      det_real,
        "detector_signal_imag":      det_imag,
        "detector_signal_magnitude": det_mag,
        # Projective measurement of the final state (Z basis) — backend-sampled outcome
        "measurement_sample":        measurement_sample,
    }
