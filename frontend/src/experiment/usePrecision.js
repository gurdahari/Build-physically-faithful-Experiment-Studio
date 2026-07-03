/**
 * usePrecision — drives the Precision Atomic Structure overlay from the backend
 * precision endpoints.  It is SEPARATE from the atomic density hook
 * (useAtomicHydrogen): toggling corrections, changing the correction stack, or
 * sweeping the magnetic field recomputes ONLY energy levels / transitions and
 * never re-requests an orbital volume or reruns QuTiP.
 *
 * Cancellation: every levels/transitions request aborts the previous one and is
 * guarded by a monotonic token, so a stale magnetic-field response can never
 * replace a newer one.  Model metadata and responses are cached by deterministic
 * keys.  The frontend computes NO precision physics.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  FAMILY_BY_KEY, allowedCorrections, levelsBody, levelsCacheKey,
  transitionBody, transitionCacheKey, spatialPresetForFamily,
} from "../domain/precisionModel.js";

const BACKEND_URL = "http://localhost:8000";
const MODEL_URL = `${BACKEND_URL}/hydrogen/precision/model`;
const LEVELS_URL = `${BACKEND_URL}/hydrogen/precision/levels`;
const TRANSITIONS_URL = `${BACKEND_URL}/hydrogen/precision/transitions`;
const CACHE_MAX = 48;
const DEBOUNCE_MS = 150;

const DEFAULT_TERM = { fine_structure: "2P3/2", ground_hyperfine: "1S1/2" };

export function usePrecision(active) {
  const [model, setModel] = useState(null);
  const [family, setFamilyState] = useState("fine_structure");
  const [corrections, setCorrections] = useState(["fine_structure", "lamb_shift"]);
  const [field, setField] = useState(0);
  const [selectedTerm, setSelectedTerm] = useState(DEFAULT_TERM.fine_structure);
  const [transitionPreset, setTransitionPreset] = useState("hyperfine_21cm");
  const [customTransition, setCustomTransition] = useState(null); // {initial, final, type}

  const [levelsData, setLevelsData] = useState(null);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [levelsError, setLevelsError] = useState(null);
  const [transitionData, setTransitionData] = useState(null);
  const [transitionError, setTransitionError] = useState(null);

  const lCache = useRef(new Map());
  const tCache = useRef(new Map());
  const lAbort = useRef(null);
  const tAbort = useRef(null);
  const lToken = useRef(0);
  const tToken = useRef(0);

  const cachePut = (m, k, v) => { m.set(k, v); if (m.size > CACHE_MAX) m.delete(m.keys().next().value); };

  // ── Model metadata (fetched once, cached) ────────────────────────────────
  useEffect(() => {
    if (!active || model) return;
    let alive = true;
    fetch(MODEL_URL).then((r) => r.json()).then((j) => { if (alive) setModel(j); }).catch(() => {});
    return () => { alive = false; };
  }, [active, model]);

  // ── Levels (debounced, cancellable, cached) ──────────────────────────────
  const fetchLevels = useCallback(async (fam, corr, b) => {
    const zeeman = corr.includes("zeeman");
    const sweep = fam === "ground_hyperfine" && zeeman;
    const body = levelsBody({
      family: fam, corrections: corr, field: b,
      includeSublevels: zeeman && b > 0,
      fieldSweep: sweep,
      sweepBmax: sweep ? Math.max(0.1, b * 1.2) : null,
    });
    const key = levelsCacheKey(body);
    const cached = lCache.current.get(key);
    if (cached) { setLevelsData(cached); setLevelsError(null); return; }

    if (lAbort.current) lAbort.current.abort();
    const controller = new AbortController();
    lAbort.current = controller;
    const myToken = ++lToken.current;
    setLevelsLoading(true);
    try {
      const resp = await fetch(LEVELS_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal, body: JSON.stringify(body),
      });
      if (myToken !== lToken.current) return;                   // superseded
      if (!resp.ok) {
        let detail = "levels request failed";
        try { detail = (await resp.json()).detail ?? detail; } catch { /* ignore */ }
        setLevelsError(detail); return;
      }
      const json = await resp.json();
      if (myToken !== lToken.current) return;                   // stale — never replace newer
      cachePut(lCache.current, key, json);
      setLevelsData(json); setLevelsError(null);
    } catch (err) {
      if (err.name !== "AbortError" && myToken === lToken.current) setLevelsError(String(err.message || err));
    } finally {
      if (myToken === lToken.current) setLevelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const corr = allowedCorrections(family, corrections);
    const t = setTimeout(() => fetchLevels(family, corr, field), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, family, corrections, field]);

  // ── Transition (cancellable, cached) ─────────────────────────────────────
  const fetchTransition = useCallback(async (preset, custom, corr, b) => {
    const body = transitionBody({
      preset, initial: custom?.initial, final: custom?.final, type: custom?.type,
      corrections: corr, field: b,
    });
    const key = transitionCacheKey(body);
    const cached = tCache.current.get(key);
    if (cached) { setTransitionData(cached); setTransitionError(null); return; }

    if (tAbort.current) tAbort.current.abort();
    const controller = new AbortController();
    tAbort.current = controller;
    const myToken = ++tToken.current;
    try {
      const resp = await fetch(TRANSITIONS_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal, body: JSON.stringify(body),
      });
      if (myToken !== tToken.current) return;
      if (!resp.ok) {
        let detail = "transition request failed";
        try { detail = (await resp.json()).detail ?? detail; } catch { /* ignore */ }
        setTransitionError(detail); setTransitionData(null); return;
      }
      const json = await resp.json();
      if (myToken !== tToken.current) return;
      cachePut(tCache.current, key, json);
      setTransitionData(json); setTransitionError(null);
    } catch (err) {
      if (err.name !== "AbortError" && myToken === tToken.current) setTransitionError(String(err.message || err));
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    // 21 cm and hyperfine presets need the hyperfine correction to be priced.
    const corr = transitionPreset && transitionPreset.startsWith("hyperfine")
      ? Array.from(new Set([...corrections, "hyperfine"]))
      : corrections;
    fetchTransition(transitionPreset, customTransition, corr, field);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, transitionPreset, customTransition, corrections, field]);

  // ── Cleanup on deactivation ──────────────────────────────────────────────
  useEffect(() => {
    if (active) return;
    if (lAbort.current) lAbort.current.abort();
    if (tAbort.current) tAbort.current.abort();
  }, [active]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const setFamily = useCallback((f) => {
    setFamilyState(f);
    setCorrections((prev) => {
      const allow = new Set(FAMILY_BY_KEY[f]?.allowed ?? []);
      const kept = prev.filter((c) => allow.has(c));
      // Ensure a sensible default stack per family.
      if (f === "ground_hyperfine" && !kept.includes("hyperfine")) kept.push("hyperfine");
      if (f === "fine_structure" && kept.length === 0) kept.push("fine_structure");
      return kept;
    });
    setSelectedTerm(DEFAULT_TERM[f] ?? "1S1/2");
  }, []);

  const toggleCorrection = useCallback((key) => {
    setCorrections((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }, []);

  const applyStackView = useCallback((view) => {
    setFamilyState(view.family);
    setCorrections([...view.corrections]);
    setSelectedTerm(DEFAULT_TERM[view.family] ?? "1S1/2");
  }, []);

  const selectTransitionPreset = useCallback((id) => {
    setCustomTransition(null);
    setTransitionPreset(id);
  }, []);

  const spatialPreset = spatialPresetForFamily(family, selectedTerm);

  return {
    model,
    family, setFamily,
    corrections, toggleCorrection, applyStackView,
    field, setField,
    selectedTerm, selectTerm: setSelectedTerm,
    transitionPreset, selectTransitionPreset,
    levelsData, levelsLoading, levelsError,
    transitionData, transitionError,
    spatialPreset,
  };
}
