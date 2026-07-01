import { useState, useRef, useCallback, useEffect } from "react";
import { applyRotation } from "./blochPhysics.js";

const ANIM_MS = 500;

let _uid = 0;
const nextId = () => String(++_uid);

/**
 * Manages a pulse sequence: list of pulses + step-wise execution.
 *
 * History layout:
 *   hist[k]   = Bloch vector BEFORE applying pulse k   (hist[0] = initial)
 *   hist[k+1] = Bloch vector AFTER  applying pulse k
 *
 * currentStep = -1 → sequence not started (seqVec = null, main anim shows).
 * currentStep = k  → pulse k has been applied; seqVec = hist[k+1].
 */
export function useSequence() {
  const [pulses,      setPulses]      = useState([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [seqVec,      setSeqVec]      = useState(null); // null = sequence not active
  const [animating,   setAnimating]   = useState(false);

  const pulsesRef = useRef([]);
  const stepRef   = useRef(-1);
  const histRef   = useRef([]);
  const animRef   = useRef(null);

  // ── Animation helpers ─────────────────────────────────────────────────────

  const cancelAnim = useCallback(() => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    setAnimating(false);
  }, []);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  // Animate fromVec → toVec along the physical rotation arc (axis / angle).
  const animateOne = useCallback((fromVec, axis, angle, toVec, onDone) => {
    cancelAnim();
    let t0 = null;
    setAnimating(true);
    const tick = (now) => {
      if (t0 === null) t0 = now;
      const t = Math.min((now - t0) / ANIM_MS, 1);
      const s = t * t * (3 - 2 * t); // smoothstep easing
      setSeqVec(applyRotation(axis, angle * s, fromVec));
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = null;
        setAnimating(false);
        setSeqVec(toVec);
        onDone?.();
      }
    };
    animRef.current = requestAnimationFrame(tick);
  }, [cancelAnim]);

  // ── Internal: reset execution state (keep pulse list) ────────────────────

  const resetExec = useCallback(() => {
    cancelAnim();
    stepRef.current = -1;
    histRef.current = [];
    setCurrentStep(-1);
    setSeqVec(null);
  }, [cancelAnim]);

  // Mutate the pulse list and always wipe execution history (it's now stale).
  const mutatePulses = useCallback((fn) => {
    cancelAnim();
    stepRef.current = -1;
    histRef.current = [];
    setCurrentStep(-1);
    setSeqVec(null);
    setPulses(prev => {
      const next = fn(prev);
      pulsesRef.current = next;
      return next;
    });
  }, [cancelAnim]);

  // ── Pulse list management ─────────────────────────────────────────────────

  const addPulse = useCallback((axis = "x", angle = Math.PI / 2, label = "") => {
    if (!isFinite(angle)) return;
    mutatePulses(prev => [...prev, { id: nextId(), axis, angle, label }]);
  }, [mutatePulses]);

  const removePulse = useCallback((id) => {
    mutatePulses(prev => prev.filter(p => p.id !== id));
  }, [mutatePulses]);

  const movePulse = useCallback((id, dir) => {
    mutatePulses(prev => {
      const i = prev.findIndex(p => p.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const a = [...prev];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  }, [mutatePulses]);

  const clearSequence = useCallback(() => {
    cancelAnim();
    pulsesRef.current = [];
    stepRef.current   = -1;
    histRef.current   = [];
    setPulses([]);
    setCurrentStep(-1);
    setSeqVec(null);
  }, [cancelAnim]);

  // ── Sequence execution ────────────────────────────────────────────────────

  const resetSequence = useCallback(() => resetExec(), [resetExec]);

  /**
   * Advance one step forward.
   * initialVec is only used the very first time (when currentStep === -1) to
   * seed hist[0]; subsequent calls read from histRef.
   */
  const stepForward = useCallback((initialVec, animate = true) => {
    const ps   = pulsesRef.current;
    const step = stepRef.current;
    if (ps.length === 0) return;

    // Seed history on first step.
    if (step === -1) {
      histRef.current = [initialVec];
    }

    const next = step + 1;
    if (next >= ps.length) return; // already at last step

    const fromVec = histRef.current[next];
    const pulse   = ps[next];
    if (!fromVec || !pulse || !isFinite(pulse.angle)) return;

    const toVec = applyRotation(pulse.axis, pulse.angle, fromVec);
    // Extend history (overwrites any stale future entries if user stepped back then forward).
    histRef.current = [...histRef.current.slice(0, next + 1), toVec];
    stepRef.current = next;
    setCurrentStep(next);

    if (animate) {
      animateOne(fromVec, pulse.axis, pulse.angle, toVec, null);
    } else {
      setSeqVec(toVec);
    }
  }, [animateOne]);

  /**
   * Step backward.
   * Restores the exact Bloch vector from history — no recomputation needed.
   * Stepping back past step 0 exits sequence mode (seqVec = null).
   */
  const stepBackward = useCallback(() => {
    const step = stepRef.current;
    cancelAnim();
    if (step <= 0) {
      stepRef.current = -1;
      setCurrentStep(-1);
      setSeqVec(null); // deactivate sequence mode
      return;
    }
    const prev = step - 1;
    stepRef.current = prev;
    setCurrentStep(prev);
    const vec = histRef.current[prev + 1]; // hist[prev+1] = state after pulse prev
    if (vec) setSeqVec(vec);
  }, [cancelAnim]);

  /**
   * Run all pulses from initialVec in one go, animating step by step.
   * Pre-computes the full history so backward stepping remains instant.
   */
  const runFull = useCallback((initialVec, animate = true) => {
    const ps = pulsesRef.current;
    if (ps.length === 0) return;
    cancelAnim();

    // Build the complete history upfront so backward-step can restore any state.
    const hist = [initialVec];
    for (const p of ps) {
      if (!isFinite(p.angle)) break;
      hist.push(applyRotation(p.axis, p.angle, hist[hist.length - 1]));
    }
    histRef.current = hist;

    if (!animate) {
      stepRef.current = ps.length - 1;
      setCurrentStep(ps.length - 1);
      setSeqVec(hist[hist.length - 1]);
      return;
    }

    let i = 0;
    const go = () => {
      if (i >= ps.length) return;
      stepRef.current = i;
      setCurrentStep(i);
      animateOne(hist[i], ps[i].axis, ps[i].angle, hist[i + 1], () => { i++; go(); });
    };
    go();
  }, [cancelAnim, animateOne]);

  return {
    pulses, currentStep, seqVec, animating,
    addPulse, removePulse, movePulse, clearSequence,
    resetSequence, stepForward, stepBackward, runFull,
  };
}
