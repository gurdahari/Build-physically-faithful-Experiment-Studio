"""
Analytic nonrelativistic hydrogenic wavefunctions ψₙₗₘ = Rₙₗ(r) Yₗᵐ(θ,φ).

Authoritative complex amplitudes are retained (never reduced to density only).

Conventions
-----------
- Radial Rₙₗ normalized as ∫₀^∞ Rₙₗ(r)² r² dr = 1, using the reduced-mass Bohr
  radius aμ (constants.A_MU).  ρ = 2r/(n·aμ); Laguerre = generalized L_k^(α).
- Spherical harmonics Yₗᵐ orthonormal on the sphere with the Condon–Shortley
  phase (explicit closed forms for l ≤ 1, which covers the supported basis).
- No 3-D PDE is solved: these are validated closed-form analytic expressions.

Gradients are analytic (exact), so probability current is exact and free of
finite-difference node artefacts.  A finite-difference gradient utility is also
provided (isolated, spacing-declared) for the continuity-equation cross-check.
"""

from __future__ import annotations

import math
import numpy as np
from scipy.special import eval_genlaguerre, factorial

from . import constants as C

_A = C.A_MU
_EPS = 1e-14                    # radius floor to guard 0/0 at the origin
_INV_SQRT_4PI = 1.0 / math.sqrt(4.0 * math.pi)
_SQRT_3_4PI = math.sqrt(3.0 / (4.0 * math.pi))
_SQRT_3_8PI = math.sqrt(3.0 / (8.0 * math.pi))


def validate_quantum_numbers(n: int, l: int, m: int) -> None:
    if not (isinstance(n, (int, np.integer)) and isinstance(l, (int, np.integer)) and isinstance(m, (int, np.integer))):
        raise ValueError("quantum numbers n, l, m must be integers")
    if n < 1:
        raise ValueError(f"invalid n={n}: require n >= 1")
    if not (0 <= l <= n - 1):
        raise ValueError(f"invalid l={l} for n={n}: require 0 <= l <= n-1")
    if not (-l <= m <= l):
        raise ValueError(f"invalid m={m} for l={l}: require -l <= m <= l")
    if l > 1:
        raise NotImplementedError("Milestone 2 exposes l ≤ 1 (s, p) only")


def _require_finite(*vals) -> None:
    for v in vals:
        if not np.all(np.isfinite(v)):
            raise ValueError("non-finite coordinate input")


# ── Radial function and its derivative ────────────────────────────────────────
def _radial_norm(n: int, l: int) -> float:
    k = n - l - 1
    return math.sqrt((2.0 / (n * _A)) ** 3 * factorial(k) / (2.0 * n * factorial(n + l)))


def R_nl(n: int, l: int, r):
    """Normalized radial function Rₙₗ(r) [m^-3/2]; r in metres (array or scalar)."""
    r = np.asarray(r, dtype=float)
    k = n - l - 1
    N = _radial_norm(n, l)
    rho = 2.0 * r / (n * _A)
    lag = eval_genlaguerre(k, 2 * l + 1, rho)
    return N * np.exp(-rho / 2.0) * rho**l * lag


def dR_nl(n: int, l: int, r):
    """Analytic dRₙₗ/dr [m^-5/2]."""
    r = np.asarray(r, dtype=float)
    k = n - l - 1
    N = _radial_norm(n, l)
    drho_dr = 2.0 / (n * _A)
    rho = np.maximum(2.0 * r / (n * _A), _EPS)
    lag = eval_genlaguerre(k, 2 * l + 1, rho)
    term = (-0.5 * rho**l) * lag
    if l >= 1:
        term = term + l * rho ** (l - 1) * lag
    if k >= 1:
        term = term - rho**l * eval_genlaguerre(k - 1, 2 * l + 2, rho)
    return N * drho_dr * np.exp(-rho / 2.0) * term


# ── Spherical harmonics (Condon–Shortley phase; l ≤ 1) ───────────────────────
def Y_lm(l: int, m: int, theta, phi):
    """Orthonormal Yₗᵐ(θ,φ) with the Condon–Shortley phase; complex."""
    theta = np.asarray(theta, dtype=float)
    phi = np.asarray(phi, dtype=float)
    if l == 0:
        return np.full(np.broadcast(theta, phi).shape, _INV_SQRT_4PI, dtype=complex) \
            if theta.shape or phi.shape else complex(_INV_SQRT_4PI)
    if l == 1:
        if m == 0:
            return (_SQRT_3_4PI * np.cos(theta)).astype(complex)
        s = 1.0 if m == 1 else -1.0
        pref = -_SQRT_3_8PI if m == 1 else _SQRT_3_8PI
        return pref * np.sin(theta) * np.exp(1j * s * phi)
    raise NotImplementedError("Y_lm implemented for l ≤ 1")


# ── Coordinate conversion ─────────────────────────────────────────────────────
def cartesian_to_spherical(x, y, z):
    x = np.asarray(x, float); y = np.asarray(y, float); z = np.asarray(z, float)
    r = np.sqrt(x * x + y * y + z * z)
    safe_r = np.where(r < _EPS, 1.0, r)
    theta = np.arccos(np.clip(z / safe_r, -1.0, 1.0))
    theta = np.where(r < _EPS, 0.0, theta)
    phi = np.arctan2(y, x)
    return r, theta, phi


# ── Wavefunction ──────────────────────────────────────────────────────────────
def psi_spherical(n: int, l: int, m: int, r, theta, phi):
    validate_quantum_numbers(n, l, m)
    _require_finite(r, theta, phi)
    return R_nl(n, l, r) * Y_lm(l, m, theta, phi)


def _angular_cartesian(l: int, m: int, x, y, z, r):
    """Yₗᵐ written directly in Cartesian form so angular nodes are exact
    (avoids arccos/cos round-off at z=0 and on the polar axis)."""
    if l == 0:
        base = np.zeros(np.asarray(r).shape, dtype=complex) if np.asarray(r).shape else 0j
        return base + _INV_SQRT_4PI
    safe_r = np.where(r < _EPS, 1.0, r)
    zero = r < _EPS
    if m == 0:
        return _SQRT_3_4PI * np.where(zero, 0.0, z / safe_r) + 0j
    s = 1.0 if m == 1 else -1.0
    pref = -_SQRT_3_8PI if m == 1 else _SQRT_3_8PI
    ang = (x + s * 1j * y) / safe_r
    return pref * np.where(zero, 0.0, ang)


def psi_cartesian(n: int, l: int, m: int, x, y, z):
    validate_quantum_numbers(n, l, m)
    _require_finite(x, y, z)
    x = np.asarray(x, float); y = np.asarray(y, float); z = np.asarray(z, float)
    r = np.sqrt(x * x + y * y + z * z)
    return R_nl(n, l, r) * _angular_cartesian(l, m, x, y, z, r)


# ── Analytic gradient ∇ψ in Cartesian coordinates (complex 3-vector) ─────────
def grad_psi_cartesian(n: int, l: int, m: int, x, y, z):
    """Return (∂xψ, ∂yψ, ∂zψ) analytically; safe at r=0 and on the polar axis."""
    validate_quantum_numbers(n, l, m)
    _require_finite(x, y, z)
    x = np.asarray(x, float); y = np.asarray(y, float); z = np.asarray(z, float)
    r = np.sqrt(x * x + y * y + z * z)
    small = r < _EPS
    safe_r = np.where(small, 1.0, r)
    Rr = R_nl(n, l, r)
    Rp = dR_nl(n, l, r)
    # Radial unit vector, zeroed at the origin (s-state cusp handled as 0).
    rhat = (np.where(small, 0.0, x / safe_r),
            np.where(small, 0.0, y / safe_r),
            np.where(small, 0.0, z / safe_r))

    if l == 0:
        g = _INV_SQRT_4PI * Rp
        return (g * rhat[0] + 0j, g * rhat[1] + 0j, g * rhat[2] + 0j)

    u = Rr / safe_r                                   # Rₙₗ/r (finite for l ≥ 1)
    up = (Rp * safe_r - Rr) / (safe_r * safe_r)       # d/dr (Rₙₗ/r)
    up = np.where(small, 0.0, up)

    if l == 1 and m == 0:
        A = _SQRT_3_4PI
        gx = A * z * up * rhat[0]
        gy = A * z * up * rhat[1]
        gz = A * (u + z * up * rhat[2])
        return (gx + 0j, gy + 0j, gz + 0j)

    # l == 1, m == ±1 :  ψ = coef · (x ± i y) · u(r)
    s = 1.0 if m == 1 else -1.0
    coef = -_SQRT_3_8PI if m == 1 else _SQRT_3_8PI
    w = x + s * 1j * y
    gx = coef * (u * 1.0 + w * up * rhat[0])
    gy = coef * (u * (s * 1j) + w * up * rhat[1])
    gz = coef * (w * up * rhat[2])
    return (gx, gy, gz)


# ── Finite-difference gradient (isolated; declared spacing) ──────────────────
def grad_fd(psi_fn, x, y, z, h):
    """Central-difference ∇ of a scalar complex field psi_fn(x,y,z). h in metres.

    Isolated utility used only for the continuity-equation cross-check; the
    authoritative current uses the analytic gradient above.
    """
    gx = (psi_fn(x + h, y, z) - psi_fn(x - h, y, z)) / (2 * h)
    gy = (psi_fn(x, y + h, z) - psi_fn(x, y - h, z)) / (2 * h)
    gz = (psi_fn(x, y, z + h) - psi_fn(x, y, z - h)) / (2 * h)
    return gx, gy, gz
