"""
Nonrelativistic analytic Hydrogen atomic-physics package (Milestone 2).

Authoritative closed-form electron–proton (relative-coordinate) Coulomb model.
Solver-first: everything here is usable directly from Python tests without
FastAPI.  QuTiP is NOT used here — it remains authoritative for the separate
Proton Spin resolution.

Public surface:
    constants  — versioned CODATA constants, reduced mass, aμ, energies
    basis      — supported basis states + scientific keys + metadata
    analytic_solver — Rₙₗ, Yₗᵐ, ψ (spherical/Cartesian), analytic ∇ψ
    state      — AtomicHydrogenState (superpositions, time evolution)
    observables — density, phase, probability current, classification
    sampling   — point/plane/volume/radial sampling service
    diagnostics — finite-domain normalization diagnostics
    cache      — bounded time-independent basis-field cache
    schemas    — typed API request models
    service    — model metadata + evaluate orchestration
"""

from . import constants, basis, analytic_solver, state, observables, sampling, diagnostics, cache, schemas, service  # noqa: F401
