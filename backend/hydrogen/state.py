"""
AtomicHydrogenState — a normalized complex superposition over the supported
hydrogenic basis, with field-free unitary time evolution.

    |Ψ(0)⟩ = Σ cᵢ |nᵢ,lᵢ,mᵢ⟩          Σ|cᵢ|² = 1
    |Ψ(t)⟩ = Σ cᵢ e^{-iEᵢt/ℏ} |i⟩     (physical time t in seconds)

Global phase does not affect observables.  For a single eigenstate, phase
evolves but density is stationary.  For a superposition of different energies,
relative phases evolve (interference).  Within an exactly degenerate n manifold
the relative dynamical phase does not change — no false beat is fabricated.
"""

from __future__ import annotations

import cmath
import numpy as np

from . import constants as C
from . import basis
from . import analytic_solver as S

NORM_TOL = 1e-9


class AtomicHydrogenState:
    def __init__(self, coefficients: dict[str, complex]):
        self._c = dict(coefficients)                      # key -> complex
        self._states = {k: basis.get_state(k) for k in self._c}

    # ── Construction / validation ────────────────────────────────────────────
    @classmethod
    def from_entries(cls, entries, normalize: bool = False, tol: float = NORM_TOL):
        """entries: iterable of (key, complex) or dicts {state, real, imag}."""
        coeffs: dict[str, complex] = {}
        for e in entries:
            if isinstance(e, dict):
                key = e.get("state")
                re, im = e.get("real"), e.get("imag")
                if key is None or re is None or im is None:
                    raise ValueError("malformed coefficient entry (need state, real, imag)")
                c = complex(float(re), float(im))
            else:
                key, c = e[0], complex(e[1])
            if not basis.is_supported(key):
                raise ValueError(f"unknown basis state '{key}'")
            if key in coeffs:
                raise ValueError(f"duplicate basis state '{key}'")
            if not (cmath.isfinite(c)):
                raise ValueError(f"non-finite coefficient for '{key}'")
            coeffs[key] = c
        if not coeffs:
            raise ValueError("state has no coefficients")

        norm2 = sum(abs(c) ** 2 for c in coeffs.values())
        if norm2 <= 0 or not np.isfinite(norm2):
            raise ValueError("zero-norm or non-finite state")
        if normalize:
            scale = 1.0 / np.sqrt(norm2)
            coeffs = {k: c * scale for k, c in coeffs.items()}
        elif abs(norm2 - 1.0) > tol:
            raise ValueError(
                f"state not normalized: Σ|cᵢ|² = {norm2:.12g} (tolerance {tol}); "
                "pass normalize=true to auto-normalize"
            )
        return cls(coeffs)

    # ── Metadata ─────────────────────────────────────────────────────────────
    def keys(self):
        return list(self._c.keys())

    def coefficients_wire(self):
        return [{"state": k, "real": c.real, "imag": c.imag} for k, c in self._c.items()]

    def populations(self) -> dict[str, float]:
        return {k: abs(c) ** 2 for k, c in self._c.items()}

    def norm_squared(self) -> float:
        return sum(abs(c) ** 2 for c in self._c.values())

    # ── Energy / angular-momentum expectations ──────────────────────────────
    def energy_expectation_j(self) -> float:
        return sum(abs(c) ** 2 * self._states[k].energy_j for k, c in self._c.items())

    def energy_variance_j2(self) -> float:
        e = self.energy_expectation_j()
        e2 = sum(abs(c) ** 2 * self._states[k].energy_j ** 2 for k, c in self._c.items())
        return max(0.0, e2 - e * e)

    def l2_expectation_hbar2(self) -> float:
        return sum(abs(c) ** 2 * self._states[k].l2_eigenvalue_hbar2 for k, c in self._c.items())

    def lz_expectation_hbar(self) -> float:
        return sum(abs(c) ** 2 * self._states[k].lz_eigenvalue_hbar for k, c in self._c.items())

    # ── Time evolution ───────────────────────────────────────────────────────
    def coefficients_at(self, t: float) -> dict[str, complex]:
        """cᵢ(t) = cᵢ e^{-iEᵢt/ℏ}."""
        if not np.isfinite(t):
            raise ValueError("time must be finite")
        out = {}
        for k, c in self._c.items():
            phase = -self._states[k].energy_j * t / C.HBAR
            out[k] = c * cmath.exp(1j * phase)
        return out

    def beat_frequencies_rad_s(self) -> list[float]:
        """|Eᵢ−Eⱼ|/ℏ for each distinct energy pair (0 within a degenerate manifold)."""
        energies = sorted({self._states[k].energy_j for k in self._c})
        out = []
        for i in range(len(energies)):
            for j in range(i + 1, len(energies)):
                out.append(abs(energies[i] - energies[j]) / C.HBAR)
        return out

    # ── Field evaluation (analytic) ──────────────────────────────────────────
    def psi(self, x, y, z, t: float = 0.0):
        coeffs = self.coefficients_at(t)
        total = 0j * np.asarray(x, float)
        for k, c in coeffs.items():
            s = self._states[k]
            total = total + c * S.psi_cartesian(s.n, s.l, s.m, x, y, z)
        return total

    def grad_psi(self, x, y, z, t: float = 0.0):
        coeffs = self.coefficients_at(t)
        gx = gy = gz = 0j * np.asarray(x, float)
        for k, c in coeffs.items():
            s = self._states[k]
            g = S.grad_psi_cartesian(s.n, s.l, s.m, x, y, z)
            gx = gx + c * g[0]; gy = gy + c * g[1]; gz = gz + c * g[2]
        return gx, gy, gz
