"""
Numerical normalization diagnostics for a state over a finite spatial domain.

A finite-domain integral of |ψ|² is honestly reported: it is generally < 1
because probability lies outside the box.  We never claim the integral is exactly
1 unless it meets the stated tolerance.

Method: midpoint (cell-centred) Riemann sum on a cubic box [−L, L]³ (aμ), so no
sample lands on a coordinate singularity; dV is the physical cell volume.
"""

from __future__ import annotations

import numpy as np

from . import constants as C

_MAX_DIAG_RES = 80          # bound the diagnostic grid independently of the request


def normalization_diagnostics(state, bound_amu: float, resolution: int, t: float = 0.0,
                              tolerance: float = 1e-2) -> dict:
    L = float(bound_amu)
    res = int(min(max(resolution, 8), _MAX_DIAG_RES))
    if not np.isfinite(L) or L <= 0:
        raise ValueError("diagnostic bound must be finite and positive")

    # Cell-centred grid on [-L, L] (aμ): centres at -L + (i+0.5)*(2L/res).
    step_amu = 2.0 * L / res
    centres = (-L + (np.arange(res) + 0.5) * step_amu)
    X, Y, Z = np.meshgrid(centres, centres, centres, indexing="ij")
    psi = state.psi(X * C.A_MU, Y * C.A_MU, Z * C.A_MU, t)

    dV = (step_amu * C.A_MU) ** 3                       # physical cell volume [m³]
    numeric = float(np.sum(np.abs(psi) ** 2) * dV)      # ∫|ψ|² dV over the box
    analytic = float(state.norm_squared())              # = 1 for a normalized state
    tail = max(0.0, analytic - numeric)                 # probability outside the box
    ok = abs(numeric - analytic) <= tolerance

    return {
        "analytic_norm": analytic,
        "numerical_integral": numeric,
        "omitted_tail_estimate": tail,
        "domain": {"box_half_extent_amu": L, "shape": [res, res, res]},
        "integration_method": "midpoint (cell-centred) Riemann sum, cubic box",
        "tolerance": tolerance,
        "status": "pass" if ok else "warning: finite-domain tail (probability lies outside the box)",
    }
