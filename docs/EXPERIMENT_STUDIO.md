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

## 9. Live physical-fidelity layer

The Physical Lab shows what the pulse does live and how the detector receives a
signal. The pipeline is strictly **physical model → QuTiP solve → observables →
visual**; nothing is animated from an approximate story.

### 9.1 Live pulse field (envelope)

- B₁/coil visuals are driven by the **backend `field_trajectory`** at the current
  `playIndex`, not by re-deriving pulse formulas in the frontend.
- `drive_magnitude(t) = √(Ωx² + Ωy²)`; the normalized `driveLevel = drive_magnitude / maxTransverse`
  drives **B₁ arrow length, B₁ opacity, RF-coil emissive, local emphasis**.
- B₁ direction = `normalize([Ωx, Ωy, 0])`; a **phase change rotates B₁**.
- Gaussian → visibly weak→strong→weak; square → ~constant then off; zero drive →
  B₁ hidden, coil glow off.
- Only the **envelope** is shown (RF carrier folded out) — labeled "envelope view";
  the badge states the carrier is not displayed and Ω(t) is available numerically.

### 9.2 Representative state inside the sample

- A red arrow inside the vial shows the **representative ensemble magnetization**;
  its **direction is the backend Bloch vector** at the same `playIndex`.
- Length ∝ `|r|`, so decoherence (reduced `|r|`) **shortens the coherent arrow** and
  the halo grows — a documented mapping, not independent spin dynamics and **not**
  random jitter. It is not a literal classical ball spinning on its own axis.

### 9.3 Detector signal

- Backend adds `detector_signal_real = <σx>`, `detector_signal_imag = <σy>`,
  `detector_signal_magnitude = √(I²+Q²)` (== `coherence`). Derived in the response
  layer from the Bloch trajectory; the frontend never re-derives detector physics.
- **Continuous acquisition** (transverse magnetization): detector glow, readout
  beam, and the live `S`/`φ` chip follow `detector_signal_magnitude`. Zero signal →
  detector idle, glow off, beam hidden.
- **Projective measurement** (distinct): at the measurement stage the detector shows
  the **backend-sampled outcome** `measurement_sample` (Z basis) or a derived
  outcome for X/Y (labeled "derived"). It does **not** reuse the continuous animation.
- Signal is a **normalized representative ensemble signal** (`|r_⊥| ≤ 1`); no
  physical voltage scale is implied for a single spin-½.
- **Stage captions** (backend-driven): "RF pulse acting on sample" (pulse) ·
  "Signal induced in detector" during free evolution when the backend transverse
  signal is significant (a free-induction signal), otherwise "Free precession under
  B₀" · "Measurement outcome recorded" (projective stage).

### 9.4 Camera close-up

- Stage-driven: a **pulse** dollies the camera in (lerp toward `CAMERA_DIST.near`),
  and any other stage returns it to normal — never scripted by elapsed time.
- Advanced preference **"Auto close-up during pulse"** (default on) gates it.
- The rig reuses a single scratch vector and only touches the camera while engaged
  (no per-frame allocation).

### 9.5 Scientific approximation contract

| Quantity | Model / observable | Backend source | Units | Visual | Scaling | Frame | Approximation | Limitation |
|---|---|---|---|---|---|---|---|---|
| Bloch vector r | ⟨σ⟩ from ρ(t) | `trajectory` | — | red arrow / state vector | exact (\|r\|≤1) | rotating | single spin-½ | representative, not per-atom |
| Drive envelope Ω(t) | H coefficient | `field_trajectory` [Ωx,Ωy,Δ] | rad/s | B₁ arrow/coil glow | **normalized** length; opacity=level | rotating | envelope only (RWA) | carrier not shown |
| B₁ direction | φ = atan2(Ωy,Ωx) | `field_trajectory` | rad | B₁ arrow direction | exact direction | rotating | — | — |
| Effective field Ω_eff | (Ωx,Ωy,Δ) | `field_trajectory` | rad/s | thin state-space arrow | **normalized** (len 0.8) | rotating | — | direction only |
| B₀ | quantization field | model (static +Z) | — | field lines + magnet | **normalized**; finite lines | lab (static) | **spatially uniform** | line count is visual, not physical |
| Coherence loss | 1−\|r\| | `trajectory` / `bloch_norm` | — | arrow shortening + halo | derived | — | Markovian Lindblad | — |
| Detector signal | ⟨σx⟩,⟨σy⟩ | `detector_signal_*` | — | detector glow/beam/chip | **normalized** (\|r_⊥\|≤1) | rotating | representative ensemble | no absolute voltage |
| Projective outcome | Born rule (final ρ) | `measurement_sample` | prob. | detector outcome | discrete sample | — | Z basis backend-sampled | X/Y derived on client |
| Physical time | t | `times` | s | timeline / readout | exact | — | — | — |
| Playback speed | — | `computeTimeScale` | s | scale badge | **slowed** (declared) | — | — | — |

**Current assumptions** (also in Advanced → Model information): single spin-½ /
representative ensemble · spatially uniform B₀ · rotating frame with carrier folded
out (RWA) · Markovian Lindblad relaxation when T₁/T₂ enabled · normalized detector
signal · finite visual sampling of field lines. Future non-uniform `B(r,t)` can feed
`fieldSampler` sampled vectors without changing the renderer; no spatial variation is
invented that is not in the model.

### 9.6 Performance & numerical quality

- QuTiP is solved **once per run**; playback replays the returned arrays via the
  synchronized `playIndex`. Re-run happens only when physical parameters change
  (`isStale`).
- Quality (preview/standard/high) is unchanged; the authoritative result is never
  silently downsampled. **Rendering downsampling**: the playhead advances by
  `step = round(N / 120)` points (≈120 render frames) while the trajectory line uses
  all `N` authoritative points; the playhead snaps to the nearest backend sample (no
  sub-sample interpolation is invented between points).
- 3-D geometries/materials are created via `useMemo`/JSX (reconciled, not rebuilt per
  frame); the camera rig reuses one scratch vector. Playwright smoke scripts close
  the browser in `try/finally` so a failed run cannot exhaust WebGL contexts.

### 9.7 Spatial B₁ field, pulse axis, and operation semantics (`pulseModel.js`)

- **Spatial B₁ field (not one arrow):** the RF pulse is drawn as a finite set of
  short field **glyphs** (`B1FieldGlyphs`) sampling B₁ through the coil bore and the
  sample. For the uniform-drive model every glyph points the same transverse
  direction (the coil's local axis, rotated to φ). **Opacity** is the one documented
  mapping of the normalized backend magnitude `driveLevel`; glyph length is fixed for
  visibility. No curvature or gradient is implied. A single thin arrow remains only as
  a secondary orientation aid.
- **Pulse axis:** derived from the drive phase φ (the item's configured phase, equal
  to the backend Hamiltonian coefficient). `n̂ = [cosφ, sinφ, 0]`; canonical mapping
  (tolerance `AXIS_TOL ≈ 3.4°`): `0→X`, `π/2→Y`, `π→−X`, `3π/2→−Y`; otherwise a compact
  `axis φ = 0.30π`. The label appears in the **stage caption** ("Gaussian X pulse ·
  Ω = 3.14 rad/s") and inside the **timeline block** ("1. Gauss · X") — one shared
  helper (`pulseModel`) so the two never disagree.
- **Operation semantics (`classifyPulseOperation`):**
  | Kind | Condition | Lab visualization |
  |---|---|---|
  | `rf_transverse` | pulse with \|Ω\|>0 | coil glows, B₁ glyphs shown along φ |
  | `longitudinal` | free evolution (σz) or zero-Ω pulse with Δ | no coil glow; precession about B₀ / Δ along lab Z |
  | `virtual_z` | frame/phase update (future item) | **no** coil glow, **no** B₁ glyphs; caption "Virtual Z rotation · frame update" |
  A transverse pulse is **never** labeled a Z pulse. During a projective measurement the
  RF field is force-hidden (no stale glyphs); the detector + basis are emphasized.
- **Ω_eff stays out of the lab view** entirely (guarded by a test) — the effective
  field lives only in the Bloch/state-space view.
- **Units:** the drive is shown as **Hamiltonian drive strength in angular-frequency
  units** (`Ω rad/s`), *not* tesla — there is no gyromagnetic ratio γ in the current
  preset. `driveFieldLabel(Ω, γ)` converts to physical `B₁ = Ω/γ` (T/mT/µT) if a preset
  ever supplies γ. The scale badge and Advanced → Model information state this explicitly.

### 9.8 Correctness & UX stabilization

- **Physics verified, no bug.** Ten canonical experiments (`backend/tests/test_canonical_experiments.py`)
  pass exactly: X π→(0,0,−1), X π/2→(0,−1,0), Y π/2→(1,0,0), X π/2·X π/2 = X π,
  X π/2·(−X)π/2→|0⟩, free-Z invariants, closed-system ‖r‖ preservation, and T2 decay.
  The earlier "strange trajectory" was a **rendering choice** (the full *future* path was
  drawn from the first frame), not a physics error.
- **Trajectory up to the playhead.** `trajectoryToNow = displayTrajectory.slice(0, idx+1)`
  is drawn as the primary path; the full future path is an optional faint Advanced preview.
  Item boundaries reached so far are marked with subtle nodes. The trajectory and the Bloch
  vector always use the **same** reference frame.
- **Dev trajectory audit** (`trajectoryAudit.js`, Advanced-only): finite components, |r|≤1+tol,
  purity∈[0.5,1], monotonic times, non-decreasing item_index, no gross point jumps, closed-system
  ‖r‖ preservation, and (pure relaxation) non-increasing distance to equilibrium.
- **Quadrature RF source.** The RF hardware is **fixed**; two orthogonal channels carry
  Ωx = Ω cosφ (X channel) and Ωy = Ω sinφ (Y channel). An X pulse lights the X channel, a Y
  pulse the Y channel; the B₁ field points along the resultant. The coils never rotate with φ —
  only the field does (`quadratureChannels`, guarded by a test).
- **Pulse-axis controls.** A segmented **X / Y / −X / −Y / Custom** control sets φ
  (`axisToPhase`); Custom reveals the φ slider + n̂ preview. The rotation angle is labeled from
  the integrated area θ = ∫Ω(t)dt (`pulseArea`), so a pulse is called "π/2" only when its area
  supports it, else "… · area = 0.48π".
- **Drawer UX.** Sticky header, single scrolling body, `width: min(360px, 90vw)`, no horizontal
  overflow at 1366/1536/1920; collapsible sequence cards (one expanded at a time) with compact
  summaries; segmented controls; detuning behind an expander unless nonzero.
- **Stale results** are dimmed/greyed with a "Stale result — press Re-run" chip; QuTiP is never
  auto-run on slider movement — Play/Re-run is the single primary action.
- **Presets** (`presets.js`): Rabi · Ramsey · Spin echo · FID configure initial state, sequence,
  environment, and measurement, and run through the **same** QuTiP endpoint. The main screen shows
  only the selected experiment name; presets live in the Edit drawer.

### 9.9 Object-focused inspection

Clicking a lab object (magnet · quadrature RF coil · sample · detector) smoothly
moves the camera toward it and opens **one** compact contextual card
(`focusModel.js` + `FocusCard.jsx`). The card is read-only and every value is the
same backend quantity at the current `playIndex` — no new physics.

| Object | Camera | Card shows |
|---|---|---|
| Magnet | see both poles + sample | B₀ direction (+Z), static-longitudinal rep., uniform vs varying |
| RF coil | close on the coil/sample | Ωx / Ωy quadrature channels, pulse axis, envelope Ω(t) |
| Sample | closest on the sample | magnetization, \|r\|, coherence, P(0)/P(1), local field |
| Detector | toward detector, keep sample | \|S\| & phase (continuous acquisition) or the projective outcome |

- The `CameraRig` lerps the OrbitControls **target and distance** (reusing scratch
  vectors); it engages on focus or the pulse close-up and releases when the default
  framing is restored. Targets stay near the sample so spatial context is preserved.
- **Return to default**: empty-space click, the card's **← Back** control, or **Escape**.
- Focus never pauses playback; the card stays synchronized to the playhead. No new
  permanent panels — the card and Back control appear only while focused.

#### Two-level close-up / macro (`focusModel.js`)

A first click enters **Close-up** (object ≈60–75 % of the viewport); a second click
on the *same* object enters **Macro close-up** (≈80–90 %); clicking a *different*
object resets to that object's Close-up (`nextFocus`). There is no level button —
the FocusCard shows the current level ("Close-up" / "Macro close-up").

Per-object explicit framing (`FRAMING`): `closeDistance`/`macroDistance`,
`closeTargetOffset`/`macroTargetOffset`, optional `cameraDirection`, `minDistance`,
`safeNearPlane`. Distances (approx):

| Object | close | macro | target (close→macro) | direction | context kept |
|---|---|---|---|---|---|
| Magnet | 1.9 | 1.15 | [0,0,0.5]→[0,0,0.7] | 3/4 elevated | pole face + sample + B₀ lines; RF/detector strongly faded at macro |
| RF coil | 1.5 | 1.0 | [0,0,0] | user view | coil bore glyphs + both channels + sample; magnet/detector faded |
| Sample | 1.2 | 0.7 | [0,0,0] | user view | vial + magnetization + a little coil; others faded |
| Detector | 1.5 | 1.0 | [0,-0.55,0]→[0,-0.72,0] | front-side | detector body + sample→detector path; magnet/RF faded |

- **Effect is camera-only** (position/target/distance/optional direction) plus
  **contextual opacity fading** (`focusFade`) — objects are never enlarged/rescaled.
  Close-up keeps unrelated objects faintly visible; macro fades them strongly but
  never below ~0.12 (never hides an object needed to read the interaction).
- **Clipping**: OrbitControls `minDistance` drops to the per-object value while
  focused (so the rig can dolly in) and every `macroDistance ≥ minDistance` keeps the
  camera outside solid geometry; the near plane stays at 0.1 (no depth artifacts).
- **Responsive**: on a narrow (portrait) canvas — dual view / open editor — the rig
  pulls back by `1/aspect` so the object stays framed at any supported viewport.
- **Priority**: manual object focus overrides the automatic pulse close-up; when
  focus exits, the pulse close-up resumes if a pulse is active. Playback and the
  shared `playIndex` are untouched at both levels.

---

## 10. What was NOT changed

- QuTiP remains the sole authoritative physics engine.
- No physics equations, endpoints, or Pydantic models changed.
- The legacy Explore and Build modes (including the original Experiment step 9)
  are untouched and still available.

*Companion doc: `docs/VISUAL_PHYSICS_SPEC.md` (arrow-level mapping for the legacy
Bloch overlays).*
