"""
Electric-dipole (E1) and magnetic-dipole (M1) selection rules.

A transition endpoint is described by an electronic level (n, l, j) plus, where
resolved, m_j and/or hyperfine (F, m_F).  Every check is returned explicitly —
never a bare allowed/forbidden — together with the reason, transition type, and
polarization compatibility.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .quantum_numbers import ElectronicLevel, half_str


@dataclass(frozen=True)
class TransitionState:
    electronic: ElectronicLevel
    two_mj: Optional[int] = None
    two_F: Optional[int] = None
    two_mF: Optional[int] = None

    @property
    def parity(self) -> str:
        return "even" if self.electronic.l % 2 == 0 else "odd"


def _polarization(delta_two_m: Optional[int]) -> Optional[str]:
    if delta_two_m is None:
        return None
    return {0: "π (linear, Δm=0)", 2: "σ+ (Δm=+1)", -2: "σ− (Δm=−1)"}.get(delta_two_m)


def _delta(a: Optional[int], b: Optional[int]) -> Optional[int]:
    if a is None or b is None:
        return None
    return b - a


def classify(initial: TransitionState, final: TransitionState, requested_type: Optional[str] = None) -> dict:
    """Classify a transition and evaluate the appropriate selection rules.

    ``requested_type`` may be "E1", "M1", or None (auto).  Auto picks M1 when the
    electronic level is unchanged but the hyperfine state differs (ground-state
    hyperfine), otherwise E1.
    """
    li, lf = initial.electronic, final.electronic
    d_l = lf.l - li.l
    d_two_j = lf.two_j - li.two_j
    parity_changes = initial.parity != final.parity
    d_two_mj = _delta(initial.two_mj, final.two_mj)
    d_two_F = _delta(initial.two_F, final.two_F)
    d_two_mF = _delta(initial.two_mF, final.two_mF)

    same_electronic = (li.n, li.l, li.two_j) == (lf.n, lf.l, lf.two_j)
    hyperfine_resolved = initial.two_F is not None and final.two_F is not None

    if requested_type is None:
        ttype = "M1" if (same_electronic and hyperfine_resolved) else "E1"
    else:
        ttype = requested_type.upper()

    checks = []
    reasons = []

    def add(name, ok, detail):
        checks.append({"rule": name, "passed": bool(ok), "detail": detail})
        if not ok:
            reasons.append(detail)

    if ttype == "E1":
        add("parity must change", parity_changes,
            f"parity {initial.parity} → {final.parity}")
        add("Δl = ±1", d_l in (-1, 1), f"Δl = {d_l}")
        add("Δj ∈ {0, ±1}", d_two_j in (-2, 0, 2), f"Δj = {half_str(abs(d_two_j))}·sgn")
        add("not j=0 → j=0", not (li.two_j == 0 and lf.two_j == 0), "electronic j endpoints")
        if d_two_mj is not None:
            add("Δm_j ∈ {0, ±1}", d_two_mj in (-2, 0, 2), f"Δm_j = {d_two_mj // 2}")
        if hyperfine_resolved:
            add("ΔF ∈ {0, ±1}", d_two_F in (-2, 0, 2), f"ΔF = {d_two_F // 2}")
            add("not F=0 → F=0", not (initial.two_F == 0 and final.two_F == 0), "hyperfine F endpoints")
            if d_two_mF is not None:
                add("Δm_F ∈ {0, ±1}", d_two_mF in (-2, 0, 2), f"Δm_F = {d_two_mF // 2}")
        pol_two_m = d_two_mF if d_two_mF is not None else d_two_mj

    elif ttype == "M1":
        add("orbital parity unchanged (Δl = 0)", d_l == 0, f"Δl = {d_l}")
        if hyperfine_resolved:
            add("ΔF ∈ {0, ±1}", d_two_F in (-2, 0, 2), f"ΔF = {(d_two_F or 0) // 2}")
            add("not F=0 → F=0", not (initial.two_F == 0 and final.two_F == 0), "hyperfine F endpoints")
            add("hyperfine state changes", initial.two_F != final.two_F or initial.two_mF != final.two_mF,
                "M1 must change the (F, m_F) state")
            if d_two_mF is not None:
                add("Δm_F ∈ {0, ±1}", d_two_mF in (-2, 0, 2), f"Δm_F = {d_two_mF // 2}")
        else:
            add("hyperfine resolution required", False,
                "M1 ground-state transition requires F, m_F on both endpoints")
        pol_two_m = d_two_mF
    else:
        raise ValueError(f"unknown transition type '{ttype}' (use E1 or M1)")

    allowed = all(c["passed"] for c in checks)
    return {
        "type": ttype,
        "type_name": "electric dipole" if ttype == "E1" else "magnetic dipole",
        "allowed": allowed,
        "checks": checks,
        "reason": "all selection rules satisfied" if allowed else "; ".join(reasons),
        "deltas": {
            "delta_l": d_l,
            "delta_j": None if d_two_j is None else d_two_j // 2 if d_two_j % 2 == 0 else d_two_j / 2.0,
            "parity_changes": parity_changes,
            "delta_two_j": d_two_j,
            "delta_two_F": d_two_F,
            "delta_two_mj": d_two_mj,
            "delta_two_mF": d_two_mF,
        },
        "polarization": _polarization(pol_two_m),
        "polarization_resolved": pol_two_m is not None,
    }
