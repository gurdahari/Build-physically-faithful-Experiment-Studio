import { useState, useRef, useEffect, useCallback } from "react";
import { applyRotation, sphericalToBloch, blochToSpherical, INITIAL_STATES } from "./blochPhysics.js";

export function useBlochAnimation() {
  const [time,        setTime]             = useState(0);
  const [omega,       setOmegaState]       = useState(2.0);
  const [playing,     setPlaying]          = useState(false);
  const [axis,        setAxisState]        = useState("x");
  const [initKey,     setInitKeyState]     = useState("|0⟩");
  const [customTheta, setCustomThetaState] = useState(Math.PI / 4);
  const [customPhi,   setCustomPhiState]   = useState(0);

  // Refs let the RAF callback and one-shot handlers read fresh values
  // without stale closures.
  const playingRef  = useRef(false);
  const wallTimeRef = useRef(null);
  const timeRef     = useRef(0);
  const omegaRef    = useRef(2.0);
  const rafRef      = useRef(null);

  const tick = useCallback(() => {
    if (!playingRef.current) return;
    const now = performance.now() / 1000;
    if (wallTimeRef.current !== null) {
      // Cap dt so a tab-switch or jank spike cannot cause a huge jump.
      timeRef.current += Math.min(now - wallTimeRef.current, 0.25);
    }
    wallTimeRef.current = now;
    setTime(timeRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(() => {
    if (playingRef.current) return;
    playingRef.current = true;
    wallTimeRef.current = null;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    pause();
    timeRef.current = 0;
    wallTimeRef.current = null;
    setTime(0);
  }, [pause]);

  // Stable clock-reset helper used by all state-change setters.
  const resetClock = useCallback(() => {
    timeRef.current = 0;
    wallTimeRef.current = null;
    setTime(0);
  }, []); // safe: touches only refs and the stable setTime setter

  const setOmega = useCallback((val) => {
    omegaRef.current = val;
    setOmegaState(val);
  }, []);

  const setAxis = useCallback((newAxis) => {
    resetClock();
    setAxisState(newAxis);
  }, [resetClock]);

  const setInitialState = useCallback((key) => {
    resetClock();
    setInitKeyState(key);
  }, [resetClock]);

  const setCustomTheta = useCallback((val) => {
    resetClock();
    setCustomThetaState(val);
  }, [resetClock]);

  const setCustomPhi = useCallback((val) => {
    resetClock();
    setCustomPhiState(val);
  }, [resetClock]);

  /**
   * Apply an ideal single-axis pulse to the current Bloch vector.
   *
   * - Pauses any running animation.
   * - Rotates `currentState` by `pulseAngle` around `pulseAxis`.
   * - Converts the result to spherical coords and stores it as the new
   *   custom initial state (so the animation restarts from there on Play).
   * - Returns the post-pulse vector.
   */
  /**
   * Immediately set the Bloch vector to vec without rotating.
   * Pauses any running animation, resets clock, and stores vec as the
   * new custom initial state. Used by the measurement collapse action.
   */
  const forceState = useCallback((vec) => {
    pause();
    timeRef.current = 0;
    wallTimeRef.current = null;
    setTime(0);
    const [newTheta, newPhi] = blochToSpherical(vec);
    setInitKeyState("custom");
    setCustomThetaState(newTheta);
    setCustomPhiState(newPhi);
  }, [pause]);

  const applyPulse = useCallback((pulseAxis, pulseAngle, currentState) => {
    // Stop continuous animation first
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Reset clock to t = 0
    timeRef.current = 0;
    wallTimeRef.current = null;
    setTime(0);
    // Apply the pulse and persist the result as a custom initial state
    const newVec = applyRotation(pulseAxis, pulseAngle, currentState);
    const [newTheta, newPhi] = blochToSpherical(newVec);
    setInitKeyState("custom");
    setCustomThetaState(newTheta);
    setCustomPhiState(newPhi);
    return newVec;
  }, []); // safe: uses only refs and stable state setters

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const theta      = omega * time;
  const initialVec = initKey === "custom"
    ? sphericalToBloch(customTheta, customPhi)
    : (INITIAL_STATES[initKey] ?? [0, 0, 1]);
  const state      = applyRotation(axis, theta, initialVec);

  return {
    state, time, theta, omega, playing, axis, initKey, initialVec,
    customTheta, customPhi,
    play, pause, reset, setOmega, setAxis, setInitialState,
    setCustomTheta, setCustomPhi, applyPulse, forceState,
  };
}
