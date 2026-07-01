import numpy as np
import pytest

from physics.bloch_rotation import apply_rotation, bloch_vector, rotation_matrix


def test_initial_state_is_north_pole():
    # At t = 0, θ = 0 → (x, y, z) must be (0, 0, 1) for any omega
    bx, by, bz = bloch_vector(0.0, 3.7)
    assert bx == 0.0
    assert np.isclose(by, 0.0)
    assert np.isclose(bz, 1.0)


def test_half_rotation_reaches_south_pole():
    # At θ = π (half rotation) → (0, 0, −1) which is |1⟩
    omega = 2.0
    t_half = np.pi / omega          # time for θ = π
    bx, by, bz = bloch_vector(t_half, omega)
    assert bx == 0.0
    assert np.isclose(by, 0.0, atol=1e-10)
    assert np.isclose(bz, -1.0)


def test_full_rotation_returns_to_north_pole():
    # At θ = 2π the vector completes one full revolution and is back at |0⟩
    omega = 1.5
    t_full = 2 * np.pi / omega
    bx, by, bz = bloch_vector(t_full, omega)
    assert bx == 0.0
    assert np.isclose(by, 0.0, atol=1e-10)
    assert np.isclose(bz, 1.0)


def test_unit_length_preserved():
    # Ideal rotation is unitary — the Bloch vector always has length 1
    for t in np.linspace(0, 4 * np.pi, 80):
        bx, by, bz = bloch_vector(t, 1.5)
        assert np.isclose(bx**2 + by**2 + bz**2, 1.0), f"Non-unit at t={t}"


def test_x_component_is_always_zero():
    # Rotation around the x-axis keeps the x-component at zero
    for t in np.linspace(0, 10, 100):
        bx, _, _ = bloch_vector(t, 3.0)
        assert bx == 0.0


# ── apply_rotation / rotation_matrix tests ────────────────────────────────────

def test_rx_half_pi_north_to_minus_y():
    # Rx(π/2)|0⟩ = (0, -1, 0)
    x, y, z = apply_rotation((0, 0, 1), "x", np.pi / 2)
    assert np.isclose(x, 0)
    assert np.isclose(y, -1)
    assert np.isclose(z, 0, atol=1e-10)


def test_ry_half_pi_north_to_plus_x():
    # Ry(π/2)|0⟩ = (1, 0, 0)
    x, y, z = apply_rotation((0, 0, 1), "y", np.pi / 2)
    assert np.isclose(x, 1)
    assert np.isclose(y, 0, atol=1e-10)
    assert np.isclose(z, 0, atol=1e-10)


def test_rz_does_not_move_north_pole():
    # z-axis rotation leaves the north pole fixed
    x, y, z = apply_rotation((0, 0, 1), "z", np.pi / 3)
    assert np.isclose(x, 0, atol=1e-10)
    assert np.isclose(y, 0, atol=1e-10)
    assert np.isclose(z, 1)


def test_rx_pi_inverts_north_to_south():
    # Rx(π)|0⟩ = |1⟩
    x, y, z = apply_rotation((0, 0, 1), "x", np.pi)
    assert np.isclose(z, -1)


def test_apply_rotation_preserves_unit_length():
    state = (1 / np.sqrt(3), 1 / np.sqrt(3), 1 / np.sqrt(3))
    for ax in ("x", "y", "z"):
        for ang in (np.pi / 6, np.pi / 2, np.pi, 3 * np.pi / 2):
            x, y, z = apply_rotation(state, ax, ang)
            assert np.isclose(x**2 + y**2 + z**2, 1.0)


def test_invalid_axis_raises():
    with pytest.raises(ValueError):
        apply_rotation((0, 0, 1), "w", np.pi / 2)


def test_two_pi_rotation_is_identity():
    # R_axis(2π) must return the original vector
    state = (0.5, 0.5, 1 / np.sqrt(2))
    for ax in ("x", "y", "z"):
        x, y, z = apply_rotation(state, ax, 2 * np.pi)
        assert np.isclose(x, state[0])
        assert np.isclose(y, state[1])
        assert np.isclose(z, state[2])


def test_quarter_rotation_lands_on_minus_y():
    # At θ = π/2 → (0, −1, 0) — the vector points along −y
    omega = 4.0
    t = (np.pi / 2) / omega
    bx, by, bz = bloch_vector(t, omega)
    assert bx == 0.0
    assert np.isclose(by, -1.0)
    assert np.isclose(bz, 0.0, atol=1e-10)
