"""
Transition assembly: merges a selection-rule classification with the spectroscopic
interval (energy, frequency, angular frequency, wavelength) for supported levels.

Energies are provided by the service (which owns the correction stack); this
module stays free of the level-energy machinery to avoid import cycles.  A
forbidden transition still returns its interval, but the UI must not draw an
arrow for it (``allowed`` is explicit).
"""

from __future__ import annotations

from typing import Optional

from . import constants as PC


def assemble(classification: dict, e_initial_j: float, e_final_j: float,
             meta: Optional[dict] = None) -> dict:
    """Combine a classification with the |ΔE| spectral line and provenance."""
    delta = e_final_j - e_initial_j
    line = PC.spectral_line(abs(delta))
    upper = "final" if e_final_j >= e_initial_j else "initial"
    out = {
        "allowed": classification["allowed"],
        "type": classification["type"],
        "type_name": classification["type_name"],
        "selection_rules": classification["checks"],
        "reason": classification["reason"],
        "deltas": classification["deltas"],
        "polarization": classification["polarization"],
        "polarization_resolved": classification["polarization_resolved"],
        "delta_energy_signed_eV": PC.ev_from_joules(delta),
        "energy_eV": line["energy_eV"],
        "frequency_Hz": line["frequency_Hz"],
        "frequency_MHz": line["frequency_MHz"],
        "frequency_GHz": line["frequency_GHz"],
        "angular_frequency_rad_s": line["angular_frequency_rad_s"],
        "wavelength_m": line["wavelength_m"],
        "wavelength_nm": line["wavelength_nm"],
        "wavelength_cm": line["wavelength_cm"],
        "upper_level": upper,
    }
    if meta:
        out.update(meta)
    return out


# ── Presets (declared endpoint descriptors; the service resolves + prices them) ─
# Each endpoint: {"term": <term symbol>, optional "two_F", "two_mF", "two_mj"}.
PRESETS = [
    {
        "id": "hyperfine_21cm",
        "label": "1S ground-state hyperfine (21 cm)",
        "requested_type": "M1",
        "initial": {"term": "1S1/2", "two_F": 2, "two_mF": 0},
        "final": {"term": "1S1/2", "two_F": 0, "two_mF": 0},
        "note": "magnetic-dipole spin-flip; the 1s spatial density is essentially unchanged",
    },
    {
        "id": "lyman_alpha",
        "label": "Lyman-α (2P1/2 → 1S1/2)",
        "requested_type": "E1",
        "initial": {"term": "2P1/2"},
        "final": {"term": "1S1/2"},
        "note": "allowed electric-dipole optical transition",
    },
    {
        "id": "lyman_alpha_3_2",
        "label": "Lyman-α (2P3/2 → 1S1/2)",
        "requested_type": "E1",
        "initial": {"term": "2P3/2"},
        "final": {"term": "1S1/2"},
        "note": "allowed electric-dipole optical transition (fine-structure partner)",
    },
    {
        "id": "lamb_2s_2p",
        "label": "Lamb-shift comparison (2S1/2 ↔ 2P1/2)",
        "requested_type": "E1",
        "initial": {"term": "2S1/2"},
        "final": {"term": "2P1/2"},
        "note": "A ~1 GHz MICROWAVE interval that exists ONLY because the Lamb shift lifts the "
                "2S1/2–2P1/2 degeneracy — NOT an ordinary optical line. (The E1 rules are satisfied, "
                "but 2S1/2 is metastable via its forbidden 2S→1S channel; do not animate emission.)",
    },
]


def presets() -> list[dict]:
    return [dict(p) for p in PRESETS]
