"""
Derived physical constants for the precision layer, built ONLY from the versioned
CODATA-2018 base constants in ``hydrogen.constants`` (nothing re-entered as an
untracked literal).  Measured spectroscopic values (Lamb shift, ground-state
hyperfine frequency) live in ``reference_data`` — they are data, not derived here.

Unit helpers convert consistently between energy (J, eV), frequency (Hz), angular
frequency (rad/s), and free-space wavelength (m).
"""

from __future__ import annotations

import math

from .. import constants as C

CONSTANTS_VERSION = C.CONSTANTS_VERSION

# ── Fundamental derived constants ─────────────────────────────────────────────
H_PLANCK = 2.0 * math.pi * C.HBAR                              # Planck constant [J·s]
ALPHA = C.E_CHARGE ** 2 / (C.FOUR_PI_EPS0 * C.HBAR * C.C_LIGHT)  # fine-structure constant
MU_B = C.E_CHARGE * C.HBAR / (2.0 * C.M_E)                     # Bohr magneton      [J/T]
MU_N = C.E_CHARGE * C.HBAR / (2.0 * C.M_P)                     # nuclear magneton   [J/T]

# g-factors (CODATA-2018 recommended magnitudes).
G_E = 2.00231930436256   # free-electron spin g-factor |g_e|
G_P = 5.5856946893       # proton g-factor g_p (μ_p = g_p μ_N I/ℏ, I = 1/2)

Z = 1  # hydrogen nuclear charge number


def lande_g_j(l: int, two_j: int, two_s: int = 1) -> float:
    """Landé g_J for an (l, s, j) electronic level, using g_S = g_e, g_L = 1.

    g_J = g_L (j(j+1) - s(s+1) + l(l+1)) / (2 j(j+1))
        + g_S (j(j+1) + s(s+1) - l(l+1)) / (2 j(j+1))
    """
    j = two_j / 2.0
    s = two_s / 2.0
    jj = j * (j + 1.0)
    ss = s * (s + 1.0)
    ll = l * (l + 1.0)
    g_l = 1.0
    return g_l * (jj - ss + ll) / (2.0 * jj) + G_E * (jj + ss - ll) / (2.0 * jj)


# ── Consistent unit conversions ───────────────────────────────────────────────
def ev_from_joules(e_j: float) -> float:
    return e_j / C.EV


def joules_from_ev(e_ev: float) -> float:
    return e_ev * C.EV


def frequency_hz_from_joules(e_j: float) -> float:
    """ν = E / h  [Hz]."""
    return e_j / H_PLANCK


def joules_from_frequency_hz(nu_hz: float) -> float:
    """E = h ν  [J]."""
    return nu_hz * H_PLANCK


def angular_frequency_rad_s_from_joules(e_j: float) -> float:
    """ω = E / ℏ  [rad/s]."""
    return e_j / C.HBAR


def wavelength_m_from_frequency_hz(nu_hz: float) -> float:
    """λ = c / ν  [m]; undefined for ν ≤ 0."""
    if nu_hz <= 0.0:
        raise ValueError("wavelength is undefined for non-positive frequency")
    return C.C_LIGHT / nu_hz


def spectral_line(delta_e_j: float) -> dict:
    """A JSON-native spectroscopic summary of a positive energy interval.

    For a transition, ``delta_e_j`` should be the magnitude |E_upper − E_lower|.
    """
    mag = abs(delta_e_j)
    out = {
        "energy_eV": ev_from_joules(delta_e_j),
        "energy_J": delta_e_j,
        "frequency_Hz": frequency_hz_from_joules(mag) if mag > 0 else 0.0,
        "angular_frequency_rad_s": angular_frequency_rad_s_from_joules(mag) if mag > 0 else 0.0,
    }
    out["frequency_MHz"] = out["frequency_Hz"] / 1e6
    out["frequency_GHz"] = out["frequency_Hz"] / 1e9
    if mag > 0:
        lam = wavelength_m_from_frequency_hz(out["frequency_Hz"])
        out["wavelength_m"] = lam
        out["wavelength_nm"] = lam * 1e9
        out["wavelength_cm"] = lam * 1e2
    else:
        out["wavelength_m"] = None
        out["wavelength_nm"] = None
        out["wavelength_cm"] = None
    return out


def constants_snapshot() -> dict:
    return {
        "version": CONSTANTS_VERSION,
        "fine_structure_constant_alpha": ALPHA,
        "one_over_alpha": 1.0 / ALPHA,
        "planck_constant_Js": H_PLANCK,
        "bohr_magneton_J_per_T": MU_B,
        "nuclear_magneton_J_per_T": MU_N,
        "electron_g_factor": G_E,
        "proton_g_factor": G_P,
        "nuclear_charge_Z": Z,
        "provenance": "derived from CODATA-2018 base constants (hydrogen.constants)",
    }
