import numpy as np
import pytest

from physics.ramsey import RamseyParameters, simulate_ramsey


def base_params(**changes):
    values = dict(
        magnetic_field_t=0.0,
        gyromagnetic_ratio_hz_per_t=28e9,
        detuning_hz=0.0,
        free_time_s=5e-6,
        t2_star_s=10e-6,
        contrast=1.0,
        final_pulse_phase_rad=0.0,
        samples=200,
    )
    values.update(changes)
    return RamseyParameters(**values)


def test_zero_phase_returns_high_population():
    result = simulate_ramsey(base_params())
    assert np.isclose(result.probability_zero[-1], (1 + np.exp(-0.5)) / 2)


def test_probability_stays_physical():
    result = simulate_ramsey(
        base_params(magnetic_field_t=0.7e-6, detuning_hz=0.4e6)
    )
    assert np.all(result.probability_zero >= 0)
    assert np.all(result.probability_zero <= 1)


def test_invalid_t2_is_rejected():
    with pytest.raises(ValueError):
        simulate_ramsey(base_params(t2_star_s=0.0))
