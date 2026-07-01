"""
Backend tests — physics functions and HTTP endpoint.

Physics expected values verified against the rotation matrices in blochPhysics.js
(the frontend ground truth) so both implementations are cross-checked.

R_x(θ): [x,  c·y − s·z,  s·y + c·z]
R_y(θ): [c·x + s·z,  y,  −s·x + c·z]
R_z(θ): [c·x − s·y,  s·x + c·y,  z]
"""

import math
import pytest
from fastapi.testclient import TestClient

from physics.bloch import apply_rotation, apply_free_evolution, norm_sq
from main import app

client = TestClient(app)

ATOL = 1e-10


def assert_vec(actual: list[float], expected: list[float], atol: float = ATOL) -> None:
    for i, (a, e) in enumerate(zip(actual, expected)):
        assert abs(a - e) < atol, (
            f"Component [{i}]: got {a:.15g}, expected {e:.15g}  (|Δ|={abs(a-e):.3e})"
        )


# ── Physics layer ─────────────────────────────────────────────────────────────

class TestPhysics:
    def test_x_pi_on_zero(self):
        """X π on |0⟩=(0,0,1) → |1⟩=(0,0,-1).
        c=cos(π)=-1, s=sin(π)=0 → y'=-y=0, z'=-z=-1."""
        assert_vec(apply_rotation("x", math.pi, [0, 0, 1]), [0, 0, -1])

    def test_x_halfpi_on_zero(self):
        """X π/2 on |0⟩=(0,0,1) → (0,-1,0).
        c=0, s=1 → y'=0-1·1=-1, z'=1·0+0·1=0."""
        assert_vec(apply_rotation("x", math.pi / 2, [0, 0, 1]), [0, -1, 0])

    def test_z_halfpi_on_plus(self):
        """Z π/2 on |+⟩=(1,0,0) → (0,1,0).
        c=0, s=1 → x'=0·1-1·0=0, y'=1·1+0·0=1."""
        assert_vec(apply_rotation("z", math.pi / 2, [1, 0, 0]), [0, 1, 0])

    def test_free_evolution_z_rotation(self):
        """Free evo omega0=1, tau=π on |+⟩=(1,0,0) → (-1,0,0).
        Equivalent to Z π: c=-1, s=0 → x'=-1, y'=0."""
        assert_vec(apply_free_evolution(1.0, math.pi, [1, 0, 0]), [-1, 0, 0])

    def test_multistep_sequence(self):
        """X π/2 on |0⟩ then Z π/2 → |+⟩=(1,0,0)."""
        state = apply_rotation("x", math.pi / 2, [0, 0, 1])
        assert_vec(state, [0, -1, 0])
        state = apply_rotation("z", math.pi / 2, state)
        assert_vec(state, [1, 0, 0])

    def test_norm_preserved_all_axes(self):
        """Rotation must not change ‖r‖ for any axis or angle."""
        initial = [0.6, 0.0, 0.8]
        for axis in ("x", "y", "z"):
            for angle in (0.0, math.pi / 4, math.pi / 2, math.pi, 3 * math.pi / 2, 2 * math.pi):
                result = apply_rotation(axis, angle, initial)
                assert abs(norm_sq(result) - 1.0) < 1e-14, (
                    f"axis={axis} angle={angle:.4f}: norm²={norm_sq(result)}"
                )

    def test_y_pi_on_zero(self):
        """Y π on |0⟩=(0,0,1) → (0,0,-1).
        c=-1, s=0 → x'=0+0=0, z'=-0+(-1)·1=-1."""
        assert_vec(apply_rotation("y", math.pi, [0, 0, 1]), [0, 0, -1])

    def test_free_evolution_zero_omega(self):
        """omega0=0 → no rotation regardless of tau."""
        v = [0.5, 0.5, math.sqrt(0.5)]
        assert_vec(apply_free_evolution(0.0, 1.0, v), v)


# ── HTTP endpoint ─────────────────────────────────────────────────────────────

class TestAPI:
    def test_root(self):
        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.json()["message"] == "Quantum backend is running"

    def test_x_pi_on_zero(self):
        resp = client.post("/simulate/ideal-sequence", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [{"type": "pulse", "axis": "x", "angle": math.pi}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert_vec(data["final_state"], [0, 0, -1])
        assert_vec(data["initial_state"], [0, 0, 1])
        assert len(data["states"]) == 1
        assert data["steps"][0]["accumulated_phase"] is None

    def test_free_evolution_phase(self):
        resp = client.post("/simulate/ideal-sequence", json={
            "initial_bloch": [1, 0, 0],
            "sequence": [{"type": "free", "omega0": 1.0, "tau": math.pi}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert_vec(data["final_state"], [-1, 0, 0])
        assert abs(data["steps"][0]["accumulated_phase"] - math.pi) < 1e-10

    def test_multistep_returns_intermediate_states(self):
        resp = client.post("/simulate/ideal-sequence", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [
                {"type": "pulse", "axis": "x", "angle": math.pi / 2},
                {"type": "pulse", "axis": "z", "angle": math.pi / 2},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["states"]) == 2
        assert_vec(data["states"][0], [0, -1, 0])
        assert_vec(data["final_state"], [1, 0, 0])

    def test_empty_sequence(self):
        resp = client.post("/simulate/ideal-sequence", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert_vec(data["final_state"], [0, 0, 1])
        assert data["states"] == []

    def test_validation_bad_axis(self):
        resp = client.post("/simulate/ideal-sequence", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [{"type": "pulse", "axis": "w", "angle": 1.0}],
        })
        assert resp.status_code == 422

    def test_validation_initial_bloch_too_large(self):
        resp = client.post("/simulate/ideal-sequence", json={
            "initial_bloch": [0, 0, 2],
            "sequence": [],
        })
        assert resp.status_code == 422

    def test_validation_negative_tau(self):
        resp = client.post("/simulate/ideal-sequence", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [{"type": "free", "omega0": 1.0, "tau": -1.0}],
        })
        assert resp.status_code == 422

    def test_validation_negative_omega0(self):
        resp = client.post("/simulate/ideal-sequence", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [{"type": "free", "omega0": -1.0, "tau": 1.0}],
        })
        assert resp.status_code == 422

    def test_norm_preserved_in_response(self):
        """Backend must return normalised Bloch vectors."""
        resp = client.post("/simulate/ideal-sequence", json={
            "initial_bloch": [0.6, 0.0, 0.8],
            "sequence": [
                {"type": "pulse", "axis": "y", "angle": math.pi / 3},
                {"type": "free",  "omega0": 2.0, "tau": 0.5},
                {"type": "pulse", "axis": "z", "angle": math.pi / 4},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        for vec in data["states"]:
            ns = sum(c * c for c in vec)
            assert abs(ns - 1.0) < 1e-12, f"norm²={ns}"
