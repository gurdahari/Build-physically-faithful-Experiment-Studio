"""
Scientific tests for the Precision Atomic Structure layer (Milestone 4).

Covers half-integer-safe quantum numbers, fine structure, recoil bookkeeping,
the Lamb-shift reference provider, ground-state hyperfine + the 21 cm line,
Breit–Rabi structure, selection rules / transitions, the correction budget, and
API integrity.  Tolerances are declared inline.
"""

import json
import math

import pytest
from fastapi.testclient import TestClient

from hydrogen.precision import service as S
from hydrogen.precision import (
    constants as PC, fine_structure as FS, recoil as RC, lamb_shift as LS,
    hyperfine as HF, zeeman as ZE, selection_rules as SR,
)
from hydrogen.precision.quantum_numbers import (
    ElectronicLevel, HyperfineLevel, couple_two_j, couple_two_F, projections,
    half_str, electronic_from_term,
)
from hydrogen.precision.schemas import LevelsRequest, TransitionRequest, Endpoint
from main import app

client = TestClient(app)

EV = 1.602176634e-19
REL = 1e-9      # exact analytic identities
TOL_HF = 1e-6   # hyperfine reference match (relative)


# 1 ─ Half-integer quantum numbers are exact/stable (doubled integers) ─────────
def test_half_integer_representation_is_exact():
    assert half_str(1) == "1/2"
    assert half_str(2) == "1"
    assert half_str(3) == "3/2"
    assert projections(3) == [-3, -1, 1, 3]        # m_j for j=3/2
    assert projections(2) == [-2, 0, 2]            # m_F for F=1
    # no floating-point equality anywhere in coupling
    assert all(isinstance(x, int) for x in couple_two_j(1) + couple_two_F(3))


# 2 ─ Valid j follow |l−s|..l+s ───────────────────────────────────────────────
def test_valid_j_coupling():
    assert couple_two_j(0) == [1]            # l=0 → j=1/2
    assert couple_two_j(1) == [1, 3]         # l=1 → j=1/2, 3/2
    assert couple_two_j(2) == [3, 5]         # l=2 → j=3/2, 5/2
    with pytest.raises(ValueError):
        ElectronicLevel(2, 1, 5)             # j=5/2 invalid for l=1


# 3 ─ Valid F follow |j−I|..j+I ───────────────────────────────────────────────
def test_valid_F_coupling():
    assert couple_two_F(1) == [0, 2]         # j=1/2, I=1/2 → F=0,1
    assert couple_two_F(3) == [2, 4]         # j=3/2, I=1/2 → F=1,2
    g = electronic_from_term("1S1/2")
    with pytest.raises(ValueError):
        HyperfineLevel(g, 4)                 # F=2 invalid for j=1/2


# 4 ─ Invalid m_j / m_F are rejected ──────────────────────────────────────────
def test_invalid_projections_rejected():
    with pytest.raises(ValueError):
        S.compute_transitions(TransitionRequest(
            initial=Endpoint(term="1S1/2", two_F=2, two_mF=4),   # m_F=2 invalid for F=1
            final=Endpoint(term="1S1/2", two_F=0, two_mF=0), transition_type="M1"))
    with pytest.raises(ValueError):
        S.compute_transitions(TransitionRequest(
            initial=Endpoint(term="2P1/2", two_mj=3),            # m_j=3/2 invalid for j=1/2
            final=Endpoint(term="1S1/2"), transition_type="E1"))


# 5 ─ Fine structure depends on n and j ───────────────────────────────────────
def test_fine_structure_depends_on_n_and_j():
    d_1s = FS.fine_structure_shift_j(ElectronicLevel(1, 0, 1))
    d_2s = FS.fine_structure_shift_j(ElectronicLevel(2, 0, 1))   # same j, different n
    d_2p12 = FS.fine_structure_shift_j(ElectronicLevel(2, 1, 1))
    d_2p32 = FS.fine_structure_shift_j(ElectronicLevel(2, 1, 3))  # same n, different j
    assert d_1s != d_2s
    assert d_2p12 != d_2p32
    # same (n, j) ⇒ identical shift (2S1/2 and 2P1/2)
    assert d_2s == pytest.approx(d_2p12, rel=REL)


# 6 ─ 2P1/2 below 2P3/2 (correct sign/ordering) ───────────────────────────────
def test_fine_structure_ordering():
    e_2p12 = FS.evaluate(ElectronicLevel(2, 1, 1))["total_point_nucleus_J"]
    e_2p32 = FS.evaluate(ElectronicLevel(2, 1, 3))["total_point_nucleus_J"]
    assert e_2p12 < e_2p32
    split_eV = (e_2p32 - e_2p12) / EV
    assert split_eV == pytest.approx(4.53e-5, rel=5e-2)   # ≈ 10.97 GHz


# 7 ─ 2S1/2 and 2P1/2 degenerate before Lamb ──────────────────────────────────
def test_2s_2p_degenerate_before_lamb():
    r = S.compute_levels(LevelsRequest(state_family="fine_structure", corrections=["fine_structure"]))
    by = {lv["term_symbol"]: lv["total_J"] for lv in r["levels"]}
    assert by["2S1/2"] == pytest.approx(by["2P1/2"], rel=REL)


# 8 ─ Lamb provider lifts the 2S1/2−2P1/2 degeneracy ─────────────────────────
def test_lamb_lifts_degeneracy():
    r = S.compute_levels(LevelsRequest(state_family="fine_structure", corrections=["fine_structure", "lamb_shift"]))
    by = {lv["term_symbol"]: lv["total_J"] for lv in r["levels"]}
    diff_hz = (by["2S1/2"] - by["2P1/2"]) / PC.H_PLANCK
    assert diff_hz > 0
    assert diff_hz == pytest.approx(1_057_845_000.0, rel=1e-6)


# 9 ─ Lamb values include source, version, units, uncertainty ─────────────────
def test_lamb_provenance_complete():
    ref = LS.reference()
    for key in ("id", "version", "value_Hz", "uncertainty_Hz", "kind", "isotope"):
        assert key in ref
    c = LS.contract()
    assert c["classification"] == "reference-data"
    assert "reference-dataset" in c["reference_or_derivation"]


# 10 ─ Reduced-mass recoil is not double counted ──────────────────────────────
def test_recoil_not_double_counted():
    r = RC.evaluate()
    assert r["status"] == "not_active"
    assert r["additional_recoil_J"] == 0.0
    assert 0.999 < r["reduced_mass_over_electron_mass"] < 1.0   # μ/m_e slightly below 1


# 11 ─ Ground hyperfine produces F=0 and F=1 ──────────────────────────────────
def test_ground_hyperfine_F_levels():
    r = S.compute_levels(LevelsRequest(state_family="ground_hyperfine", corrections=["hyperfine"]))
    Fs = {lv["quantum_numbers"]["F"] for lv in r["zero_field_levels"]}
    assert Fs == {"0", "1"}


# 12 ─ Zero-field F=1 triplet m_F states are degenerate ───────────────────────
def test_zero_field_triplet_degenerate():
    br = ZE.ground_breit_rabi(0.0)
    f1 = [lv["energy_eV"] for lv in br["levels"] if lv["coupled_composition"]["F=1"] >= 0.5]
    assert len(f1) == 3
    assert max(f1) == pytest.approx(min(f1), abs=1e-18)


# 13 ─ Ground hyperfine splitting matches the versioned provider ──────────────
def test_hyperfine_splitting_matches_reference():
    gm = HF.ground_manifold()
    assert gm["splitting"]["frequency_MHz"] == pytest.approx(1420.405751768, rel=TOL_HF)


# 14 ─ 21 cm energy / frequency / wavelength are mutually consistent ──────────
def test_21cm_self_consistent():
    t = S.compute_transitions(TransitionRequest(preset="hyperfine_21cm"))
    assert t["frequency_Hz"] == pytest.approx(t["energy_eV"] * EV / PC.H_PLANCK, rel=REL)
    assert t["wavelength_cm"] == pytest.approx(29979245800.0 / t["frequency_Hz"], rel=REL)
    assert t["wavelength_cm"] == pytest.approx(21.106, rel=1e-3)


# 15 ─ 21 cm is a magnetic-dipole transition ─────────────────────────────────
def test_21cm_is_magnetic_dipole():
    t = S.compute_transitions(TransitionRequest(preset="hyperfine_21cm"))
    assert t["type"] == "M1"
    assert t["type_name"] == "magnetic dipole"
    assert t["allowed"] is True


# 16 ─ Breit–Rabi reduces to zero-field hyperfine energies at B=0 ─────────────
def test_breit_rabi_zero_field_limit():
    a_j = HF.hyperfine_constant_A_j()
    br = ZE.ground_breit_rabi(0.0)
    energies = sorted(lv["energy_eV"] for lv in br["levels"])
    expected = sorted([PC.ev_from_joules(a_j * 0.25)] * 3 + [PC.ev_from_joules(-0.75 * a_j)])
    for got, exp in zip(energies, expected):
        assert got == pytest.approx(exp, rel=1e-9, abs=1e-18)


# 17 ─ Weak-field slopes are physically consistent ───────────────────────────
def test_weak_field_slopes():
    def stretched(bt, two_mF):
        lv = [x for x in ZE.ground_breit_rabi(bt)["levels"] if x["two_mF"] == two_mF][0]
        return lv["energy_eV"]
    b1, b2 = 1e-4, 2e-4
    slope_up = (stretched(b2, 2) - stretched(b1, 2)) / (b2 - b1)
    slope_dn = (stretched(b2, -2) - stretched(b1, -2)) / (b2 - b1)
    assert slope_up > 0 and slope_dn < 0
    assert ZE.ground_breit_rabi(b1)["regime"] == "weak_field"


# 18 ─ High-field labeling changes when F is no longer good ──────────────────
def test_high_field_paschen_back():
    br = ZE.ground_breit_rabi(5.0)
    assert br["regime"] == "paschen_back"
    assert br["F_good_quantum_number"] is False
    assert all(lv["F_label"] is None for lv in br["levels"])


# 19 ─ State-composition probabilities normalize to one ──────────────────────
def test_composition_normalizes():
    br = ZE.ground_breit_rabi(0.03)
    for lv in br["levels"]:
        cc = lv["coupled_composition"]
        assert cc["F=1"] + cc["F=0"] == pytest.approx(1.0, abs=1e-9)
        assert sum(lv["uncoupled_composition"].values()) == pytest.approx(1.0, abs=1e-9)


# 20 ─ Allowed E1 passes all implemented rules ───────────────────────────────
def test_allowed_e1():
    t = S.compute_transitions(TransitionRequest(preset="lyman_alpha"))
    assert t["type"] == "E1" and t["allowed"] is True
    assert all(c["passed"] for c in t["selection_rules"])
    assert t["wavelength_nm"] == pytest.approx(121.567, rel=1e-3)


# 21 ─ Forbidden parity transition rejected ──────────────────────────────────
def test_forbidden_parity():
    t = S.compute_transitions(TransitionRequest(
        initial=Endpoint(term="1S1/2"), final=Endpoint(term="2S1/2"), transition_type="E1"))
    assert t["allowed"] is False
    assert t["draw_arrow"] is False
    assert any("parity" in c["rule"] and not c["passed"] for c in t["selection_rules"])


# 22 ─ 0↔0 angular-momentum rule is enforced where applicable ────────────────
def test_zero_zero_rule_present():
    st = SR.TransitionState(ElectronicLevel(2, 1, 1))
    cls = SR.classify(st, SR.TransitionState(ElectronicLevel(1, 0, 1)), "E1")
    assert any(c["rule"] == "not j=0 → j=0" for c in cls["checks"])


# 23 ─ Hyperfine F=0 ↔ F=0 rejected ──────────────────────────────────────────
def test_hyperfine_00_forbidden():
    t = S.compute_transitions(TransitionRequest(
        initial=Endpoint(term="1S1/2", two_F=0, two_mF=0),
        final=Endpoint(term="1S1/2", two_F=0, two_mF=0), transition_type="M1"))
    assert t["allowed"] is False
    assert any("F=0 → F=0" in c["rule"] and not c["passed"] for c in t["selection_rules"])


# 24 ─ Polarization / Δm handled correctly ───────────────────────────────────
def test_polarization_rules():
    # π: Δm_F = 0
    pi = S.compute_transitions(TransitionRequest(
        initial=Endpoint(term="1S1/2", two_F=2, two_mF=0),
        final=Endpoint(term="1S1/2", two_F=0, two_mF=0), transition_type="M1"))
    assert pi["allowed"] is True and "π" in pi["polarization"]
    # σ: Δm_F = −1 (allowed)
    sig = S.compute_transitions(TransitionRequest(
        initial=Endpoint(term="1S1/2", two_F=2, two_mF=2),
        final=Endpoint(term="1S1/2", two_F=0, two_mF=0), transition_type="M1"))
    assert sig["allowed"] is True and "σ" in sig["polarization"]
    # Δm_F = ±2 is forbidden (F=1, m_F=+1 → F=1, m_F=−1)
    forb = S.compute_transitions(TransitionRequest(
        initial=Endpoint(term="1S1/2", two_F=2, two_mF=2),
        final=Endpoint(term="1S1/2", two_F=2, two_mF=-2), transition_type="M1"))
    assert forb["allowed"] is False
    assert any("Δm_F" in c["rule"] and not c["passed"] for c in forb["selection_rules"])


# 25 ─ Transition energy/frequency/ω/wavelength consistent ───────────────────
def test_transition_quantities_consistent():
    t = S.compute_transitions(TransitionRequest(preset="lyman_alpha"))
    nu = t["frequency_Hz"]
    assert t["angular_frequency_rad_s"] == pytest.approx(2 * math.pi * nu, rel=REL)
    assert t["wavelength_m"] == pytest.approx(299792458.0 / nu, rel=REL)
    assert t["energy_eV"] == pytest.approx(PC.H_PLANCK * nu / EV, rel=REL)


# 26 ─ Correction-budget terms sum to the reported total ─────────────────────
def test_budget_sums_to_total():
    for fam, corr, field in [
        ("fine_structure", ["fine_structure", "lamb_shift"], 0.0),
        ("ground_hyperfine", ["hyperfine", "zeeman"], 0.02),
    ]:
        r = S.compute_levels(LevelsRequest(state_family=fam, corrections=corr, magnetic_field_tesla=field))
        groups = r.get("levels") or r.get("breit_rabi", {}).get("sublevels") or r["zero_field_levels"]
        for lv in groups:
            b = lv["budget"]
            s = (b["baseline_coulomb_eV"] + b["fine_structure_eV"] + b["recoil_eV"]
                 + b["lamb_shift_eV"] + b["hyperfine_eV"] + b["zeeman_eV"])
            assert s == pytest.approx(b["total_eV"], rel=1e-12, abs=1e-15)


# 27 ─ Unsupported correction combinations return clear errors ───────────────
def test_unsupported_combination_errors():
    with pytest.raises(ValueError):
        S.compute_levels(LevelsRequest(state_family="fine_structure", corrections=["hyperfine"]))
    with pytest.raises(ValueError):
        S.compute_levels(LevelsRequest(state_family="ground_hyperfine", corrections=["lamb_shift"]))
    # via API → 422
    resp = client.post("/hydrogen/precision/levels",
                       json={"state_family": "fine_structure", "corrections": ["hyperfine"]})
    assert resp.status_code == 422


# 28 ─ API responses are finite and JSON-serializable ────────────────────────
def test_api_json_serializable():
    assert client.get("/hydrogen/precision/model").status_code == 200
    payloads = [
        {"state_family": "fine_structure", "corrections": ["fine_structure", "lamb_shift", "zeeman"],
         "magnetic_field_tesla": 0.5, "include_sublevels": True},
        {"state_family": "ground_hyperfine", "corrections": ["hyperfine", "zeeman"],
         "magnetic_field_tesla": 0.03, "field_sweep": True, "sweep_bmax_tesla": 0.1},
    ]
    for p in payloads:
        resp = client.post("/hydrogen/precision/levels", json=p)
        assert resp.status_code == 200
        text = json.dumps(resp.json())          # raises if not serializable
        assert "NaN" not in text and "Infinity" not in text
    t = client.post("/hydrogen/precision/transitions", json={"preset": "hyperfine_21cm"})
    assert t.status_code == 200
    assert "NaN" not in json.dumps(t.json())


# 29 ─ Precision calculations do not mutate the nonrelativistic atomic state ──
def test_precision_does_not_mutate_atomic():
    body = {"coefficients": [{"state": "hydrogen.state.n1_l0_m0", "real": 1, "imag": 0}],
            "time_seconds": 0, "sampling": {"type": "volume", "bound_amu": 8, "resolution": 6},
            "quantities": ["abs2"], "diagnostic_bound_amu": 8}
    before = client.post("/hydrogen/atomic/evaluate", json=body).json()
    S.compute_levels(LevelsRequest(state_family="fine_structure", corrections=["fine_structure", "lamb_shift"]))
    S.compute_transitions(TransitionRequest(preset="hyperfine_21cm"))
    after = client.post("/hydrogen/atomic/evaluate", json=body).json()
    assert before["sampling"]["fields"]["abs2"] == after["sampling"]["fields"]["abs2"]
    assert before["energy"] == after["energy"]


# 30 ─ Precision layer does not invoke QuTiP ─────────────────────────────────
def test_precision_does_not_import_qutip():
    import pathlib
    import re
    pkg = pathlib.Path(HF.__file__).parent
    for f in pkg.glob("*.py"):
        src = f.read_text(encoding="utf-8")
        # No qutip IMPORT (the words "not QuTiP" as a provenance label are fine).
        assert not re.search(r"^\s*(import|from)\s+qutip", src, re.M), f"{f.name} imports qutip"
    assert S.model_metadata()["provenance"]["engine"] == "not QuTiP"
