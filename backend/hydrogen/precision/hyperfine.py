"""
Electron–proton hyperfine coupling for the Hydrogen 1S ground state.

Effective Hamiltonian  H_hfs = A  I·J  with electron J = 1/2 and proton I = 1/2.
The scalar coupling A is FIXED to the versioned ground-state hyperfine frequency
(A = h·ν_HF), not an unexplained literal.  Eigenvalues (in units of A):

    ⟨I·J⟩ = ½[F(F+1) − I(I+1) − J(J+1)]
    F = 1 (triplet):  +1/4 A      F = 0 (singlet):  −3/4 A
    splitting  ΔE_hf = E(F=1) − E(F=0) = A = h·ν_HF   → the 21 cm line.

At zero field the F=1 triplet (m_F = −1, 0, +1) is degenerate; F=0 is a single
level.  Excited-state hyperfine structure is intentionally omitted (no datum).
"""

from __future__ import annotations

from . import constants as PC
from . import reference_data as RD
from .quantum_numbers import (
    ElectronicLevel, HyperfineLevel, couple_two_F, ground_hyperfine_levels, half_str,
    TWO_I_PROTON,
)

_REF = RD.HYPERFINE_1S_GROUND
_GROUND_TERM = "1S1/2"


def hyperfine_constant_A_j() -> float:
    """A = h·ν_HF  [J] — the effective scalar coupling fixed to the reference line."""
    return PC.joules_from_frequency_hz(_REF["value_Hz"])


def i_dot_j(two_F: int, two_j: int, two_I: int = TWO_I_PROTON) -> float:
    """⟨I·J⟩ in units of ℏ² = ½[F(F+1) − I(I+1) − J(J+1)]."""
    F = two_F / 2.0
    j = two_j / 2.0
    I = two_I / 2.0
    return 0.5 * (F * (F + 1.0) - I * (I + 1.0) - j * (j + 1.0))


def is_ground_hyperfine(level: ElectronicLevel) -> bool:
    return level.term_symbol == _GROUND_TERM


def hyperfine_shift_j(hlevel: HyperfineLevel) -> float:
    """Hyperfine energy A⟨I·J⟩ for a ground-state hyperfine level [J]; 0 if unsupported."""
    if hlevel.electronic.term_symbol != _GROUND_TERM:
        return 0.0
    return hyperfine_constant_A_j() * i_dot_j(hlevel.two_F, hlevel.electronic.two_j, hlevel.two_I)


def ground_manifold() -> dict:
    """Full JSON-native description of the 1S1/2 F=0/F=1 manifold at zero field."""
    a_j = hyperfine_constant_A_j()
    levels = []
    for hl in ground_hyperfine_levels():
        e = hyperfine_shift_j(hl)
        levels.append({
            "label": hl.label,
            "F": half_str(hl.two_F), "two_F": hl.two_F,
            "energy_J": e, "energy_eV": PC.ev_from_joules(e),
            "degeneracy_zero_field": hl.degeneracy,
            "m_F_values": [half_str(m) for m in hl.m_F_values()],
        })
    split = PC.spectral_line(a_j)
    return {
        "electronic_state": _GROUND_TERM,
        "coupling_A_J": a_j,
        "coupling_A_eV": PC.ev_from_joules(a_j),
        "coupling_A_over_h_MHz": _REF["value_Hz"] / 1e6,
        "levels": levels,
        "splitting": {
            "energy_eV": split["energy_eV"],
            "frequency_Hz": split["frequency_Hz"],
            "frequency_MHz": split["frequency_MHz"],
            "wavelength_cm": split["wavelength_cm"],
            "uncertainty_Hz": _REF["uncertainty_Hz"],
        },
        "reference": dict(_REF),
    }


def evaluate(hlevel: HyperfineLevel) -> dict:
    e = hyperfine_shift_j(hlevel)
    supported = hlevel.electronic.term_symbol == _GROUND_TERM
    return {
        "hyperfine_J": e,
        "hyperfine_eV": PC.ev_from_joules(e),
        "supported": supported,
        "classification": "computed" if supported else "omitted",
        "i_dot_j_hbar2": i_dot_j(hlevel.two_F, hlevel.electronic.two_j, hlevel.two_I) if supported else 0.0,
        "reference": dict(_REF) if supported else None,
    }


def contract() -> dict:
    return {
        "name": "hyperfine",
        "classification": "computed",   # angular algebra computed; A fixed to reference frequency
        "method": "analytic (effective A I·J), A fixed to versioned reference frequency",
        "mathematical_definition": "H_hfs = A I·J; A = h·ν_HF; ⟨I·J⟩ = ½[F(F+1)−I(I+1)−J(J+1)]",
        "perturbative_order": "leading magnetic-dipole hyperfine",
        "supported_states": "1S1/2 ground state only (F = 0, 1)",
        "units": "J (also eV); ν in Hz",
        "constants_version": PC.CONSTANTS_VERSION,
        "reference_or_derivation": f"{_REF['id']} {_REF['version']} (ν_HF); coupling algebra analytic",
        "validity_range": "field-free ¹H 1S1/2; excited-state hyperfine omitted",
        "uncertainty": f"A fixed to ν_HF ± {_REF['uncertainty_Hz']:.0f} Hz",
        "terms_included": ["magnetic-dipole electron–proton coupling (ground state)"],
        "terms_omitted": ["excited-state hyperfine", "nuclear electric-quadrupole (none for I=1/2)",
                          "hyperfine anomaly / distribution corrections"],
        "double_counting_exclusions": [
            "A fixed to the measured splitting; not added on top of a separate calculated A",
        ],
        "model": "effective ground-state hyperfine A I·J",
    }
