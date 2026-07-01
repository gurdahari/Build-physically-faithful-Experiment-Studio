"""
Tests for POST /simulate/experiment (unified QuTiP authoritative endpoint).

Tolerances:
  ATOL      = 1e-3  — final-state accuracy (standard quality, 200 steps)
  ATOL_NORM = 2e-5  — Bloch-norm preservation across trajectory
  ATOL_DEC  = 1e-2  — decoherence physics (analytical vs numerical)
"""

import math
import pytest

qutip = pytest.importorskip("qutip", reason="QuTiP not installed")

from fastapi.testclient import TestClient
from physics.experiment import simulate_experiment, QUALITY_STEPS, _build_collapse_operators
from physics.hamiltonian import _rodrigues
from main import app

client = TestClient(app)

ATOL      = 1e-3
ATOL_NORM = 2e-5
ATOL_DEC  = 1e-2   # decoherence tests: comparing to analytic solutions
N_STD     = 200
N_HIGH    = 1000


def assert_vec(actual, expected, atol=ATOL, label=""):
    for i, (a, e) in enumerate(zip(actual, expected)):
        assert abs(a - e) < atol, (
            f"{label}[{i}]: got {a:.10g}, expected {e:.10g}  (|Δ|={abs(a-e):.3e})"
        )


def run(sequence, initial=[0, 0, 1], quality="standard"):
    return simulate_experiment(
        initial_bloch=initial,
        sequence=sequence,
        quality=quality,
    )


def run_dec(sequence, T1, T2, initial=[0, 0, 1], quality="standard", z_eq=1.0):
    return simulate_experiment(
        initial_bloch=initial,
        sequence=sequence,
        quality=quality,
        enable_decoherence=True,
        T1=T1,
        T2=T2,
        equilibrium_z=z_eq,
    )


# ── Physics correctness ───────────────────────────────────────────────────────

class TestExperimentPhysics:

    def test_x_pi_pulse(self):
        """Single resonant X π-pulse: |0⟩ → |1⟩ (Bloch: [0,0,1] → [0,0,-1])."""
        r = run([{
            "type": "pulse", "pulse_shape": "square",
            "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0,
        }])
        assert_vec(r["final_state"], [0, 0, -1], label="X-π on |0⟩")
        assert_vec(r["state_after_items"][0], [0, 0, -1], label="state_after_items")

    def test_y_pi_half_pulse(self):
        """Resonant Y π/2-pulse: |0⟩ → [1,0,0] (rotation about Y axis)."""
        r = run([{
            "type": "pulse", "pulse_shape": "square",
            "amplitude": math.pi / 2, "phase": math.pi / 2,
            "detuning": 0.0, "duration": 1.0,
        }])
        assert_vec(r["final_state"], [1, 0, 0], label="Y-π/2 on |0⟩")

    def test_z_free_evolution(self):
        """|+x⟩ under Z precession (ω₀=π/2, T=1) → [0,1,0]."""
        r = run([{
            "type": "free", "duration": 1.0, "omega0": math.pi / 2,
        }], initial=[1, 0, 0])
        assert_vec(r["final_state"], [0, 1, 0], label="Z precession |+x⟩")

    def test_pulse_then_free_evolution(self):
        """X π/2 then Z free-precession: sequence of two items."""
        # X π/2: [0,0,1] → [0,-1,0]
        # Z free (ω₀=π/2, T=2): [0,-1,0] → [0,-(-1),0]=[0,1,0]... let me compute
        # Z rotation by π: [0,-1,0] → [0,1,0]
        r = run([
            {"type": "pulse", "pulse_shape": "square",
             "amplitude": math.pi / 2, "phase": 0.0, "detuning": 0.0, "duration": 1.0},
            {"type": "free", "duration": 1.0, "omega0": math.pi},
        ])
        # After X π/2: [0,-1,0]
        assert_vec(r["state_after_items"][0], [0, -1, 0], atol=ATOL, label="after X-π/2")
        # After Z(π): [0,-1,0] → R_z(π)·[0,-1,0]
        # R_z(θ): x'=x·cosθ-y·sinθ, y'=x·sinθ+y·cosθ, z'=z
        # R_z(π): x'=0·(-1)-(-1)·0=0, y'=0·0+(-1)·(-1)=1... wait
        # R_z(π): x'=x·cos(π)-y·sin(π)=-x, y'=x·sin(π)+y·cos(π)=-y
        # So [0,-1,0] → [0,1,0]
        assert_vec(r["state_after_items"][1], [0, 1, 0], atol=ATOL, label="after Z-π")

    def test_detuned_pulse_matches_rodrigues(self):
        """Square pulse with Δ≠0: constant Ω_eff → compare to Rodrigues' formula."""
        A, delta, T = math.pi, math.pi, 1.0
        r = run([{
            "type": "pulse", "pulse_shape": "square",
            "amplitude": A, "phase": 0.0, "detuning": delta, "duration": T,
        }], quality="high")
        omega_mag = math.sqrt(A**2 + delta**2)
        n_hat = [A / omega_mag, 0.0, delta / omega_mag]
        expected = _rodrigues(n_hat, omega_mag * T, [0, 0, 1])
        assert_vec(r["final_state"], expected, atol=ATOL, label="detuned square vs Rodrigues")

    def test_gaussian_pulse(self):
        """Gaussian π pulse: |0⟩ → approximately |1⟩ (norm-preserving)."""
        r = run([{
            "type": "pulse", "pulse_shape": "gaussian",
            "amplitude": math.pi, "phase": 0.0, "detuning": 0.0,
            "duration": 2.0, "sigma": 0.3,
        }], quality="high")
        # Gaussian pulse area ≈ A·σ·√(2π) = π·0.3·√(2π) ≈ 2.37 ≠ π
        # So it won't flip exactly; just check norm is preserved.
        final = r["final_state"]
        norm = math.sqrt(sum(c * c for c in final))
        assert abs(norm - 1.0) < ATOL_NORM, f"Gaussian norm = {norm:.10g}"

    def test_mixed_initial_state(self):
        """Mixed initial state (norm < 1): norm preserved under unitary evolution."""
        init = [0.0, 0.6, 0.0]
        r = run([{
            "type": "pulse", "pulse_shape": "square",
            "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0,
        }], initial=init)
        init_norm = math.sqrt(sum(c * c for c in init))
        final_norm = math.sqrt(sum(c * c for c in r["final_state"]))
        assert abs(final_norm - init_norm) < ATOL_NORM, (
            f"norm changed: {init_norm:.10g} → {final_norm:.10g}"
        )

    def test_bloch_norm_preserved_throughout_trajectory(self):
        """Bloch-norm ≤ 1 for every point in the trajectory."""
        r = run([
            {"type": "pulse", "pulse_shape": "square",
             "amplitude": 2 * math.pi, "phase": 0.5, "detuning": 0.8, "duration": 1.5},
            {"type": "free", "duration": 0.5, "omega0": math.pi},
        ])
        for i, vec in enumerate(r["trajectory"]):
            ns = sum(c * c for c in vec)
            assert ns <= 1.0 + ATOL_NORM, f"step {i}: norm² = {ns:.15g} > 1"

    def test_continuity_between_items(self):
        """No discontinuous jump in trajectory at item boundaries.

        We skip the duplicate boundary point when stitching items, so the step
        at the boundary equals one time-step of item 1's evolution — the same
        as any internal step.  We verify the boundary step is ≤ 2× the max
        internal step (allowing slack for different Hamiltonians).
        """
        r = run([
            {"type": "pulse", "pulse_shape": "square",
             "amplitude": math.pi / 2, "phase": 0.0, "detuning": 0.0, "duration": 1.0},
            {"type": "free", "duration": 0.5, "omega0": math.pi},
        ])
        traj = r["trajectory"]
        item_indices = r["item_index"]

        def step_size(i):
            return math.sqrt(sum((traj[i+1][j] - traj[i][j])**2 for j in range(3)))

        boundary = next(i for i, idx in enumerate(item_indices) if idx == 1)
        boundary_step = step_size(boundary - 1)  # step crossing the item seam

        # Max step elsewhere in the trajectory
        max_internal = max(
            step_size(i) for i in range(len(traj) - 1) if i != boundary - 1
        )

        assert boundary_step <= max_internal * 2 + 1e-6, (
            f"boundary step {boundary_step:.6g} far exceeds typical step {max_internal:.6g}"
        )

    def test_state_after_items_matches_trajectory(self):
        """state_after_items[i] matches the last trajectory point of item i."""
        seq = [
            {"type": "pulse", "pulse_shape": "square",
             "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0},
            {"type": "free", "duration": 0.5, "omega0": math.pi / 2},
        ]
        r = run(seq)
        item_indices = r["item_index"]
        traj = r["trajectory"]
        # Last point of each item
        for item_idx in range(len(seq)):
            last_pos = max(i for i, idx in enumerate(item_indices) if idx == item_idx)
            assert_vec(
                r["state_after_items"][item_idx], traj[last_pos],
                atol=1e-12, label=f"state_after_items[{item_idx}]"
            )

    def test_final_state_matches_last_item(self):
        """final_state == state_after_items[-1]."""
        r = run([
            {"type": "pulse", "pulse_shape": "square",
             "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0},
        ])
        assert r["final_state"] == r["state_after_items"][-1]


# ── Response structure ────────────────────────────────────────────────────────

class TestExperimentStructure:

    def test_trajectory_length_standard(self):
        """standard quality: trajectory has n_per_item points for a single item."""
        r = run([{
            "type": "pulse", "pulse_shape": "square",
            "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0,
        }], quality="standard")
        assert len(r["trajectory"])     == N_STD
        assert len(r["times"])          == N_STD
        assert len(r["item_index"])     == N_STD
        assert len(r["local_progress"]) == N_STD

    def test_trajectory_length_two_items(self):
        """Two items, n per item, boundary point is deduplicated."""
        r = run([
            {"type": "pulse", "pulse_shape": "square",
             "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0},
            {"type": "free", "duration": 0.5, "omega0": 0.0},
        ], quality="standard")
        # n + (n-1) = 2n-1 points
        assert len(r["trajectory"]) == 2 * N_STD - 1

    def test_times_monotone(self):
        """Global time array is strictly increasing."""
        r = run([
            {"type": "pulse", "pulse_shape": "square",
             "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0},
            {"type": "free", "duration": 0.5, "omega0": math.pi},
        ])
        times = r["times"]
        assert times[0] == pytest.approx(0.0, abs=1e-14)
        assert times[-1] == pytest.approx(r["total_duration"], abs=1e-12)
        for i in range(1, len(times)):
            assert times[i] > times[i - 1], f"non-monotone at {i}"

    def test_item_index_values(self):
        """item_index contains 0 for all first-item points, 1 for second-item, etc."""
        r = run([
            {"type": "pulse", "pulse_shape": "square",
             "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0},
            {"type": "free", "duration": 0.5, "omega0": 0.0},
        ])
        assert r["item_index"][0]  == 0
        assert r["item_index"][-1] == 1

    def test_local_progress_range(self):
        """local_progress is in [0, 1] for every point."""
        r = run([{
            "type": "pulse", "pulse_shape": "square",
            "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0},
            {"type": "free", "duration": 0.5, "omega0": math.pi},
        ])
        for p in r["local_progress"]:
            assert 0.0 <= p <= 1.0 + 1e-12, f"progress out of range: {p}"

    def test_solver_info(self):
        """solver_info contains solver='qutip' and a version string."""
        r = run([{
            "type": "pulse", "pulse_shape": "square",
            "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0,
        }])
        assert r["solver_info"]["solver"] == "qutip"
        assert isinstance(r["solver_info"]["version"], str)
        assert len(r["solver_info"]["version"]) > 0

    def test_quality_preview_steps(self):
        """preview quality uses 50 steps per item."""
        r = run([{
            "type": "pulse", "pulse_shape": "square",
            "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0,
        }], quality="preview")
        assert len(r["trajectory"]) == QUALITY_STEPS["preview"]

    def test_quality_high_steps(self):
        """high quality uses 1000 steps per item."""
        r = run([{
            "type": "pulse", "pulse_shape": "square",
            "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0,
        }], quality="high")
        assert len(r["trajectory"]) == QUALITY_STEPS["high"]


# ── HTTP endpoint ─────────────────────────────────────────────────────────────

class TestExperimentAPI:

    def test_basic_pi_pulse(self):
        resp = client.post("/simulate/experiment", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [{
                "type": "pulse", "pulse_shape": "square",
                "amplitude": math.pi, "phase": 0.0,
                "detuning": 0.0, "duration": 1.0,
            }],
            "quality": "standard",
        })
        assert resp.status_code == 200
        d = resp.json()
        assert_vec(d["final_state"], [0, 0, -1], label="API X-π")
        assert "trajectory"        in d
        assert "times"             in d
        assert "item_index"        in d
        assert "local_progress"    in d
        assert "state_after_items" in d
        assert "total_duration"    in d
        assert "solver_info"       in d

    def test_two_item_sequence(self):
        resp = client.post("/simulate/experiment", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [
                {"type": "pulse", "pulse_shape": "square",
                 "amplitude": math.pi / 2, "phase": 0.0, "detuning": 0.0, "duration": 1.0},
                {"type": "free", "duration": 0.5, "omega0": math.pi},
            ],
            "quality": "standard",
        })
        assert resp.status_code == 200
        d = resp.json()
        assert len(d["state_after_items"]) == 2
        assert d["total_duration"] == pytest.approx(1.5, abs=1e-12)

    def test_validation_bloch_out_of_bounds(self):
        resp = client.post("/simulate/experiment", json={
            "initial_bloch": [0, 0, 2],
            "sequence": [{"type": "pulse", "pulse_shape": "square",
                          "amplitude": 1.0, "phase": 0.0, "detuning": 0.0, "duration": 1.0}],
        })
        assert resp.status_code == 422

    def test_validation_empty_sequence(self):
        resp = client.post("/simulate/experiment", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [],
        })
        assert resp.status_code == 422

    def test_validation_bad_quality(self):
        resp = client.post("/simulate/experiment", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [{"type": "free", "duration": 1.0, "omega0": 0.0}],
            "quality": "ultra",
        })
        assert resp.status_code == 422

    def test_diagnostic_arrays_present(self):
        """All diagnostic arrays present and correct length in response."""
        resp = client.post("/simulate/experiment", json={
            "initial_bloch": [0, 0, 1],
            "sequence": [{"type": "pulse", "pulse_shape": "square",
                          "amplitude": math.pi, "phase": 0.0,
                          "detuning": 0.0, "duration": 1.0}],
            "quality": "standard",
        })
        assert resp.status_code == 200
        d = resp.json()
        n = len(d["trajectory"])
        for key in ("purity", "bloch_norm", "pop0", "pop1", "coherence", "trace_check"):
            assert key in d, f"{key!r} missing from response"
            assert len(d[key]) == n, f"{key}: got {len(d[key])}, expected {n}"
        assert "final_diagnostics" in d
        fd = d["final_diagnostics"]
        for k in ("trace", "purity", "bloch_norm", "eigenvalues"):
            assert k in fd, f"final_diagnostics missing {k!r}"


# ── Collapse operator unit tests ──────────────────────────────────────────────

class TestCollapseOperators:

    def test_zero_temp_one_operator(self):
        """At zero temperature (z_eq=+1) and T2=2T1, only C_down is created."""
        c_ops = _build_collapse_operators(T1=1.0, T2=2.0, equilibrium_z=1.0)
        assert len(c_ops) == 1  # only C_down; no C_up, no C_phi

    def test_t2_lt_2t1_adds_dephasing(self):
        """T2 < 2T1 creates C_down + C_phi (two operators at zero temperature)."""
        c_ops = _build_collapse_operators(T1=2.0, T2=1.0, equilibrium_z=1.0)
        assert len(c_ops) == 2  # C_down + C_phi

    def test_finite_temp_three_operators(self):
        """z_eq < 1 and T2 < 2T1 yields three operators: C_down, C_up, C_phi."""
        c_ops = _build_collapse_operators(T1=1.0, T2=0.5, equilibrium_z=0.0)
        assert len(c_ops) == 3  # C_down + C_up + C_phi

    def test_t2_equals_2t1_no_pure_dephasing(self):
        """T2 = 2T1 exactly: 1/T_phi = 0, so pure-dephasing operator absent."""
        c_ops = _build_collapse_operators(T1=1.0, T2=2.0, equilibrium_z=1.0)
        # Only amplitude-damping collapse operator at zero temperature
        assert all(op.shape == (2, 2) for op in c_ops)
        assert len(c_ops) == 1


# ── Decoherence physics tests ─────────────────────────────────────────────────

class TestDecoherencePhysics:

    PI_PULSE = {"type": "pulse", "pulse_shape": "square",
                "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 0.01}
    # Very short pulse so decoherence during the pulse is negligible

    def test_disabled_reproduces_unitary(self):
        """With enable_decoherence=False the trajectory matches the unitary result."""
        seq = [{"type": "pulse", "pulse_shape": "square",
                "amplitude": math.pi, "phase": 0.0, "detuning": 0.0, "duration": 1.0}]
        r_ideal = run(seq)
        r_dec   = simulate_experiment(
            initial_bloch=[0, 0, 1], sequence=seq, quality="standard",
            enable_decoherence=False,
        )
        assert_vec(r_ideal["final_state"], r_dec["final_state"], atol=1e-10,
                   label="disabled decoherence vs unitary")

    def test_excited_relaxes_toward_ground(self):
        """
        |1⟩ ([0,0,-1]) under T1 relaxation:  z(t) = 1 - 2·exp(-t/T1).
        After t = T1 seconds of free evolution: z ≈ 1 - 2/e ≈ -0.264.
        """
        T1 = 1.0
        r = run_dec(
            [{"type": "free", "duration": T1, "omega0": 0.0}],
            T1=T1, T2=T1,   # T2 = T1 ≤ 2T1
            initial=[0, 0, -1],
            quality="high",
        )
        z_analytic = 1.0 - 2.0 * math.exp(-1.0)   # ≈ -0.2642
        assert abs(r["final_state"][2] - z_analytic) < ATOL_DEC, (
            f"z after T1: {r['final_state'][2]:.6g}, expected {z_analytic:.6g}"
        )

    def test_transverse_coherence_decays(self):
        """
        |+x⟩ ([1,0,0]) under pure dephasing (T1 large, T2 = T1/100):
        The transverse component decays as exp(-t/T2).
        After t = T2: coherence ≈ 1/e ≈ 0.368.
        """
        T1 = 1000.0    # negligible T1 relaxation over T2 time
        T2 = 1.0
        r = run_dec(
            [{"type": "free", "duration": T2, "omega0": 0.0}],
            T1=T1, T2=T2, initial=[1, 0, 0], quality="high",
        )
        coh = math.sqrt(r["final_state"][0]**2 + r["final_state"][1]**2)
        expected = math.exp(-1.0)   # 1/e ≈ 0.368
        assert abs(coh - expected) < ATOL_DEC, (
            f"coherence after T2: {coh:.6g}, expected {expected:.6g}"
        )

    def test_combined_t1_t2_evolution(self):
        """Both relaxation and dephasing act simultaneously: norm decreases."""
        T1, T2 = 2.0, 1.0
        r0 = run([{"type": "free", "duration": 1.5, "omega0": math.pi / 2}],
                 initial=[1, 0, 0])
        r1 = run_dec([{"type": "free", "duration": 1.5, "omega0": math.pi / 2}],
                     T1=T1, T2=T2, initial=[1, 0, 0], quality="high")
        norm_ideal = math.sqrt(sum(c*c for c in r0["final_state"]))
        norm_dec   = math.sqrt(sum(c*c for c in r1["final_state"]))
        assert norm_dec < norm_ideal - 0.05, (
            f"decoherence should reduce norm: ideal={norm_ideal:.4g}, dec={norm_dec:.4g}"
        )

    def test_trace_preserved(self):
        """Tr(ρ) = 1 throughout — Lindblad is trace-preserving."""
        r = run_dec(
            [{"type": "pulse", "pulse_shape": "square",
              "amplitude": math.pi, "phase": 0.3, "detuning": 0.5, "duration": 1.0},
             {"type": "free", "duration": 0.5, "omega0": math.pi}],
            T1=1.0, T2=0.8, initial=[0, 0, 1], quality="standard",
        )
        for i, tr in enumerate(r["trace_check"]):
            assert abs(tr - 1.0) < 1e-3, f"trace[{i}] = {tr:.10g}"

    def test_hermiticity_via_purity(self):
        """Purity = Tr(ρ²) ∈ (0, 1] everywhere — implies ρ is a valid density matrix."""
        r = run_dec(
            [{"type": "free", "duration": 2.0, "omega0": math.pi / 2}],
            T1=1.0, T2=0.6, initial=[1, 0, 0], quality="standard",
        )
        for i, p in enumerate(r["purity"]):
            assert 0.0 <= p <= 1.0 + 1e-6, f"purity[{i}] = {p:.10g} out of [0,1]"

    def test_positivity_eigenvalues(self):
        """Eigenvalues of final ρ are non-negative and sum to 1."""
        r = run_dec(
            [{"type": "free", "duration": 2.0, "omega0": 0.0}],
            T1=1.0, T2=0.8, initial=[0, 0, -1], quality="high",
        )
        evals = r["final_diagnostics"]["eigenvalues"]
        for e in evals:
            assert e >= -1e-6, f"negative eigenvalue: {e:.10g}"
        assert abs(sum(evals) - 1.0) < 1e-6, f"eigenvalues don't sum to 1: {sum(evals):.10g}"

    def test_purity_decreases(self):
        """Under decoherence, purity decreases from 1 (pure → mixed).

        Use |+x⟩ = [1,0,0] so both T1 (z-relaxation) and T2 (transverse decay)
        act; the ground state [0,0,1] is invariant and would show no change.
        """
        r = run_dec(
            [{"type": "free", "duration": 1.5, "omega0": 0.0}],
            T1=1.0, T2=0.5, initial=[1, 0, 0], quality="standard",
        )
        initial_purity = r["purity"][0]
        final_purity   = r["purity"][-1]
        assert final_purity < initial_purity - 0.01, (
            f"purity should decrease: {initial_purity:.4g} → {final_purity:.4g}"
        )

    def test_bloch_norm_at_most_one(self):
        """Bloch norm ≤ 1 everywhere (positivity of ρ)."""
        r = run_dec(
            [{"type": "pulse", "pulse_shape": "square",
              "amplitude": 2 * math.pi, "phase": 0.4, "detuning": 0.3, "duration": 1.0}],
            T1=0.8, T2=0.5, initial=[0.6, 0, 0.8], quality="standard",
        )
        for i, bn in enumerate(r["bloch_norm"]):
            assert bn <= 1.0 + 1e-5, f"bloch_norm[{i}] = {bn:.10g} > 1"

    def test_t2_equals_2t1_pure_amplitude_damping(self):
        """T2 = 2T1 → zero pure-dephasing rate; transverse decay only from T1."""
        T1 = 1.0
        r = run_dec(
            [{"type": "free", "duration": T1, "omega0": 0.0}],
            T1=T1, T2=2.0 * T1,   # T2 = 2T1 — no pure dephasing
            initial=[1, 0, 0], quality="high",
        )
        # Analytic: x(t) = exp(-t/(2T1)), z(t) = 1 - exp(-t/T1)
        x_analytic = math.exp(-0.5)   # t/T1=1, x = e^{-1/(2)}
        z_analytic = 1.0 - math.exp(-1.0)
        assert abs(r["final_state"][0] - x_analytic) < ATOL_DEC, (
            f"x: got {r['final_state'][0]:.6g}, expected {x_analytic:.6g}"
        )
        assert abs(r["final_state"][2] - z_analytic) < ATOL_DEC, (
            f"z: got {r['final_state'][2]:.6g}, expected {z_analytic:.6g}"
        )

    def test_continuity_across_items_with_decoherence(self):
        """Density-matrix continuity is preserved at item boundaries under decoherence."""
        r = run_dec(
            [{"type": "pulse", "pulse_shape": "square",
              "amplitude": math.pi / 2, "phase": 0.0, "detuning": 0.0, "duration": 1.0},
             {"type": "free", "duration": 1.0, "omega0": 0.0}],
            T1=2.0, T2=1.0, initial=[0, 0, 1], quality="standard",
        )
        traj = r["trajectory"]
        idxs = r["item_index"]
        boundary = next(i for i, idx in enumerate(idxs) if idx == 1)

        def step(i):
            return math.sqrt(sum((traj[i+1][j] - traj[i][j])**2 for j in range(3)))

        bdry_step = step(boundary - 1)
        max_internal = max(step(i) for i in range(len(traj) - 1) if i != boundary - 1)
        assert bdry_step <= max_internal * 2 + 1e-6, (
            f"discontinuity at boundary: step={bdry_step:.6g}, typical={max_internal:.6g}"
        )


# ── Decoherence HTTP / validation ─────────────────────────────────────────────

class TestDecoherenceAPI:

    _seq = [{"type": "free", "duration": 1.0, "omega0": 0.0}]

    def _post(self, body):
        return client.post("/simulate/experiment", json=body)

    def test_decoherence_endpoint_ok(self):
        resp = self._post({
            "initial_bloch": [0, 0, 1],
            "sequence": self._seq,
            "enable_decoherence": True,
            "T1": 2.0, "T2": 1.0,
        })
        assert resp.status_code == 200
        d = resp.json()
        assert "purity"           in d
        assert "bloch_norm"       in d
        assert "pop0"             in d
        assert "pop1"             in d
        assert "coherence"        in d
        assert "final_diagnostics" in d

    def test_t2_gt_2t1_rejected(self):
        """T2 > 2·T1 violates physics — must return 422."""
        resp = self._post({
            "initial_bloch": [0, 0, 1],
            "sequence": self._seq,
            "enable_decoherence": True,
            "T1": 1.0, "T2": 2.5,   # 2.5 > 2·1.0 = 2.0
        })
        assert resp.status_code == 422

    def test_t1_missing_rejected(self):
        resp = self._post({
            "initial_bloch": [0, 0, 1],
            "sequence": self._seq,
            "enable_decoherence": True,
            "T2": 1.0,
        })
        assert resp.status_code == 422

    def test_t1_negative_rejected(self):
        resp = self._post({
            "initial_bloch": [0, 0, 1],
            "sequence": self._seq,
            "enable_decoherence": True,
            "T1": -1.0, "T2": 0.5,
        })
        assert resp.status_code == 422

    def test_disabled_decoherence_no_t1_required(self):
        """T1/T2 are not required when decoherence is disabled."""
        resp = self._post({
            "initial_bloch": [0, 0, 1],
            "sequence": self._seq,
            "enable_decoherence": False,
        })
        assert resp.status_code == 200

    def test_equilibrium_z_out_of_range(self):
        resp = self._post({
            "initial_bloch": [0, 0, 1],
            "sequence": self._seq,
            "enable_decoherence": True,
            "T1": 1.0, "T2": 0.5, "equilibrium_z": 1.5,
        })
        assert resp.status_code == 422
