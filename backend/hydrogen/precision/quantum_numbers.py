"""
Half-integer-safe quantum numbers via DOUBLED integers.

Angular momenta that can be half-integer (s, j, m_j, I, F, m_F) are stored as
``two_x = 2·x`` so all coupling logic is exact integer arithmetic — never a
fragile floating-point equality on 1/2.  Integer-valued numbers (n, l, m_l) are
stored normally.  Display/serialization adapters render doubled values as exact
fractions ("1/2", "1", "3/2").

Coupling rules implemented:
    j  ∈ {|l − s|, …, l + s}
    F  ∈ {|j − I|, …, j + I}
    m_j ∈ {−j, …, +j}    (step 1)
    m_F ∈ {−F, …, +F}    (step 1)
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

_L_LETTER = {0: "S", 1: "P", 2: "D", 3: "F"}
TWO_S_ELECTRON = 1   # electron spin s = 1/2
TWO_I_PROTON = 1     # proton spin I = 1/2


def half_str(two_x: int) -> str:
    """Exact fraction string for a doubled quantum number: 1→'1/2', 2→'1', 3→'3/2'."""
    if two_x % 2 == 0:
        return str(two_x // 2)
    return f"{two_x}/2"


def half_value(two_x: int) -> float:
    """Numeric value (may be half-integer) — for display/math only, never for equality."""
    return two_x / 2.0


# ── Coupling rules (exact integer arithmetic on doubled values) ───────────────
def couple_two_j(l: int, two_s: int = TWO_S_ELECTRON) -> list[int]:
    """Allowed doubled total electronic angular momenta two_j for orbital l."""
    two_l = 2 * l
    lo = abs(two_l - two_s)
    hi = two_l + two_s
    return list(range(lo, hi + 1, 2))


def couple_two_F(two_j: int, two_I: int = TWO_I_PROTON) -> list[int]:
    """Allowed doubled total atomic angular momenta two_F for electronic two_j."""
    lo = abs(two_j - two_I)
    hi = two_j + two_I
    return list(range(lo, hi + 1, 2))


def projections(two_j: int) -> list[int]:
    """Allowed doubled projections: −two_j, −two_j+2, …, +two_j."""
    return list(range(-two_j, two_j + 1, 2))


def is_valid_projection(two_m: int, two_j: int) -> bool:
    return two_m in projections(two_j)


def is_valid_two_j(l: int, two_j: int, two_s: int = TWO_S_ELECTRON) -> bool:
    return two_j in couple_two_j(l, two_s)


def is_valid_two_F(two_F: int, two_j: int, two_I: int = TWO_I_PROTON) -> bool:
    return two_F in couple_two_F(two_j, two_I)


# ── Electronic level (n, l, j) ────────────────────────────────────────────────
@dataclass(frozen=True)
class ElectronicLevel:
    n: int
    l: int
    two_j: int
    two_s: int = TWO_S_ELECTRON

    def __post_init__(self):
        if self.n < 1:
            raise ValueError("n must be >= 1")
        if not (0 <= self.l <= self.n - 1):
            raise ValueError(f"l must satisfy 0 <= l <= n-1 (got n={self.n}, l={self.l})")
        if not is_valid_two_j(self.l, self.two_j, self.two_s):
            raise ValueError(
                f"invalid j={half_str(self.two_j)} for l={self.l}; "
                f"allowed j ∈ {{{', '.join(half_str(v) for v in couple_two_j(self.l, self.two_s))}}}"
            )

    @property
    def term_symbol(self) -> str:
        return f"{self.n}{_L_LETTER.get(self.l, f'l{self.l}')}{half_str(self.two_j)}"

    def m_j_values(self) -> list[int]:
        return projections(self.two_j)

    def to_dict(self) -> dict:
        return {
            "n": self.n, "l": self.l,
            "s": half_str(self.two_s), "j": half_str(self.two_j),
            "two_s": self.two_s, "two_j": self.two_j,
            "term_symbol": self.term_symbol,
            "parity": "even" if self.l % 2 == 0 else "odd",
            "m_j_values": [half_str(m) for m in self.m_j_values()],
        }


# ── Hyperfine level (adds proton spin I and total F) ─────────────────────────
@dataclass(frozen=True)
class HyperfineLevel:
    electronic: ElectronicLevel
    two_F: int
    two_I: int = TWO_I_PROTON

    def __post_init__(self):
        if not is_valid_two_F(self.two_F, self.electronic.two_j, self.two_I):
            allowed = ", ".join(half_str(v) for v in couple_two_F(self.electronic.two_j, self.two_I))
            raise ValueError(
                f"invalid F={half_str(self.two_F)} for j={half_str(self.electronic.two_j)}, "
                f"I={half_str(self.two_I)}; allowed F ∈ {{{allowed}}}"
            )

    @property
    def label(self) -> str:
        return f"{self.electronic.term_symbol}, F={half_str(self.two_F)}"

    def m_F_values(self) -> list[int]:
        return projections(self.two_F)

    @property
    def degeneracy(self) -> int:
        return self.two_F + 1   # 2F + 1 sublevels

    def to_dict(self) -> dict:
        return {
            "electronic": self.electronic.to_dict(),
            "I": half_str(self.two_I), "two_I": self.two_I,
            "F": half_str(self.two_F), "two_F": self.two_F,
            "label": self.label,
            "degeneracy": self.degeneracy,
            "m_F_values": [half_str(m) for m in self.m_F_values()],
        }


# ── Supported precision levels (declared; unsupported states have NO data) ────
SUPPORTED_ELECTRONIC = [
    ElectronicLevel(1, 0, 1),   # 1S1/2
    ElectronicLevel(2, 0, 1),   # 2S1/2
    ElectronicLevel(2, 1, 1),   # 2P1/2
    ElectronicLevel(2, 1, 3),   # 2P3/2
]
_ELECTRONIC_BY_TERM = {lv.term_symbol: lv for lv in SUPPORTED_ELECTRONIC}


def supported_terms() -> list[str]:
    return [lv.term_symbol for lv in SUPPORTED_ELECTRONIC]


def electronic_from_term(term: str) -> ElectronicLevel:
    if term not in _ELECTRONIC_BY_TERM:
        raise ValueError(
            f"unsupported precision state '{term}'; supported: {', '.join(supported_terms())}"
        )
    return _ELECTRONIC_BY_TERM[term]


def ground_hyperfine_levels() -> list[HyperfineLevel]:
    """1S1/2 ground-state hyperfine manifold: F = 0 (singlet) and F = 1 (triplet)."""
    g = electronic_from_term("1S1/2")
    return [HyperfineLevel(g, tf) for tf in couple_two_F(g.two_j)]  # F=0, F=1
