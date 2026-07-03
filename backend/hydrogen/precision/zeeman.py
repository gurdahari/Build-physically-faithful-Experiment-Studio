"""
Static magnetic-field (Zeeman) structure.

Two declared regimes:

  * GROUND-STATE HYPERFINE (1S1/2, I=J=1/2): the full Breit–Rabi structure by
    exact diagonalization of  H = A I·J + g_J μ_B B J_z − g_p μ_N B I_z  in the
    four-state uncoupled basis {|m_J, m_I⟩}.  H is block-diagonal in
    m_F = m_J + m_I: the stretched states (m_F = ±1) are exact linear branches;
    the m_F = 0 block is a 2×2 that mixes |F=1,0⟩ and |F=0,0⟩.  F, m_F labels are
    reported only while they remain good (weak field); state composition in the
    coupled and uncoupled bases is always returned.

  * FINE-STRUCTURE LEVELS (weak field): linear Zeeman split into m_J sublevels
    E = E₀ + g_J μ_B B m_J, with an explicit weak-field validity limit.

The magnetic field belongs to the PRECISION model; it is not bound to the
laboratory B₀ unless an explicit adapter is chosen upstream.
"""

from __future__ import annotations

import numpy as np

from . import constants as PC
from . import hyperfine as HF
from .quantum_numbers import ElectronicLevel, half_str

# Uncoupled 1S1/2 basis {(m_J, m_I)} with m in units of 1/2 → doubled ints.
_UNCOUPLED = [(+1, +1), (+1, -1), (-1, +1), (-1, -1)]   # (two_mJ, two_mI)

# Coupled |F, m_F⟩ expressed in the uncoupled m_F = 0 block {|+,−⟩, |−,+⟩}.
_INV_SQRT2 = 1.0 / np.sqrt(2.0)
_F1_M0 = np.array([_INV_SQRT2, _INV_SQRT2])    # |F=1, m_F=0⟩
_F0_M0 = np.array([_INV_SQRT2, -_INV_SQRT2])   # |F=0, m_F=0⟩

_G_J_GROUND = PC.lande_g_j(0, 1)   # 1S1/2 → g_J = g_e


def _electron_zeeman_j(two_mJ: int, b_tesla: float, g_j: float) -> float:
    return g_j * PC.MU_B * b_tesla * (two_mJ / 2.0)


def _nuclear_zeeman_j(two_mI: int, b_tesla: float) -> float:
    # Proton term (small): −g_p μ_N B m_I.
    return -PC.G_P * PC.MU_N * b_tesla * (two_mI / 2.0)


def _regime(x: float, b_tesla: float) -> str:
    if b_tesla == 0.0:
        return "zero_field"
    if x < 0.1:
        return "weak_field"
    if x < 10.0:
        return "intermediate"
    return "paschen_back"


def ground_breit_rabi(b_tesla: float) -> dict:
    """Exact Breit–Rabi levels of the 1S1/2 hyperfine manifold at field b_tesla."""
    a_j = HF.hyperfine_constant_A_j()
    x = (_G_J_GROUND * PC.MU_B * b_tesla) / a_j if a_j > 0 else 0.0
    regime = _regime(x, b_tesla)
    good_fm = regime in ("zero_field", "weak_field")

    levels = []

    # Stretched states m_F = ±1 (1×1, exact linear; pure |F=1, m_F=±1⟩).
    for (two_mJ, two_mI) in [(+1, +1), (-1, -1)]:
        two_mF = two_mJ + two_mI
        e = a_j * 0.25 + _electron_zeeman_j(two_mJ, b_tesla, _G_J_GROUND) + _nuclear_zeeman_j(two_mI, b_tesla)
        levels.append({
            "energy_J": float(e), "energy_eV": PC.ev_from_joules(float(e)),
            "two_mF": two_mF, "m_F": half_str(two_mF),
            "F_label": "1" if good_fm else None,
            "F_good_quantum_number": good_fm,
            "coupled_composition": {"F=1": 1.0, "F=0": 0.0},
            "uncoupled_composition": {f"|mJ={half_str(two_mJ)}, mI={half_str(two_mI)}⟩": 1.0},
            "branch": "stretched",
        })

    # m_F = 0 block: 2×2 over {|+,−⟩, |−,+⟩}.
    basis0 = [(+1, -1), (-1, +1)]
    ij = np.array([[-0.25, 0.5], [0.5, -0.25]])       # A·(I·J) part, m_F=0 block
    diagZ = np.array([
        _electron_zeeman_j(+1, b_tesla, _G_J_GROUND) + _nuclear_zeeman_j(-1, b_tesla),
        _electron_zeeman_j(-1, b_tesla, _G_J_GROUND) + _nuclear_zeeman_j(+1, b_tesla),
    ])
    H0 = a_j * ij + np.diag(diagZ)
    vals, vecs = np.linalg.eigh(H0)   # ascending; real symmetric
    order = np.argsort(vals)[::-1]    # descending so index 0 is the upper (F=1-like) level
    for idx in order:
        e = float(vals[idx])
        v = vecs[:, idx]
        w_f1 = float(np.dot(_F1_M0, v) ** 2)
        w_f0 = float(np.dot(_F0_M0, v) ** 2)
        s = w_f1 + w_f0
        if s > 0:
            w_f1, w_f0 = w_f1 / s, w_f0 / s
        f_label = ("1" if w_f1 >= w_f0 else "0") if good_fm else None
        levels.append({
            "energy_J": e, "energy_eV": PC.ev_from_joules(e),
            "two_mF": 0, "m_F": "0",
            "F_label": f_label,
            "F_good_quantum_number": good_fm,
            "coupled_composition": {"F=1": w_f1, "F=0": w_f0},
            "uncoupled_composition": {
                f"|mJ={half_str(bm[0])}, mI={half_str(bm[1])}⟩": float(v[i] ** 2)
                for i, bm in enumerate(basis0)
            },
            "branch": "mixed",
        })

    return {
        "manifold": "1S1/2 hyperfine (Breit–Rabi)",
        "B_tesla": b_tesla,
        "x_ratio_electronZeeman_over_hyperfine": float(x),
        "regime": regime,
        "F_good_quantum_number": good_fm,
        "levels": levels,
        "note": "F, m_F labels are reported only while F is a good quantum number; "
                "state composition in both bases is always provided.",
    }


def ground_breit_rabi_sweep(b_max_tesla: float, points: int = 41) -> dict:
    """Energy-vs-B branches for the Breit–Rabi plot (four branches, ordered)."""
    points = max(2, min(int(points), 121))
    bs = [b_max_tesla * i / (points - 1) for i in range(points)]
    # Track branches by a stable ordering of the four eigen-energies at each B.
    branches = [[] for _ in range(4)]
    for b in bs:
        lv = ground_breit_rabi(b)["levels"]
        energies = sorted((x["energy_eV"] for x in lv), reverse=True)
        for k in range(4):
            branches[k].append(energies[k])
    return {
        "B_tesla": bs,
        "branches_eV": branches,
        "count": points,
        "note": "branches ordered by descending energy at each field (avoided crossings preserved)",
    }


def weak_field_zeeman_j(level: ElectronicLevel, two_mJ: int, b_tesla: float) -> float:
    """Weak-field linear Zeeman energy g_J μ_B B m_J for a fine-structure sublevel [J]."""
    g_j = PC.lande_g_j(level.l, level.two_j)
    return g_j * PC.MU_B * b_tesla * (two_mJ / 2.0)


def fine_structure_zeeman(level: ElectronicLevel, b_tesla: float) -> dict:
    """Weak-field m_J splitting of a fine-structure level (linear; weak-field only)."""
    g_j = PC.lande_g_j(level.l, level.two_j)
    subs = []
    for two_mJ in level.m_j_values():
        e = weak_field_zeeman_j(level, two_mJ, b_tesla)
        subs.append({
            "two_mJ": two_mJ, "m_J": half_str(two_mJ),
            "zeeman_J": e, "zeeman_eV": PC.ev_from_joules(e),
        })
    return {
        "term_symbol": level.term_symbol,
        "lande_g_J": g_j,
        "B_tesla": b_tesla,
        "regime": "weak_field_linear",
        "sublevels": subs,
        "validity": "linear weak-field Zeeman only; not valid once g_J μ_B B approaches level spacings",
    }


def contract() -> dict:
    return {
        "name": "zeeman",
        "classification": "computed",
        "method": "exact diagonalization (ground hyperfine Breit–Rabi) + weak-field linear (fine structure)",
        "mathematical_definition": "H = A I·J + g_J μ_B B J_z − g_p μ_N B I_z (ground); "
                                   "E = E₀ + g_J μ_B B m_J (weak-field fine structure)",
        "perturbative_order": "exact within the 1S hyperfine manifold; linear for fine-structure levels",
        "supported_states": "1S1/2 hyperfine manifold (full field); supported fine-structure levels (weak field)",
        "units": "J (also eV); B in tesla",
        "constants_version": PC.CONSTANTS_VERSION,
        "reference_or_derivation": "Breit–Rabi equation / effective-Hamiltonian diagonalization",
        "validity_range": "Breit–Rabi valid across fields for the ground manifold; "
                          "fine-structure Zeeman limited to weak field; no ultra-strong-field deformation",
        "uncertainty": "nuclear term uses g_p; g_J from Landé with g_S = g_e",
        "terms_included": ["electron Zeeman", "nuclear (proton) Zeeman", "hyperfine coupling (ground)"],
        "terms_omitted": ["diamagnetic (B²) term", "strong-field orbital deformation", "ionization"],
        "double_counting_exclusions": [
            "ground-field structure diagonalizes A I·J WITH Zeeman together (no separate re-add)",
        ],
        "model": "Breit–Rabi (ground) + weak-field linear Zeeman (fine structure)",
    }
