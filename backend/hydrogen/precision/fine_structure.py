"""
Fine-structure correction — leading-order (α²) perturbative point-nucleus model.

    ΔE_fs(n, j) = E_n⁽⁰⁾ · (Zα)²/n² · ( n/(j + 1/2) − 3/4 )

with E_n⁽⁰⁾ the nonrelativistic (reduced-mass) Coulomb energy (negative).  This is
the standard textbook combination of the relativistic kinetic, spin–orbit, and
Darwin terms; it depends ONLY on n and j.  Consequences:

  * the nonrelativistic n-degeneracy is partially lifted;
  * 2P1/2 (j=1/2) and 2P3/2 (j=3/2) split, with 2P1/2 lower;
  * states of equal (n, j) stay degenerate → 2S1/2 and 2P1/2 remain degenerate
    here (that interval is lifted only by the Lamb-shift reference correction).

A single authoritative implementation (perturbative); it is NOT mixed with an
exact-Dirac binding energy, so the same relativistic effect is never double
counted.  The reduced-mass treatment lives entirely in the baseline (see
``recoil``); this term adds no further mass correction.
"""

from __future__ import annotations

from .. import constants as C
from . import constants as PC
from .quantum_numbers import ElectronicLevel, half_str

MODEL = "leading-order (α²) perturbative fine structure, point nucleus"
PERTURBATIVE_ORDER = "O(α²) relative to E_n (i.e. O(α⁴ m c²) in absolute energy)"


def baseline_coulomb_j(n: int) -> float:
    """Nonrelativistic reduced-mass Coulomb energy E_n⁽⁰⁾ (negative) [J]."""
    return C.energy_joules(n)


def fine_structure_shift_j(level: ElectronicLevel) -> float:
    """ΔE_fs for an electronic level [J]."""
    n = level.n
    j = level.two_j / 2.0
    e0 = baseline_coulomb_j(n)
    return e0 * (PC.ALPHA ** 2) / (n * n) * (n / (j + 0.5) - 0.75)


def evaluate(level: ElectronicLevel) -> dict:
    e0 = baseline_coulomb_j(level.n)
    d = fine_structure_shift_j(level)
    return {
        "baseline_coulomb_J": e0,
        "baseline_coulomb_eV": PC.ev_from_joules(e0),
        "fine_structure_J": d,
        "fine_structure_eV": PC.ev_from_joules(d),
        "total_point_nucleus_J": e0 + d,
        "total_point_nucleus_eV": PC.ev_from_joules(e0 + d),
        "depends_on": {"n": level.n, "j": half_str(level.two_j)},
    }


def contract() -> dict:
    return {
        "name": "fine_structure",
        "classification": "computed",
        "method": "perturbative",
        "mathematical_definition": "ΔE_fs = E_n⁽⁰⁾ (Zα)²/n² ( n/(j+1/2) − 3/4 )",
        "perturbative_order": PERTURBATIVE_ORDER,
        "supported_states": "all supported electronic levels (n ≤ 2)",
        "units": "J (also eV)",
        "constants_version": PC.CONSTANTS_VERSION,
        "reference_or_derivation": "standard Dirac expansion (relativistic kinetic + spin–orbit + Darwin)",
        "validity_range": "low-Z hydrogen, leading order in (Zα)²; excited/high-n accuracy limited",
        "uncertainty": "truncation at O(α²) relative; higher-order relativistic terms omitted",
        "terms_included": ["relativistic kinetic", "spin–orbit", "Darwin (contact)"],
        "terms_omitted": ["Lamb shift (see lamb_shift)", "hyperfine (see hyperfine)",
                          "higher-order (Zα)⁴+ relativistic corrections"],
        "double_counting_exclusions": [
            "NOT combined with an exact-Dirac binding energy (would double count relativity)",
            "adds no reduced-mass/recoil term (handled by baseline; see recoil)",
        ],
        "model": MODEL,
    }
