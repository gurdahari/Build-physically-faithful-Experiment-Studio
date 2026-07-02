# Hydrogen Atomic Solver — Milestone 2 (nonrelativistic analytic engine)

Authoritative, validated, closed-form nonrelativistic Hydrogen solver living in
the Python backend package [`backend/hydrogen/`](../backend/hydrogen). No orbital
rendering is added in this milestone (that is Milestone 3). QuTiP is **not** used
here and the separate Proton Spin experiment is unchanged.

> The atomic solver models a **nonrelativistic Coulomb-bound electron–proton
> system**. It is **not** a Dirac, QED, finite-proton-size, hyperfine,
> environmental, or proton-internal calculation.

## Governing model

- Hamiltonian (electron–proton relative coordinate):
  `H₀ = -ℏ²/(2μ)∇² - e²/(4πε₀r)`
- Reduced mass: `μ = mₑmₚ/(mₑ+mₚ)`
- Reduced-mass-adjusted Bohr radius: `aμ = 4πε₀ℏ²/(μe²)` (= `a₀·mₑ/μ`)
- Bound-state energies: `Eₙ = -μe⁴/[2(4πε₀)²ℏ²n²]` (E₁ ≈ −13.598 eV)

**Included:** one electron, one proton, relative-coordinate motion, Coulomb
interaction, bound nonrelativistic eigenstates, coherent superpositions, unitary
field-free evolution.

**Omitted (never silently included):** center-of-mass dynamics, electron spin,
proton spin, fine structure, spin-orbit coupling, Darwin term, relativistic
kinetic corrections, hyperfine structure, Lamb shift, vacuum polarization,
radiative self-energy, external E/B fields, collisions, decoherence, finite
proton size, proton polarizability, proton internal structure.

## Constants and units ([constants.py](../backend/hydrogen/constants.py))

Versioned `CODATA-2018-v1` provider (no scattered literals). SI is authoritative;
energies also in eV and Hartree; lengths also in aμ. Internal math uses the
dimensionless `ρ = r/aμ`, but **every API result declares its units**
(`ψ`: m⁻³ᐟ², `|ψ|²`: m⁻³, `j`: m⁻² s⁻¹, phase: rad, time: s).

## Supported basis states ([basis.py](../backend/hydrogen/basis.py))

Stable keys `hydrogen.state.n{n}_l{l}_m{m}`:

| key | label | E (eV) | parity | L²/ℏ² | Lz/ℏ | radial nodes | angular node |
|---|---|---|---|---|---|---|---|
| `…n1_l0_m0` | 1s | −13.598 | even | 0 | 0 | 0 | none |
| `…n2_l0_m0` | 2s | −3.400 | even | 0 | 0 | 1 (at r=2aμ) | none |
| `…n2_l1_m-1` | 2p (m=−1) | −3.400 | odd | 2 | −1 | 0 | polar-axis node |
| `…n2_l1_m0` | 2p (m=0) | −3.400 | odd | 2 | 0 | 0 | z=0 plane |
| `…n2_l1_m1` | 2p (m=+1) | −3.400 | odd | 2 | +1 | 0 | polar-axis node |

## Conventions

- **Radial** `Rₙₗ` normalized `∫₀^∞ Rₙₗ² r² dr = 1`, using aμ; `ρ = 2r/(n·aμ)`,
  generalized Laguerre `L_{n-l-1}^{(2l+1)}(ρ)` (scipy `eval_genlaguerre`).
- **Spherical harmonics** `Yₗᵐ` orthonormal on the sphere with the
  **Condon–Shortley phase** (explicit closed forms for l ≤ 1). `Y₁,±₁ = ∓√(3/8π) sinθ e^{±iφ}`.
- **Coefficients** on the wire: `{ real, imag }`, `Σ|cᵢ|² = 1`.
- No 3-D PDE is solved — validated closed-form analytic expressions.

## Wavefunction & gradient ([analytic_solver.py](../backend/hydrogen/analytic_solver.py))

`ψₙₗₘ = Rₙₗ(r)Yₗᵐ(θ,φ)` in spherical or Cartesian; the authoritative **complex**
amplitude is retained (never reduced to density only). Cartesian evaluation uses
exact Cartesian angular forms so angular nodes are exact and `r=0` / polar-axis /
non-finite inputs are handled safely. Gradients `∇ψ` are **analytic** (exact), so
the probability current is free of finite-difference node artefacts. An isolated
finite-difference gradient (`grad_fd`, declared spacing) exists only for the
continuity-equation cross-check.

## Quantum state & time evolution ([state.py](../backend/hydrogen/state.py))

`AtomicHydrogenState` holds normalized complex coefficients and validates unknown
states, duplicates, non-finite/zero-norm, and normalization tolerance (`1e-9`);
auto-normalization only when explicitly requested. Field-free evolution:
`cᵢ(t) = cᵢ e^{-iEᵢt/ℏ}` (physical seconds).

- **Eigenstate:** phase evolves, density stationary.
- **Unequal-energy superposition:** relative phase evolves at `ω = |Eᵢ−Eⱼ|/ℏ`
  (interference → time-dependent density).
- **Degenerate n manifold:** relative dynamical phase does not change — no false
  beat is fabricated (`beat_frequencies_rad_s == []`).
- **Global phase** leaves all observables unchanged.

## Observables ([observables.py](../backend/hydrogen/observables.py))

`energy` (**observable**), `L²`, `Lz`; `ψ`, `|ψ|²`, `phase`, probability current
(**model-derived**). Probability density is a **position-measurement probability
density, not a material electron cloud**. Probability current
`j = (ℏ/μ) Im[ψ*∇ψ]` is a conserved current within the active model — **not a
classical electron trajectory**. Expected: 1s/2s/real-2p₀ currents are zero;
2p₊₁/2p₋₁ have opposite azimuthal circulation.

## Spatial sampling ([sampling.py](../backend/hydrogen/sampling.py))

Point / plane / volume / radial sampling at a selected physical time and a
**selected** subset of quantities (`psi_real, psi_imag, abs, abs2, phase, jx, jy, jz`)
— never all fields by default. Coordinates in aμ; complex fields as separate
real/imag arrays. Strict limits: `MAX_AXIS=160`, `MAX_TOTAL_SAMPLES=300000`,
`MAX_BOUND=200 aμ`; malformed/non-finite/oversized requests are rejected. **No
Three.js geometry is produced** and authoritative data is kept separate from any
future rendering downsampling.

## Normalization diagnostics ([diagnostics.py](../backend/hydrogen/diagnostics.py))

Finite-domain `∫|ψ|² dV` via a **midpoint (cell-centred) Riemann sum** on a cubic
box (no sample on a coordinate singularity). Reports analytic norm, numerical
integral, **omitted-tail estimate**, grid/domain, integration method, tolerance
(`1e-2`), and pass/warning status. A finite-domain integral is never reported as
exactly 1 unless it meets the tolerance — tail probability outside the box is
acknowledged.

## Caching ([cache.py](../backend/hydrogen/cache.py))

Bounded **LRU** cache (max 64) of **time-independent** per-basis fields (ψ, ∇ψ) on
a specific grid, keyed by `(basis_key, constants_version, grid_signature)`.
Time-dependent coefficient phases are applied *after* the lookup; derived combined
fields are computed per request. Never an unbounded global cache; point samples
bypass the cache. `cache.stats()` is exposed for tests.

## API ([schemas.py](../backend/hydrogen/schemas.py) · [service.py](../backend/hydrogen/service.py) · routes in `main.py`)

- `GET /hydrogen/atomic/model` → model metadata: constants version, supported
  basis, included/omitted physics, units, conventions, quantity classification,
  limitations.
- `POST /hydrogen/atomic/evaluate` → `{coefficients, time_seconds, normalize,
  sampling, quantities, …}` → model/constants versions, normalized state metadata,
  participating states, energies + variance, `⟨L²⟩`/`⟨Lz⟩`, beat frequencies,
  sampled fields, normalization diagnostics, units, warnings, provenance, cache.

Requests are typed (Pydantic); responses are JSON-native only — **no NumPy
arrays, Python complex, NaN, or Infinity** (a recursive sanitizer rejects
non-finite values). Validation failures return **422** with a clear message, not
a traceback. Atomic evaluation runs **only on explicit POST**; entering the
Hydrogen inspector does not call it or rerun QuTiP.

## Numerical tolerances

| check | tolerance | note |
|---|---|---|
| radial/volume analytic normalization | 5e-4 | scipy `quad`, r up to 80 aμ |
| finite-domain midpoint normalization | 1e-2 | tail acknowledged |
| exact analytic identities (E, beats, populations, variance) | 1e-9 | closed-form |
| continuity `∂ρ/∂t + ∇·j` | 3e-2 (relative) | central FD, `h=1e-2 aμ`, `dt=5e-19 s` |
| node handling | exact Cartesian angular forms | nodes are analytically exact |

## Known limitations

- Nonrelativistic Coulomb model only (see omitted list); n ≤ 2 basis exposed
  (solver is general but the exposed set is small).
- Finite-domain sampling omits tail probability (reported by diagnostics).
- Probability density / current are model-derived quantities, not photographs of
  reality; probability current is not a classical trajectory.
- Continuity and any finite-difference cross-checks carry the documented FD error.

---

# Milestone 3 — interactive Atomic Hydrogen visualization (frontend)

The Atomic resolution is now an **active, interactive** experience.  Selecting
*Hydrogen → Atomic · Nonrelativistic* replaces the laboratory apparatus scene
inside the existing viewport with the [AtomicHydrogenScene](../frontend/src/experiment/AtomicHydrogenScene.jsx),
while the app shell (top bar, transport, timeline, inspector) is preserved and
the Proton Spin (QuTiP) experiment state is left completely untouched.  The
mathematical Bloch view is hidden while the atomic visualization is active.
Pressing **Back / Esc** restores the lab scene with all experiment state intact.

## Scientific-integrity contract

Everything visible comes from the authoritative backend solver or from an
**explicitly declared** visual mapping of backend data.  The frontend computes
**no** atomic physics — no eigenfunctions, energies, evolution, current, or nodal
locations.  The following are never shown: a classical electron orbit, an
electron ball circling the proton, a stationary orbital rotated for visual
effect, a material-cloud reading of |ψ|², or any frontend-invented evolution.
The proton marker denotes **localization only** and has no rendered internal
structure.  Each mapping is registered as a `VisualTruthDescriptor`
([visualTruth.js](../frontend/src/domain/visualTruth.js), `visual.atomic.*`).

## Data flow (no physics in React)

| concern | module | responsibility |
|---|---|---|
| state presets | [atomicPresets.js](../frontend/src/domain/atomicPresets.js) | backend-valid normalized coefficient sets (plain data) |
| declared mappings + requests | [atomicVisual.js](../frontend/src/domain/atomicVisual.js) | request builder, cache key, density→opacity/size, phase→hue, current→arrows, bounds, stationarity |
| requests / cache / playback | [useAtomicHydrogen.js](../frontend/src/experiment/useAtomicHydrogen.js) | `POST /hydrogen/atomic/evaluate`, bounded LRU cache, `AbortController` cancellation, quality tiers, bounded-cadence time evolution, atomic time (separate from the experiment playhead) |
| rendering | [AtomicHydrogenScene.jsx](../frontend/src/experiment/AtomicHydrogenScene.jsx) | shader point-cloud, proton marker, current arrows, section, scale indicator, energy inset, camera orbit/reset |
| controls | [AtomicControls.jsx](../frontend/src/experiment/AtomicControls.jsx) | presets · representation mode · quality tier · time evolution · honest state info |

The frontend only **requests / interpolates / caches / maps** backend values; it
never computes eigenfunctions, energies, evolution, current, or nodes.

## Presets

`1s`, `2s`, `2p₋₁`, `2p₀`, `2p₊₁`, an **unequal-energy** superposition
`(1s + 2p₀)/√2` (time-dependent interference), and a **degenerate** superposition
`(2p₊₁ + 2p₋₁)/√2` (stationary density).  Whether a state evolves is decided by
the **backend** (a non-empty `beat_frequencies_rad_s` list); the frontend only
uses distinct principal quantum numbers as a pre-response hint.

## Representation modes

| mode | request | mapping |
|---|---|---|
| **Density** | volume `abs2` | point opacity ∝ \|ψ\|^{2·0.55} (γ curve), size grows with density, additive blending — the primary faithful representation |
| **Density + Phase** | volume `abs2`+`phase` | same density points, hue = cyclic `arg(ψ)` wheel (declared interpretive mapping, not a literal color in space) |
| **Probability Current** | volume `abs2`+`jx/jy/jz` (bounded resolution) | sparse capped arrows; **no arrows are drawn where the backend j ≈ 0** (stationary real orbitals); m=±1 show opposite circulation |
| **Section View** | `xz` plane `abs2`+`phase` | a planar slab of points that reveals nodal structure directly |

Nodal structure (radial and angular) is visible through the sampled field — the
density simply vanishes at the backend-computed nodes.

## Controlled time evolution

Stationary states (empty backend beat list) are fetched **once** and never
animated.  Only the unequal-energy superposition evolves: playback advances an
**atomic** time (distinct from the experiment `playIndex`) and requests backend
frames at a **bounded cadence** (`PLAYBACK_INTERVAL_MS`, one request per tick —
never one request per rendered frame).  Quality is **Preview** during playback
and a crisp **Standard** frame is requested on pause.  Every state / mode /
quality / time change **cancels** any in-flight request (`AbortController` + a
monotonic token), so a stale response can never replace newer state.  No requests
are issued while the Atomic resolution is inactive, and in-flight requests are
aborted on deactivation.

## Honest finite-domain normalization

The scale indicator and state-info readout show `∫|ψ|²` inside the displayed box
and the omitted exponential tail from the backend
[diagnostics](../backend/hydrogen/diagnostics.py).  The displayed finite box is
**not** claimed to contain exactly 100% of the probability.

## Performance

Quality tiers (Preview 20 / Standard 30 / High 40 grid) trade resolution for
responsiveness; the shader material is created once and reused; point geometry is
rebuilt only per **backend frame** (bounded cadence), never per render frame; the
response cache is bounded (`CACHE_MAX`); requests are debounced; and no hidden
requests occur while the resolution is inactive.

## Tests

- Pure mappings: [atomicVisual.test.js](../frontend/src/domain/__tests__/atomicVisual.test.js),
  [atomicPresets.test.js](../frontend/src/domain/__tests__/atomicPresets.test.js).
- Structural / integrity guards: [atomicStudio.test.js](../frontend/src/experiment/__tests__/atomicStudio.test.js)
  (active status, VisualTruth descriptors, no-physics-in-React, stale-request
  cancellation, bounded-cadence playback, no invented evolution/rotation, scene
  swap preserving the app shell).
