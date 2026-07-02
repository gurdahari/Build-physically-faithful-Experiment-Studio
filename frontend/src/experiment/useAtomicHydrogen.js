/**
 * useAtomicHydrogen — drives the interactive Atomic Hydrogen visualization from
 * the authoritative backend solver.  Completely SEPARATE from the Proton Spin
 * experiment (useExperiment): its own state, time, playback, cache, and requests.
 *
 * Responsibilities:
 *   • request sampled fields from POST /hydrogen/atomic/evaluate
 *   • bounded, deterministic-keyed response cache
 *   • AbortController cancellation (stale responses can never replace newer state)
 *   • quality tiers (Preview while playing, Standard when paused, High on request)
 *   • bounded-cadence playback for unequal-energy superpositions; stationary
 *     states are fetched once and never refetched or animated
 *   • atomic physical time, distinct from the laboratory experiment timeline
 *
 * The frontend computes NO atomic physics — only requests + visual mapping.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { PRESET_BY_KEY, ATOMIC_PRESETS } from "../domain/atomicPresets.js";
import {
  buildEvaluateBody, requestCacheKey, coefficientsAreEvolving, isStationaryResponse,
} from "../domain/atomicVisual.js";

const BACKEND_URL = "http://localhost:8000";
const EVAL_URL = `${BACKEND_URL}/hydrogen/atomic/evaluate`;
const CACHE_MAX = 48;
const PLAYBACK_INTERVAL_MS = 220;     // bounded request cadence during playback
const TICKS_PER_BEAT = 30;            // physical-time resolution of one beat period
const FALLBACK_DT = 4e-16 / TICKS_PER_BEAT;

export function useAtomicHydrogen(active) {
  const [presetKey, setPresetKey] = useState("1s");
  const [coefficients, setCoefficients] = useState(PRESET_BY_KEY["1s"].coefficients);
  const [mode, setMode] = useState("density");
  const [quality, setQuality] = useState("standard");
  const [atomicTime, setAtomicTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cacheRef = useRef(new Map());
  const abortRef = useRef(null);
  const tokenRef = useRef(0);
  const inFlightRef = useRef(false);
  const dtRef = useRef(FALLBACK_DT);
  const timerRef = useRef(null);
  const timeRef = useRef(0);
  timeRef.current = atomicTime;

  const cacheGet = (k) => cacheRef.current.get(k);
  const cachePut = (k, v) => {
    const m = cacheRef.current;
    m.set(k, v);
    if (m.size > CACHE_MAX) m.delete(m.keys().next().value);   // bounded LRU-ish
  };

  // ── Core fetch (cancellable; stale responses ignored) ────────────────────
  const runFetch = useCallback(async (coeffs, time, m, q) => {
    const body = buildEvaluateBody({ coefficients: coeffs, time, mode: m, quality: q });
    const key = requestCacheKey(body);
    const cached = cacheGet(key);
    if (cached) { setData(cached); setError(null); return cached; }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const myToken = ++tokenRef.current;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const resp = await fetch(EVAL_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal, body: JSON.stringify(body),
      });
      if (myToken !== tokenRef.current) return null;           // superseded
      if (!resp.ok) {
        let detail = "atomic evaluation failed";
        try { detail = (await resp.json()).detail ?? detail; } catch { /* ignore */ }
        setError(detail); return null;
      }
      const json = await resp.json();
      if (myToken !== tokenRef.current) return null;           // stale — never replace newer state
      cachePut(key, json);
      dtRef.current = (json.beat_frequencies_rad_s?.length)
        ? (2 * Math.PI / json.beat_frequencies_rad_s[0]) / TICKS_PER_BEAT
        : FALLBACK_DT;
      setData(json); setError(null);
      return json;
    } catch (err) {
      if (err.name === "AbortError") return null;
      if (myToken === tokenRef.current) setError(String(err.message || err));
      return null;
    } finally {
      if (myToken === tokenRef.current) { inFlightRef.current = false; setLoading(false); }
    }
  }, []);

  // ── State / mode / quality changes (debounced; paused quality) ───────────
  useEffect(() => {
    if (!active) return;
    const q = playing ? "preview" : quality;
    const t = setTimeout(() => { runFetch(coefficients, timeRef.current, mode, q); }, 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, coefficients, mode, quality]);

  // ── When Atomic becomes inactive: stop everything, abort in-flight ───────
  useEffect(() => {
    if (active) return;
    if (abortRef.current) abortRef.current.abort();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPlaying(false);
  }, [active]);

  // ── Bounded-cadence playback (only refetches when evolving) ──────────────
  useEffect(() => {
    if (!active || !playing) return;
    const evolving = data ? !isStationaryResponse(data) : coefficientsAreEvolving(coefficients);
    timerRef.current = setInterval(() => {
      const nt = timeRef.current + dtRef.current;
      timeRef.current = nt;
      setAtomicTime(nt);
      if (evolving && !inFlightRef.current) {
        runFetch(coefficients, nt, mode, "preview");           // Preview during playback
      }
    }, PLAYBACK_INTERVAL_MS);
    return () => { clearInterval(timerRef.current); timerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, playing, coefficients, mode, data]);

  // ── On pause: request a crisp Standard frame at the current time ─────────
  const prevPlaying = useRef(false);
  useEffect(() => {
    if (active && prevPlaying.current && !playing) {
      runFetch(coefficients, timeRef.current, mode, quality);
    }
    prevPlaying.current = playing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const selectPreset = useCallback((key) => {
    const p = PRESET_BY_KEY[key];
    if (!p) return;
    setPresetKey(key);
    setCoefficients(p.coefficients);
    setAtomicTime(0); timeRef.current = 0;
    setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);
  const resetTime = useCallback(() => { setAtomicTime(0); timeRef.current = 0; }, []);

  const stationary = isStationaryResponse(data);

  return {
    presets: ATOMIC_PRESETS, presetKey, selectPreset,
    coefficients,
    mode, setMode,
    quality, setQuality,
    atomicTime, playing, togglePlay, resetTime,
    data, loading, error, stationary,
  };
}
