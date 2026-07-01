"""
Bloch sphere rotation physics — pure functions, no I/O.

Rotation matrices match blochPhysics.js exactly so JS and Python
results can be compared to floating-point precision:

  R_x(θ): [x,  c·y − s·z,  s·y + c·z]
  R_y(θ): [c·x + s·z,  y,  −s·x + c·z]
  R_z(θ): [c·x − s·y,  s·x + c·y,  z]

where c = cos(θ), s = sin(θ).
"""

from __future__ import annotations

import math
from typing import Literal

Axis = Literal["x", "y", "z"]
Vec3 = list[float]


def apply_rotation(axis: Axis, theta: float, vec: Vec3) -> Vec3:
    x, y, z = vec
    c = math.cos(theta)
    s = math.sin(theta)
    if axis == "x":
        return [x, c * y - s * z, s * y + c * z]
    if axis == "y":
        return [c * x + s * z, y, -s * x + c * z]
    if axis == "z":
        return [c * x - s * y, s * x + c * y, z]
    raise ValueError(f"Unknown axis: {axis!r}")


def apply_free_evolution(omega0: float, tau: float, vec: Vec3) -> Vec3:
    """H₀ = (ℏω₀/2)σz free evolution for duration tau → Z-rotation by omega0·tau."""
    return apply_rotation("z", omega0 * tau, vec)


def norm_sq(vec: Vec3) -> float:
    return vec[0] ** 2 + vec[1] ** 2 + vec[2] ** 2
