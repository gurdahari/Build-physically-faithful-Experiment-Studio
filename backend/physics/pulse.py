"""
Time-dependent single-qubit pulse simulation.

Physics model:
  H(t) = (ħ/2)[Ω(t)cos(φ) σx + Ω(t)sin(φ) σy + Δ σz]

The Bloch equation dr/dt = Ω_eff(t) × r is integrated with RK4,
where Ω_eff(t) = (Ω(t)cosφ, Ω(t)sinφ, Δ).

Supported envelope shapes:
  square:   Ω(t) = amplitude
  gaussian: Ω(t) = amplitude · exp[−(t − T/2)² / (2σ²)]

The rotation axis direction is constant (cos φ, sin φ, Δ/|Ω_eff|), so
for resonant pulses (Δ=0) the trajectory is a great-circle arc.
"""

from __future__ import annotations

import math
from typing import Callable, Literal

Vec3 = list[float]


# ── Pulse envelope callables ───────────────────────────────────────────────────

def _square(amplitude: float) -> Callable[[float], float]:
    return lambda _t: amplitude


def _gaussian(amplitude: float, t_center: float, sigma: float) -> Callable[[float], float]:
    inv2s2 = 1.0 / (2.0 * sigma * sigma)
    return lambda t: amplitude * math.exp(-((t - t_center) ** 2) * inv2s2)


# ── Bloch equation and RK4 ────────────────────────────────────────────────────

def _rhs(t: float, r: Vec3, omega_fn: Callable[[float], float],
         cos_phi: float, sin_phi: float, delta: float) -> Vec3:
    """dr/dt = Ω_eff(t) × r."""
    omega_t = omega_fn(t)
    ex, ey, ez = omega_t * cos_phi, omega_t * sin_phi, delta
    rx, ry, rz = r
    return [ey * rz - ez * ry,
            ez * rx - ex * rz,
            ex * ry - ey * rx]


def _rk4(t: float, r: Vec3, dt: float,
         f: Callable[[float, Vec3], Vec3]) -> Vec3:
    k1 = f(t,       r)
    k2 = f(t+dt/2, [r[i] + dt/2 * k1[i] for i in range(3)])
    k3 = f(t+dt/2, [r[i] + dt/2 * k2[i] for i in range(3)])
    k4 = f(t+dt,   [r[i] + dt   * k3[i] for i in range(3)])
    return [r[i] + dt/6 * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]) for i in range(3)]


def _trapz(y: list[float], x: list[float]) -> float:
    return sum((y[i] + y[i+1]) / 2.0 * (x[i+1] - x[i]) for i in range(len(x) - 1))


# ── Main simulation ───────────────────────────────────────────────────────────

def simulate_time_dependent_pulse(
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
    Integrate dr/dt = Ω_eff(t) × r using RK4.

    Returns a dict with:
      times, pulse_envelope, effective_field, trajectory,
      final_state, pulse_area, max_amplitude
    """
    cos_phi = math.cos(phase)
    sin_phi = math.sin(phase)

    if pulse_shape == "square":
        omega_fn = _square(amplitude)
    else:
        eff_sigma = sigma if (sigma is not None and sigma > 0) else duration / 6
        omega_fn = _gaussian(amplitude, duration / 2, eff_sigma)

    def f(t: float, r: Vec3) -> Vec3:
        return _rhs(t, r, omega_fn, cos_phi, sin_phi, detuning)

    n  = number_of_steps
    dt = duration / (n - 1)

    times:      list[float] = []
    envelope:   list[float] = []
    eff_field:  list[Vec3]  = []
    trajectory: list[Vec3]  = []

    r: Vec3 = list(initial_bloch)

    for i in range(n):
        t       = i / (n - 1) * duration
        omega_t = omega_fn(t)
        times.append(t)
        envelope.append(omega_t)
        eff_field.append([omega_t * cos_phi, omega_t * sin_phi, detuning])
        trajectory.append(list(r))
        if i < n - 1:
            r = _rk4(t, r, dt, f)

    return {
        "times":           times,
        "pulse_envelope":  envelope,
        "effective_field": eff_field,
        "trajectory":      trajectory,
        "final_state":     list(trajectory[-1]),
        "pulse_area":      _trapz(envelope, times),
        "max_amplitude":   max(abs(v) for v in envelope),
    }
