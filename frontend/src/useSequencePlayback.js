/**
 * useSequencePlayback — continuous animated pulse-sequence playback.
 *
 * Architecture: all mutable values that are read inside requestAnimationFrame
 * callbacks live in refs so callbacks never capture stale closures.  React
 * state mirrors the ref values purely for rendering.
 *
 * History layout (built once when Play / Step Forward is first called):
 *   hist[0]   = initial Bloch vector (before any pulse)
 *   hist[k+1] = Bloch vector after pulse k
 *
 * Partial rotation during animation:
 *   seqVec = applyRotation(pulse.axis, pulse.angle × pulseProgress, hist[k])
 *
 * This is the physically correct arc – NOT linear interpolation.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { applyRotation, applyFreeEvolution } from "./blochPhysics.js";

let _uid = 0;
const nextId = () => String(++_uid);

export function useSequencePlayback() {
  // ── React state (drives rendering) ────────────────────────────────────────
  const [pulses,         setPulses]         = useState([]);
  const [playing,        setPlaying]        = useState(false);
  const [completedSteps, setCompletedSteps] = useState(-1); // index of last completed pulse
  const [currentPulse,   setCurrentPulse]   = useState(-1); // pulse currently animating (-1 = none)
  const [pulseProgress,  setPulseProgress]  = useState(0);  // 0..1 within current pulse
  const [inPause,        setInPause]        = useState(false);
  const [pauseProgress,  setPauseProgress]  = useState(0);  // 0..1 of inter-pulse pause
  const [seqVec,         setSeqVec]         = useState(null);

  // ── Playback settings ─────────────────────────────────────────────────────
  const [speed,         setSpeedState]         = useState(1.0);
  const [visualPause,   setVisualPauseState]   = useState(true);
  const [pauseDuration, setPauseDurationState] = useState(0.6);

  // ── Refs: mutable, safe to read in RAF, never cause re-renders ───────────
  const pulsesRef         = useRef([]);
  const speedRef          = useRef(1.0);
  const visualPauseRef    = useRef(true);
  const pauseDurRef       = useRef(0.6);
  const playingRef        = useRef(false);
  const completedStepsRef = useRef(-1);
  const currentPulseRef   = useRef(-1);
  const pulseProgressRef  = useRef(0);
  const inPauseRef        = useRef(false);
  const pauseProgressRef  = useRef(0);
  const histRef           = useRef([]);
  const lastTimeRef       = useRef(null);
  const animRef           = useRef(null);

  // These function refs are overwritten on every render so the RAF callback
  // always has access to the freshest closures without adding them as deps.
  const tickRef      = useRef(null);
  const stopRef      = useRef(null);
  const resetExRef   = useRef(null);
  const mutatePRef   = useRef(null);
  const buildHistRef = useRef(null);

  // ── buildHist ─────────────────────────────────────────────────────────────
  buildHistRef.current = (initialVec) => {
    const hist = [initialVec];
    for (const item of pulsesRef.current) {
      const prev = hist[hist.length - 1];
      if (item.type === "free") {
        if (!isFinite(item.omega0) || !isFinite(item.tau) || item.tau <= 0) break;
        hist.push(applyFreeEvolution(item.omega0, item.tau, prev));
      } else {
        if (!isFinite(item.angle)) break;
        hist.push(applyRotation(item.axis, item.angle, prev));
      }
    }
    histRef.current = hist;
  };

  // ── stop (cancel RAF, mark not-playing) ──────────────────────────────────
  stopRef.current = () => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    playingRef.current = false;
    lastTimeRef.current = null;
  };

  // ── resetExec (stop + wipe all execution state) ──────────────────────────
  resetExRef.current = () => {
    stopRef.current();
    completedStepsRef.current = -1;
    currentPulseRef.current   = -1;
    pulseProgressRef.current  = 0;
    inPauseRef.current        = false;
    pauseProgressRef.current  = 0;
    histRef.current           = [];
    setPlaying(false);
    setCompletedSteps(-1);
    setCurrentPulse(-1);
    setPulseProgress(0);
    setInPause(false);
    setPauseProgress(0);
    setSeqVec(null);
  };

  // ── mutatePulses (any list edit resets execution) ────────────────────────
  mutatePRef.current = (fn) => {
    resetExRef.current();
    setPulses(prev => {
      const next = fn(prev);
      pulsesRef.current = next;
      return next;
    });
  };

  // ── Animation tick ────────────────────────────────────────────────────────
  tickRef.current = (now) => {
    if (!playingRef.current) return;

    const dt = lastTimeRef.current !== null
      ? Math.min((now - lastTimeRef.current) / 1000, 0.1)
      : 0;
    lastTimeRef.current = now;

    const ps = pulsesRef.current;
    const n  = ps.length;
    const schedule = () => {
      animRef.current = requestAnimationFrame((t) => tickRef.current(t));
    };

    // ── Phase 1: inter-pulse visual pause ──────────────────────────────────
    if (inPauseRef.current) {
      const dur = pauseDurRef.current;
      const np  = pauseProgressRef.current + (dur > 0 ? dt / dur : 999);
      if (np < 1) {
        pauseProgressRef.current = np;
        setPauseProgress(np);
        schedule();
        return;
      }
      // Pause complete — advance to next pulse.
      inPauseRef.current   = false;
      pauseProgressRef.current = 0;
      setInPause(false);
      setPauseProgress(0);

      const next = currentPulseRef.current + 1;
      if (next >= n) {
        stopRef.current();
        setPlaying(false);
        setCurrentPulse(-1);
        return;
      }
      currentPulseRef.current  = next;
      pulseProgressRef.current = 0;
      setCurrentPulse(next);
      setPulseProgress(0);
    }

    // ── Phase 2: active item animation (pulse or free evolution) ──────────
    const ci   = currentPulseRef.current;
    const item = ps[ci];
    if (!item) {
      stopRef.current();
      setPlaying(false);
      return;
    }

    const fromVec = histRef.current[ci];

    if (item.type === "free") {
      // Free Evolution: Z-rotation by ω₀×τ over duration τ.
      if (!isFinite(item.omega0) || !isFinite(item.tau) || item.tau <= 0) {
        stopRef.current();
        setPlaying(false);
        return;
      }
      const animSecs = Math.max(0.15, item.tau / speedRef.current);
      const np = pulseProgressRef.current + dt / animSecs;

      if (np < 1) {
        pulseProgressRef.current = np;
        setPulseProgress(np);
        if (fromVec) setSeqVec(applyRotation("z", item.omega0 * item.tau * np, fromVec));
        schedule();
        return;
      }
    } else {
      // Pulse: single-axis rotation. π-rotation takes 1 s at 1× speed.
      if (!isFinite(item.angle)) {
        stopRef.current();
        setPlaying(false);
        return;
      }
      const pulseSecs = Math.max(0.15, Math.abs(item.angle) / (Math.PI * speedRef.current));
      const np = pulseProgressRef.current + dt / pulseSecs;

      if (np < 1) {
        pulseProgressRef.current = np;
        setPulseProgress(np);
        if (fromVec) setSeqVec(applyRotation(item.axis, item.angle * np, fromVec));
        schedule();
        return;
      }
    }

    // ── Item complete (shared for both types) ─────────────────────────────
    const toVec = histRef.current[ci + 1];
    completedStepsRef.current = ci;
    pulseProgressRef.current  = 1;
    setCompletedSteps(ci);
    setPulseProgress(1);
    setSeqVec(toVec);

    if (visualPauseRef.current && pauseDurRef.current > 0) {
      inPauseRef.current       = true;
      pauseProgressRef.current = 0;
      setInPause(true);
      setPauseProgress(0);
      schedule();
    } else {
      const next = ci + 1;
      if (next >= n) {
        stopRef.current();
        setPlaying(false);
        setCurrentPulse(-1);
        return;
      }
      currentPulseRef.current  = next;
      pulseProgressRef.current = 0;
      inPauseRef.current       = false;
      setCurrentPulse(next);
      setPulseProgress(0);
      schedule();
    }
  };

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  // ── Settings ──────────────────────────────────────────────────────────────
  const setSpeed = useCallback((v) => { speedRef.current = v; setSpeedState(v); }, []);
  const setVisualPause   = useCallback((v) => { visualPauseRef.current = v; setVisualPauseState(v); }, []);
  const setPauseDuration = useCallback((v) => { pauseDurRef.current    = v; setPauseDurationState(v); }, []);

  // ── Pulse list ────────────────────────────────────────────────────────────
  const addPulse = useCallback((axis = "x", angle = Math.PI / 2, label = "") => {
    if (!isFinite(angle)) return;
    mutatePRef.current(prev => [...prev, { id: nextId(), type: "pulse", axis, angle, label }]);
  }, []);

  const addFreeEvolution = useCallback((tau = 1.0, omega0 = 1.0, label = "") => {
    if (!isFinite(tau) || !isFinite(omega0) || tau <= 0 || omega0 < 0) return;
    mutatePRef.current(prev => [...prev, { id: nextId(), type: "free", tau, omega0, label }]);
  }, []);

  const removePulse = useCallback((id) => {
    mutatePRef.current(prev => prev.filter(p => p.id !== id));
  }, []);

  const movePulse = useCallback((id, dir) => {
    mutatePRef.current(prev => {
      const i = prev.findIndex(p => p.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const a = [...prev];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  }, []);

  const clearSequence = useCallback(() => {
    resetExRef.current();
    pulsesRef.current = [];
    setPulses([]);
  }, []);

  // ── Playback ──────────────────────────────────────────────────────────────

  const play = useCallback((initialVec) => {
    const ps = pulsesRef.current;
    if (ps.length === 0 || playingRef.current) return;

    // Build history the first time Play is pressed.
    if (histRef.current.length === 0) buildHistRef.current(initialVec);

    const cs = completedStepsRef.current;

    // Sequence already finished and nothing mid-animation — nothing to do.
    if (cs >= ps.length - 1 && currentPulseRef.current === -1 && !inPauseRef.current) return;

    // Set up the next pulse to animate if not mid-pulse.
    if (currentPulseRef.current === -1 && !inPauseRef.current) {
      const next = cs + 1;
      if (next >= ps.length) return;
      currentPulseRef.current  = next;
      pulseProgressRef.current = 0;
      setCurrentPulse(next);
      setPulseProgress(0);
    }

    playingRef.current  = true;
    lastTimeRef.current = null;
    setPlaying(true);
    animRef.current = requestAnimationFrame((t) => tickRef.current(t));
  }, []);

  const pause = useCallback(() => {
    if (!playingRef.current) return;
    stopRef.current();
    setPlaying(false);
  }, []);

  const resetSequence = useCallback(() => { resetExRef.current(); }, []);

  /**
   * Apply one complete pulse immediately (no animation).
   * initialVec is captured only on the first call.
   */
  const stepForward = useCallback((initialVec) => {
    if (histRef.current.length === 0) {
      buildHistRef.current(initialVec);
      completedStepsRef.current = -1;
      setCompletedSteps(-1);
    }

    stopRef.current();
    setPlaying(false);
    inPauseRef.current = false;
    setInPause(false);

    const ps   = pulsesRef.current;
    const cs   = completedStepsRef.current;
    const next = cs + 1;
    if (next >= ps.length) return;

    const toVec = histRef.current[next + 1];
    if (!toVec) return;

    completedStepsRef.current = next;
    currentPulseRef.current   = -1;
    pulseProgressRef.current  = 0;
    setCompletedSteps(next);
    setCurrentPulse(-1);
    setPulseProgress(0);
    setSeqVec(toVec);
  }, []);

  /**
   * Undo one pulse — restores Bloch vector from pre-computed history.
   * No recomputation; backward step is always O(1).
   */
  const stepBackward = useCallback(() => {
    stopRef.current();
    setPlaying(false);
    inPauseRef.current = false;
    setInPause(false);

    const cs = completedStepsRef.current;
    if (cs < 0) return;

    if (cs === 0) {
      completedStepsRef.current = -1;
      currentPulseRef.current   = -1;
      pulseProgressRef.current  = 0;
      setCompletedSteps(-1);
      setCurrentPulse(-1);
      setPulseProgress(0);
      setSeqVec(null);
      return;
    }

    const prev  = cs - 1;
    const vec   = histRef.current[prev + 1];
    completedStepsRef.current = prev;
    currentPulseRef.current   = -1;
    pulseProgressRef.current  = 0;
    setCompletedSteps(prev);
    setCurrentPulse(-1);
    setPulseProgress(0);
    if (vec) setSeqVec(vec);
  }, []);

  return {
    // Sequence items (pulses + free evolutions)
    pulses, addPulse, addFreeEvolution, removePulse, movePulse, clearSequence,

    // Playback state
    playing, completedSteps, currentPulse, pulseProgress,
    inPause, pauseProgress, seqVec,

    // Settings
    speed, setSpeed,
    visualPause, setVisualPause,
    pauseDuration, setPauseDuration,

    // Actions
    play, pause, resetSequence, stepForward, stepBackward,
  };
}
