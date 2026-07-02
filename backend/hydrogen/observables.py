"""
Field-level observables / derived quantities and their scientific classification.

    probability density   |ψ|²                     (model-derived)
    phase                 arg(ψ)                   (model-derived; global phase unobservable)
    probability current   j = (ℏ/μ) Im[ψ*∇ψ]      (model-derived conserved current)
    energy                ⟨H₀⟩                     (observable)

Probability density is a position-measurement probability density — NOT a
material electron cloud.
"""

from __future__ import annotations

import numpy as np

from . import constants as C

# Scientific classification of each quantity the engine can report.
QUANTITY_CLASSIFICATION = {
    "psi": {
        "category": "model-derived",
        "note": "Authoritative complex probability amplitude; retains phase.",
    },
    "probability_density": {
        "category": "model-derived",
        "note": "|ψ|²; a position-measurement probability density, not a material cloud.",
    },
    "phase": {
        "category": "model-derived",
        "note": "arg(ψ); convention-sensitive. Global phase is not observable.",
    },
    "probability_current": {
        "category": "model-derived",
        "note": "j = (ℏ/μ) Im[ψ*∇ψ]; conserved current within the active field-free model.",
    },
    "energy": {
        "category": "observable",
        "note": "⟨H₀⟩ energy expectation value.",
    },
    "L2": {"category": "observable", "note": "⟨L²⟩ total angular momentum (eigenvalue l(l+1)ℏ²)."},
    "Lz": {"category": "observable", "note": "⟨L_z⟩ (eigenvalue mℏ)."},
}


def probability_density(psi):
    return np.abs(psi) ** 2


def phase(psi):
    return np.angle(psi)


def probability_current(psi, grad_psi):
    """j = (ℏ/μ) Im[ψ* ∇ψ]  [m^-2 s^-1]; grad_psi = (∂xψ, ∂yψ, ∂zψ)."""
    conj = np.conj(psi)
    factor = C.HBAR / C.MU
    jx = factor * np.imag(conj * grad_psi[0])
    jy = factor * np.imag(conj * grad_psi[1])
    jz = factor * np.imag(conj * grad_psi[2])
    return jx, jy, jz
