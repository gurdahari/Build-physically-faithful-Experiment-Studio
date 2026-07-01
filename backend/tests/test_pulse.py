"""
Tests for POST /simulate/time-dependent-pulse.

Physics ground truth:
- Resonant square pulse (Δ=0): pure rotation around (cosφ, sinφ, 0) by area = A·T.
- Off-resonance square pulse: rotation around tilted axis, compared to Rodrigues'.
- Zero amplitude + Δ: pure Z precession.
- Gaussian: pulse area ≈ A·σ·√(2π) for σ ≪ T/2.
- Norm of Bloch vector is preserved to machine precision throughout.

RK4 with n=1000 steps matches Rodrigues to ≈1e-10 for all square-pulse cases.
"""

import math
import pytest
from fastapi.testclient import TestClient

from physics.pulse import simulate_time_dependent_pulse
from physics.hamiltonian import _rodrigues
from main import app

client = TestClient(app)

ATOL      = 1e-4     # tight enough to catch physics bugs, loose enough for RK4 drift
ATOL_NORM = 5e-9     # norm is conserved very well — RK4 drift is ≪ 1e-9 per step
N         = 1000     # default step count for physics tests


def assert_vec(actual, expected, atol=ATOL, label=""):
    for i, (a, e) in enumerate(zip(actual, expected)):
        assert abs(a - e) < atol, (
            f"{label}[{i}]: got {a:.12g}, expected {e:.12g}  (|Δ|={abs(a-e):.3e})"
        )


def run(pulse_shape="square", amplitude=math.pi, phase=0.0, detuning=0.0,
        duration=1.0, initial=[0, 0, 1], n=N, sigma=None):
    return simulate_time_dependent_pulse(
        pulse_shape=pulse_shape, amplitude=amplitude, phase=phase,
        detuning=detuning, duration=duration, initial_bloch=initial,
        number_of_steps=n, sigma=sigma,
    )


# ── Physics layer ─────────────────────────────────────────────────────────────

class TestPhysicsPulse:

    def test_resonant_square_pi_pulse_x(self):
        """φ=0, Δ=0, A=π, T=1 on |0⟩ → X π rotation → [0,0,-1]."""
        r = run(amplitude=math.pi, phase=0, detuning=0, initial=[0, 0, 1])
        assert_vec(r["final_state"], [0, 0, -1], label="X-π on |0⟩")

    def test_resonant_square_half_pi_pulse_x(self):
        """φ=0, Δ=0, A=π/2, T=1 on |0⟩ → X π/2 rotation → [0,-1,0]."""
        r = run(amplitude=math.pi/2, phase=0, detuning=0, initial=[0, 0, 1])
        assert_vec(r["final_state"], [0, -1, 0], label="X-π/2 on |0⟩")

    def test_phase_zero_is_x_rotation(self):
        """φ=0, Δ=0, A=π on |+y⟩=[0,1,0] → R_x(π) → [0,-1,0]."""
        r = run(amplitude=math.pi, phase=0, detuning=0, initial=[0, 1, 0])
        assert_vec(r["final_state"], [0, -1, 0], label="phase=0 on |+y⟩")

    def test_phase_pi_half_is_y_rotation(self):
        """φ=π/2, Δ=0, A=π on |+x⟩=[1,0,0] → R_y(π) → [-1,0,0].
        Contrast: R_x(π) on |+x⟩ leaves it unchanged."""
        r = run(amplitude=math.pi, phase=math.pi/2, detuning=0, initial=[1, 0, 0])
        assert_vec(r["final_state"], [-1, 0, 0], label="phase=π/2 on |+x⟩")

    def test_nonzero_detuning_matches_rodrigues(self):
        """Square pulse with Δ≠0: constant Ω_eff = (A,0,Δ) → compare to Rodrigues'."""
        A, delta, T = math.pi, math.pi, 1.0
        r = run(amplitude=A, phase=0, detuning=delta, duration=T,
                initial=[0, 0, 1], n=2000)
        omega_mag = math.sqrt(A**2 + delta**2)
        n_hat = [A/omega_mag, 0, delta/omega_mag]
        expected = _rodrigues(n_hat, omega_mag * T, [0, 0, 1])
        assert_vec(r["final_state"], expected, atol=1e-6, label="detuned square pulse")

    def test_zero_amplitude_z_precession(self):
        """A=0, Δ=π/2, T=1 on |+x⟩ → Z rotation by π/2 → [0,1,0]."""
        r = run(amplitude=0.0, phase=0, detuning=math.pi/2,
                duration=1.0, initial=[1, 0, 0])
        assert_vec(r["final_state"], [0, 1, 0], atol=1e-8, label="Z precession")

    def test_gaussian_pulse_area(self):
        """Gaussian area ≈ A·σ·√(2π) when σ ≪ T/2."""
        A, sigma, T = 1.0, 0.3, 4.0
        r = simulate_time_dependent_pulse(
            "gaussian", amplitude=A, phase=0, detuning=0,
            duration=T, initial_bloch=[0, 0, 1],
            number_of_steps=2001, sigma=sigma,
        )
        expected_area = A * sigma * math.sqrt(2 * math.pi)
        assert abs(r["pulse_area"] - expected_area) < 1e-3

    def test_norm_preserved_square(self):
        """Norm of Bloch vector must stay ≈ 1 throughout (RK4 near-lossless)."""
        r = run(amplitude=2*math.pi, phase=0.3, detuning=1.0,
                duration=2.0, initial=[0.6, 0, 0.8], n=500)
        for i, vec in enumerate(r["trajectory"]):
            ns = sum(c*c for c in vec)
            assert abs(ns - 1.0) < ATOL_NORM, f"step {i}: norm²={ns:.15g}"

    def test_norm_preserved_gaussian(self):
        """Norm preserved under Gaussian pulse with detuning."""
        r = simulate_time_dependent_pulse(
            "gaussian", amplitude=math.pi, phase=math.pi/4, detuning=0.5,
            duration=2.0, initial_bloch=[0, 0, 1],
            number_of_steps=500, sigma=0.4,
        )
        for i, vec in enumerate(r["trajectory"]):
            ns = sum(c*c for c in vec)
            assert abs(ns - 1.0) < ATOL_NORM, f"step {i}: norm²={ns:.15g}"

    def test_trajectory_length(self):
        """trajectory, pulse_envelope, effective_field, times all have length n."""
        n = 123
        r = run(n=n)
        assert len(r["times"])           == n
        assert len(r["pulse_envelope"])  == n
        assert len(r["effective_field"]) == n
        assert len(r["trajectory"])      == n

    def test_time_array_endpoints(self):
        """times[0] = 0, times[-1] = duration exactly."""
        T = 1.75
        r = run(duration=T, n=300)
        assert r["times"][0]  == 0.0
        assert abs(r["times"][-1] - T) < 1e-14

    def test_max_amplitude_square(self):
        """Square pulse: max_amplitude == |amplitude|."""
        A = 2.5
        r = run(amplitude=A)
        assert abs(r["max_amplitude"] - A) < 1e-15

    def test_max_amplitude_gaussian(self):
        """Gaussian peak is at t=T/2; max_amplitude == amplitude (to machine eps).
        Uses odd n so T/2 falls exactly on a sample point."""
        A = 1.7
        r = simulate_time_dependent_pulse(
            "gaussian", amplitude=A, phase=0, detuning=0,
            duration=4.0, initial_bloch=[0, 0, 1],
            number_of_steps=1001, sigma=0.5,
        )
        assert abs(r["max_amplitude"] - A) < 1e-12

    def test_sigma_default_is_duration_over_six(self):
        """When sigma=None, Gaussian width defaults to duration/6."""
        T = 3.0
        r_default = simulate_time_dependent_pulse(
            "gaussian", amplitude=1.0, phase=0, detuning=0,
            duration=T, initial_bloch=[0, 0, 1], sigma=None,
        )
        r_explicit = simulate_time_dependent_pulse(
            "gaussian", amplitude=1.0, phase=0, detuning=0,
            duration=T, initial_bloch=[0, 0, 1], sigma=T/6,
        )
        assert_vec(r_default["final_state"], r_explicit["final_state"], atol=1e-15)

    def test_effective_field_components(self):
        """Effective field matches (Ω(t)cosφ, Ω(t)sinφ, Δ) at every step."""
        phi = math.pi / 3
        r = run(amplitude=2.0, phase=phi, detuning=1.5, initial=[0, 0, 1], n=50)
        for i, (ef, env) in enumerate(zip(r["effective_field"], r["pulse_envelope"])):
            assert abs(ef[0] - env * math.cos(phi)) < 1e-14, f"step {i} ex"
            assert abs(ef[1] - env * math.sin(phi)) < 1e-14, f"step {i} ey"
            assert abs(ef[2] - 1.5)                < 1e-14, f"step {i} ez"


# ── HTTP endpoint ─────────────────────────────────────────────────────────────

class TestPulseAPI:

    def test_resonant_square_pi_api(self):
        resp = client.post("/simulate/time-dependent-pulse", json={
            "initial_bloch": [0, 0, 1],
            "pulse_shape":   "square",
            "amplitude":     math.pi,
            "phase":         0.0,
            "detuning":      0.0,
            "duration":      1.0,
            "number_of_steps": 1000,
        })
        assert resp.status_code == 200
        d = resp.json()
        assert_vec(d["final_state"], [0, 0, -1], atol=ATOL)
        assert d["times"][0]  == 0.0
        assert abs(d["times"][-1] - 1.0) < 1e-12
        assert len(d["trajectory"])      == 1000
        assert len(d["pulse_envelope"])  == 1000

    def test_gaussian_api_returns_all_fields(self):
        resp = client.post("/simulate/time-dependent-pulse", json={
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
        assert "pulse_envelope"  in d
        assert "effective_field" in d
        assert "trajectory"      in d
        assert "pulse_area"      in d
        assert "max_amplitude"   in d
        assert len(d["trajectory"]) == 200

    def test_gaussian_default_sigma_api(self):
        """Sending no sigma to Gaussian uses duration/6 (set by model_validator)."""
        resp = client.post("/simulate/time-dependent-pulse", json={
            "initial_bloch":   [0, 0, 1],
            "pulse_shape":     "gaussian",
            "amplitude":       math.pi,
            "phase":           0.0,
            "detuning":        0.0,
            "duration":        1.0,
            "number_of_steps": 100,
        })
        assert resp.status_code == 200

    def test_validation_negative_duration(self):
        resp = client.post("/simulate/time-dependent-pulse", json={
            "initial_bloch": [0, 0, 1],
            "pulse_shape":   "square",
            "amplitude":     1.0,
            "duration":      -1.0,
        })
        assert resp.status_code == 422

    def test_validation_zero_duration(self):
        resp = client.post("/simulate/time-dependent-pulse", json={
            "initial_bloch": [0, 0, 1],
            "pulse_shape":   "square",
            "amplitude":     1.0,
            "duration":      0.0,
        })
        assert resp.status_code == 422

    def test_validation_steps_too_small(self):
        resp = client.post("/simulate/time-dependent-pulse", json={
            "initial_bloch":   [0, 0, 1],
            "pulse_shape":     "square",
            "amplitude":       1.0,
            "duration":        1.0,
            "number_of_steps": 5,
        })
        assert resp.status_code == 422

    def test_validation_steps_too_large(self):
        resp = client.post("/simulate/time-dependent-pulse", json={
            "initial_bloch":   [0, 0, 1],
            "pulse_shape":     "square",
            "amplitude":       1.0,
            "duration":        1.0,
            "number_of_steps": 10001,
        })
        assert resp.status_code == 422

    def test_validation_nonpositive_sigma_gaussian(self):
        """sigma=0 for Gaussian must be rejected."""
        from pydantic import ValidationError
        from models import TimeDependentPulseRequest
        with pytest.raises(ValidationError, match="sigma"):
            TimeDependentPulseRequest(
                initial_bloch=[0, 0, 1],
                pulse_shape="gaussian",
                amplitude=math.pi,
                duration=1.0,
                sigma=0.0,
            )

    def test_validation_bloch_out_of_sphere(self):
        resp = client.post("/simulate/time-dependent-pulse", json={
            "initial_bloch": [0, 0, 2],
            "pulse_shape":   "square",
            "amplitude":     1.0,
            "duration":      1.0,
        })
        assert resp.status_code == 422
