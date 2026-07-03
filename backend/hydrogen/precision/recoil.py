"""
Recoil provider — explicit, honest bookkeeping (NOT a filler number).

The nonrelativistic Coulomb baseline (``hydrogen.constants``) already uses the
reduced mass μ = mₑmₚ/(mₑ+mₚ), so the leading finite-nuclear-mass (recoil)
effect is ALREADY in the baseline.  This milestone implements no additional
higher-order recoil correction, so the additional-recoil contribution is
reported as ``not_active`` with a reason — never as an approximate number
inserted to fill the correction budget.
"""

from __future__ import annotations

from .. import constants as C
from . import constants as PC

MU_OVER_ME = C.MU / C.M_E


def evaluate() -> dict:
    return {
        "additional_recoil_J": 0.0,
        "additional_recoil_eV": 0.0,
        "status": "not_active",
        "reason": "reduced-mass treatment already included in the baseline; "
                  "higher-order recoil omitted this milestone",
        "reduced_mass_over_electron_mass": MU_OVER_ME,
    }


def contract() -> dict:
    return {
        "name": "recoil",
        "classification": "omitted",   # additional recoil beyond reduced mass is omitted
        "method": "none (baseline already reduced-mass)",
        "mathematical_definition": "baseline uses μ = mₑmₚ/(mₑ+mₚ); no further recoil term added",
        "perturbative_order": "n/a (additional recoil not active)",
        "supported_states": "all (statement is state-independent)",
        "units": "J (also eV)",
        "constants_version": PC.CONSTANTS_VERSION,
        "reference_or_derivation": "reduced-mass baseline (Milestone 2 solver)",
        "validity_range": "leading finite-mass effect only",
        "uncertainty": "higher-order recoil (relativistic recoil, mass polarization) omitted",
        "terms_included": ["leading reduced-mass recoil (in baseline)"],
        "terms_omitted": ["relativistic recoil", "higher-order mass-dependent QED recoil"],
        "double_counting_exclusions": [
            "MUST NOT add a second reduced-mass correction on top of the baseline",
        ],
        "model": "reduced-mass baseline; additional recoil not active",
    }
