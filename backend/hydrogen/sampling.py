"""
Reusable spatial-sampling service for the (future) renderer.

Produces authoritative numerical fields — point, plane, volume, or radial — at a
selected physical time and for a *selected* set of quantities.  It does NOT
always return every field and enforces strict payload limits.  No Three.js
geometry is generated here (that belongs to Milestone 3); authoritative data is
kept separate from any future rendering downsampling.

Bounds and coordinates are expressed in units of aμ (reduced-mass Bohr radius).
Complex fields are returned as separate real/imag arrays.
"""

from __future__ import annotations

import numpy as np

from . import constants as C
from . import cache

# ── Payload limits (reject excessive requests safely) ────────────────────────
MAX_AXIS = 160            # max points per grid axis
MAX_TOTAL_SAMPLES = 300_000
MAX_BOUND_AMU = 200.0     # max half-extent (aμ)

ALLOWED_QUANTITIES = ("psi_real", "psi_imag", "abs", "abs2", "phase", "jx", "jy", "jz")
_CURRENT_Q = {"jx", "jy", "jz"}


def _check_quantities(quantities):
    if not quantities:
        raise ValueError("at least one quantity must be requested")
    unknown = [q for q in quantities if q not in ALLOWED_QUANTITIES]
    if unknown:
        raise ValueError(f"unsupported quantities {unknown}; allowed: {list(ALLOWED_QUANTITIES)}")
    return list(dict.fromkeys(quantities))          # de-dup, keep order


def _check_bound(L):
    if not np.isfinite(L) or L <= 0 or L > MAX_BOUND_AMU:
        raise ValueError(f"bound must be finite in (0, {MAX_BOUND_AMU}] aμ (got {L})")
    return float(L)


def _check_res(res, axes):
    if not isinstance(res, int) or res < 2 or res > MAX_AXIS:
        raise ValueError(f"resolution must be an int in [2, {MAX_AXIS}] (got {res})")
    if res ** axes > MAX_TOTAL_SAMPLES:
        raise ValueError(f"grid too large: {res}^{axes} exceeds {MAX_TOTAL_SAMPLES} samples")
    return res


def _axis(L, res):
    return np.linspace(-L, L, res)                  # in aμ


def _combine(state, X_amu, Y_amu, Z_amu, t, grid_sig, want_current):
    """Total ψ (+ ∇ψ if needed) from cached time-independent basis fields × phases."""
    Xm = X_amu * C.A_MU; Ym = Y_amu * C.A_MU; Zm = Z_amu * C.A_MU
    coeffs = state.coefficients_at(t)
    psi = np.zeros(np.broadcast(Xm, Ym, Zm).shape, dtype=complex)
    gx = gy = gz = None
    if want_current:
        gx = np.zeros_like(psi); gy = np.zeros_like(psi); gz = np.zeros_like(psi)
    for key, c in coeffs.items():
        p, a, b, cc = cache.basis_fields(key, Xm, Ym, Zm, grid_sig)
        psi = psi + c * p
        if want_current:
            gx = gx + c * a; gy = gy + c * b; gz = gz + c * cc
    return psi, (gx, gy, gz)


def _fields(psi, grad, quantities):
    out = {}
    for q in quantities:
        if q == "psi_real": out[q] = np.real(psi)
        elif q == "psi_imag": out[q] = np.imag(psi)
        elif q == "abs": out[q] = np.abs(psi)
        elif q == "abs2": out[q] = np.abs(psi) ** 2
        elif q == "phase": out[q] = np.angle(psi)
        elif q in _CURRENT_Q:
            from . import observables
            jx, jy, jz = observables.probability_current(psi, grad)
            out["jx"], out["jy"], out["jz"] = jx, jy, jz
    return out


def _tolist(arr):
    return np.asarray(arr, dtype=float).tolist()


# ── Public sampling entry points ─────────────────────────────────────────────
def sample_point(state, point_amu, t, quantities):
    quantities = _check_quantities(quantities)
    x, y, z = (float(v) for v in point_amu)
    if not all(np.isfinite(v) for v in (x, y, z)):
        raise ValueError("point coordinates must be finite")
    want_current = bool(_CURRENT_Q & set(quantities))
    psi, grad = _combine(state, np.array(x), np.array(y), np.array(z), t, "", want_current)
    fields = _fields(psi, grad, quantities)
    return {
        "type": "point", "units": {"length": "aμ", "current": "m^-2 s^-1"},
        "coordinates_amu": {"x": x, "y": y, "z": z},
        "fields": {q: float(np.asarray(v)) for q, v in fields.items()},
    }


def sample_plane(state, plane, offset_amu, bound_amu, resolution, t, quantities):
    quantities = _check_quantities(quantities)
    plane = plane.lower()
    if plane not in ("xy", "xz", "yz"):
        raise ValueError("plane must be one of 'xy', 'xz', 'yz'")
    L = _check_bound(bound_amu); res = _check_res(resolution, 2)
    off = float(offset_amu)
    if not np.isfinite(off):
        raise ValueError("plane offset must be finite")
    u = _axis(L, res); U, V = np.meshgrid(u, u, indexing="ij")
    if plane == "xy": X, Y, Z = U, V, np.full_like(U, off)
    elif plane == "xz": X, Y, Z = U, np.full_like(U, off), V
    else: X, Y, Z = np.full_like(U, off), U, V
    grid_sig = f"plane|{plane}|{off}|{L}|{res}"
    want_current = bool(_CURRENT_Q & set(quantities))
    psi, grad = _combine(state, X, Y, Z, t, grid_sig, want_current)
    fields = _fields(psi, grad, quantities)
    return {
        "type": "plane", "plane": plane, "offset_amu": off, "bound_amu": L, "resolution": res,
        "units": {"length": "aμ", "current": "m^-2 s^-1"},
        "axis_amu": u.tolist(),
        "shape": [res, res],
        "fields": {q: _tolist(v) for q, v in fields.items()},
    }


def sample_volume(state, bound_amu, resolution, t, quantities):
    quantities = _check_quantities(quantities)
    L = _check_bound(bound_amu); res = _check_res(resolution, 3)
    u = _axis(L, res); X, Y, Z = np.meshgrid(u, u, u, indexing="ij")
    grid_sig = f"volume|{L}|{res}"
    want_current = bool(_CURRENT_Q & set(quantities))
    psi, grad = _combine(state, X, Y, Z, t, grid_sig, want_current)
    fields = _fields(psi, grad, quantities)
    return {
        "type": "volume", "bound_amu": L, "resolution": res,
        "units": {"length": "aμ", "current": "m^-2 s^-1"},
        "axis_amu": u.tolist(),
        "shape": [res, res, res],
        "fields": {q: _tolist(v) for q, v in fields.items()},
    }


def sample_radial(state, rmax_amu, resolution, theta, phi, t, quantities):
    quantities = _check_quantities(quantities)
    L = _check_bound(rmax_amu); res = _check_res(resolution, 1)
    if not (np.isfinite(theta) and np.isfinite(phi)):
        raise ValueError("theta and phi must be finite")
    r = np.linspace(0.0, L, res)
    X = r * np.sin(theta) * np.cos(phi)
    Y = r * np.sin(theta) * np.sin(phi)
    Z = r * np.cos(theta)
    grid_sig = f"radial|{L}|{res}|{theta}|{phi}"
    want_current = bool(_CURRENT_Q & set(quantities))
    psi, grad = _combine(state, X, Y, Z, t, grid_sig, want_current)
    fields = _fields(psi, grad, quantities)
    return {
        "type": "radial", "rmax_amu": L, "resolution": res, "theta": float(theta), "phi": float(phi),
        "units": {"length": "aμ", "current": "m^-2 s^-1"},
        "r_amu": r.tolist(), "shape": [res],
        "fields": {q: _tolist(v) for q, v in fields.items()},
    }
