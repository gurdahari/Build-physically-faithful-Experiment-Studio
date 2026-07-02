/**
 * presets — named research-grade experiment configurations.
 *
 * Each preset is plain configuration data (initial state, sequence, environment,
 * measurement, description) that drives the SAME QuTiP experiment endpoint via
 * the existing hook.  No new simulation engine.
 *
 * Phases use the pulse-axis convention (X → φ=0, Y → φ=π/2).  Items omit `id`;
 * the hook assigns ids when the preset is applied.
 */

const PI = Math.PI;

const pulse = (axisPhase, amplitude, duration, shape = "square", extra = {}) => ({
  type: "pulse", pulse_shape: shape, amplitude, phase: axisPhase,
  detuning: 0.0, duration, sigma: null, ...extra,
});
const free = (omega0, duration) => ({ type: "free", duration, omega0 });

export const PRESETS = {
  rabi: {
    key: "rabi",
    name: "Rabi oscillation",
    description: "Continuous resonant drive from |0⟩ — the Bloch vector nutates through several full rotations about X.",
    initKey: "|0⟩",
    // One long square X drive → many Rabi cycles (area = π·4 = 4π).
    sequence: [pulse(0, PI, 4.0)],
    decoherence: { enabled: false, T1: 2.0, T2: 1.0, zEq: 1.0 },
    measurement: { enabled: true, axis: "z" },
  },

  ramsey: {
    key: "ramsey",
    name: "Ramsey (T2*) sequence",
    description: "X π/2 · free precession (detuned) · X π/2. Fringes encode the detuning; free evolution accrues phase about B₀.",
    initKey: "|0⟩",
    sequence: [pulse(0, PI / 2, 1.0), free(PI, 2.0), pulse(0, PI / 2, 1.0)],
    decoherence: { enabled: false, T1: 4.0, T2: 2.0, zEq: 1.0 },
    measurement: { enabled: true, axis: "z" },
  },

  echo: {
    key: "echo",
    name: "Spin echo (Hahn)",
    description: "X π/2 · free · Y π refocus · free · read. The π pulse refocuses static dephasing (the echo).",
    initKey: "|0⟩",
    sequence: [pulse(0, PI / 2, 1.0), free(PI, 1.5), pulse(PI / 2, PI, 1.0), free(PI, 1.5)],
    decoherence: { enabled: true, T1: 8.0, T2: 4.0, zEq: 1.0 },
    measurement: { enabled: true, axis: "z" },
  },

  fid: {
    key: "fid",
    name: "Free induction decay",
    description: "X π/2 tips the spin into the transverse plane; the free-induction signal precesses and decays with T2.",
    initKey: "|0⟩",
    sequence: [pulse(0, PI / 2, 1.0), free(2 * PI, 4.0)],
    decoherence: { enabled: true, T1: 6.0, T2: 1.5, zEq: 1.0 },
    measurement: { enabled: true, axis: "z" },
  },
};

export const PRESET_LIST = Object.values(PRESETS);
