"""
Bounded cache for TIME-INDEPENDENT per-basis spatial fields (ψ and ∇ψ on a
specific grid).  Time-dependent coefficient phases are applied *after* the
lookup, so the cached data is scientifically safe under superposition and time
evolution.  The cache is bounded (LRU eviction) — never an unbounded global.
"""

from __future__ import annotations

from collections import OrderedDict

from . import constants as C
from . import basis
from . import analytic_solver as S

_MAXSIZE = 64
_cache: "OrderedDict[str, tuple]" = OrderedDict()
_stats = {"hits": 0, "misses": 0}


def _key(basis_key: str, grid_sig: str) -> str:
    return f"{basis_key}|{C.CONSTANTS_VERSION}|{grid_sig}"


def basis_fields(basis_key: str, X, Y, Z, grid_sig: str):
    """Return (ψ, ∂xψ, ∂yψ, ∂zψ) for one basis state on the given Cartesian grid.

    `grid_sig` must uniquely identify (X, Y, Z).  Point samples pass an empty
    grid_sig to bypass caching.
    """
    if not grid_sig:                              # point evaluation → do not cache
        s = basis.get_state(basis_key)
        psi = S.psi_cartesian(s.n, s.l, s.m, X, Y, Z)
        g = S.grad_psi_cartesian(s.n, s.l, s.m, X, Y, Z)
        return psi, g[0], g[1], g[2]

    ck = _key(basis_key, grid_sig)
    if ck in _cache:
        _stats["hits"] += 1
        _cache.move_to_end(ck)
        return _cache[ck]

    _stats["misses"] += 1
    s = basis.get_state(basis_key)
    psi = S.psi_cartesian(s.n, s.l, s.m, X, Y, Z)
    g = S.grad_psi_cartesian(s.n, s.l, s.m, X, Y, Z)
    val = (psi, g[0], g[1], g[2])
    _cache[ck] = val
    if len(_cache) > _MAXSIZE:
        _cache.popitem(last=False)                # evict least-recently-used
    return val


def stats() -> dict:
    return {"hits": _stats["hits"], "misses": _stats["misses"], "size": len(_cache), "maxsize": _MAXSIZE}


def clear() -> None:
    _cache.clear()
    _stats["hits"] = 0
    _stats["misses"] = 0
