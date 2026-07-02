"""Typed request schemas for the Hydrogen atomic API.

Complex coefficients use an explicit {real, imag} wire format.  Responses are
plain JSON-native dicts assembled by ``service`` (no NumPy / complex / NaN / Inf).
"""

from __future__ import annotations

import math
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class Coefficient(BaseModel):
    state: str                       # basis key, e.g. hydrogen.state.n1_l0_m0
    real: float
    imag: float

    @field_validator("real", "imag")
    @classmethod
    def _finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("coefficient components must be finite")
        return v


class SamplingSpec(BaseModel):
    type: Literal["point", "plane", "volume", "radial"]
    # point
    point_amu: Optional[list[float]] = None
    # plane
    plane: Optional[Literal["xy", "xz", "yz"]] = None
    offset_amu: float = 0.0
    # plane / volume
    bound_amu: Optional[float] = None
    resolution: Optional[int] = None
    # radial
    rmax_amu: Optional[float] = None
    theta: float = math.pi / 2
    phi: float = 0.0


class EvaluateRequest(BaseModel):
    coefficients: list[Coefficient] = Field(min_length=1, max_length=8)
    time_seconds: float = 0.0
    normalize: bool = False
    sampling: SamplingSpec
    quantities: list[str] = Field(default_factory=lambda: ["abs2", "phase"], max_length=8)
    quality: Optional[str] = None
    include_diagnostics: bool = True
    diagnostic_bound_amu: Optional[float] = None
    diagnostic_resolution: int = 40

    @field_validator("time_seconds")
    @classmethod
    def _finite_time(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("time_seconds must be finite")
        return v
