# Physically Faithful Visualization System — Specification

This document records every visualized quantity, its source, and every transformation
applied between the physical backend data and the visual representation.

**Rule**: The frontend must not invent physics.  Any scaling, frame transformation,
or normalization applied to backend data must be declared here and labeled in the UI.

---

## 1. Authoritative Data Source

All quantum state evolution is computed by the backend (`POST /simulate/experiment`).
The frontend receives and renders; it does not re-derive quantum trajectories.

### Backend response fields consumed by the visualization system

| Field | Type | Description |
|---|---|---|
| `trajectory` | `list[list[float]]` | Bloch vector [x,y,z] at each time point (rotating frame) |
| `field_trajectory` | `list[list[float]]` | Classical drive field [Ωx(t), Ωy(t), Δ] at each time point |
| `times` | `list[float]` | Physical time stamps (seconds) |
| `total_duration` | `float` | Total physical duration (seconds) |
| `purity`, `bloch_norm`, `pop0`, `pop1`, `coherence` | `list[float]` | Diagnostic arrays |
| `final_diagnostics` | `dict` | Final state trace, purity, eigenvalues |

### `field_trajectory` definition

`field_trajectory[i] = [Ωx(t_i), Ωy(t_i), Δ]` where:
- `Ωx(t) = Ω(t) · cos(φ)` — X component of rotating-frame drive
- `Ωy(t) = Ω(t) · sin(φ)` — Y component of rotating-frame drive
- `Δ` — detuning (constant per sequence item)
- `Ω(t)` — pulse envelope (square or Gaussian, from `_pulse_envelope`)

This is the **classical control signal** (input to the quantum solver), not a quantum result.
For free-evolution items: `[0, 0, ω₀]`.

---

## 2. Visualized Quantities

### 2.1 Bloch Vector (r)

| Property | Value |
|---|---|
| Source | `trajectory[playIndex]` |
| Scale | Exact: `|r| ≤ 1`; pure state = 1, maximally mixed = 0 |
| Color | Red (`#dc143c`) |
| Label | `r` |
| Frame dependence | Transformed by active reference frame |

The Bloch sphere has unit radius by convention.  `|r| = 1` means a pure state; `|r| < 1`
means a mixed state (from decoherence).

### 2.2 Static Longitudinal Field (B₀)

| Property | Value |
|---|---|
| Source | Convention: always [0, 0, 1] in rotating frame |
| Physical meaning | Quantization field; defines the Z axis |
| Scale | **NORMALIZED** — visual length 1.35, not proportional to physical magnitude |
| Color | Blue (`#5096ff`) |
| Label | `B₀` |
| Frame dependence | Lab frame: same direction (B₀ is static); Effective frame: transformed with scene |

B₀ is not returned by the backend because its direction is fixed by convention.  Its
inclusion is a visual pedagogical choice, not a physical calculation.

### 2.3 Transverse Drive Field (B₁(t))

| Property | Value |
|---|---|
| Source | `field_trajectory[playIndex]` components `[Ωx, Ωy]` |
| Physical meaning | Control field in XY plane of rotating frame |
| Scale | **NORMALIZED** — direction exact, visual length 1.08 (not amplitude-scaled) |
| Color | Cyan (`#40c8e0`) |
| Label | `B₁(t)` |
| Frame dependence | Rotating frame: static at angle φ within each step; Lab frame: oscillates at ω_carrier |
| Available | Only during pulse items (Ωx=Ωy=0 during free evolution → not shown) |

### 2.4 Effective Field (Ω_eff)

| Property | Value |
|---|---|
| Source | `field_trajectory[playIndex]` all three components `[Ωx, Ωy, Δ]` |
| Physical meaning | Rotation axis in rotating frame: `Ω_eff = (Ωcosφ, Ωsinφ, Δ)` |
| Magnitude | `|Ω_eff| = √(Ω² + Δ²)` — rotation speed (rad/s) |
| Scale | **NORMALIZED** — direction exact, visual length 1.42 (not magnitude-scaled) |
| Color | Orange (`#ff9040`) |
| Label | `Ω_eff` |
| Frame dependence | Always in rotating frame; hidden in effective-field frame (it IS the Z axis there) |

### 2.5 Detuning Component (Δ) — Diagnostic mode only

| Property | Value |
|---|---|
| Source | `field_trajectory[playIndex][2]` |
| Physical meaning | Longitudinal Hamiltonian component; shifts resonance |
| Scale | **NORMALIZED** (direction exact) |
| Color | Purple (`#bb88ff`) |
| Label | `Δ` |

---

## 3. Reference Frames

### 3.1 Rotating Frame (default)

The backend solves the Schrödinger equation in the rotating frame:
```
H(t) = (ħ/2)[Ω(t)cosφ σx + Ω(t)sinφ σy + Δ σz]
```
All trajectory and field data are natively in this frame.  No transformation is applied.

- B₀ appears static (it's along +Z by definition)
- B₁ is static within each pulse step (φ is constant per item)
- Ω_eff is static within each step

### 3.2 Effective-Field Frame

A frame rotation that maps Ω_eff → +Z axis, using Rodrigues' formula
(see `frameTransforms.js:toEffectiveFrame`).

Applied to:
- Bloch vector: `displayState = toEffectiveFrame(state, currentField)`
- Trajectory: each point transformed with the same Ω_eff

Effect:
- Bloch vector's rotation about Ω_eff appears as rotation about Z
- Ω_eff arrow is hidden (it IS the Z axis in this frame)
- B₁ and B₀ appear at transformed angles

**UI label**: "Effective-field frame"

### 3.3 Lab Frame (visual)

**Physical clarification**: The actual lab-frame carrier frequency ω₀
(microwave ≈ GHz, optical ≈ PHz) cannot be animated.  This view uses a
user-configured `carrierFreqVis` (rad/s) to show the qualitative precession character.

Transform: `rotatingToLab(blochVec, t, carrierFreqVis)` — a Z-rotation by `carrierFreqVis · t`.

**UI label**: "Lab frame (visual)"
**UI warning**: "visual only — actual carrier is far too fast to animate"
**Scale badge**: shows `Carrier: slowed × N`

---

## 4. Time Scaling

Physical simulation time (seconds) is mapped to playback time (wall-clock) as follows:

```
step        = max(1, round(N / TARGET_FRAMES))   # TARGET_FRAMES = 120
frames      = ceil(N / step)
playbackTime = frames × FRAME_MS / 1000           # FRAME_MS = 33 ms
scaleFactor = physicalDuration / playbackTime
```

The scale factor is reported in PhysicalScaleBadge as `"X s → Y s (Zx slower)"`.

---

## 5. Visualization Modes

### Mode A — Concept
- Shows: Bloch vector only
- Target: beginners, conceptual understanding
- No field arrows, no overlays, no scale badge

### Mode B — Physics
- Shows: Bloch vector + B₀ + B₁(t) + Ω_eff + scale badge + legend
- Target: understanding the Hamiltonian driving the evolution
- Arrow lengths normalized; scale badge explains normalization

### Mode C — Diagnostic
- Shows: everything in Physics + detuning component + ideal overlay + numerical labels
- Target: verifying simulation correctness, comparing ideal vs decohering

---

## 6. Frontend Architecture

```
visualPhysics/
  visualizationTypes.js   — VIS_MODES, FRAMES, FIELD_IDS, SCALE_TYPE constants
  visualScales.js         — ARROW_DISPLAY_LENGTH, computeTimeScale, buildScaleMetadata, normalizeVec
  frameTransforms.js      — rotatingToLab, toEffectiveFrame, transformTrajectory, phaseToXYDirection, effectiveFieldVector
  visualMappings.js       — getModeConfig, mapB0ToVisual, mapB1ToVisual, mapOmegaEffToVisual, ...
  __tests__/
    visualPhysics.test.js — 40 unit tests (Vitest)

components/vis/
  FieldVector.jsx          — R3F: labeled arrow in 3D scene (no physics)
  PhysicalScaleBadge.jsx   — HTML overlay: declares all visual scaling
  VisualizationLegend.jsx  — HTML overlay: identifies every colored element
  WhyAmISeeingThis.jsx     — HTML panel: explains current visualization

BlochSphere.jsx            — extended: accepts visMode, currentField, visFrame, scaleMeta, visControls
VisControlPanel.jsx        — mode/frame toggle buttons rendered in visControls slot
```

### Data flow

```
Backend POST /simulate/experiment
  └─ returns trajectory, field_trajectory, times, total_duration, ...

ExperimentPanel (animation loop)
  ├─ onState(trajectory[i])           → App → BlochSphere state
  ├─ onCurrentField(field_trajectory[i]) → App → BlochSphere currentField
  └─ onScaleMeta(buildScaleMetadata) → App → BlochSphere scaleMeta

BlochSphere / BlochScene
  ├─ Reads visMode, visFrame, currentField, scaleMeta
  ├─ Calls getModeConfig → decides which arrows to render
  ├─ Calls mapB0/B1/OmegaEff ToVisual → gets direction/color/length from backend data
  ├─ Calls toEffectiveFrame (if EFFECTIVE frame) → transforms Bloch vector + trajectory
  └─ Renders FieldVector components + HTML overlays
```

---

## 7. Invariants

1. `FieldVector` takes only visual descriptors — it contains no physics formulas.
2. When `field_trajectory` is absent or null, `mapB1ToVisual(null)` and `mapOmegaEffToVisual(null)` return `{ available: false }`.  Components must check `available` before rendering.
3. Arrow lengths are always `ARROW_DISPLAY_LENGTH` (normalized) — never a physical magnitude.
4. The Bloch vector tip (`|r|`) is the only quantity shown at exact physical scale.
5. All frame transforms preserve vector magnitude: `|toEffectiveFrame(v, ω)| = |v|`.
6. The `field_trajectory` is classical (control-signal values) — the quantum state evolution is always from `trajectory`.

---

*Last updated: Task G — Physically Faithful Visualization System*
