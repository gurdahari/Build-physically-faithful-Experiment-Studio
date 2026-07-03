"""
Versioned REFERENCE datasets for corrections that are NOT derived from first
principles in this package.  These are measured / recommended spectroscopic
values with explicit provenance, units, uncertainty, and assumptions.

Nothing here is a live calculation.  Every consumer must surface the
``reference`` metadata so the UI can label the contribution "reference-data",
never "real-time simulation".
"""

from __future__ import annotations

# ── Ground-state hyperfine transition (the 21 cm line) ────────────────────────
# The 1S1/2 F=1 ↔ F=0 splitting frequency.  One of the most precisely measured
# quantities in physics (hydrogen-maser value); we retain generous declared
# uncertainty rather than implying full experimental precision downstream.
HYPERFINE_1S_GROUND = {
    "id": "reference-dataset:hydrogen-1s-hyperfine-frequency",
    "version": "v1",
    "quantity": "ground-state hyperfine splitting frequency ν_HF(1S1/2)",
    "value_Hz": 1_420_405_751.768,          # 1420.405751768 MHz
    "uncertainty_Hz": 1.0,                   # declared conservative bound
    "kind": "state-splitting",               # ΔE = h·ν between F=1 and F=0
    "isotope": "¹H (protium)",
    "proton_size_included_in_value": True,   # a measured value includes all real effects
    "assumptions": [
        "field-free (B = 0) hydrogen atom in the 1S1/2 electronic ground state",
        "value is the physical F=1 ↔ F=0 splitting; the effective A I·J model is fit to it",
    ],
    "source": "hydrogen maser measurement (recommended value); used here as a benchmark constant",
}

# ── Lamb shift 2S1/2 − 2P1/2 ──────────────────────────────────────────────────
# Preserved as a TRANSITION DIFFERENCE (not two absolute state shifts).  The
# point-nucleus Dirac/perturbative fine-structure model leaves 2S1/2 and 2P1/2
# degenerate; this measured difference lifts that degeneracy.
LAMB_2S1_2_2P1_2 = {
    "id": "reference-dataset:hydrogen-lamb-2s1_2-2p1_2",
    "version": "v1",
    "quantity": "Lamb shift E(2S1/2) − E(2P1/2)",
    "value_Hz": 1_057_845_000.0,             # 1057.845 MHz (classic recommended value)
    "uncertainty_Hz": 9_000.0,               # ≈ 9 kHz
    "kind": "transition-difference",         # a DIFFERENCE, applied with 2P1/2 as reference
    "reference_level": "2P1/2",              # shift assigned relative to this level
    "shifted_level": "2S1/2",               # 2S1/2 lies ABOVE 2P1/2 by the value
    "isotope": "¹H (protium)",
    "proton_size_included_in_value": True,   # the measured difference includes finite proton size
    "assumptions": [
        "value is the measured/recommended 2S1/2−2P1/2 interval, dominated by QED self-energy",
        "assigned to 2S1/2 with 2P1/2 as the zero reference; NOT split into two absolute QED shifts",
        "point-nucleus fine structure keeps 2S1/2 and 2P1/2 degenerate before this correction",
    ],
    "source": "recommended microwave Lamb-shift value; reference data, not a QED calculation here",
}


def all_references() -> list[dict]:
    return [HYPERFINE_1S_GROUND, LAMB_2S1_2_2P1_2]
