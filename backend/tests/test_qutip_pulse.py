"""
Tests for POST /simulate/time-dependent-pulse/qutip and /compare.

Physics ground truth is the same as test_pulse.py — QuTiP should agree with
the custom RK4 solver and with analytical results derived from Rodrigues' formula.

Tolerances:
  ATOL        = 1e-4  — QuTiP vs analytic (QuTiP's adaptive solver is very accurate)
  ATOL_NORM   = 1e-6  — Bloch-norm preservation (unitary evolution, no drift)
  ATOL_COMPARE= 1e-3  — QuTiP vs custom RK4 cross-solver agreement
"""

import math
import pytest

qutip = pytest.importorskip("qutip", reason="QuTiP not installed")

from fastapi.testclient import TestClient
from physics.qutip_pulse import simulate_qutip_pulse, compare_solvers, COMPARISON_TOLERANCE
from physics.hamiltonian import _rodrigues
from main import app

client = TestClient(app)

ATOL         = 1e-4
ATOL_NORM    = 2e-5
ATOL_COMPARE = 1e-3
N            = 500   # steps for physics tests


def assert_vec(actual, expected, atol=ATOL, label=""):
    for i, (a, e) in enumerate(zip(actual, expected)):
        assert abs(a - e) < atol, (
            f"{label}[{i}]: got {a:.12g}, expected {e:.12g}  (|Δ|={abs(a-e):.3e})"
        )


def run(pulse_shape="square", amplitude=math.pi, phase=0.0, detuning=0.0,
        duration=1.0, initial=[0, 0, 1], n=N, sigma=None):
    return simulate_qutip_pulse(
        pulse_shape=pulse_shape, amplitude=amplitude, phase=phase,
        detuning=detuning, duration=duration, initial_bloch=initial,
        number_of_steps=n, sigma=sigma,
    )


# ── Physics layer ─────────────────────────────────────────────────────────────

class TestQuTiPPhysics:

    def test_resonant_pi_x(self):
        """φ=0, Δ=0, A=π, T=1 on |0⟩ → X π → [0,0,-1]."""
        r = run(amplitude=math.pi, phase=0, detuning=0, initial=[0, 0, 1])
        assert_vec(r["final_state"], [0, 0, -1], label="X-π on |0⟩")

    def test_resonant_half_pi_x(self):
        """φ=0, Δ=0, A=π/2, T=1 on |0⟩ → X π/2 → [0,-1,0]."""
        r = run(amplitude=math.pi/2, phase=0, detuning=0, initial=[0, 0, 1])
        assert_vec(r["final_state"], [0, -1, 0], label="X-π/2 on |0⟩")

    def test_phase_pi_half_y_rotation(self):
        """φ=π/2, Δ=0, A=π on |+x⟩ → R_y(π) → [-1,0,0]."""
        r = run(amplitude=math.pi, phase=math.pi/2, detuning=0, initial=[1, 0, 0])
        assert_vec(r["final_state"], [-1, 0, 0], label="Y-π on |+x⟩")

    def test_detuned_square_matches_rodrigues(self):
        """Square pulse with Δ≠0: constant Ω_eff → compare to Rodrigues' formula."""
        A, delta, T = math.pi, math.pi, 1.0
        r = run(amplitude=A, phase=0, detuning=delta, duration=T,
                initial=[0, 0, 1], n=N)
        omega_mag = math.sqrt(A**2 + delta**2)
        n_hat = [A/omega_mag, 0, delta/omega_mag]
        expected = _rodrigues(n_hat, omega_mag * T, [0, 0, 1])
        assert_vec(r["final_state"], expected, atol=1e-4, label="detuned square pulse")

    def test_zero_amplitude_z_precession(self):
        """A=0, Δ=π/2, T=1 on |+x⟩ → Z rotation by π/2 → [0,1,0]."""
        r = run(amplitude=0.0, phase=0, detuning=math.pi/2,
                duration=1.0, initial=[1, 0, 0])
        assert_vec(r["final_state"], [0, 1, 0], atol=1e-4, label="Z precession")

    def test_gaussian_norm_preserved(self):
        """Gaussian pulse: Bloch-norm preserved throughout (unitary evolution)."""
        r = simulate_qutip_pulse(
            "gaussian", amplitude=math.pi, phase=0, detuning=0,
            duration=2.0, initial_bloch=[0, 0, 1],
            number_of_steps=N, sigma=0.4,
        )
        for i, vec in enumerate(r["trajectory"]):
            ns = sum(c * c for c in vec)
            assert abs(ns - 1.0) < ATOL_NORM, f"step {i}: norm²={ns:.15g}"

    def test_mixed_initial_state_x_pi(self):
        """Mixed state with Bloch norm < 1: norm is preserved under unitary evolution.
        |+y-mixed⟩ = (0, 0.6, 0) → R_x(π) → (0, -0.6, 0)."""
        r = run(amplitude=math.pi, phase=0, detuning=0, initial=[0, 0.6, 0])
        assert_vec(r["final_state"], [0, -0.6, 0], atol=ATOL, label="mixed X-π on |+y-mixed⟩")

    def test_bloch_norm_preserved_square(self):
        """Bloch norm (= √(x²+y²+z²)) is conserved along the whole trajectory."""
        init = [0.6, 0.0, 0.8]
        init_norm_sq = sum(c*c for c in init)
        r = run(amplitude=2*math.pi, phase=0.3, detuning=1.0,
                duration=2.0, initial=init, n=300)
        for i, vec in enumerate(r["trajectory"]):
            ns = sum(c*c for c in vec)
            assert abs(ns - init_norm_sq) < ATOL_NORM, f"step {i}: norm²={ns:.15g}"

    def test_trajectory_length_and_times(self):
        """trajectory, envelope, times all have length n; times[0]=0, times[-1]=T."""
        T, n = 1.5, 77
        r = run(duration=T, n=n)
        assert len(r["times"])          == n
        assert len(r["pulse_envelope"]) == n
        assert len(r["trajectory"])     == n
        assert r["times"][0]  == pytest.approx(0.0, abs=1e-14)
        assert r["times"][-1] == pytest.approx(T, abs=1e-12)

    def test_pulse_area_square(self):
        """Square pulse area = A·T exactly (to trapezoidal precision)."""
        A, T = 2.0, 1.5
        r = run(amplitude=A, duration=T, n=300)
        assert abs(r["pulse_area"] - A * T) < 1e-10

    def test_solver_name_and_version(self):
        """solver_name == 'qutip' and qutip_version is a non-empty string."""
        r = run()
        assert r["solver_name"] == "qutip"
        assert isinstance(r["qutip_version"], str)
        assert len(r["qutip_version"]) > 0

    def test_agreement_with_custom_rk4(self):
        """QuTiP and custom RK4 agree within COMPARISON_TOLERANCE."""
        from physics.pulse import simulate_time_dependent_pulse
        params = dict(pulse_shape="square", amplitude=math.pi, phase=0.3,
                      detuning=0.5, duration=1.0, initial_bloch=[0, 0, 1],
                      number_of_steps=N, sigma=None)
        custom = simulate_time_dependent_pulse(**params)
        qt     = simulate_qutip_pulse(**params)
        diff = math.sqrt(sum((a-b)**2 for a,b in zip(custom["final_state"], qt["final_state"])))
        assert diff < ATOL_COMPARE, f"|Δ_final| = {diff:.3e} ≥ {ATOL_COMPARE}"

    def test_agreement_gaussian(self):
        """Cross-solver agreement for Gaussian pulse within COMPARISON_TOLERANCE."""
        from physics.pulse import simulate_time_dependent_pulse
        params = dict(pulse_shape="gaussian", amplitude=math.pi, phase=0,
                      detuning=0, duration=2.0, initial_bloch=[0, 0, 1],
                      number_of_steps=300, sigma=0.4)
        custom = simulate_time_dependent_pulse(**params)
        qt     = simulate_qutip_pulse(**params)
        diff = math.sqrt(sum((a-b)**2 for a,b in zip(custom["final_state"], qt["final_state"])))
        assert diff < ATOL_COMPARE, f"|Δ_final| = {diff:.3e} ≥ {ATOL_COMPARE}"


# ── compare_solvers() function ────────────────────────────────────────────────

class TestCompareSolvers:

    def test_basic_resonant_pi(self):
        """compare_solvers on X π: final_state_diff < 1e-3, passed=True."""
        r = compare_solvers("square", math.pi, 0, 0, 1.0, [0, 0, 1], number_of_steps=300)
        assert r["passed"] is True
        assert r["final_state_diff"] < COMPARISON_TOLERANCE
        assert r["tolerance"] == COMPARISON_TOLERANCE

    def test_both_trajectories_same_length(self):
        """Both trajectory arrays have the same length = number_of_steps."""
        n = 100
        r = compare_solvers("square", math.pi, 0, 0, 1.0, [0, 0, 1], number_of_steps=n)
        assert len(r["custom_trajectory"]) == n
        assert len(r["qutip_trajectory"])  == n
        assert len(r["times"])             == n

    def test_norms_preserved(self):
        """Both Bloch norms should equal the initial norm for unitary evolution."""
        initial = [0.0, 0.0, 1.0]
        init_norm = math.sqrt(sum(c*c for c in initial))
        r = compare_solvers("square", math.pi, 0.3, 0.5, 1.0, initial, number_of_steps=200)
        assert abs(r["custom_bloch_norm"] - init_norm) < 1e-4, f"custom norm {r['custom_bloch_norm']}"
        assert abs(r["qutip_bloch_norm"]  - init_norm) < 1e-4, f"qutip norm {r['qutip_bloch_norm']}"

    def test_gaussian_passed(self):
        """Gaussian pulse comparison also passes."""
        r = compare_solvers("gaussian", math.pi, 0, 0, 2.0, [0, 0, 1],
                            number_of_steps=200, sigma=0.4)
        assert r["passed"] is True


# ── HTTP endpoints ─────────────────────────────────────────────────────────────

class TestQuTiPAPI:

    def test_qutip_endpoint_resonant_pi(self):
        resp = client.post("/simulate/time-dependent-pulse/qutip", json={
            "initial_bloch":   [0, 0, 1],
            "pulse_shape":     "square",
            "amplitude":       math.pi,
            "phase":           0.0,
            "detuning":        0.0,
            "duration":        1.0,
            "number_of_steps": 500,
        })
        assert resp.status_code == 200
        d = resp.json()
        assert_vec(d["final_state"], [0, 0, -1], atol=ATOL)
        assert d["solver_name"] == "qutip"
        assert isinstance(d["qutip_version"], str) and len(d["qutip_version"]) > 0

    def test_qutip_endpoint_gaussian(self):
        resp = client.post("/simulate/time-dependent-pulse/qutip", json={
            "initial_bloch":   [0, 0, 1],
            "pulse_shape":     "gaussian",
            "amplitude":       math.pi,
            "phase":           0.0,
            "detuning":        0.0,
            "duration":        2.0,
            "number_of_steps": 200,
            "sigma":           0.4,
        })
        assert resp.status_code == 200
        d = resp.json()
        assert len(d["trajectory"])     == 200
        assert len(d["pulse_envelope"]) == 200
        assert "pulse_area"             in d

    def test_compare_endpoint_resonant_pi(self):
        resp = client.post("/simulate/time-dependent-pulse/compare", json={
            "initial_bloch":   [0, 0, 1],
            "pulse_shape":     "square",
            "amplitude":       math.pi,
            "phase":           0.0,
            "detuning":        0.0,
            "duration":        1.0,
            "number_of_steps": 200,
        })
        assert resp.status_code == 200
        d = resp.json()
        assert "custom_trajectory"  in d
        assert "qutip_trajectory"   in d
        assert "custom_final_state" in d
        assert "qutip_final_state"  in d
        assert "final_state_diff"   in d
        assert "max_trajectory_diff" in d
        assert d["passed"] is True
        assert d["final_state_diff"] < COMPARISON_TOLERANCE

    def test_compare_endpoint_pass_flag(self):
        """The compare endpoint should always pass for typical single-qubit inputs."""
        resp = client.post("/simulate/time-dependent-pulse/compare", json={
            "initial_bloch":   [1, 0, 0],
            "pulse_shape":     "square",
            "amplitude":       math.pi / 2,
            "phase":           math.pi / 4,
            "detuning":        0.3,
            "duration":        1.5,
            "number_of_steps": 150,
        })
        assert resp.status_code == 200
        d = resp.json()
        assert d["passed"] is True

    def test_compare_endpoint_bloch_norms(self):
        """Both Bloch norms close to initial norm."""
        resp = client.post("/simulate/time-dependent-pulse/compare", json={
            "initial_bloch":   [0, 0, 1],
            "pulse_shape":     "square",
            "amplitude":       math.pi,
            "phase":           0.0,
            "detuning":        0.0,
            "duration":        1.0,
            "number_of_steps": 100,
        })
        assert resp.status_code == 200
        d = resp.json()
        assert abs(d["custom_bloch_norm"] - 1.0) < 1e-4
        assert abs(d["qutip_bloch_norm"]  - 1.0) < 1e-4

    def test_validation_reused(self):
        """QuTiP endpoint uses the same validation as the custom endpoint."""
        resp = client.post("/simulate/time-dependent-pulse/qutip", json={
            "initial_bloch":   [0, 0, 2],   # norm > 1 → 422
            "pulse_shape":     "square",
            "amplitude":       1.0,
            "duration":        1.0,
        })
        assert resp.status_code == 422
