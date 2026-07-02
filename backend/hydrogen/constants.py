"""
Versioned physical-constants provider for the nonrelativistic Hydrogen solver.

Constants are CODATA-2018 compatible.  Nothing physical is scattered as an
untracked numeric literal elsewhere in the package — everything derives from here.

Unit conventions
----------------
- SI is authoritative (metres, kilograms, seconds, joules, coulombs).
- Energies are additionally exposed in electronvolts and Hartree.
- Lengths are additionally expressed in the reduced-mass-adjusted Bohr radius aμ.
- Internal wavefunction math uses the dimensionless coordinate ρ = r / aμ, but
  every API result declares its units explicitly (see units()).
"""

from __future__ import annotations

import math

CONSTANTS_VERSION = "CODATA-2018-v1"

# ── SI constants (CODATA 2018) ────────────────────────────────────────────────
M_E     = 9.1093837015e-31     # electron mass            [kg]
M_P     = 1.67262192369e-27    # proton mass              [kg]
E_CHARGE = 1.602176634e-19     # elementary charge        [C]  (exact)
HBAR    = 1.054571817e-34      # reduced Planck constant  [J·s]
EPS0    = 8.8541878128e-12     # vacuum permittivity      [F/m]
C_LIGHT = 299792458.0          # speed of light           [m/s] (exact)
EV      = 1.602176634e-19      # 1 eV in joules           [J]  (exact)
A0      = 5.29177210903e-11    # conventional Bohr radius [m]  (uses m_e)
HARTREE = 4.3597447222071e-18  # Hartree energy           [J]

FOUR_PI_EPS0 = 4.0 * math.pi * EPS0

# ── Derived: reduced mass and reduced-mass-adjusted scales ────────────────────
MU   = (M_E * M_P) / (M_E + M_P)                    # reduced mass            [kg]
A_MU = FOUR_PI_EPS0 * HBAR**2 / (MU * E_CHARGE**2)  # aμ = 4πε₀ℏ²/(μe²)       [m]

# Rydberg-type energy scale with the reduced mass (E₁ = −this).
_RY_MU = (MU * E_CHARGE**4) / (2.0 * FOUR_PI_EPS0**2 * HBAR**2)  # [J]


def energy_joules(n: int) -> float:
    """Bound-state energy Eₙ = −μe⁴ / [2(4πε₀)²ℏ²n²]  [J]."""
    if n < 1:
        raise ValueError("principal quantum number n must be >= 1")
    return -_RY_MU / (n * n)


def energy_ev(n: int) -> float:
    return energy_joules(n) / EV


def energy_hartree(n: int) -> float:
    return energy_joules(n) / HARTREE


def angular_frequency(delta_energy_joules: float) -> float:
    """ω = ΔE / ℏ  [rad/s]."""
    return delta_energy_joules / HBAR


def units() -> dict:
    """Declared unit conventions for API consumers."""
    return {
        "length": "m (SI); also expressed in aμ (reduced-mass Bohr radius)",
        "energy": "J (SI); also eV and Hartree",
        "time": "s (SI)",
        "wavefunction": "m^-3/2 (ψ has SI dimension length^-3/2)",
        "probability_density": "m^-3 (|ψ|²)",
        "probability_current": "m^-2 s^-1 (j = (ℏ/μ) Im[ψ*∇ψ])",
        "phase": "rad",
        "internal_dimensionless_coordinate": "rho = r / a_mu",
    }


def constants() -> dict:
    """Full, JSON-serializable constants snapshot (SI + atomic-unit-friendly)."""
    return {
        "version": CONSTANTS_VERSION,
        "provenance": "CODATA 2018 recommended values",
        "si": {
            "electron_mass_kg": M_E,
            "proton_mass_kg": M_P,
            "elementary_charge_C": E_CHARGE,
            "hbar_Js": HBAR,
            "vacuum_permittivity_Fm": EPS0,
            "speed_of_light_ms": C_LIGHT,
            "electronvolt_J": EV,
            "bohr_radius_m": A0,
            "hartree_energy_J": HARTREE,
            "reduced_mass_kg": MU,
            "reduced_bohr_radius_m": A_MU,
        },
        "atomic_units": {
            "length_unit_m": A_MU,          # lengths measured in aμ
            "energy_unit_J": HARTREE,       # energies measured in Hartree
            "note": "Internal ρ = r/aμ is dimensionless; energies scale with μ.",
        },
        "derived": {
            "reduced_mass_over_electron_mass": MU / M_E,
            "a_mu_over_a0": A_MU / A0,
            "ground_state_energy_eV": energy_ev(1),
        },
        "units": units(),
    }
