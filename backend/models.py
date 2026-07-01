"""Pydantic v2 request/response models for the simulation API."""

from __future__ import annotations

import math
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator


# ── Shared helpers ────────────────────────────────────────────────────────────

def _validate_bloch(v: list[float]) -> list[float]:
    """Shared validator: finite components, norm² ≤ 1 + tolerance."""
    if not all(math.isfinite(c) for c in v):
        raise ValueError("initial_bloch components must be finite numbers")
    norm_sq = sum(c * c for c in v)
    if norm_sq > 1.0 + 1e-6:
        raise ValueError(
            f"initial_bloch norm² = {norm_sq:.6g} > 1; supply a unit or zero vector"
        )
    return v


# ── Sequence items ────────────────────────────────────────────────────────────

class PulseItem(BaseModel):
    type: Literal["pulse"]
    axis: Literal["x", "y", "z"]
    angle: float

    @field_validator("angle")
    @classmethod
    def angle_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("angle must be a finite number")
        return v


class FreeEvoItem(BaseModel):
    type: Literal["free"]
    omega0: float
    tau: float

    @field_validator("omega0")
    @classmethod
    def omega0_nonneg_finite(cls, v: float) -> float:
        if not math.isfinite(v) or v < 0:
            raise ValueError("omega0 must be finite and >= 0")
        return v

    @field_validator("tau")
    @classmethod
    def tau_positive_finite(cls, v: float) -> float:
        if not math.isfinite(v) or v <= 0:
            raise ValueError("tau must be finite and > 0")
        return v


SequenceItem = Annotated[
    Union[PulseItem, FreeEvoItem],
    Field(discriminator="type"),
]


# ── Request ───────────────────────────────────────────────────────────────────

class SimulateRequest(BaseModel):
    initial_bloch: Annotated[list[float], Field(min_length=3, max_length=3)]
    sequence: Annotated[list[SequenceItem], Field(max_length=200)]

    @field_validator("initial_bloch")
    @classmethod
    def bloch_finite_unit(cls, v: list[float]) -> list[float]:
        return _validate_bloch(v)


# ── Response ──────────────────────────────────────────────────────────────────

class StepResult(BaseModel):
    type: Literal["pulse", "free"]
    axis: Optional[Literal["x", "y", "z"]] = None
    angle: Optional[float] = None
    omega0: Optional[float] = None
    tau: Optional[float] = None
    # omega0 * tau for free-evo items; None for pulse items
    accumulated_phase: Optional[float] = None


class SimulateResponse(BaseModel):
    initial_state: list[float]          # echo of request
    states: list[list[float]]           # state after each sequence item
    final_state: list[float]            # states[-1], or initial_state when sequence is empty
    steps: list[StepResult]             # per-item metadata (with accumulated_phase)


# ── Hamiltonian simulation ────────────────────────────────────────────────────

class HamiltonianRequest(BaseModel):
    initial_bloch: Annotated[list[float], Field(min_length=3, max_length=3)]
    omega_x: float = 0.0
    omega_y: float = 0.0
    omega_z: float = 0.0
    duration: float
    number_of_steps: int = Field(default=100, ge=2, le=5000)

    @field_validator("initial_bloch")
    @classmethod
    def bloch_finite_unit(cls, v: list[float]) -> list[float]:
        return _validate_bloch(v)

    @field_validator("omega_x", "omega_y", "omega_z")
    @classmethod
    def omega_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("omega components must be finite numbers")
        return v

    @field_validator("duration")
    @classmethod
    def duration_finite_positive(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("duration must be a finite number")
        if v <= 0:
            raise ValueError("duration must be > 0")
        return v


class HamiltonianResponse(BaseModel):
    times: list[float]                  # uniformly spaced 0 … duration
    trajectory: list[list[float]]       # Bloch vector at each time point
    final_state: list[float]            # trajectory[-1]
    rotation_axis: Optional[list[float]]  # n̂ = Ω/|Ω|; None when |Ω| = 0
    total_angle: float                  # |Ω| · duration  (radians)
    omega_magnitude: float              # |Ω|  (rad/s)


# ── Time-dependent pulse simulation ──────────────────────────────────────────

class TimeDependentPulseRequest(BaseModel):
    initial_bloch: Annotated[list[float], Field(min_length=3, max_length=3)]
    pulse_shape: Literal["square", "gaussian"]
    amplitude: float        # peak Rabi frequency (rad/s)
    phase: float = 0.0      # φ — selects rotation axis in XY plane
    detuning: float = 0.0   # Δ — drives Z component of effective field (rad/s)
    duration: float         # total pulse duration (s)
    number_of_steps: int = Field(default=500, ge=10, le=10000)
    sigma: Optional[float] = None   # Gaussian half-width (s); None → duration/6

    @field_validator("initial_bloch")
    @classmethod
    def bloch_finite_unit(cls, v: list[float]) -> list[float]:
        return _validate_bloch(v)

    @field_validator("amplitude", "phase", "detuning")
    @classmethod
    def floats_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("amplitude, phase, and detuning must be finite numbers")
        return v

    @field_validator("duration")
    @classmethod
    def duration_positive(cls, v: float) -> float:
        if not math.isfinite(v) or v <= 0:
            raise ValueError("duration must be a positive finite number")
        return v

    @model_validator(mode="after")
    def resolve_sigma(self) -> "TimeDependentPulseRequest":
        if self.pulse_shape == "gaussian":
            if self.sigma is None:
                self.sigma = self.duration / 6
            elif not math.isfinite(self.sigma) or self.sigma <= 0:
                raise ValueError("sigma must be a positive finite number for Gaussian pulses")
        return self


class TimeDependentPulseResponse(BaseModel):
    times: list[float]                     # 0 … duration (number_of_steps points)
    pulse_envelope: list[float]            # Ω(t) at each time point
    effective_field: list[list[float]]     # [Ω(t)cosφ, Ω(t)sinφ, Δ] at each point
    trajectory: list[list[float]]          # Bloch vector at each time point
    final_state: list[float]               # trajectory[-1]
    pulse_area: float                      # ∫₀ᵀ Ω(t)dt  (radians)
    max_amplitude: float                   # max|Ω(t)|


# ── QuTiP simulation ──────────────────────────────────────────────────────────

class QuTiPPulseResponse(BaseModel):
    times: list[float]
    trajectory: list[list[float]]
    final_state: list[float]
    pulse_envelope: list[float]
    pulse_area: float
    max_amplitude: float
    solver_name: str                       # always "qutip"
    qutip_version: str


class SolverComparisonResponse(BaseModel):
    times: list[float]
    custom_trajectory: list[list[float]]   # Bloch trajectory from custom RK4
    qutip_trajectory: list[list[float]]    # Bloch trajectory from QuTiP
    custom_final_state: list[float]
    qutip_final_state: list[float]
    final_state_diff: float                # Euclidean |Δr_final|
    max_trajectory_diff: float             # max_t |Δr(t)|
    custom_bloch_norm: float               # |r_final| from custom solver
    qutip_bloch_norm: float                # |r_final| from QuTiP
    passed: bool                           # final_state_diff < tolerance
    tolerance: float                       # documented threshold (1e-3)
    qutip_version: str


# ── Experiment simulation (unified QuTiP endpoint) ────────────────────────────

class ExperimentPulseItem(BaseModel):
    type: Literal["pulse"]
    pulse_shape: Literal["square", "gaussian"] = "square"
    amplitude: float        # peak Rabi frequency (rad/s)
    phase: float = 0.0      # φ
    detuning: float = 0.0   # Δ
    duration: float
    sigma: Optional[float] = None   # Gaussian half-width; None → duration/6

    @field_validator("amplitude", "phase", "detuning")
    @classmethod
    def floats_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("amplitude, phase, and detuning must be finite")
        return v

    @field_validator("duration")
    @classmethod
    def duration_positive(cls, v: float) -> float:
        if not math.isfinite(v) or v <= 0:
            raise ValueError("duration must be a positive finite number")
        return v

    @model_validator(mode="after")
    def resolve_sigma(self) -> "ExperimentPulseItem":
        if self.pulse_shape == "gaussian":
            if self.sigma is None:
                self.sigma = self.duration / 6
            elif not math.isfinite(self.sigma) or self.sigma <= 0:
                raise ValueError("sigma must be a positive finite number for Gaussian pulses")
        return self


class ExperimentFreeItem(BaseModel):
    type: Literal["free"]
    duration: float         # free-evolution duration (s)
    omega0: float = 0.0    # Ωz (Ωx = Ωy = 0); maps to 0.5·omega0·σz

    @field_validator("duration")
    @classmethod
    def duration_positive(cls, v: float) -> float:
        if not math.isfinite(v) or v <= 0:
            raise ValueError("duration must be a positive finite number")
        return v

    @field_validator("omega0")
    @classmethod
    def omega0_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("omega0 must be a finite number")
        return v


ExperimentSequenceItem = Annotated[
    Union[ExperimentPulseItem, ExperimentFreeItem],
    Field(discriminator="type"),
]


class ExperimentRequest(BaseModel):
    initial_bloch: Annotated[list[float], Field(min_length=3, max_length=3)]
    sequence: Annotated[list[ExperimentSequenceItem], Field(min_length=1, max_length=50)]
    quality: Literal["preview", "standard", "high"] = "standard"

    # ── Decoherence (Lindblad open-system dynamics) ──────────────────────────
    enable_decoherence: bool = False
    T1: Optional[float] = None    # energy relaxation time (s); required if enable_decoherence
    T2: Optional[float] = None    # total transverse coherence time (s); T2 ≤ 2·T1
    equilibrium_z: float = 1.0   # Bloch-z at thermal equilibrium ∈ [−1, 1]

    @field_validator("initial_bloch")
    @classmethod
    def bloch_finite_unit(cls, v: list[float]) -> list[float]:
        return _validate_bloch(v)

    @model_validator(mode="after")
    def validate_decoherence(self) -> "ExperimentRequest":
        if not self.enable_decoherence:
            return self
        if self.T1 is None:
            raise ValueError("T1 is required when enable_decoherence is True")
        if self.T2 is None:
            raise ValueError("T2 is required when enable_decoherence is True")
        if not math.isfinite(self.T1) or self.T1 <= 0:
            raise ValueError("T1 must be a positive finite number (seconds)")
        if not math.isfinite(self.T2) or self.T2 <= 0:
            raise ValueError("T2 must be a positive finite number (seconds)")
        if self.T2 > 2.0 * self.T1 + 1e-12:
            raise ValueError(
                f"T2 ({self.T2:.6g} s) must be ≤ 2·T1 ({2*self.T1:.6g} s); "
                "physical constraint: 1/T2 ≥ 1/(2T1)"
            )
        if not math.isfinite(self.equilibrium_z) or not (-1.0 - 1e-9 <= self.equilibrium_z <= 1.0 + 1e-9):
            raise ValueError("equilibrium_z must be in [−1, 1]")
        return self


class ExperimentResponse(BaseModel):
    times: list[float]                   # global time stamps
    trajectory: list[list[float]]        # Bloch vector at every time point
    field_trajectory: list[list[float]]  # [Ωx(t), Ωy(t), Δ(t)] — classical drive field
    item_index: list[int]                # which sequence item is active
    local_progress: list[float]          # progress within active item [0,1]
    state_after_items: list[list[float]] # final Bloch state after each item
    final_state: list[float]             # state_after_items[-1]
    total_duration: float
    solver_info: dict                    # {"solver": "qutip", "version": "..."}
    # ── Synchronized diagnostic arrays ──────────────────────────────────────
    purity: list[float]                  # Tr(ρ²) = (1+|r|²)/2; 1 for pure, <1 for mixed
    bloch_norm: list[float]              # |r| = √(x²+y²+z²); ≤1
    pop0: list[float]                    # P(|0⟩) = (1+z)/2
    pop1: list[float]                    # P(|1⟩) = (1−z)/2
    coherence: list[float]              # √(x²+y²) — transverse Bloch magnitude
    trace_check: list[float]            # Tr(ρ) ≈ 1 throughout (sanity)
    # ── Final density-matrix diagnostics ───────────────────────────────────
    final_diagnostics: dict             # {trace, purity, bloch_norm, eigenvalues}
