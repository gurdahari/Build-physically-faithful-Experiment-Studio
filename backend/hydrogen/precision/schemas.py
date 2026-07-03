"""Typed request schemas for the precision API (Pydantic v2)."""

from __future__ import annotations

import math
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

MAX_FIELD_TESLA = 20.0
VALID_CORRECTIONS = {"fine_structure", "lamb_shift", "hyperfine", "zeeman"}


class LevelsRequest(BaseModel):
    state_family: Literal["fine_structure", "ground_hyperfine"] = "fine_structure"
    corrections: list[str] = Field(default_factory=lambda: ["fine_structure", "lamb_shift"], max_length=6)
    magnetic_field_tesla: float = 0.0
    include_sublevels: bool = False
    field_sweep: bool = False
    sweep_bmax_tesla: Optional[float] = None
    sweep_points: int = 41

    @field_validator("magnetic_field_tesla")
    @classmethod
    def _field_range(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("magnetic_field_tesla must be finite")
        if v < 0.0 or v > MAX_FIELD_TESLA:
            raise ValueError(f"magnetic_field_tesla must be in [0, {MAX_FIELD_TESLA}] T")
        return v

    @field_validator("corrections")
    @classmethod
    def _known_corrections(cls, v: list[str]) -> list[str]:
        bad = [c for c in v if c not in VALID_CORRECTIONS]
        if bad:
            raise ValueError(f"unknown correction(s): {bad}; valid: {sorted(VALID_CORRECTIONS)}")
        return v

    @field_validator("sweep_bmax_tesla")
    @classmethod
    def _sweep_range(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return v
        if not math.isfinite(v) or v <= 0.0 or v > MAX_FIELD_TESLA:
            raise ValueError(f"sweep_bmax_tesla must be in (0, {MAX_FIELD_TESLA}] T")
        return v


class Endpoint(BaseModel):
    term: str                                  # e.g. "2P1/2"
    two_F: Optional[int] = None
    two_mF: Optional[int] = None
    two_mj: Optional[int] = None


class TransitionRequest(BaseModel):
    initial: Optional[Endpoint] = None
    final: Optional[Endpoint] = None
    transition_type: Optional[Literal["E1", "M1"]] = None
    magnetic_field_tesla: float = 0.0
    corrections: list[str] = Field(default_factory=lambda: ["fine_structure", "lamb_shift", "hyperfine"], max_length=6)
    preset: Optional[str] = None

    @field_validator("magnetic_field_tesla")
    @classmethod
    def _field_range(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("magnetic_field_tesla must be finite")
        if v < 0.0 or v > MAX_FIELD_TESLA:
            raise ValueError(f"magnetic_field_tesla must be in [0, {MAX_FIELD_TESLA}] T")
        return v

    @field_validator("corrections")
    @classmethod
    def _known_corrections(cls, v: list[str]) -> list[str]:
        bad = [c for c in v if c not in VALID_CORRECTIONS]
        if bad:
            raise ValueError(f"unknown correction(s): {bad}; valid: {sorted(VALID_CORRECTIONS)}")
        return v
