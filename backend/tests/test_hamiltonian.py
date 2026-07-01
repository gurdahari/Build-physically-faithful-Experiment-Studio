"""
Tests for POST /simulate/hamiltonian.

Physical ground truth: under H = (ħ/2)(Ωx σx + Ωy σy + Ωz σz) the Bloch
vector rotates around n̂ = Ω/|Ω| by angle θ = |Ω| · t, computed with
Rodrigues' formula.  Cardinal-axis cases must agree with blochPhysics.js.
"""

import math
import pytest
from fastapi.testclient import TestClient

from physics.hamiltonian import simulate_hamiltonian, _rodrigues
from main import app

client = TestClient(app)

ATOL = 1e-10


def assert_vec(actual: list[float], expected: list[float], atol: float = ATOL) -> None:
    assert len(actual) == len(expected)
    for i, (a, e) in enumerate(zip(actual, expected)):
        assert abs(a - e) < atol, (
            f"[{i}]: got {a:.15g}, expected {e:.15g}  (|Δ|={abs(a-e):.3e})"
        )


# ── Physics layer ─────────────────────────────────────────────────────────────

class TestPhysicsHamiltonian:

    def test_x_hamiltonian_pi_rotation(self):
        """Ωx=π, duration=1 → X π on |0⟩ → |1⟩=(0,0,-1)."""
        r = simulate_hamiltonian(math.pi, 0, 0, 1.0, [0, 0, 1])
        assert_vec(r["final_state"], [0, 0, -1])
        assert abs(r["total_angle"] - math.pi) < ATOL
        assert_vec(r["rotation_axis"], [1, 0, 0])

    def test_y_hamiltonian_pi_rotation(self):
        """Ωy=π, duration=1 → Y π on |0⟩ → (0,0,-1)."""
        r = simulate_hamiltonian(0, math.pi, 0, 1.0, [0, 0, 1])
        assert_vec(r["final_state"], [0, 0, -1])
        assert_vec(r["rotation_axis"], [0, 1, 0])

    def test_z_hamiltonian_quarter_turn(self):
        """Ωz=1, duration=π/2 → Z π/2 on |+⟩=(1,0,0) → (0,1,0).
        Matches R_z from blochPhysics.js exactly."""
        r = simulate_hamiltonian(0, 0, 1, math.pi / 2, [1, 0, 0])
        assert_vec(r["final_state"], [0, 1, 0])
        assert abs(r["total_angle"] - math.pi / 2) < ATOL

    def test_diagonal_axis_half_turn(self):
        """Ωx=Ωy=Ωz=1, duration=π/√3 → half-turn around (1,1,1)/√3.
        On |0⟩=(0,0,1) the expected result is (2/3, 2/3, -1/3)."""
        sqrt3 = math.sqrt(3)
        r = simulate_hamiltonian(1, 1, 1, math.pi / sqrt3, [0, 0, 1])
        assert_vec(r["final_state"], [2/3, 2/3, -1/3])
        assert abs(r["total_angle"] - math.pi) < ATOL
        assert abs(r["omega_magnitude"] - sqrt3) < ATOL

    def test_zero_hamiltonian_constant_state(self):
        """Ωx=Ωy=Ωz=0 → state unchanged throughout the trajectory."""
        r = simulate_hamiltonian(0, 0, 0, 1.0, [0, 0, 1])
        assert r["rotation_axis"] is None
        assert r["total_angle"] == 0.0
        assert_vec(r["final_state"], [0, 0, 1])
        for vec in r["trajectory"]:
            assert_vec(vec, [0, 0, 1])

    def test_norm_preserved_diagonal(self):
        """Every trajectory point must lie on the unit sphere."""
        r = simulate_hamiltonian(1, 2, 3, 2.0, [1, 0, 0], number_of_steps=200)
        for i, vec in enumerate(r["trajectory"]):
            ns = sum(c * c for c in vec)
            assert abs(ns - 1.0) < 1e-12, f"step {i}: norm²={ns}"

    def test_correct_final_angle(self):
        """total_angle == |Ω| × duration."""
        omega_x, omega_y, omega_z, dur = 2.0, 3.0, 1.0, 0.75
        r = simulate_hamiltonian(omega_x, omega_y, omega_z, dur, [0, 0, 1])
        expected_mag   = math.sqrt(omega_x**2 + omega_y**2 + omega_z**2)
        expected_angle = expected_mag * dur
        assert abs(r["omega_magnitude"] - expected_mag)   < ATOL
        assert abs(r["total_angle"]     - expected_angle) < ATOL

    def test_trajectory_time_array(self):
        """times[0]=0, times[-1]=duration, uniformly spaced."""
        dur = 2.5
        n   = 50
        r   = simulate_hamiltonian(1, 0, 0, dur, [0, 0, 1], number_of_steps=n)
        assert len(r["times"])      == n
        assert len(r["trajectory"]) == n
        assert abs(r["times"][0]  - 0.0) < ATOL
        assert abs(r["times"][-1] - dur) < ATOL
        # uniform spacing
        dt = dur / (n - 1)
        for i in range(1, n):
            assert abs(r["times"][i] - r["times"][i-1] - dt) < 1e-12

    def test_x_quarter_pi_matches_bloch_rotation(self):
        """Rodrigues with n̂=(1,0,0) must match blochPhysics.js R_x exactly."""
        from physics.bloch import apply_rotation
        theta = math.pi / 3
        vec   = [0.5, 0.5, math.sqrt(0.5)]
        js    = apply_rotation("x", theta, vec)
        rod   = _rodrigues([1, 0, 0], theta, vec)
        assert_vec(rod, js)

    def test_rodrigues_all_cardinal_axes_match_bloch(self):
        """Rodrigues for each cardinal axis matches blochPhysics.js matrices."""
        from physics.bloch import apply_rotation
        vec   = [0.6, 0.0, 0.8]
        axes  = {"x": [1,0,0], "y": [0,1,0], "z": [0,0,1]}
        for name, n_hat in axes.items():
            for theta in (0, math.pi/4, math.pi/2, math.pi, 2*math.pi):
                js  = apply_rotation(name, theta, vec)
                rod = _rodrigues(n_hat, theta, vec)
                assert_vec(rod, js, atol=1e-13)


# ── HTTP endpoint ─────────────────────────────────────────────────────────────

class TestHamiltonianAPI:

    def test_pure_x_pi(self):
        resp = client.post("/simulate/hamiltonian", json={
            "initial_bloch": [0, 0, 1],
            "omega_x": math.pi, "omega_y": 0, "omega_z": 0,
            "duration": 1.0,
        })
        assert resp.status_code == 200
        d = resp.json()
        assert_vec(d["final_state"], [0, 0, -1])
        assert abs(d["total_angle"] - math.pi) < ATOL

    def test_pure_z_returns_trajectory(self):
        resp = client.post("/simulate/hamiltonian", json={
            "initial_bloch": [1, 0, 0],
            "omega_x": 0, "omega_y": 0, "omega_z": 1,
            "duration": math.pi / 2,
            "number_of_steps": 20,
        })
        assert resp.status_code == 200
        d = resp.json()
        assert len(d["trajectory"]) == 20
        assert len(d["times"])      == 20
        assert abs(d["times"][-1] - math.pi / 2) < 1e-10
        assert_vec(d["final_state"], [0, 1, 0])

    def test_zero_hamiltonian(self):
        resp = client.post("/simulate/hamiltonian", json={
            "initial_bloch": [0, 0, 1],
            "omega_x": 0, "omega_y": 0, "omega_z": 0,
            "duration": 1.0,
        })
        assert resp.status_code == 200
        d = resp.json()
        assert d["rotation_axis"] is None
        assert d["total_angle"]   == 0.0
        assert_vec(d["final_state"], [0, 0, 1])

    def test_norm_preserved_in_trajectory(self):
        resp = client.post("/simulate/hamiltonian", json={
            "initial_bloch": [1, 0, 0],
            "omega_x": 1, "omega_y": 2, "omega_z": 3,
            "duration": 3.0,
            "number_of_steps": 100,
        })
        assert resp.status_code == 200
        for vec in resp.json()["trajectory"]:
            ns = sum(c * c for c in vec)
            assert abs(ns - 1.0) < 1e-12

    # ── Validation ───────────────────────────────────────────────────────────

    def test_validation_negative_duration(self):
        resp = client.post("/simulate/hamiltonian", json={
            "initial_bloch": [0, 0, 1],
            "omega_x": 1, "omega_y": 0, "omega_z": 0,
            "duration": -1.0,
        })
        assert resp.status_code == 422

    def test_validation_zero_duration(self):
        resp = client.post("/simulate/hamiltonian", json={
            "initial_bloch": [0, 0, 1],
            "omega_x": 1, "omega_y": 0, "omega_z": 0,
            "duration": 0.0,
        })
        assert resp.status_code == 422

    def test_validation_steps_too_small(self):
        resp = client.post("/simulate/hamiltonian", json={
            "initial_bloch": [0, 0, 1],
            "omega_x": 1, "omega_y": 0, "omega_z": 0,
            "duration": 1.0,
            "number_of_steps": 1,
        })
        assert resp.status_code == 422

    def test_validation_steps_too_large(self):
        resp = client.post("/simulate/hamiltonian", json={
            "initial_bloch": [0, 0, 1],
            "omega_x": 1, "omega_y": 0, "omega_z": 0,
            "duration": 1.0,
            "number_of_steps": 5001,
        })
        assert resp.status_code == 422

    def test_validation_bloch_too_large(self):
        resp = client.post("/simulate/hamiltonian", json={
            "initial_bloch": [0, 0, 2],
            "omega_x": 1, "omega_y": 0, "omega_z": 0,
            "duration": 1.0,
        })
        assert resp.status_code == 422

    def test_omega_finite_validator_directly(self):
        """Pydantic rejects inf via the omega_finite validator."""
        from pydantic import ValidationError
        from models import HamiltonianRequest
        with pytest.raises(ValidationError, match="finite"):
            HamiltonianRequest(
                initial_bloch=[0, 0, 1],
                omega_x=math.inf,
                omega_y=0,
                omega_z=0,
                duration=1.0,
            )
