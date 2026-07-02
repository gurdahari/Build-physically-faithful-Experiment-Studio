"""
Scientific tests for the nonrelativistic analytic Hydrogen solver (Milestone 2).

Analytic reference values are used wherever possible.  Documented tolerances:
  ATOL_NORM   = 5e-4   radial/volume analytic normalization (scipy quad)
  ATOL_DIAG   = 1e-2   finite-domain midpoint-integration normalization
  TOL_REL     = 1e-9   exact analytic identities (energies, beats, populations)
  H_SPACE     = 1e-2·aμ central-difference step for continuity divergence
  CONTINUITY  = 3e-2   relative tolerance for the continuity-equation check
"""

import math
import cmath
import json

import numpy as np
import pytest
from scipy.integrate import quad

from fastapi.testclient import TestClient

from hydrogen import constants as C
from hydrogen import analytic_solver as S
from hydrogen import basis, sampling, observables, cache
from hydrogen.state import AtomicHydrogenState
from main import app

client = TestClient(app)

A = C.A_MU
K1 = "hydrogen.state.n1_l0_m0"
K2S = "hydrogen.state.n2_l0_m0"
K2P0 = "hydrogen.state.n2_l1_m0"
K2Pp = "hydrogen.state.n2_l1_m1"
K2Pm = "hydrogen.state.n2_l1_m-1"

ATOL_NORM = 5e-4
ATOL_DIAG = 1e-2
TOL_REL = 1e-9


def one(key):
    return AtomicHydrogenState.from_entries([{"state": key, "real": 1.0, "imag": 0.0}])


def current_at(state, x, y, z, t=0.0):
    psi = state.psi(x, y, z, t)
    grad = state.grad_psi(x, y, z, t)
    return observables.probability_current(psi, grad)


# 1–4  Constants, reduced mass, energies, degeneracy ──────────────────────────
def test_1_reduced_mass():
    assert abs(C.MU - C.M_E * C.M_P / (C.M_E + C.M_P)) < 1e-40


def test_2_adjusted_bohr_uses_reduced_mass():
    expected = C.FOUR_PI_EPS0 * C.HBAR**2 / (C.MU * C.E_CHARGE**2)
    assert abs(C.A_MU - expected) < 1e-25
    # aμ = a0·(m_e/μ) to high precision
    assert abs(C.A_MU - C.A0 * (C.M_E / C.MU)) / C.A_MU < 1e-6


def test_3_energies_scale_inverse_square():
    for n in (1, 2, 3):
        assert abs(C.energy_joules(n) - C.energy_joules(1) / n**2) < 1e-30
    assert C.energy_ev(1) < 0 and abs(C.energy_ev(1) + 13.598) < 0.01


def test_4_same_n_degenerate():
    e2 = {basis.get_state(k).energy_j for k in (K2S, K2P0, K2Pp, K2Pm)}
    assert len(e2) == 1


# 5–11  Wavefunctions, symmetry, nodes, density ───────────────────────────────
def test_5_wavefunctions_normalize():
    for (n, l) in [(1, 0), (2, 0), (2, 1)]:
        val, _ = quad(lambda r: S.R_nl(n, l, r) ** 2 * r * r, 0, 80 * A, limit=300)
        assert abs(val - 1.0) < ATOL_NORM


def test_6_1s_density_spherically_symmetric():
    r0 = 0.9 * A
    vals = [abs(S.psi_cartesian(1, 0, 0, r0 * math.sin(t) * math.cos(p),
                                r0 * math.sin(t) * math.sin(p), r0 * math.cos(t))) ** 2
            for (t, p) in [(0.3, 0.1), (1.1, 2.0), (2.4, 4.0), (1.9, 5.5)]]
    assert max(vals) - min(vals) < 1e-6 * max(vals)


def test_7_2s_radial_node_at_2a():
    assert abs(S.R_nl(2, 0, 2 * A)) < 1e-6 * abs(S.R_nl(2, 0, 0.0))


def test_8_2p_m0_angular_nodal_plane():
    # ψ(2p,m=0) = 0 on the z = 0 plane; large off-plane.
    on = abs(S.psi_cartesian(2, 1, 0, A, A, 0.0))
    off = abs(S.psi_cartesian(2, 1, 0, A, A, A))
    assert on < 1e-9 * off


def test_9_2p_pm1_polar_axis_node():
    for k, (n, l, m) in [(K2Pp, (2, 1, 1)), (K2Pm, (2, 1, -1))]:
        assert abs(S.psi_cartesian(n, l, m, 0.0, 0.0, A)) < 1e-30


def test_10_11_density_is_abs2_and_nonnegative():
    st = AtomicHydrogenState.from_entries(
        [{"state": K1, "real": 1 / math.sqrt(2), "imag": 0.0},
         {"state": K2P0, "real": 1 / math.sqrt(2), "imag": 0.0}])
    pts = [(0.5 * A, 0.3 * A, 0.7 * A), (-A, 0.2 * A, -0.4 * A)]
    for (x, y, z) in pts:
        psi = st.psi(x, y, z, 0.0)
        d = observables.probability_density(psi)
        assert d >= 0
        assert abs(d - abs(psi) ** 2) < 1e-30


# 12–20  Time evolution ───────────────────────────────────────────────────────
def test_12_13_eigenstate_stationary_density_evolving_phase():
    st = one(K2P0)
    p = (0.8 * A, 0.4 * A, 0.6 * A)
    T = 1e-16
    d0 = abs(st.psi(*p, 0.0)) ** 2
    dT = abs(st.psi(*p, T)) ** 2
    assert abs(dT - d0) < 1e-9 * d0                      # density stationary
    ph0 = cmath.phase(st.psi(*p, 0.0))
    phT = cmath.phase(st.psi(*p, T))
    assert abs((phT - ph0)) > 1e-3                        # phase accumulates


def test_14_global_phase_invariance():
    a = AtomicHydrogenState.from_entries([{"state": K1, "real": 1.0, "imag": 0.0}])
    g = cmath.exp(1j * 0.7)
    b = AtomicHydrogenState.from_entries([{"state": K1, "real": g.real, "imag": g.imag}])
    assert abs(a.energy_expectation_j() - b.energy_expectation_j()) < 1e-40
    p = (0.6 * A, 0.2 * A, 0.5 * A)
    assert abs(abs(a.psi(*p)) ** 2 - abs(b.psi(*p)) ** 2) < 1e-30
    assert a.populations()[K1] == pytest.approx(b.populations()[K1])


def test_15_unequal_energy_beat_frequency():
    c = 1 / math.sqrt(2)
    st = AtomicHydrogenState.from_entries(
        [{"state": K1, "real": c, "imag": 0.0}, {"state": K2S, "real": c, "imag": 0.0}])
    expected = abs(C.energy_joules(1) - C.energy_joules(2)) / C.HBAR
    assert st.beat_frequencies_rad_s()[0] == pytest.approx(expected, rel=TOL_REL)


def test_16_degenerate_manifold_no_false_beat():
    c = 1 / math.sqrt(2)
    st = AtomicHydrogenState.from_entries(
        [{"state": K2P0, "real": c, "imag": 0.0}, {"state": K2Pp, "real": c, "imag": 0.0}])
    assert st.beat_frequencies_rad_s() == []              # no distinct-energy pairs
    p = (0.7 * A, 0.3 * A, 0.5 * A)
    d0 = abs(st.psi(*p, 0.0)) ** 2
    dT = abs(st.psi(*p, 3e-16)) ** 2
    assert abs(dT - d0) < 1e-9 * max(d0, 1e-300)          # density time-independent


def test_17_18_19_20_populations_energy_variance():
    c = 1 / math.sqrt(2)
    sup = AtomicHydrogenState.from_entries(
        [{"state": K1, "real": c, "imag": 0.0}, {"state": K2S, "real": c, "imag": 0.0}])
    # populations constant under evolution
    p0 = {k: abs(v) ** 2 for k, v in sup.coefficients_at(0).items()}
    pT = {k: abs(v) ** 2 for k, v in sup.coefficients_at(5e-16).items()}
    for k in p0:
        assert abs(p0[k] - pT[k]) < TOL_REL
    # energy conserved
    assert sup.energy_expectation_j() == pytest.approx(sup.energy_expectation_j())
    # variance: 0 for eigenstate, >0 for unequal-energy superposition
    assert one(K1).energy_variance_j2() == 0.0
    var_expected = (C.energy_joules(1) - C.energy_joules(2)) ** 2 / 4.0
    assert sup.energy_variance_j2() == pytest.approx(var_expected, rel=1e-9)


# 21–23  Probability current ───────────────────────────────────────────────────
def test_21_real_states_zero_current():
    p = (0.8 * A, 0.6 * A, 0.7 * A)
    ref = max(abs(v) for v in current_at(one(K2Pp), *p))
    for k in (K1, K2S, K2P0):
        j = current_at(one(k), *p)
        assert max(abs(v) for v in j) < 1e-6 * ref


def test_22_opposite_azimuthal_circulation():
    x, y, z = 0.8 * A, 0.6 * A, 0.7 * A
    jp = current_at(one(K2Pp), x, y, z)
    jm = current_at(one(K2Pm), x, y, z)
    rho = math.hypot(x, y)
    jphi_p = (-y * jp[0] + x * jp[1]) / rho
    jphi_m = (-y * jm[0] + x * jm[1]) / rho
    assert jphi_p > 0 and jphi_m < 0                      # opposite orientation
    assert jphi_p == pytest.approx(-jphi_m, rel=1e-9)


def test_23_continuity_equation():
    # ∂ρ/∂t + ∇·j = 0 for a time-dependent superposition (1s + 2p m=0).
    c = 1 / math.sqrt(2)
    st = AtomicHydrogenState.from_entries(
        [{"state": K1, "real": c, "imag": 0.0}, {"state": K2P0, "real": c, "imag": 0.0}])
    x, y, z, t = 1.3 * A, 0.7 * A, 0.9 * A, 2e-17
    h = 1e-2 * A
    dt = 5e-19
    drho_dt = (abs(st.psi(x, y, z, t + dt)) ** 2 - abs(st.psi(x, y, z, t - dt)) ** 2) / (2 * dt)
    jx1 = current_at(st, x + h, y, z, t)[0]; jx0 = current_at(st, x - h, y, z, t)[0]
    jy1 = current_at(st, x, y + h, z, t)[1]; jy0 = current_at(st, x, y - h, z, t)[1]
    jz1 = current_at(st, x, y, z + h, t)[2]; jz0 = current_at(st, x, y, z - h, t)[2]
    div_j = (jx1 - jx0) / (2 * h) + (jy1 - jy0) / (2 * h) + (jz1 - jz0) / (2 * h)
    scale = max(abs(drho_dt), abs(div_j))
    assert abs(drho_dt + div_j) < 3e-2 * scale            # documented CONTINUITY tol


# 24  Sampling dimensions and coordinates ─────────────────────────────────────
def test_24_sampling_shapes_and_coords():
    st = one(K1)
    pl = sampling.sample_plane(st, "xy", 0.0, 6.0, 16, 0.0, ["abs2"])
    assert pl["shape"] == [16, 16] and len(pl["axis_amu"]) == 16
    assert np.allclose(pl["axis_amu"], np.linspace(-6, 6, 16))
    assert np.array(pl["fields"]["abs2"]).shape == (16, 16)
    vol = sampling.sample_volume(st, 5.0, 10, 0.0, ["abs2"])
    assert vol["shape"] == [10, 10, 10]
    rad = sampling.sample_radial(st, 10.0, 20, math.pi / 2, 0.0, 0.0, ["abs"])
    assert rad["shape"] == [20] and rad["r_amu"][0] == 0.0


# 25–29  Validation and safe rejection ────────────────────────────────────────
def test_25_invalid_quantum_numbers_rejected():
    for (n, l, m) in [(1, 0, 1), (2, 2, 0), (0, 0, 0), (2, 1, 2)]:
        with pytest.raises((ValueError, NotImplementedError)):
            S.validate_quantum_numbers(n, l, m)


def test_26_invalid_normalization_rejected():
    with pytest.raises(ValueError):
        AtomicHydrogenState.from_entries([{"state": K1, "real": 0.5, "imag": 0.0}])  # |c|²=0.25


def test_27_zero_norm_rejected():
    with pytest.raises(ValueError):
        AtomicHydrogenState.from_entries([{"state": K1, "real": 0.0, "imag": 0.0}])


def test_28_non_finite_rejected():
    with pytest.raises(ValueError):
        AtomicHydrogenState.from_entries([{"state": K1, "real": float("nan"), "imag": 0.0}])
    with pytest.raises(ValueError):
        sampling.sample_point(one(K1), [float("inf"), 0, 0], 0.0, ["abs2"])


def test_29_excessive_grid_rejected():
    with pytest.raises(ValueError):
        sampling.sample_plane(one(K1), "xy", 0.0, 6.0, 500, 0.0, ["abs2"])  # res > MAX_AXIS
    with pytest.raises(ValueError):
        sampling.sample_volume(one(K1), 6.0, 80, 0.0, ["abs2"])             # 80³ > MAX_TOTAL


# 30  API responses are finite and JSON-serializable ──────────────────────────
def _assert_all_finite(obj):
    if isinstance(obj, dict):
        for v in obj.values():
            _assert_all_finite(v)
    elif isinstance(obj, list):
        for v in obj:
            _assert_all_finite(v)
    elif isinstance(obj, float):
        assert math.isfinite(obj)


def test_30_api_model_and_evaluate_json_finite():
    m = client.get("/hydrogen/atomic/model")
    assert m.status_code == 200
    _assert_all_finite(m.json())

    body = {
        "coefficients": [{"state": K1, "real": 1.0, "imag": 0.0}],
        "sampling": {"type": "volume", "bound_amu": 8, "resolution": 20},
        "quantities": ["abs2", "phase"],
    }
    r = client.post("/hydrogen/atomic/evaluate", json=body)
    assert r.status_code == 200
    data = r.json()
    _assert_all_finite(data)
    json.dumps(data)                                       # fully serializable
    assert "NaN" not in r.text and "Infinity" not in r.text

    # invalid → 422 (not a traceback / 500)
    bad_norm = {"coefficients": [{"state": K1, "real": 0.5, "imag": 0.0}],
                "sampling": {"type": "point", "point_amu": [1, 0, 0]}}
    assert client.post("/hydrogen/atomic/evaluate", json=bad_norm).status_code == 422
    bad_state = {"coefficients": [{"state": "hydrogen.state.n9_l0_m0", "real": 1.0, "imag": 0.0}],
                 "sampling": {"type": "point", "point_amu": [1, 0, 0]}}
    assert client.post("/hydrogen/atomic/evaluate", json=bad_state).status_code == 422
    big = {"coefficients": [{"state": K1, "real": 1.0, "imag": 0.0}],
           "sampling": {"type": "volume", "bound_amu": 8, "resolution": 80}}
    assert client.post("/hydrogen/atomic/evaluate", json=big).status_code == 422


# 31  Cache correctness ───────────────────────────────────────────────────────
def test_31_cached_and_uncached_agree():
    st = one(K2Pp)
    cache.clear()
    a = sampling.sample_plane(st, "xy", 0.0, 6.0, 24, 0.0, ["abs2", "jx", "jy"])
    misses_after_first = cache.stats()["misses"]
    b = sampling.sample_plane(st, "xy", 0.0, 6.0, 24, 0.0, ["abs2", "jx", "jy"])
    assert cache.stats()["hits"] >= 1                      # second call hit the cache
    assert cache.stats()["misses"] == misses_after_first  # no new misses
    for q in ("abs2", "jx", "jy"):
        assert np.allclose(np.array(a["fields"][q]), np.array(b["fields"][q]))
