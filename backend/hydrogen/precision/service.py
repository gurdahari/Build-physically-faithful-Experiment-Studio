"""
Orchestration for the precision layer.

Owns the correction stack, assembles the per-level correction budget (each term
reported separately with provenance), builds the ground-state Breit–Rabi
structure, and prices transitions.  Scientific/validation problems raise
ValueError (→ 422 at the route).  All outputs are JSON-native (reuses the atomic
service's ``_json_safe``): no NumPy scalars, complex, NaN, or Infinity.
"""

from __future__ import annotations

from .. import constants as C
from ..service import _json_safe
from . import (
    MODEL_VERSION, constants as PC, reference_data as RD,
    fine_structure as FS, recoil as RC, lamb_shift as LS,
    hyperfine as HF, zeeman as ZE, selection_rules as SR, transitions as TR,
)
from .quantum_numbers import (
    ElectronicLevel, HyperfineLevel, electronic_from_term, supported_terms,
    ground_hyperfine_levels, couple_two_F, half_str, TWO_I_PROTON,
)

# Which corrections each state family supports (others → clear error).
FAMILY_ALLOWED = {
    "fine_structure": {"fine_structure", "lamb_shift", "zeeman"},
    "ground_hyperfine": {"hyperfine", "zeeman"},
}

ENERGY_HIERARCHY = "E_total = E_Coulomb + ΔE_fine + ΔE_recoil + ΔE_Lamb + ΔE_hyperfine + ΔE_Zeeman"


def _provider_contracts() -> list[dict]:
    return [FS.contract(), RC.contract(), LS.contract(), HF.contract(), ZE.contract()]


def model_metadata() -> dict:
    return {
        "model_version": MODEL_VERSION,
        "model_name": "Precision Atomic Structure and Spectroscopy (layered effective model)",
        "constants_version": PC.CONSTANTS_VERSION,
        "energy_hierarchy": ENERGY_HIERARCHY,
        "statement": (
            "A layered effective model combining analytic/perturbative calculations and "
            "versioned reference data. NOT a complete real-time bound-state QED simulation."
        ),
        "supported_electronic_states": supported_terms(),
        "supported_families": {
            "fine_structure": {
                "states": supported_terms(),
                "allowed_corrections": sorted(FAMILY_ALLOWED["fine_structure"]),
            },
            "ground_hyperfine": {
                "states": [hl.label for hl in ground_hyperfine_levels()],
                "allowed_corrections": sorted(FAMILY_ALLOWED["ground_hyperfine"]),
            },
        },
        "correction_providers": _provider_contracts(),
        "reference_datasets": RD.all_references(),
        "included_physics": [
            "point-nucleus Coulomb baseline (reduced mass)", "electron spin s=1/2",
            "orbital angular momentum l", "total electronic angular momentum j",
            "leading fine structure (n, j)", "reduced-mass recoil (baseline)",
            "electron–proton hyperfine coupling (ground state)", "proton spin I=1/2",
            "total atomic angular momentum F", "static-field Zeeman / Breit–Rabi",
            "E1/M1 selection rules", "reference-data Lamb shift (2S1/2−2P1/2)",
        ],
        "omitted_physics": [
            "full numerical bound-state QED", "arbitrary-order radiative corrections",
            "complete two-photon exchange", "full proton-polarizability calculation",
            "arbitrary excited-state hyperfine precision", "strong-field ionization",
            "time-dependent optical driving", "spontaneous-emission dynamics",
            "collisions", "environmental decoherence", "many-body effects",
            "molecular hydrogen", "proton internal real-time dynamics",
            "electroweak corrections",
        ],
        "correction_classifications": {
            "computed": ["fine_structure", "hyperfine", "zeeman"],
            "reference_data": ["lamb_shift", "hyperfine (ν_HF fixed to reference)"],
            "not_active": ["recoil (additional; baseline already reduced-mass)"],
            "not_implemented": ["full bound-state QED", "excited-state hyperfine"],
        },
        "validity_ranges": {
            "fine_structure": "low-Z, leading (Zα)², n ≤ 2",
            "lamb_shift": "¹H 2S1/2−2P1/2 microwave interval only",
            "hyperfine": "¹H 1S1/2 ground state only",
            "zeeman": "Breit–Rabi ground manifold across field; fine-structure Zeeman weak-field only; B ≤ 20 T",
        },
        "constants": PC.constants_snapshot(),
        "transition_presets": TR.presets(),
        "provenance": {"solver": "analytic + reference data", "engine": "not QuTiP", "model": MODEL_VERSION},
        "spatial_orbital_note": (
            "Spatial density source remains the nonrelativistic orbital model. Precision corrections "
            "change energy and spin-angular structure, not the rendered spatial cloud."
        ),
    }


def _validate_family_corrections(family: str, corrections: list[str]) -> set:
    allowed = FAMILY_ALLOWED[family]
    enabled = set(corrections)
    unsupported = enabled - allowed
    if unsupported:
        raise ValueError(
            f"unsupported correction combination: {sorted(unsupported)} not available for "
            f"family '{family}'; allowed: {sorted(allowed)}"
        )
    return enabled


def _budget(baseline_j, fine_j, lamb_j, hyper_j, zeeman_j) -> dict:
    total = baseline_j + fine_j + 0.0 + lamb_j + hyper_j + zeeman_j
    return {
        "baseline_coulomb_eV": PC.ev_from_joules(baseline_j),
        "fine_structure_eV": PC.ev_from_joules(fine_j),
        "recoil_eV": 0.0,   # additional recoil not active (baseline already reduced-mass)
        "lamb_shift_eV": PC.ev_from_joules(lamb_j),
        "hyperfine_eV": PC.ev_from_joules(hyper_j),
        "zeeman_eV": PC.ev_from_joules(zeeman_j),
        "total_eV": PC.ev_from_joules(total),
    }


# ── Fine-structure family ─────────────────────────────────────────────────────
def _electronic_level_result(level: ElectronicLevel, enabled: set, b: float) -> dict:
    baseline = FS.baseline_coulomb_j(level.n)
    fine = FS.fine_structure_shift_j(level) if "fine_structure" in enabled else 0.0
    lamb = LS.shift_j(level) if "lamb_shift" in enabled else 0.0
    total_j = baseline + fine + lamb

    result = {
        "term_symbol": level.term_symbol,
        "quantum_numbers": level.to_dict(),
        "degeneracy": level.two_j + 1,
        "budget": _budget(baseline, fine, lamb, 0.0, 0.0),
        "total_eV": PC.ev_from_joules(total_j),
        "total_J": total_j,
        "uncertainty": {
            "fine_structure": FS.contract()["uncertainty"],
            "lamb_shift": LS.contract()["uncertainty"] if "lamb_shift" in enabled else "not applied",
        },
        "composition_note": "pure electronic level (no basis mixing at this resolution)",
        "corrections_applied": sorted(enabled),
    }
    if "zeeman" in enabled and b > 0.0:
        result["zeeman_sublevels"] = ZE.fine_structure_zeeman(level, b)
    return result


# ── Ground-state hyperfine family ─────────────────────────────────────────────
def _ground_zero_field(enabled: set) -> list[dict]:
    g = electronic_from_term("1S1/2")
    baseline = FS.baseline_coulomb_j(g.n)
    out = []
    for hl in ground_hyperfine_levels():
        hyper = HF.hyperfine_shift_j(hl) if "hyperfine" in enabled else 0.0
        total_j = baseline + hyper
        out.append({
            "label": hl.label,
            "quantum_numbers": hl.to_dict(),
            "degeneracy": hl.degeneracy,
            "budget": _budget(baseline, 0.0, 0.0, hyper, 0.0),
            "total_eV": PC.ev_from_joules(total_j),
            "total_J": total_j,
        })
    return out


def _ground_breit_rabi(enabled: set, b: float) -> dict:
    """Field-resolved Breit–Rabi sublevels with a non-double-counting budget."""
    g = electronic_from_term("1S1/2")
    baseline = FS.baseline_coulomb_j(g.n)
    a_j = HF.hyperfine_constant_A_j()
    hyper_F1 = a_j * HF.i_dot_j(2, g.two_j)   # +A/4
    hyper_F0 = a_j * HF.i_dot_j(0, g.two_j)   # −3A/4
    br = ZE.ground_breit_rabi(b)

    sublevels = []
    for lv in br["levels"]:
        # Parent zero-field F: stretched & mixed-upper → F=1; mixed-lower → F=0.
        if lv["branch"] == "stretched":
            parent_hyper = hyper_F1
        else:
            parent_hyper = hyper_F1 if lv["coupled_composition"]["F=1"] >= lv["coupled_composition"]["F=0"] else hyper_F0
        relative_j = PC.joules_from_ev(lv["energy_eV"])   # A I·J + Zeeman (relative to 1S electronic)
        hyper_j = parent_hyper if "hyperfine" in enabled else 0.0
        zeeman_j = relative_j - hyper_j
        total_j = baseline + relative_j
        sublevels.append({
            **lv,
            "budget": _budget(baseline, 0.0, 0.0, hyper_j, zeeman_j),
            "total_eV": PC.ev_from_joules(total_j),
            "total_J": total_j,
        })
    return {
        "regime": br["regime"],
        "x_ratio_electronZeeman_over_hyperfine": br["x_ratio_electronZeeman_over_hyperfine"],
        "F_good_quantum_number": br["F_good_quantum_number"],
        "B_tesla": b,
        "sublevels": sublevels,
        "note": br["note"],
    }


def compute_levels(req) -> dict:
    family = req.state_family
    enabled = _validate_family_corrections(family, req.corrections)
    b = float(req.magnetic_field_tesla)

    resp = {
        "model_version": MODEL_VERSION,
        "constants_version": PC.CONSTANTS_VERSION,
        "state_family": family,
        "corrections_enabled": sorted(enabled),
        "magnetic_field_tesla": b,
        "energy_hierarchy": ENERGY_HIERARCHY,
        "spatial_orbital_note": (
            "Spatial density source: nonrelativistic orbital model. Precision overlay: "
            "spin and energy corrections only — the spatial cloud is not deformed."
        ),
        "recoil": RC.evaluate(),
        "provenance": {"model": MODEL_VERSION, "engine": "not QuTiP", "constants": PC.CONSTANTS_VERSION},
    }

    if family == "fine_structure":
        levels = [_electronic_level_result(lv, enabled, b) for lv in _supported_levels()]
        resp["levels"] = levels
        resp["reference_datasets"] = [RD.LAMB_2S1_2_2P1_2] if "lamb_shift" in enabled else []
    else:  # ground_hyperfine
        resp["zero_field_levels"] = _ground_zero_field(enabled)
        resp["hyperfine_reference"] = RD.HYPERFINE_1S_GROUND
        if "zeeman" in enabled and b > 0.0:
            resp["breit_rabi"] = _ground_breit_rabi(enabled, b)
        if req.field_sweep:
            bmax = req.sweep_bmax_tesla or (b if b > 0 else 0.05)
            resp["breit_rabi_sweep"] = ZE.ground_breit_rabi_sweep(bmax, req.sweep_points)
        resp["ground_manifold_summary"] = HF.ground_manifold()

    return _json_safe(resp)


def _supported_levels() -> list[ElectronicLevel]:
    from .quantum_numbers import SUPPORTED_ELECTRONIC
    return list(SUPPORTED_ELECTRONIC)


# ── Transitions ───────────────────────────────────────────────────────────────
def _endpoint_state(ep) -> SR.TransitionState:
    level = electronic_from_term(ep.term)
    if ep.two_F is not None:
        if ep.term != "1S1/2":
            raise ValueError("hyperfine-resolved endpoints are only supported for 1S1/2")
        if not (ep.two_F in couple_two_F(level.two_j)):
            raise ValueError(f"invalid F for {ep.term}")
        if ep.two_mF is not None and ep.two_mF not in range(-ep.two_F, ep.two_F + 1, 2):
            raise ValueError("invalid m_F for the requested F")
    if ep.two_mj is not None and ep.two_mj not in level.m_j_values():
        raise ValueError(f"invalid m_j for {ep.term}")
    return SR.TransitionState(level, two_mj=ep.two_mj, two_F=ep.two_F, two_mF=ep.two_mF)


def _endpoint_energy_j(ep, enabled: set, b: float) -> float:
    level = electronic_from_term(ep.term)
    e = FS.baseline_coulomb_j(level.n)
    if "fine_structure" in enabled:
        e += FS.fine_structure_shift_j(level)
    if "lamb_shift" in enabled:
        e += LS.shift_j(level)
    if ep.two_mj is not None and "zeeman" in enabled and b > 0.0:
        e += ZE.weak_field_zeeman_j(level, ep.two_mj, b)
    if ep.two_F is not None:
        if "hyperfine" not in enabled:
            raise ValueError("hyperfine-resolved endpoint requires the 'hyperfine' correction")
        if b > 0.0 and "zeeman" in enabled and ep.two_mF is not None:
            e += _ground_sublevel_relative_j(ep.two_F, ep.two_mF, b)
        else:
            e += HF.hyperfine_constant_A_j() * HF.i_dot_j(ep.two_F, level.two_j)
    return e


def _ground_sublevel_relative_j(two_F: int, two_mF: int, b: float) -> float:
    br = ZE.ground_breit_rabi(b)["levels"]
    if abs(two_mF) == 2:
        for lv in br:
            if lv["two_mF"] == two_mF:
                return PC.joules_from_ev(lv["energy_eV"])
    # m_F = 0: pick the branch matching requested F (upper=F1, lower=F0).
    mixed = sorted((lv for lv in br if lv["two_mF"] == 0), key=lambda x: x["energy_eV"], reverse=True)
    pick = mixed[0] if two_F == 2 else mixed[-1]
    return PC.joules_from_ev(pick["energy_eV"])


def compute_transitions(req) -> dict:
    enabled = set(req.corrections)
    b = float(req.magnetic_field_tesla)

    if req.preset:
        preset = next((p for p in TR.PRESETS if p["id"] == req.preset), None)
        if preset is None:
            raise ValueError(f"unknown preset '{req.preset}'")
        init = _EP(preset["initial"])
        fin = _EP(preset["final"])
        ttype = preset.get("requested_type")
        meta = {"preset": preset["id"], "preset_label": preset["label"], "preset_note": preset["note"]}
    else:
        if req.initial is None or req.final is None:
            raise ValueError("transition requires 'initial' and 'final' endpoints (or a 'preset')")
        init, fin = req.initial, req.final
        ttype = req.transition_type
        meta = {}

    si = _endpoint_state(init)
    sf = _endpoint_state(fin)
    classification = SR.classify(si, sf, ttype)

    e_i = _endpoint_energy_j(init, enabled, b)
    e_f = _endpoint_energy_j(fin, enabled, b)

    result = TR.assemble(classification, e_i, e_f, meta)
    result.update({
        "model_version": MODEL_VERSION,
        "constants_version": PC.CONSTANTS_VERSION,
        "magnetic_field_tesla": b,
        "corrections_enabled": sorted(enabled),
        "initial": {"term": init.term, "two_F": init.two_F, "two_mF": init.two_mF, "two_mj": init.two_mj},
        "final": {"term": fin.term, "two_F": fin.two_F, "two_mF": fin.two_mF, "two_mj": fin.two_mj},
        "provenance": {"model": MODEL_VERSION, "engine": "not QuTiP", "constants": PC.CONSTANTS_VERSION},
        "draw_arrow": classification["allowed"],   # never draw an arrow for a forbidden transition
    })
    return _json_safe(result)


class _EP:
    """Lightweight endpoint adapter so presets (dicts) reuse the schema-endpoint API."""
    def __init__(self, d: dict):
        self.term = d["term"]
        self.two_F = d.get("two_F")
        self.two_mF = d.get("two_mF")
        self.two_mj = d.get("two_mj")


def transition_presets() -> list[dict]:
    return TR.presets()
