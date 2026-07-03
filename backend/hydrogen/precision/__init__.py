"""
Precision Atomic Structure and Spectroscopy (Milestone 4).

A LAYERED EFFECTIVE MODEL on top of the nonrelativistic Coulomb baseline
(``hydrogen`` package).  It combines:

  * analytically / perturbatively CALCULATED corrections (fine structure,
    hyperfine coupling, Zeeman / Breit–Rabi), and
  * versioned REFERENCE-DATA corrections (Lamb shift, ground-state hyperfine
    frequency) that are measured/recommended values, NOT first-principles QED.

It is NOT a complete real-time bound-state QED simulation.  Every contribution
declares whether it is analytically calculated, perturbatively calculated,
reference-data, omitted, or outside the current validity range, and the
correction budget reports each term separately with provenance.

This package is pure Python physics: no FastAPI, no Three.js, no QuTiP.  The
authoritative spatial orbital state remains the nonrelativistic probability
density from the ``hydrogen`` package — precision corrections change energy and
spin-angular structure, never the rendered spatial cloud.
"""

from __future__ import annotations

MODEL_VERSION = "hydrogen-precision-1.0.0"
