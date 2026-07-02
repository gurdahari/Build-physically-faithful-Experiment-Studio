"""
Orchestration between the atomic solver and the API layer.

`model_metadata()` describes the active declared model; `evaluate(request)`
builds a state, evolves it, samples fields, runs normalization diagnostics, and
returns a fully JSON-native dict.  Scientific validation raises ValueError, which
the route converts into a clear 422 response (never a traceback).
"""

from __future__ import annotations

import math

from . import constants as C
from . import basis, sampling, diagnostics, observables, cache
from .state import AtomicHydrogenState

MODEL_VERSION = "hydrogen-atomic-nonrel-1.0.0"

INCLUDED_PHYSICS = [
    "one electron",
    "one proton",
    "electron–proton relative-coordinate motion",
    "Coulomb interaction",
    "bound nonrelativistic eigenstates",
    "coherent superpositions",
    "unitary field-free time evolution",
]

OMITTED_PHYSICS = [
    "center-of-mass dynamics", "electron spin", "proton spin", "fine structure",
    "spin-orbit coupling", "Darwin term", "relativistic kinetic corrections",
    "hyperfine structure", "Lamb shift", "vacuum polarization", "radiative self-energy",
    "external electric fields", "external magnetic fields", "collisions", "decoherence",
    "finite proton size", "proton polarizability", "proton internal structure",
]

CONVENTIONS = {
    "hamiltonian": "H₀ = -ℏ²/(2μ)∇² - e²/(4πε₀r)",
    "reduced_mass": "μ = mₑmₚ/(mₑ+mₚ)",
    "bohr_scale": "aμ = 4πε₀ℏ²/(μe²)",
    "energies": "Eₙ = -μe⁴/[2(4πε₀)²ℏ²n²]",
    "radial": "Rₙₗ normalized ∫₀^∞ Rₙₗ² r² dr = 1 (uses aμ)",
    "spherical_harmonics": "Yₗᵐ orthonormal on the sphere with the Condon–Shortley phase",
    "coefficient_wire_format": "{ real, imag }, Σ|cᵢ|² = 1",
    "time_evolution": "Ψ(t) = Σ cᵢ ψᵢ e^{-iEᵢt/ℏ} (physical seconds; global phase unobservable)",
    "probability_current": "j = (ℏ/μ) Im[ψ*∇ψ], analytic gradient",
}

LIMITATIONS = [
    "Nonrelativistic Coulomb-bound electron–proton model only.",
    "NOT a Dirac / QED / finite-proton-size / hyperfine / environmental / proton-internal calculation.",
    "Finite-domain sampling omits probability outside the box (see normalization diagnostics).",
    "Probability density is a position-measurement probability density, not a material electron cloud.",
    "Probability current is not a literal classical electron trajectory.",
]


def model_metadata() -> dict:
    return {
        "model_version": MODEL_VERSION,
        "model_name": "Nonrelativistic Coulomb electron–proton (relative coordinate)",
        "constants_version": C.CONSTANTS_VERSION,
        "supported_basis_states": [s.to_dict() for s in basis.all_states()],
        "included_physics": INCLUDED_PHYSICS,
        "omitted_physics": OMITTED_PHYSICS,
        "units": C.units(),
        "conventions": CONVENTIONS,
        "quantity_classification": observables.QUANTITY_CLASSIFICATION,
        "limitations": LIMITATIONS,
        "constants": C.constants(),
        "solver": "analytic (closed-form hydrogenic wavefunctions); QuTiP is NOT used here",
    }


def _json_safe(obj):
    """Recursively convert to JSON-native types; reject NaN/Infinity."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, int):
        return obj
    if isinstance(obj, float):
        if not math.isfinite(obj):
            raise ValueError("internal error: non-finite value in response")
        return obj
    # numpy scalars
    try:
        import numpy as np
        if isinstance(obj, np.generic):
            return _json_safe(obj.item())
    except Exception:
        pass
    if isinstance(obj, complex):
        return {"real": _json_safe(obj.real), "imag": _json_safe(obj.imag)}
    return obj


def evaluate(req) -> dict:
    state = AtomicHydrogenState.from_entries(
        [c.model_dump() for c in req.coefficients], normalize=req.normalize
    )
    t = float(req.time_seconds)
    spec = req.sampling
    q = req.quantities

    if spec.type == "point":
        sampled = sampling.sample_point(state, spec.point_amu or [1.0, 0.0, 0.0], t, q)
    elif spec.type == "plane":
        if spec.bound_amu is None or spec.resolution is None or spec.plane is None:
            raise ValueError("plane sampling requires plane, bound_amu, and resolution")
        sampled = sampling.sample_plane(state, spec.plane, spec.offset_amu, spec.bound_amu, spec.resolution, t, q)
    elif spec.type == "volume":
        if spec.bound_amu is None or spec.resolution is None:
            raise ValueError("volume sampling requires bound_amu and resolution")
        sampled = sampling.sample_volume(state, spec.bound_amu, spec.resolution, t, q)
    else:  # radial
        if spec.rmax_amu is None or spec.resolution is None:
            raise ValueError("radial sampling requires rmax_amu and resolution")
        sampled = sampling.sample_radial(state, spec.rmax_amu, spec.resolution, spec.theta, spec.phi, t, q)

    diag = None
    warnings = []
    if req.include_diagnostics:
        db = req.diagnostic_bound_amu or spec.bound_amu or spec.rmax_amu or 12.0
        diag = diagnostics.normalization_diagnostics(state, db, req.diagnostic_resolution, t)
        if str(diag["status"]).startswith("warning"):
            warnings.append("normalization: " + diag["status"])

    e_j = state.energy_expectation_j()
    var_j2 = state.energy_variance_j2()

    resp = {
        "model_version": MODEL_VERSION,
        "constants_version": C.CONSTANTS_VERSION,
        "state": {
            "coefficients": state.coefficients_wire(),
            "normalized": True,
            "norm_squared": state.norm_squared(),
            "populations": state.populations(),
        },
        "participating_states": [basis.get_state(k).to_dict() for k in state.keys()],
        "energy": {
            "expectation_J": e_j,
            "expectation_eV": e_j / C.EV,
            "variance_J2": var_j2,
            "variance_eV2": var_j2 / (C.EV ** 2),
            "std_eV": (var_j2 ** 0.5) / C.EV,
        },
        "angular_momentum": {
            "L2_expectation_hbar2": state.l2_expectation_hbar2(),
            "Lz_expectation_hbar": state.lz_expectation_hbar(),
        },
        "beat_frequencies_rad_s": state.beat_frequencies_rad_s(),
        "time_seconds": t,
        "visual_time_scale": {
            "physical_equation_unaltered": True,
            "note": "Any visual slowdown is a renderer concern; the physical evolution is not modified.",
        },
        "sampling": sampled,
        "normalization_diagnostics": diag,
        "quantity_classification": observables.QUANTITY_CLASSIFICATION,
        "units": C.units(),
        "warnings": warnings,
        "provenance": {
            "solver": "analytic hydrogenic wavefunctions",
            "constants": C.CONSTANTS_VERSION,
            "model": MODEL_VERSION,
            "engine": "not QuTiP (QuTiP remains authoritative for the separate Proton Spin model)",
        },
        "cache": cache.stats(),
    }
    return _json_safe(resp)
