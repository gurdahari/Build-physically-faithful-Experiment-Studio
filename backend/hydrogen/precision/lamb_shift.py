"""
Lamb-shift provider — VERSIONED REFERENCE DATA, not an improvised QED calculation.

The point-nucleus fine-structure model leaves 2S1/2 and 2P1/2 degenerate.  The
measured/recommended 2S1/2 − 2P1/2 interval lifts that degeneracy.  The value is
preserved as a TRANSITION DIFFERENCE and applied with 2P1/2 as the zero
reference (2S1/2 sits above by the value); it is never silently split into two
arbitrary absolute QED state shifts.

The UI must label this "Reference-data QED correction", not "Real-time QED".
"""

from __future__ import annotations

from . import constants as PC
from . import reference_data as RD
from .quantum_numbers import ElectronicLevel

_REF = RD.LAMB_2S1_2_2P1_2


def reference() -> dict:
    return dict(_REF)


def shift_j(level: ElectronicLevel) -> float:
    """Lamb contribution assigned to a supported level [J].

    Only the 2S1/2 / 2P1/2 pair is supported.  2P1/2 is the reference (0); the
    difference is assigned to 2S1/2.  Every other level returns 0 (no supported
    Lamb datum) — this is an honest omission, not a fabricated value.
    """
    term = level.term_symbol
    if term == _REF["shifted_level"]:      # 2S1/2
        return PC.joules_from_frequency_hz(_REF["value_Hz"])
    return 0.0                              # 2P1/2 (reference) and all others


def supported_difference() -> dict:
    """The supported reference interval, preserved as a difference (not two shifts)."""
    e_j = PC.joules_from_frequency_hz(_REF["value_Hz"])
    line = PC.spectral_line(e_j)
    return {
        "levels": f"{_REF['shifted_level']} − {_REF['reference_level']}",
        "kind": _REF["kind"],
        "energy_eV": line["energy_eV"],
        "frequency_MHz": line["frequency_MHz"],
        "uncertainty_Hz": _REF["uncertainty_Hz"],
        "reference": reference(),
    }


def evaluate(level: ElectronicLevel) -> dict:
    d = shift_j(level)
    is_ref = level.term_symbol == _REF["reference_level"]
    return {
        "lamb_shift_J": d,
        "lamb_shift_eV": PC.ev_from_joules(d),
        "assigned": level.term_symbol == _REF["shifted_level"],
        "is_reference_level": is_ref,
        "classification": "reference-data",
        "reference": reference(),
    }


def contract() -> dict:
    return {
        "name": "lamb_shift",
        "classification": "reference-data",
        "method": "versioned reference dataset (measured/recommended)",
        "mathematical_definition": "E(2S1/2) − E(2P1/2) preserved as a measured difference",
        "perturbative_order": "n/a (not calculated here; dominated by QED self-energy)",
        "supported_states": "2S1/2 (assigned) and 2P1/2 (reference); others → 0 (no datum)",
        "units": "Hz in the dataset; converted to J/eV via E = hν",
        "constants_version": PC.CONSTANTS_VERSION,
        "reference_or_derivation": f"{_REF['id']} {_REF['version']}",
        "validity_range": "¹H 2S1/2−2P1/2 microwave interval only",
        "uncertainty": f"±{_REF['uncertainty_Hz']:.0f} Hz (dataset)",
        "terms_included": ["measured 2S1/2−2P1/2 interval (QED self-energy dominated, proton size included)"],
        "terms_omitted": ["absolute per-state QED shifts", "arbitrary excited-state Lamb data",
                          "first-principles bound-state QED"],
        "double_counting_exclusions": [
            "preserved as ONE difference; NOT converted into two arbitrary absolute shifts",
            "assigned relative to 2P1/2 (=0) so fine structure is not re-added",
        ],
        "model": "reference-data QED correction (NOT a real-time QED simulation)",
    }
