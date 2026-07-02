"""
Canonical validation experiments with analytically known results (Part 2).

These pin down the Hamiltonian sign convention and verify the end-to-end
experiment pipeline (chaining, closed/open evolution) against exact answers, so
we can tell whether a "strange" trajectory is a physics bug or just a rendering
choice.

Convention (from H = ½[Ω cosφ σx + Ω sinφ σy + Δ σz], U = exp(-iHt)):
  dr/dt = Ω_eff × r,  Ω_eff = (Ω cosφ, Ω sinφ, Δ)
  X pulse (φ=0)   precesses about +x:  |0⟩ →(π)→ (0,0,-1),  →(π/2)→ (0,-1,0)
  Y pulse (φ=π/2) precesses about +y:  |0⟩ →(π/2)→ (1,0,0)
"""

import math
import pytest

qutip = pytest.importorskip("qutip", reason="QuTiP not installed")

from physics.experiment import simulate_experiment

ATOL = 2e-3
ATOL_NORM = 2e-5


def run(sequence, initial=(0, 0, 1), quality="high", **kw):
    return simulate_experiment(initial_bloch=list(initial), sequence=sequence, quality=quality, **kw)


def sq(amplitude, phase, duration=1.0, detuning=0.0):
    return {"type": "pulse", "pulse_shape": "square", "amplitude": amplitude,
            "phase": phase, "detuning": detuning, "duration": duration}


def free(omega0, duration=1.0):
    return {"type": "free", "duration": duration, "omega0": omega0}


def assert_vec(actual, expected, atol=ATOL, label=""):
    for i, (a, e) in enumerate(zip(actual, expected)):
        assert abs(a - e) < atol, f"{label}[{i}]: got {a:.6g}, expected {e:.6g} (Δ={abs(a-e):.2e})"


def norm(v):
    return math.sqrt(sum(c * c for c in v))


# 1. |0⟩, square X π pulse → (0,0,-1)
def test_1_x_pi():
    r = run([sq(math.pi, 0.0)])
    assert_vec(r["final_state"], [0, 0, -1], label="X π")


# 2. |0⟩, square X π/2 pulse → (0,-1,0) (sign from convention)
def test_2_x_pi_half():
    r = run([sq(math.pi / 2, 0.0)])
    assert_vec(r["final_state"], [0, -1, 0], label="X π/2")


# 3. |0⟩, square Y π/2 pulse → (1,0,0)
def test_3_y_pi_half():
    r = run([sq(math.pi / 2, math.pi / 2)])
    assert_vec(r["final_state"], [1, 0, 0], label="Y π/2")


# 4. X π/2 then X π/2 == X π → (0,0,-1)
def test_4_two_x_pi_half_equals_x_pi():
    r = run([sq(math.pi / 2, 0.0), sq(math.pi / 2, 0.0)])
    assert_vec(r["final_state"], [0, 0, -1], label="X π/2 · X π/2")


# 5. X π/2 then -X π/2 → back to |0⟩
def test_5_x_then_minus_x_returns():
    r = run([sq(math.pi / 2, 0.0), sq(math.pi / 2, math.pi)])  # -X is φ=π
    assert_vec(r["final_state"], [0, 0, 1], label="X π/2 · (−X) π/2")


# 6. Free Z evolution from |0⟩ stays on +Z
def test_6_free_z_from_ground_stays():
    r = run([free(math.pi, duration=2.0)], initial=[0, 0, 1])
    assert_vec(r["final_state"], [0, 0, 1], label="free-Z from |0⟩")
    # every point stays at the north pole
    assert max(abs(p[0]) for p in r["trajectory"]) < ATOL
    assert max(abs(p[1]) for p in r["trajectory"]) < ATOL


# 7. Free Z from |+x⟩: circular XY precession, |r| constant (no decoherence)
def test_7_free_z_from_plus_x_circular():
    r = run([free(math.pi / 2, duration=1.0)], initial=[1, 0, 0])
    assert_vec(r["final_state"], [0, 1, 0], label="free-Z |+x⟩ quarter turn")
    norms = [norm(p) for p in r["trajectory"]]
    assert max(norms) - min(norms) < 1e-3, "‖r‖ should stay constant"
    for p in r["trajectory"]:
        assert abs(p[2]) < ATOL, "z stays 0 during pure Z precession from equator"


# 8. Closed-system Gaussian pulse: purity ≈ 1 throughout
def test_8_gaussian_closed_purity():
    r = run([{"type": "pulse", "pulse_shape": "gaussian", "amplitude": math.pi,
              "phase": 0.0, "detuning": 0.0, "duration": 2.0, "sigma": 0.3}])
    assert min(r["purity"]) > 1 - 1e-4, "closed Gaussian must stay pure"


# 9. Decoherence disabled: no spiral toward center (‖r‖ stays ≈ 1)
def test_9_no_decoherence_no_spiral():
    r = run([sq(math.pi / 2, 0.0), free(math.pi, duration=3.0)], initial=[0, 0, 1])
    assert min(norm(p) for p in r["trajectory"]) > 1 - 1e-3


# 10. Decoherence enabled: transverse coherence decays ≈ exp(-t/T2)
def test_10_decoherence_matches_t2():
    T1, T2, T = 10.0, 1.0, 1.0
    r = run([free(0.0, duration=T)], initial=[1, 0, 0],
            enable_decoherence=True, T1=T1, T2=T2, equilibrium_z=1.0)
    coherence_final = r["coherence"][-1]
    expected = math.exp(-T / T2)
    assert abs(coherence_final - expected) < 2e-2, (
        f"transverse coherence {coherence_final:.4f} vs exp(-T/T2)={expected:.4f}"
    )
    # spirals inward
    assert norm(r["trajectory"][-1]) < norm(r["trajectory"][0])
