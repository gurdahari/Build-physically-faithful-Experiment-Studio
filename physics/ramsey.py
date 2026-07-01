from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class RamseyParameters:
    magnetic_field_t: float
    gyromagnetic_ratio_hz_per_t: float
    detuning_hz: float
    free_time_s: float
    t2_star_s: float
    contrast: float = 1.0
    final_pulse_phase_rad: float = 0.0
    samples: int = 240
    pulse_fraction: float = 0.12


@dataclass(frozen=True)
class RamseyResult:
    time_s: np.ndarray
    bloch_x: np.ndarray
    bloch_y: np.ndarray
    bloch_z: np.ndarray
    phase_rad: np.ndarray
    probability_zero: np.ndarray
    stage: np.ndarray
    first_pulse_end_s: float
    free_evolution_end_s: float
    total_time_s: float
    angular_frequency_rad_s: float


def _rotation_y(theta: np.ndarray, vector: np.ndarray) -> np.ndarray:
    """Rotate a 3-vector or stack of vectors around the y-axis."""
    c = np.cos(theta)
    s = np.sin(theta)
    x, y, z = vector
    return np.array([c * x + s * z, y, -s * x + c * z])


def simulate_ramsey(p: RamseyParameters) -> RamseyResult:
    if p.free_time_s <= 0:
        raise ValueError("free_time_s must be positive")
    if p.t2_star_s <= 0:
        raise ValueError("t2_star_s must be positive")
    if p.samples < 20:
        raise ValueError("samples must be at least 20")
    if not 0 <= p.contrast <= 1:
        raise ValueError("contrast must be between 0 and 1")

    pulse_duration = max(p.free_time_s * p.pulse_fraction, 1e-9)
    first_end = pulse_duration
    free_end = first_end + p.free_time_s
    total = free_end + pulse_duration

    n_pulse = max(10, int(p.samples * p.pulse_fraction))
    n_free = max(20, p.samples - 2 * n_pulse)

    t1 = np.linspace(0.0, first_end, n_pulse, endpoint=False)
    tf = np.linspace(first_end, free_end, n_free, endpoint=False)
    t2 = np.linspace(free_end, total, n_pulse + 1)

    # First ideal pi/2 rotation: north pole -> +x.
    theta1 = (np.pi / 2) * (t1 / pulse_duration)
    x1 = np.sin(theta1)
    y1 = np.zeros_like(theta1)
    z1 = np.cos(theta1)

    frequency_hz = (
        p.gyromagnetic_ratio_hz_per_t * p.magnetic_field_t
        + p.detuning_hz
    )
    omega = 2 * np.pi * frequency_hz

    tau = tf - first_end
    phase_f = omega * tau
    coherence = np.exp(-tau / p.t2_star_s)

    xf = coherence * np.cos(phase_f)
    yf = coherence * np.sin(phase_f)
    zf = np.zeros_like(tf)

    # Animate the final pulse as a y-axis rotation. The final pulse phase
    # is represented by shifting the accumulated phase before readout.
    final_phase = omega * p.free_time_s - p.final_pulse_phase_rad
    final_coherence = np.exp(-p.free_time_s / p.t2_star_s)
    start_vector = np.array(
        [
            final_coherence * np.cos(final_phase),
            final_coherence * np.sin(final_phase),
            0.0,
        ]
    )

    theta2 = -(np.pi / 2) * ((t2 - free_end) / pulse_duration)
    rotated = np.column_stack(
        [_rotation_y(theta, start_vector) for theta in theta2]
    )
    x2, y2, z2 = rotated

    time = np.concatenate([t1, tf, t2])
    x = np.concatenate([x1, xf, x2])
    y = np.concatenate([y1, yf, y2])
    z = np.concatenate([z1, zf, z2])

    phase = np.concatenate([
        np.zeros_like(t1),
        phase_f,
        np.full_like(t2, omega * p.free_time_s),
    ])

    probability = (1 + z) / 2
    predicted_final = (
        1
        + p.contrast
        * final_coherence
        * np.cos(final_phase)
    ) / 2
    probability[-1] = np.clip(predicted_final, 0.0, 1.0)

    stage = np.concatenate([
        np.full(t1.shape, "Initial π/2 pulse", dtype=object),
        np.full(tf.shape, "Free evolution", dtype=object),
        np.full(t2.shape, "Final π/2 pulse + readout", dtype=object),
    ])

    return RamseyResult(
        time_s=time,
        bloch_x=x,
        bloch_y=y,
        bloch_z=z,
        phase_rad=phase,
        probability_zero=probability,
        stage=stage,
        first_pulse_end_s=first_end,
        free_evolution_end_s=free_end,
        total_time_s=total,
        angular_frequency_rad_s=omega,
    )
