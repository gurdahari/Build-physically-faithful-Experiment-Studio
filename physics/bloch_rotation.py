import numpy as np


# Driving a two-level system resonantly around the x-axis is described by
# the Hamiltonian  H = (ω/2) σ_x.  In the rotating frame this produces a
# simple rotation of the Bloch vector in the y-z plane.
#
# Starting from |0⟩ (north pole, Bloch vector = (0, 0, 1)), the exact
# solution for ideal (no decoherence) evolution is:
#
#   θ(t) = ω · t          [rad]  — accumulated rotation angle
#   x(t) =  0                    — rotation axis is x; x-component stays 0
#   y(t) = −sin θ                — tips toward −y then returns
#   z(t) =  cos θ                — starts at 1 (north), sweeps to south
#
# The vector traces a great circle in the y-z plane and always has unit length:
#   |r|² = 0² + sin²θ + cos²θ = 1  (Pythagoras / trig identity)


def bloch_vector(t: float, omega: float) -> tuple[float, float, float]:
    """Return the Bloch-vector (x, y, z) for x-axis rotation at time t.

    Parameters
    ----------
    t     : simulation time in seconds  (t ≥ 0)
    omega : angular frequency ω in rad/s  (sets rotation speed)
    """
    # θ(t) = ω · t  — angle grows linearly with time and drive frequency
    theta = omega * t

    # x = 0  : the rotation is around the x-axis, so x never changes
    # y = −sin θ : second component of the great-circle trajectory
    # z =  cos θ : starts at 1 (|0⟩), reaches −1 (|1⟩) at θ = π
    return 0.0, float(-np.sin(theta)), float(np.cos(theta))


# ── Arbitrary-axis single-shot rotations (pulses) ─────────────────────────────
#
# A quantum gate U = exp(−i θ/2 σ_axis) acts on the Bloch sphere as the
# SO(3) rotation R_axis(θ).  The rotation matrices are:
#
#   Rx(θ) = [[1,  0,      0    ],    (y-z plane rotation, x invariant)
#             [0,  cos θ, −sin θ],
#             [0,  sin θ,  cos θ]]
#
#   Ry(θ) = [[ cos θ, 0, sin θ],    (z-x plane rotation, y invariant)
#             [ 0,     1, 0    ],
#             [−sin θ, 0, cos θ]]
#
#   Rz(θ) = [[cos θ, −sin θ, 0],    (x-y plane rotation, z invariant)
#             [sin θ,  cos θ, 0],
#             [0,      0,     1]]
#
# Positive θ follows the right-hand rule for each axis.


def rotation_matrix(axis: str, angle: float) -> np.ndarray:
    """Return the 3×3 SO(3) rotation matrix for angle radians around axis."""
    c, s = np.cos(angle), np.sin(angle)
    if axis == "x":
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=float)
    if axis == "y":
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=float)
    if axis == "z":
        return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=float)
    raise ValueError(f"axis must be 'x', 'y', or 'z', got {axis!r}")


def apply_rotation(
    state: tuple[float, float, float],
    axis: str,
    angle: float,
) -> tuple[float, float, float]:
    """Rotate the Bloch vector state by angle radians around axis.

    r_new = R_axis(angle) · r_old

    The result is renormalised to guard against accumulated floating-point
    drift after many successive pulses.
    """
    v = rotation_matrix(axis, angle) @ np.array(state, dtype=float)
    norm = np.linalg.norm(v)
    if norm > 1e-12:
        v /= norm   # keep the vector exactly on the unit sphere
    return float(v[0]), float(v[1]), float(v[2])
