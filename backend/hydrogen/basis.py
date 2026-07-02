"""
Supported hydrogenic basis states for Milestone 2.

Stable scientific keys of the form ``hydrogen.state.n{n}_l{l}_m{m}`` (e.g.
``hydrogen.state.n2_l1_m-1``).  Each state carries scientifically explicit
metadata.  The basis is intentionally small (n ≤ 2); the solver is general but
only these states are exposed.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

from . import constants as C

_L_LETTER = {0: "s", 1: "p", 2: "d", 3: "f"}


def state_key(n: int, l: int, m: int) -> str:
    return f"hydrogen.state.n{n}_l{l}_m{m}"


def _angular_node_description(l: int, m: int) -> str:
    if l == 0:
        return "no angular nodes (spherically symmetric)"
    if l == 1 and m == 0:
        return "one angular nodal plane (the z = 0 / xy plane)"
    if l == 1 and abs(m) == 1:
        return "angular node along the polar axis (|ψ| = 0 on the z-axis)"
    return f"{l} angular nodal surface(s)"


def _label(n: int, l: int, m: int) -> str:
    base = f"{n}{_L_LETTER.get(l, f'l{l}')}"
    if l == 0:
        return base
    sign = "+" if m > 0 else "−" if m < 0 else ""
    return f"{base} (m={sign}{abs(m)})"


@dataclass(frozen=True)
class BasisState:
    key: str
    n: int
    l: int
    m: int
    label: str
    energy_j: float
    energy_ev: float
    energy_hartree: float
    parity: str                     # "even" | "odd"  = (-1)^l
    l2_eigenvalue_hbar2: float      # l(l+1)  (units of ℏ²)
    lz_eigenvalue_hbar: int         # m       (units of ℏ)
    degeneracy_n_manifold: int      # n²
    radial_nodes: int               # n - l - 1
    angular_nodes: int              # l
    angular_node_description: str
    normalization_convention: str

    def to_dict(self) -> dict:
        return asdict(self)


_NORM = (
    "∫|ψ|² d³r = 1; radial Rₙₗ normalized as ∫₀^∞ Rₙₗ² r² dr = 1; "
    "spherical harmonics Yₗᵐ orthonormal with the Condon–Shortley phase."
)


def _make(n: int, l: int, m: int) -> BasisState:
    return BasisState(
        key=state_key(n, l, m), n=n, l=l, m=m, label=_label(n, l, m),
        energy_j=C.energy_joules(n), energy_ev=C.energy_ev(n), energy_hartree=C.energy_hartree(n),
        parity="even" if l % 2 == 0 else "odd",
        l2_eigenvalue_hbar2=float(l * (l + 1)),
        lz_eigenvalue_hbar=int(m),
        degeneracy_n_manifold=n * n,
        radial_nodes=n - l - 1,
        angular_nodes=l,
        angular_node_description=_angular_node_description(l, m),
        normalization_convention=_NORM,
    )


# ── Supported set: 1s, 2s, 2p (m = -1, 0, +1) ────────────────────────────────
_SUPPORTED = [
    _make(1, 0, 0),
    _make(2, 0, 0),
    _make(2, 1, -1),
    _make(2, 1, 0),
    _make(2, 1, 1),
]
_BY_KEY = {s.key: s for s in _SUPPORTED}


def all_states() -> list[BasisState]:
    return list(_SUPPORTED)


def get_state(key: str) -> BasisState:
    if key not in _BY_KEY:
        raise KeyError(f"unknown basis state '{key}'")
    return _BY_KEY[key]


def is_supported(key: str) -> bool:
    return key in _BY_KEY


def supported_keys() -> list[str]:
    return [s.key for s in _SUPPORTED]
