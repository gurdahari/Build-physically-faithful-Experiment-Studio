# Experiment Studio — Redesign & Physical-Faithfulness Reference

The Experiment Studio (`frontend/src/experiment/`) is the redesigned, minimal,
physically faithful interface for building and observing a QuTiP-computed
experiment. It replaces the cramped accordion-embedded experiment panel with a
calm default screen where the 3-D scene dominates and everything else is hidden
until needed.

**Golden rule (unchanged):** the frontend never invents physics. All quantum
evolution is computed by the QuTiP backend (`POST /simulate/experiment`). The
frontend only (a) selects the backend sample for the current playhead,
(b) transforms already-returned data into a chosen reference frame, and
(c) applies *declared* visual scaling. Every transformation is labeled in the UI
(scale badge) and documented below.

---

## 1. Two separated spaces

| View | File | Represents | Shows |
|---|---|---|---|
| **Physical lab** | `PhysicalLabScene.jsx` | Real apparatus in lab space | Sample, magnet (B₀), RF source (B₁(t)), detector, active stage |
| **State space** | `StateSphere.jsx` | Abstract density-matrix space | Bloch vector r, trajectory, effective field Ω_eff, measurement axis |

The Bloch sphere is explicitly labeled "State space · Bloch sphere" and is *not*
a physical object. Physical field vectors (B₀, B₁) are never drawn on top of the
Bloch sphere; the effective field and state vector live only in the state space.

---

## 2. Quantity → backend source → visual representation

| Quantity | Backend source | Where shown | Visual | Scale | Units | Frame |
|---|---|---|---|---|---|---|
| Bloch vector **r** | `trajectory[i]` | State space | Red arrow (strongest) | **Exact** ( \|r\| ≤ 1 ) | dimensionless | rotating (or transformed) |
| Trajectory | `trajectory[]` | State space | Gold line | exact | — | as selected |
| Comparison trajectory | ideal-run `trajectory[]` | State space | Magenta line | exact | — | as selected |
| **B₀** static field | physical-system definition (static +Z) | Physical lab | Blue arrow + magnet poles | **Normalized** (direction only) | — | lab (static) |
| **B₁(t)** drive | `field_trajectory[i] = [Ωx,Ωy,Δ]`, transverse part | Physical lab | Cyan arrow + RF coil glow | **Normalized** (direction = φ) | rad/s (magnitude in chip) | rotating |
| **Ω_eff** effective field | `field_trajectory[i]` all three components | State space | Orange arrow (rotation axis) | **Normalized** | rad/s | rotating |
| Detuning Δ | `field_trajectory[i][2]` | (stage detail text) | — | — | rad/s | rotating |
| Coherence loss | `1 − \|r\|` from `trajectory[i]` | Physical lab (sample halo) + state HUD | Growing fuzzy halo | derived | — | — |
| Purity | `(1 + \|r\|²)/2` from `trajectory[i]` | State-space HUD chip | text | derived | — | — |
| Measurement P(±n̂) | Born projection of `trajectory[i]` | Detector + Measurement editor | `(1 ± r·n̂)/2` | derived (Z = backend pop0/pop1 exactly) | probability | — |
| Active stage | `item_index[i]` + `field_trajectory[i]` | Everywhere (label, colors, emphasis) | stage chip | — | — | — |
| Physical time | `times[i]` | Timeline + time readout | text | exact | s | — |
| Playback time-scale | `computeTimeScale()` | Scale badge | text | **slowed** (declared) | s | — |

`field_trajectory` is the **classical control signal** (input to the solver), not
a quantum result. Free-evolution items report `[0, 0, ω₀]`.

---

## 3. Context-aware field emphasis (`stageModel.js`)

Only the physically relevant field is prominent; inactive fields fade rather than
compete. `emphasisForStage(stage)` returns per-object weights ∈ [0,1] which the
scenes map to opacity / arrow presence:

| Stage | B₀ | B₁ | Ω_eff | Detector |
|---|---|---|---|---|
| Free evolution | **1.0** | 0.0 | 0.28 | 0.0 |
| Drive pulse | 0.18 | **1.0** | **1.0** | 0.0 |
| Measurement | 0.20 | 0.0 | 0.0 | **1.0** |
| Idle | 0.55 | 0.0 | 0.0 | 0.0 |

Consequence: B₀, B₁ and Ω_eff are **never** shown with equal weight at the same
time. The Ω_eff arrow appears in the state space only while a pulse drives it.

The stage itself is derived from the configured item type refined by the backend
field signature (a pulse with zero transverse amplitude is treated as free).

---

## 4. Reference frames (visualization only)

The backend always solves in the **rotating frame**. The studio offers:

- **Rotating** (default): backend-native; no transform.
- **Ω_eff → Z** (`toEffectiveFrame`): rotates the state space so the effective
  field maps to +Z, revealing the rotation axis. Magnitude-preserving. The Ω_eff
  arrow is hidden in this frame (it *is* the Z axis). Applied to the Bloch vector
  and the whole trajectory identically.

Both are labeled in the scale badge; the effective-frame warning is surfaced there.
(The visually-slowed lab-frame carrier remains available in the legacy Build-mode
Bloch sphere; it is intentionally omitted from the studio's minimal default.)

---

## 5. Time & amplitude scaling — declared, never faked

- Real RF/optical carriers are too fast to animate. The studio shows the
  **rotating-frame envelope**: B₁ magnitude drives the RF-coil glow and arrow
  presence; the carrier is *folded out*, stated as "Carrier: folded out" in the badge.
- Field-arrow **lengths are normalized** (direction only). Physical magnitudes
  appear as text (Rabi \|Ω\| in the stage detail, badge notes "Field arrows: normalized").
- Playback time ≠ physical time. `computeTimeScale()` reports the factor
  (e.g. "5 s → 4 s (1× slower)") in the badge.
- Only the Bloch vector length is at **exact** physical scale ( \|r\| = 1 ⇒ pure).

---

## 6. Synchronization

A single playhead index (`playIndex` in `useExperiment`) is the clock. Everything
reads from the same backend arrays at that index:

```
playIndex ─┬─ trajectory[i]        → Bloch vector, purity, coherence, mixedness
           ├─ field_trajectory[i]  → B₁ direction/presence, Ω_eff, stage
           ├─ item_index[i]        → active timeline block, active stage
           └─ times[i]             → time readout, timeline playhead position
```

So the timeline block highlight, the physical-scene emphasis, the state vector,
the effective field, the stage label and the clock can never drift apart.

---

## 7. Contextual editing

There is one editing surface (`EditExperimentDrawer.jsx`) with four groups —
**System · Fields & Pulses · Environment · Measurement** — plus an **Advanced**
section (solver quality, reference frame, diagnostics, solver info) hidden until
expanded.

Selecting an object opens only the relevant group (`SELECTION_TO_GROUP`):

| Select… | Opens | Edits |
|---|---|---|
| Magnet (lab) | System | initial state / B₀ note |
| RF source (lab) or a pulse block (timeline) | Fields & Pulses | that pulse |
| Free block (timeline) | Fields & Pulses | that free-evolution item |
| Sample (lab) | Environment | T₁, T₂, z_eq |
| Detector (lab) or measurement cap (timeline) | Measurement | basis, readout |

---

## 8. Default vs hidden controls

**Visible by default:** experiment name · physical lab scene · large timeline ·
one Play/Pause · one Reset · one Edit Experiment · current time · current stage ·
one scale/frame badge · a small "Math view" toggle · an info "i" · a Focus button.

**Hidden (moved):**
- Field/pulse/decoherence/measurement/solver/diagnostics panels → Edit drawer.
- Quality, reference frame, diagnostics, solver version → Edit drawer → Advanced.
- Concept/Physics/Diagnostic mode buttons → removed; replaced by one physically
  faithful context-aware default view.
- Legend → info "i" drawer. Scale/frame details → scale badge (expand on click).

**Focus mode** (`⤢ Focus`): hides the top bar and editor, leaving full-width
physical viz (+ optional compact Bloch), the large timeline, Play/Pause, Reset,
current time and current stage — nothing else permanent.

---

## 9. What was NOT changed

- QuTiP remains the sole authoritative physics engine.
- No physics equations, endpoints, or Pydantic models changed.
- The legacy Explore and Build modes (including the original Experiment step 9)
  are untouched and still available.

*Companion doc: `docs/VISUAL_PHYSICS_SPEC.md` (arrow-level mapping for the legacy
Bloch overlays).*
