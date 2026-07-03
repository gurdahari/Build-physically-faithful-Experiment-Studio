# Hydrogen Precision Atomic Structure & Spectroscopy — Milestone 4

> **Precision Atomic Structure is a LAYERED EFFECTIVE MODEL.** It combines
> analytic/perturbative calculations with versioned reference data. **It is NOT a
> complete real-time bound-state QED simulation.** Every contribution declares
> whether it is *computed*, *reference-data*, *not active*, or *omitted*, and the
> correction budget reports each term separately with provenance.

The authoritative **spatial** state is unchanged: the nonrelativistic probability
density (see [HYDROGEN_ATOMIC.md](HYDROGEN_ATOMIC.md)) remains the orbital
renderer. Precision corrections change **energy and spin-angular structure**, and
are **never** shown as new spatial deformations of the orbital cloud.

Backend package: [backend/hydrogen/precision/](../backend/hydrogen/precision/) —
pure Python (no FastAPI, no Three.js, **no QuTiP**). Routes in
[main.py](../backend/main.py); the QuTiP Proton Spin model is untouched.

## Correction hierarchy

```
E_total = E_Coulomb + ΔE_fine + ΔE_recoil + ΔE_Lamb + ΔE_hyperfine + ΔE_Zeeman
```

| term | provider | classification | supported |
|---|---|---|---|
| `E_Coulomb` | nonrelativistic baseline (reduced mass) | computed | all n ≤ 2 |
| `ΔE_fine` | [fine_structure.py](../backend/hydrogen/precision/fine_structure.py) | **computed** (perturbative α²) | all |
| `ΔE_recoil` | [recoil.py](../backend/hydrogen/precision/recoil.py) | **not active** (baseline already reduced-mass) | — |
| `ΔE_Lamb` | [lamb_shift.py](../backend/hydrogen/precision/lamb_shift.py) | **reference data** | 2S1/2 − 2P1/2 |
| `ΔE_hyperfine` | [hyperfine.py](../backend/hydrogen/precision/hyperfine.py) | **computed** (A fixed to reference ν_HF) | 1S1/2 ground |
| `ΔE_Zeeman` | [zeeman.py](../backend/hydrogen/precision/zeeman.py) | **computed** (Breit–Rabi / weak-field) | ground manifold; fine-structure levels (weak field) |

### Double-counting prevention

- **Fine structure** uses one authoritative perturbative implementation; it is
  **not** combined with an exact-Dirac binding energy (that would double count
  relativity), and it adds **no** reduced-mass term.
- **Recoil**: the reduced mass μ = mₑmₚ/(mₑ+mₚ) is already in the baseline. No
  second reduced-mass correction is added; additional recoil is reported
  `not_active` with a reason — never a filler number.
- **Lamb shift** is preserved as a single *transition difference*
  (2S1/2 − 2P1/2), assigned with 2P1/2 as the zero reference; it is **not** split
  into two arbitrary absolute QED shifts.
- **Hyperfine** coupling A is fixed to the measured ν_HF; it is not added on top
  of a separately-computed A.
- **Ground-state Zeeman** diagonalizes `A I·J + Zeeman` together; the budget
  reports `hyperfine` = the zero-field parent energy and `zeeman` = the
  field-induced remainder so the terms sum exactly to the total.

## Fine structure

Leading-order (α²) perturbative point-nucleus shift:

```
ΔE_fine(n, j) = E_n⁽⁰⁾ · (Zα)²/n² · ( n/(j + 1/2) − 3/4 )
```

Depends only on **(n, j)**. Consequences (verified by tests): the n-degeneracy is
partially lifted; **2P1/2 lies below 2P3/2** (≈ 10.97 GHz); states of equal (n, j)
stay degenerate, so **2S1/2 and 2P1/2 remain degenerate** until the Lamb shift.
The 2S1/2–2P1/2 separation is **not** attributed to fine structure.

## Reduced-mass baseline & recoil treatment

The baseline energies `E_n = −μe⁴/[2(4πε₀)²ℏ²n²]` already use the reduced mass.
The recoil provider states this explicitly and returns `additional_recoil = 0`
(`status: not_active`). Higher-order recoil (relativistic recoil, mass
polarization) is omitted.

## Lamb-shift provider (reference data, not a calculation)

`E(2S1/2) − E(2P1/2) = 1057.845 MHz` (± 9 kHz), from a versioned dataset
([reference_data.py](../backend/hydrogen/precision/reference_data.py)):
`id`, `version`, `value_Hz`, `uncertainty_Hz`, `kind: transition-difference`,
`isotope`, and `proton_size_included_in_value: true`. The UI labels this a
**Reference-data QED correction**, never a real-time QED simulation. It lifts the
supported 2S1/2–2P1/2 degeneracy.

## Hyperfine structure & the 21 cm line

Effective `H_hfs = A I·J` with electron J = 1/2, proton I = 1/2, and A fixed to
the versioned ground-state hyperfine frequency `ν_HF = 1420.405751768 MHz`:

```
⟨I·J⟩ = ½[F(F+1) − I(I+1) − J(J+1)]
E(F=1) = +A/4   (triplet, m_F = −1,0,+1)      E(F=0) = −3A/4  (singlet)
ΔE_hf = A = h·ν_HF   →  the 21 cm transition
```

At zero field the F=1 triplet is degenerate. The **21 cm** preset is the
`F=1 ↔ F=0` transition, classified as **magnetic dipole (M1)**, with mutually
consistent energy / frequency / wavelength (≈ 21.106 cm). It changes the coupled
**spin** state; the 1s spatial density is essentially unchanged and no electron
"jump" between orbital paths is depicted. Excited-state hyperfine is omitted.

## Zeeman model & the Breit–Rabi equation

Static field belongs to the **precision model** (0–20 T), independent of the
laboratory B₀ unless an explicit adapter is chosen. For the 1S1/2 hyperfine
manifold the four-state Hamiltonian is diagonalized exactly:

```
H = A I·J + g_J μ_B B J_z − g_p μ_N B I_z
```

It is block-diagonal in `m_F = m_J + m_I`: the stretched states (m_F = ±1) are
exact linear branches; the m_F = 0 block is a 2×2 mixing |F=1,0⟩ and |F=0,0⟩.

### Coupled vs uncoupled bases and regime labels

`x = g_J μ_B B / A` measures the electron Zeeman energy against the hyperfine
splitting. Regime: `weak_field` (x < 0.1) → `intermediate` → `paschen_back`
(x ≥ 10). **F, m_F labels are reported only while F is a good quantum number**;
otherwise the level reports its composition in the coupled and uncoupled bases
(both normalized to 1). Fine-structure levels support a weak-field linear Zeeman
split `E = E₀ + g_J μ_B B m_J` (validity limited to weak field). No ultra-strong-
field orbital deformation is implemented.

## Selection rules & transition classification

[selection_rules.py](../backend/hydrogen/precision/selection_rules.py) returns the
full rule evaluation (never a bare allowed/forbidden), the reason, the type, and
polarization compatibility.

- **E1** (electric dipole): parity must change; Δl = ±1; Δj = 0, ±1 (not 0→0);
  Δm_j ∈ {0, ±1}. Hyperfine-resolved: ΔF = 0, ±1 (not F=0→0); Δm_F ∈ {0, ±1}.
- **M1** (magnetic dipole): Δl = 0; ΔF = 0, ±1 (not F=0→0); Δm_F ∈ {0, ±1} — the
  ground-state 21 cm spin flip.
- Polarization: Δm = 0 → π; Δm = ±1 → σ±.

Quantities: `ΔE`, `ν = ΔE/h`, `ω = 2πν`, `λ = c/ν`. **Arrows are drawn only for
allowed transitions** (`draw_arrow`). Presets: 21 cm, Lyman-α (2P1/2→1S1/2 and
2P3/2→1S1/2), and the 2S1/2↔2P1/2 Lamb comparison — the last is a ~1 GHz
**microwave** interval that exists only because of the Lamb shift, **not** an
ordinary optical line, and no emission dynamics are animated.

## API

- `GET /hydrogen/precision/model` — hierarchy, providers (with classifications),
  supported states, included/omitted physics, validity ranges, constants/dataset
  versions, transition presets.
- `POST /hydrogen/precision/levels` — `{state_family, corrections[], magnetic_field_tesla,
  include_sublevels, field_sweep}` → baseline, **per-term correction budget**,
  totals, quantum numbers, degeneracies, uncertainties, state composition,
  provenance; Breit–Rabi structure + sweep for the ground manifold.
- `POST /hydrogen/precision/transitions` — `{initial, final | preset, transition_type,
  magnetic_field_tesla, corrections[]}` → allowed/forbidden, rule evaluation,
  energy/frequency/ω/wavelength, polarization, provenance.

Responses are JSON-native (no NumPy/complex/NaN/Infinity). Invalid quantum
numbers, unsupported states, out-of-range fields, and **unsupported correction
combinations** return `422` with a clear message (e.g. `hyperfine` is only
available via the `ground_hyperfine` family).

## Frontend (visualization)

The Precision resolution reuses the atomic viewport and app shell — no new
top-level mode. The nonrelativistic orbital density is the spatial context, with
a banner: *"Spatial density source: nonrelativistic orbital model · Precision
overlay: spin & energy corrections only — the spatial cloud is not deformed."*

The single [PrecisionOverlay](../frontend/src/experiment/PrecisionOverlay.jsx)
card contains: correction-stack selector (family + progressive views + toggles
tagged computed/reference-data), an **energy-level explorer** (with a declared
*"Energy-axis magnification active"* label when the spread is tiny — physical
values stay visible), an interpretive **spin-coupling glyph** (singlet/triplet;
never a rotating classical ball), a **magnetic-field control** with the
**Breit–Rabi** plot, a **transition inspector**, the **correction budget** (with
per-term classification tags), and a provenance footer. Data flows through
[usePrecision.js](../frontend/src/experiment/usePrecision.js) (deterministic cache
keys, `AbortController` + monotonic token so stale field responses can't replace
newer ones); the pure mappings live in
[precisionModel.js](../frontend/src/domain/precisionModel.js). VisualTruth
descriptors: `visual.precision.*` in
[visualTruth.js](../frontend/src/domain/visualTruth.js).

### Relationship to the orbital renderer (spatial limitations)

- `1S1/2, F=0` and `1S1/2, F=1` **share the same 1s density**.
- `2P1/2` and `2P3/2` **share the 2p spatial representation** at this level.
- Their energy and spin-angular structure differ **only** in the overlay. No
  distinct spatial clouds are fabricated for spin/hyperfine splittings, and no
  Dirac spinors are rendered (not implemented).

## Uncertainty & provenance

Computed terms carry truncation error (fine structure at O(α²)); reference data
carry declared dataset uncertainty (Lamb ± 9 kHz; ν_HF ± 1 Hz here as a
conservative bound). Every level/transition response includes model + constants
versions and an `engine: "not QuTiP"` marker.

## Supported states & omitted physics

**Supported:** 1S1/2, 2S1/2, 2P1/2, 2P3/2; ground-state hyperfine 1S1/2 F=0/F=1
and all m_F. **Omitted / limited:** full numerical bound-state QED, arbitrary-order
radiative corrections, complete two-photon exchange, full proton-polarizability,
arbitrary excited-state hyperfine, strong-field ionization, time-dependent optical
driving, spontaneous-emission dynamics, collisions, environmental decoherence,
many-body effects, molecular hydrogen, proton internal real-time dynamics, and
electroweak corrections.

## Scientific tolerances (tests)

| check | tolerance |
|---|---|
| exact analytic identities (energies, budget sums, E–ν–ω–λ) | 1e-9 rel / 1e-15 abs |
| 2S1/2–2P1/2 degeneracy before Lamb | 1e-9 rel |
| Lamb 2S1/2−2P1/2 = 1057.845 MHz | 1e-6 rel |
| ground hyperfine ν_HF = 1420.405751768 MHz | 1e-6 rel |
| fine split 2P3/2−2P1/2 ≈ 10.97 GHz | 5e-2 rel |
| Breit–Rabi B=0 limit → hyperfine energies | 1e-9 rel |

## Reference-data sources & versions

- `reference-dataset:hydrogen-1s-hyperfine-frequency v1` — ν_HF = 1420.405751768 MHz.
- `reference-dataset:hydrogen-lamb-2s1_2-2p1_2 v1` — 1057.845 MHz (± 9 kHz), ¹H.
- Base physical constants: `CODATA-2018-v1` (via `hydrogen.constants`).
