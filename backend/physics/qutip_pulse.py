"""
QuTiP-based time-dependent pulse simulation.

Physics (identical to the custom RK4 solver):
  H(t) = 0.5 * [Ω(t)cos(φ) σx + Ω(t)sin(φ) σy + Δ σz]   (ħ = 1)

Initial density matrix from Bloch vector (x, y, z):
  ρ₀ = 0.5 * (I + x σx + y σy + z σz)

Bloch trajectory extracted from expectation values:
  r(t) = (⟨σx⟩(t), ⟨σy⟩(t), ⟨σz⟩(t))

Uses mesolve with no collapse operators → purely unitary evolution.
Mixed initial states (|r| < 1) are handled naturally via the density matrix.
"""

from __future__ import annotations

import math
from typing import Literal

import numpy as np

Vec3 = list[float]

COMPARISON_TOLERANCE: float = 1e-3


# ── Density matrix helpers ────────────────────────────────────────────────────

def _build_rho0(x: float, y: float, z: float):
    """Build 2×2 density matrix from Bloch-vector components."""
    from qutip import qeye, sigmax, sigmay, sigmaz
    return 0.5 * (qeye(2) + x * sigmax() + y * sigmay() + z * sigmaz())


def _build_envelope(pulse_shape: str, amplitude: float, duration: float,
                    sigma: float | None):
    """Return a closure Ω(t) for the chosen pulse shape (no args param)."""
    if pulse_shape == "square":
        return lambda t: float(amplitude)
    else:
        eff_sigma = sigma if (sigma is not None and sigma > 0) else duration / 6
        t_center = duration / 2
        inv2s2 = 1.0 / (2.0 * eff_sigma * eff_sigma)
        return lambda t: float(amplitude * math.exp(-((t - t_center) ** 2) * inv2s2))


# ── QuTiP simulation ──────────────────────────────────────────────────────────

def simulate_qutip_pulse(
    pulse_shape: Literal["square", "gaussian"],
    amplitude: float,
    phase: float,
    detuning: float,
    duration: float,
    initial_bloch: Vec3,
    number_of_steps: int = 500,
    sigma: float | None = None,
) -> dict:
    """
    Simulate time-dependent pulse using QuTiP's mesolve (Lindblad ME, c_ops=[]).

    Returns: times, trajectory, final_state, pulse_envelope, pulse_area,
             max_amplitude, solver_name, qutip_version.
    """
    import qutip
    from qutip import mesolve, sigmax, sigmay, sigmaz

    x, y, z = initial_bloch
    rho0 = _build_rho0(x, y, z)

    cos_phi = math.cos(phase)
    sin_phi = math.sin(phase)
    envelope = _build_envelope(pulse_shape, amplitude, duration, sigma)

    # H(t) = H_static + H_drive · Ω(t)
    H_static = 0.5 * float(detuning) * sigmaz()
    H_drive  = 0.5 * (float(cos_phi) * sigmax() + float(sin_phi) * sigmay())
    H = [H_static, [H_drive, envelope]]

    tlist  = np.linspace(0.0, duration, number_of_steps)
    e_ops  = [sigmax(), sigmay(), sigmaz()]
    result = mesolve(H, rho0, tlist, c_ops=[], e_ops=e_ops)

    ex = np.real(result.expect[0])
    ey = np.real(result.expect[1])
    ez = np.real(result.expect[2])

    trajectory   = [[float(ex[i]), float(ey[i]), float(ez[i])] for i in range(len(tlist))]
    envelope_arr = [float(envelope(t)) for t in tlist]

    # Pure-Python trapezoidal integration (avoids numpy 2.x np.trapz deprecation)
    pulse_area = sum(
        (envelope_arr[i] + envelope_arr[i + 1]) / 2.0 * (float(tlist[i + 1]) - float(tlist[i]))
        for i in range(len(tlist) - 1)
    )

    return {
        "times":          [float(t) for t in tlist],
        "trajectory":     trajectory,
        "final_state":    trajectory[-1],
        "pulse_envelope": envelope_arr,
        "pulse_area":     float(pulse_area),
        "max_amplitude":  float(max(abs(v) for v in envelope_arr)),
        "solver_name":    "qutip",
        "qutip_version":  qutip.__version__,
    }


# ── Cross-solver comparison ───────────────────────────────────────────────────

def compare_solvers(
    pulse_shape: Literal["square", "gaussian"],
    amplitude: float,
    phase: float,
    detuning: float,
    duration: float,
    initial_bloch: Vec3,
    number_of_steps: int = 200,
    sigma: float | None = None,
) -> dict:
    """Run custom RK4 and QuTiP on the same input and return a comparison dict."""
    from .pulse import simulate_time_dependent_pulse
    import qutip

    custom = simulate_time_dependent_pulse(
        pulse_shape=pulse_shape, amplitude=amplitude, phase=phase,
        detuning=detuning, duration=duration, initial_bloch=initial_bloch,
        number_of_steps=number_of_steps, sigma=sigma,
    )
    qt = simulate_qutip_pulse(
        pulse_shape=pulse_shape, amplitude=amplitude, phase=phase,
        detuning=detuning, duration=duration, initial_bloch=initial_bloch,
        number_of_steps=number_of_steps, sigma=sigma,
    )

    cf = custom["final_state"]
    qf = qt["final_state"]

    final_diff = math.sqrt(sum((a - b) ** 2 for a, b in zip(cf, qf)))

    max_traj_diff = max(
        math.sqrt(sum((a - b) ** 2 for a, b in zip(cv, qv)))
        for cv, qv in zip(custom["trajectory"], qt["trajectory"])
    )

    custom_norm = math.sqrt(sum(c * c for c in cf))
    qutip_norm  = math.sqrt(sum(c * c for c in qf))

    return {
        "times":               custom["times"],
        "custom_trajectory":   custom["trajectory"],
        "qutip_trajectory":    qt["trajectory"],
        "custom_final_state":  cf,
        "qutip_final_state":   qf,
        "final_state_diff":    final_diff,
        "max_trajectory_diff": max_traj_diff,
        "custom_bloch_norm":   custom_norm,
        "qutip_bloch_norm":    qutip_norm,
        "passed":              final_diff < COMPARISON_TOLERANCE,
        "tolerance":           COMPARISON_TOLERANCE,
        "qutip_version":       qutip.__version__,
    }
