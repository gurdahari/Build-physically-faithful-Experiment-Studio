"""
Tests for the detector-signal observable added to POST /simulate/experiment.

The detector signal is the transverse magnetization quadrature (<σx>, <σy>),
derived in the response layer from the already-computed Bloch trajectory.
"""

import math
import pytest

qutip = pytest.importorskip("qutip", reason="QuTiP not installed")

from physics.experiment import simulate_experiment, _sample_projective_measurement


def run(sequence, initial=(0, 0, 1), quality="standard", **kw):
    return simulate_experiment(initial_bloch=list(initial), sequence=sequence, quality=quality, **kw)


class TestDetectorSignal:

    def test_signal_real_matches_bloch_x(self):
        r = run([{"type": "pulse", "pulse_shape": "square", "amplitude": math.pi,
                  "phase": 0.0, "detuning": 0.0, "duration": 1.0}])
        for sig, point in zip(r["detector_signal_real"], r["trajectory"]):
            assert abs(sig - point[0]) < 1e-12

    def test_signal_imag_matches_bloch_y(self):
        # Phase π/2 drives magnetization into the Y quadrature.
        r = run([{"type": "pulse", "pulse_shape": "square", "amplitude": math.pi,
                  "phase": math.pi / 2, "detuning": 0.0, "duration": 1.0}])
        for sig, point in zip(r["detector_signal_imag"], r["trajectory"]):
            assert abs(sig - point[1]) < 1e-12

    def test_signal_magnitude_is_quadrature_norm(self):
        r = run([{"type": "pulse", "pulse_shape": "gaussian", "amplitude": 2 * math.pi,
                  "phase": 0.3, "detuning": 0.5, "duration": 1.0}])
        for mag, re, im in zip(r["detector_signal_magnitude"],
                               r["detector_signal_real"], r["detector_signal_imag"]):
            assert abs(mag - math.hypot(re, im)) < 1e-12

    def test_signal_magnitude_equals_coherence(self):
        # signal_magnitude == coherence (both are √(x²+y²)); documented equivalence.
        r = run([{"type": "pulse", "pulse_shape": "square", "amplitude": math.pi,
                  "phase": 0.7, "detuning": 0.0, "duration": 1.0}])
        for mag, coh in zip(r["detector_signal_magnitude"], r["coherence"]):
            assert abs(mag - coh) < 1e-12

    def test_zero_transverse_gives_zero_signal(self):
        # Start at |0> (north pole) and only free-evolve about Z: transverse stays 0.
        r = run([{"type": "free", "duration": 1.0, "omega0": math.pi}], initial=(0, 0, 1))
        assert max(r["detector_signal_magnitude"]) < 1e-9
        assert all(abs(v) < 1e-9 for v in r["detector_signal_real"])
        assert all(abs(v) < 1e-9 for v in r["detector_signal_imag"])

    def test_signal_arrays_share_trajectory_indexing(self):
        r = run([
            {"type": "pulse", "pulse_shape": "square", "amplitude": math.pi,
             "phase": 0.0, "detuning": 0.0, "duration": 1.0},
            {"type": "free", "duration": 0.5, "omega0": math.pi},
        ])
        n = len(r["trajectory"])
        assert len(r["detector_signal_real"]) == n
        assert len(r["detector_signal_imag"]) == n
        assert len(r["detector_signal_magnitude"]) == n
        assert len(r["field_trajectory"]) == n
        assert len(r["times"]) == n
        assert len(r["item_index"]) == n


class TestProjectiveMeasurement:

    def test_ground_state_outcome_is_zero(self):
        m = _sample_projective_measurement([0.0, 0.0, 1.0])
        assert m["outcome"] == 0 and m["label"] == "|0⟩"
        assert abs(m["p0"] - 1.0) < 1e-12 and abs(m["p1"]) < 1e-12

    def test_excited_state_outcome_is_one(self):
        m = _sample_projective_measurement([0.0, 0.0, -1.0])
        assert m["outcome"] == 1 and m["label"] == "|1⟩"
        assert abs(m["p0"]) < 1e-12 and abs(m["p1"] - 1.0) < 1e-12

    def test_probabilities_sum_to_one_and_outcome_valid(self):
        m = _sample_projective_measurement([0.3, -0.4, 0.5])
        assert abs(m["p0"] + m["p1"] - 1.0) < 1e-12
        assert m["outcome"] in (0, 1)
        assert m["basis"] == "z"

    def test_response_includes_measurement_sample(self):
        r = run([{"type": "pulse", "pulse_shape": "square", "amplitude": math.pi,
                  "phase": 0.0, "detuning": 0.0, "duration": 1.0}])
        assert "measurement_sample" in r
        assert r["measurement_sample"]["outcome"] in (0, 1)
