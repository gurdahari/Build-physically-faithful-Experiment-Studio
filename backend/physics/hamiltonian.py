"""
General single-qubit Hamiltonian evolution on the Bloch sphere.

  H = (ħ/2)(Ωx σx + Ωy σy + Ωz σz)

The Bloch vector evolves as a rigid-body rotation:
  n̂ = Ω / |Ω|        rotation axis
  θ(t) = |Ω| · t     rotation angle at time t

Rodrigues' formula is used for the arbitrary-axis rotation so the result is
identical (to floating-point precision) to the SO(3) matrices in blochPhysics.js
for the special cases x / y / z.

When |Ω| = 0 the state is constant for all t.
"""

from __future__ import annotations

import math

from .bloch import Vec3


def _rodrigues(n_hat: Vec3, theta: float, vec: Vec3) -> Vec3:
    """Rotate vec around unit axis n_hat by angle theta.

    Matches R_x / R_y / R_z from blochPhysics.js when n_hat is a cardinal axis:
      n̂=(1,0,0) → x', y'=c·y−s·z, z'=s·y+c·z  (R_x)
      n̂=(0,1,0) → x'=c·x+s·z, y', z'=−s·x+c·z  (R_y)
      n̂=(0,0,1) → x'=c·x−s·y, y'=s·x+c·y, z'    (R_z)
    """
    nx, ny, nz = n_hat
    vx, vy, vz = vec
    c = math.cos(theta)
    s = math.sin(theta)
    dot = nx * vx + ny * vy + nz * vz
    cx  = ny * vz - nz * vy
    cy  = nz * vx - nx * vz
    cz  = nx * vy - ny * vx
    f   = (1.0 - c) * dot
    return [vx * c + cx * s + nx * f,
            vy * c + cy * s + ny * f,
            vz * c + cz * s + nz * f]


def simulate_hamiltonian(
    omega_x: float,
    omega_y: float,
    omega_z: float,
    duration: float,
    initial_bloch: Vec3,
    number_of_steps: int = 100,
) -> dict:
    """
    Simulate Bloch-vector trajectory under H = (ħ/2)(Ωx σx + Ωy σy + Ωz σz).

    Returns:
      times          — uniformly spaced from 0 to duration (number_of_steps points)
      trajectory     — Bloch vector at each time (list of [x,y,z])
      final_state    — trajectory[-1]
      rotation_axis  — n̂ = Ω/|Ω|, or None when |Ω| = 0
      total_angle    — |Ω| · duration (radians)
      omega_magnitude — |Ω| (rad/s)
    """
    omega_mag   = math.sqrt(omega_x**2 + omega_y**2 + omega_z**2)
    total_angle = omega_mag * duration

    if omega_mag < 1e-15:
        times = [i / (number_of_steps - 1) * duration for i in range(number_of_steps)]
        const = list(initial_bloch)
        return {
            "times":           times,
            "trajectory":      [const for _ in range(number_of_steps)],
            "final_state":     const,
            "rotation_axis":   None,
            "total_angle":     0.0,
            "omega_magnitude": 0.0,
        }

    n_hat: Vec3 = [omega_x / omega_mag,
                   omega_y / omega_mag,
                   omega_z / omega_mag]

    times: list[float] = []
    traj:  list[Vec3]  = []
    n = number_of_steps
    for i in range(n):
        t = i / (n - 1) * duration
        times.append(t)
        traj.append(_rodrigues(n_hat, omega_mag * t, list(initial_bloch)))

    return {
        "times":           times,
        "trajectory":      traj,
        "final_state":     list(traj[-1]),
        "rotation_axis":   n_hat,
        "total_angle":     total_angle,
        "omega_magnitude": omega_mag,
    }
