/**
 * useExperiment — the single source of truth for the redesigned Experiment
 * Studio.  It owns:
 *   • experiment configuration (name, initial state, sequence, environment,
 *     measurement, quality, reference frame)
 *   • the authoritative backend run (POST /simulate/experiment — QuTiP)
 *   • trajectory playback (interpolating between backend points only)
 *   • derived, frame-transformed current-frame values consumed by every view
 *
 * The hook performs NO quantum physics.  All evolution comes from the backend;
 * the hook only (a) selects the active backend sample for the current playhead,
 * (b) transforms already-returned data into the selected reference frame, and
 * (c) applies declared visual scaling metadata.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { buildScaleMetadata } from "../visualPhysics/visualScales.js";
import { toEffectiveFrame } from "../visualPhysics/frameTransforms.js";
import { FRAMES } from "../visualPhysics/visualizationTypes.js";
import {
  classifyStage, emphasisForStage, measurementProbabilities, STAGE,
} from "./stageModel.js";
import { maxTransverse, driveLevel, detectorLevel, signalPhase } from "./signalModel.js";

const BACKEND_URL   = "http://localhost:8000";
const FETCH_TIMEOUT = 30000;
const TARGET_FRAMES = 120;   // ~4 s of playback regardless of quality
const FRAME_MS      = 33;    // ~30 fps

// ── Initial-state presets ──────────────────────────────────────────────────
export const INIT_PRESETS = ["|0⟩", "|1⟩", "|+⟩", "Custom"];

function blochFromKey(key, theta, phi) {
  switch (key) {
    case "|0⟩": return [0, 0, 1];
    case "|1⟩": return [0, 0, -1];
    case "|+⟩": return [1, 0, 0];
    default:    return [
      Math.sin(theta) * Math.cos(phi),
      Math.sin(theta) * Math.sin(phi),
      Math.cos(theta),
    ];
  }
}

// ── Sequence-item factories ────────────────────────────────────────────────
let _seq = 0;
const uid = () => `it${(_seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const newPulse = () => ({
  id: uid(), type: "pulse", pulse_shape: "square",
  amplitude: Math.PI, phase: 0.0, detuning: 0.0, duration: 1.0, sigma: null,
});
export const newFree = () => ({
  id: uid(), type: "free", duration: 1.0, omega0: Math.PI / 2,
});

// ── Frame transform of a single vector ─────────────────────────────────────
function transformVec(vec, frame, field) {
  if (frame === FRAMES.EFFECTIVE && field) return toEffectiveFrame(vec, field);
  return vec;
}

export function useExperiment() {
  // ── Configuration ────────────────────────────────────────────────────────
  const [name, setName] = useState("Untitled experiment");

  const [initKey, setInitKey]       = useState("|0⟩");
  const [customTheta, setCustomTheta] = useState(Math.PI / 2);
  const [customPhi,   setCustomPhi]   = useState(0);
  const initialBloch = useMemo(
    () => blochFromKey(initKey, customTheta, customPhi),
    [initKey, customTheta, customPhi]
  );

  const [items, setItems] = useState(() => [newPulse()]);
  const [quality, setQuality] = useState("standard");
  const [frame, setFrame] = useState(FRAMES.ROTATING);

  const [decoherence, setDecoherenceState] = useState({
    enabled: false, T1: 2.0, T2: 1.0, zEq: 1.0,
  });
  const [showComparison, setShowComparison] = useState(false);

  const [measurement, setMeasurementState] = useState({ enabled: false, axis: "z" });

  // Visualization preferences (Advanced).
  const [autoCloseup, setAutoCloseup]     = useState(true);  // dolly in during a pulse
  const [showFuturePath, setShowFuturePath] = useState(false); // faint full-path preview

  // ── Run state ────────────────────────────────────────────────────────────
  const [status, setStatus]           = useState("idle"); // idle|loading|ok|error|offline
  const [result, setResult]           = useState(null);
  const [idealResult, setIdealResult] = useState(null);
  const [error, setError]             = useState(null);
  const [isStale, setIsStale]         = useState(true);    // config changed since last run

  // ── Playback ─────────────────────────────────────────────────────────────
  const [playing, setPlaying]     = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const intervalRef = useRef(null);
  const pendingPlayRef = useRef(false); // "play after the pending run resolves"

  const t2Err = decoherence.enabled && decoherence.T2 > 2 * decoherence.T1 + 1e-9;

  // ── Mark result stale whenever physics-affecting config changes ───────────
  useEffect(() => { setIsStale(true); }, [
    initKey, customTheta, customPhi, items, quality,
    decoherence.enabled, decoherence.T1, decoherence.T2, decoherence.zEq, showComparison,
  ]);

  // ── Config mutators ──────────────────────────────────────────────────────
  const setDecoherence = useCallback((patch) => {
    setDecoherenceState(prev => {
      const next = { ...prev, ...patch };
      // Enforce T2 ≤ 2·T1 physical constraint on the client for a clean UX.
      if (patch.T1 !== undefined && next.T2 > 2 * patch.T1) next.T2 = 2 * patch.T1;
      return next;
    });
  }, []);
  const setMeasurement = useCallback((patch) =>
    setMeasurementState(prev => ({ ...prev, ...patch })), []);

  const addPulse = useCallback(() => setItems(p => [...p, newPulse()]), []);
  const addFree  = useCallback(() => setItems(p => [...p, newFree()]), []);
  const updateItem = useCallback((id, patch) =>
    setItems(p => p.map(it => it.id === id ? { ...it, ...patch } : it)), []);
  const removeItem = useCallback((id) =>
    setItems(p => p.length > 1 ? p.filter(it => it.id !== id) : p), []);
  // Apply a named preset — sets name, initial state, sequence, environment,
  // measurement (same QuTiP endpoint). Marks the result stale (Play to run).
  const applyPreset = useCallback((preset) => {
    if (!preset) return;
    stopPlayback();
    setName(preset.name);
    if (preset.initKey) setInitKey(preset.initKey);
    setItems(preset.sequence.map(it => ({ ...it, id: uid() })));
    if (preset.decoherence) setDecoherenceState(prev => ({ ...prev, ...preset.decoherence }));
    if (preset.measurement) setMeasurementState(prev => ({ ...prev, ...preset.measurement }));
    setResult(null);
    setPlayIndex(0);
    setStatus("idle");
    setIsStale(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const moveItem = useCallback((id, dir) => setItems(p => {
    const i = p.findIndex(it => it.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.length) return p;
    const next = [...p];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }), []);

  // ── Playback control ─────────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing || !result) return;
    const traj = result.trajectory;
    const step = Math.max(1, Math.round(traj.length / TARGET_FRAMES));
    intervalRef.current = setInterval(() => {
      setPlayIndex(prev => {
        const next = prev + step;
        if (next >= traj.length - 1) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          setPlaying(false);
          return traj.length - 1;
        }
        return next;
      });
    }, FRAME_MS);
    return () => clearInterval(intervalRef.current);
  }, [playing, result]);

  // ── Build request body ───────────────────────────────────────────────────
  const buildBody = useCallback((withDecoherence) => {
    const sequence = items.map(it => {
      if (it.type === "pulse") {
        const b = {
          type: "pulse", pulse_shape: it.pulse_shape,
          amplitude: it.amplitude, phase: it.phase,
          detuning: it.detuning, duration: it.duration,
        };
        if (it.pulse_shape === "gaussian") b.sigma = it.sigma ?? it.duration / 6;
        return b;
      }
      return { type: "free", duration: it.duration, omega0: it.omega0 };
    });
    const body = { initial_bloch: initialBloch, sequence, quality };
    if (withDecoherence && decoherence.enabled) {
      body.enable_decoherence = true;
      body.T1 = decoherence.T1;
      body.T2 = decoherence.T2;
      body.equilibrium_z = decoherence.zEq;
    }
    return body;
  }, [initialBloch, items, quality, decoherence]);

  // ── Run (authoritative QuTiP simulation) ─────────────────────────────────
  const run = useCallback(async () => {
    if (t2Err) return null;
    stopPlayback();
    setStatus("loading");
    setResult(null);
    setIdealResult(null);
    setError(null);
    setPlayIndex(0);

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const fetchExp = (body) => fetch(`${BACKEND_URL}/simulate/experiment`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: controller.signal, body: JSON.stringify(body),
    });

    try {
      const mainBody = buildBody(true);
      const mainResp = await fetchExp(mainBody);
      clearTimeout(tid);

      if (!mainResp.ok) {
        let detail = "Request failed";
        try { detail = (await mainResp.json()).detail ?? detail; } catch { /* ignore */ }
        setStatus("error"); setError(detail); setIsStale(true);
        return null;
      }
      const data = await mainResp.json();
      setStatus("ok");
      setResult(data);
      setIsStale(false);

      // Optional ideal (no-decoherence) comparison run.
      if (showComparison && decoherence.enabled) {
        const idealBody = buildBody(false);
        idealBody.enable_decoherence = false;
        const ic = new AbortController();
        const tid2 = setTimeout(() => ic.abort(), FETCH_TIMEOUT);
        try {
          const idealResp = await fetch(`${BACKEND_URL}/simulate/experiment`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            signal: ic.signal, body: JSON.stringify(idealBody),
          });
          clearTimeout(tid2);
          if (idealResp.ok) setIdealResult(await idealResp.json());
        } catch { clearTimeout(tid2); }
      }
      return data;
    } catch (err) {
      clearTimeout(tid);
      if (err.name === "AbortError" || err.name === "TypeError") {
        setStatus("offline");
        setError("Backend offline — start it with: uvicorn main:app");
      } else {
        setStatus("error"); setError(String(err));
      }
      setIsStale(true);
      return null;
    }
  }, [buildBody, decoherence.enabled, showComparison, stopPlayback, t2Err]);

  // Start playback once a freshly requested run resolves.
  useEffect(() => {
    if (pendingPlayRef.current && status === "ok" && result && !isStale) {
      pendingPlayRef.current = false;
      setPlayIndex(0);
      setPlaying(true);
    }
    if (pendingPlayRef.current && (status === "error" || status === "offline")) {
      pendingPlayRef.current = false;
    }
  }, [status, result, isStale]);

  // ── One primary action: Play (runs first if stale), Pause, Reset ─────────
  const play = useCallback(() => {
    if (playing) return;
    if (isStale || !result) {
      pendingPlayRef.current = true;
      run();
      return;
    }
    if (playIndex >= result.trajectory.length - 1) setPlayIndex(0);
    setPlaying(true);
  }, [playing, isStale, result, playIndex, run]);

  const pause = useCallback(() => stopPlayback(), [stopPlayback]);
  const togglePlay = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);

  const reset = useCallback(() => {
    stopPlayback();
    setPlayIndex(0);
  }, [stopPlayback]);

  const seek = useCallback((idx) => {
    if (!result) return;
    stopPlayback();
    setPlayIndex(Math.max(0, Math.min(result.trajectory.length - 1, idx)));
  }, [result, stopPlayback]);

  const toEnd = useCallback(() => {
    if (!result) return;
    stopPlayback();
    setPlayIndex(result.trajectory.length - 1);
  }, [result, stopPlayback]);

  // Peak transverse drive over the whole run — normalizes the live pulse field.
  const maxDrive = useMemo(() => maxTransverse(result?.field_trajectory), [result]);

  // ── Derived current-frame values (display only) ──────────────────────────
  const derived = useMemo(() => {
    const nItems = items.length;
    if (!result) {
      const stage = classifyStage(null, null, { hasResult: false });
      return {
        currentBlochRaw: initialBloch,
        currentBloch:    initialBloch,
        currentField:    null,
        currentItemIndex: null,
        currentTime:     0,
        progress:        0,
        stage,
        emphasis:        emphasisForStage(stage.stage),
        displayTrajectory:    null,
        trajectoryToNow:      null,
        segmentBreaks:        [],
        displayTrajectoryAlt: null,
        driveLevel:      0,
        driveMagnitude:  0,
        signalMagnitude: 0,
        signalReal:      0,
        signalImag:      0,
        signalPhase:     0,
      };
    }

    const traj = result.trajectory;
    const idx  = Math.max(0, Math.min(traj.length - 1, playIndex));
    const atEnd = idx >= traj.length - 1;

    const blochRaw = traj[idx];
    const field    = result.field_trajectory?.[idx] ?? null;
    const itemIdx  = result.item_index?.[idx] ?? null;
    const item     = itemIdx != null ? items[itemIdx] ?? null : null;
    const time     = result.times?.[idx] ?? 0;
    const progress = traj.length > 1 ? idx / (traj.length - 1) : 0;

    const stage = classifyStage(item, field, {
      atEnd, measurementEnabled: measurement.enabled, hasResult: true,
    });

    // Live drive envelope + detector signal at the SAME backend index.
    const sigRe = result.detector_signal_real?.[idx] ?? blochRaw[0];
    const sigIm = result.detector_signal_imag?.[idx] ?? blochRaw[1];
    const sigMag = result.detector_signal_magnitude?.[idx] ?? Math.hypot(blochRaw[0], blochRaw[1]);

    // Frame transform for the state-space view (declared, magnitude-preserving).
    // The Bloch vector AND the trajectory use the SAME frame transform.
    const bloch = transformVec(blochRaw, frame, field);
    const dispTraj = frame === FRAMES.EFFECTIVE && field
      ? traj.map(p => toEffectiveFrame(p, field))
      : traj;
    const dispTrajAlt = (frame === FRAMES.EFFECTIVE && field && idealResult)
      ? idealResult.trajectory.map(p => toEffectiveFrame(p, field))
      : idealResult?.trajectory ?? null;

    // Show only the trajectory travelled SO FAR (not the whole future path).
    const trajectoryToNow = dispTraj.slice(0, idx + 1);
    // Item-boundary markers reached so far (subtle segment breaks).
    const segmentBreaks = [];
    if (result.item_index) {
      for (let i = 1; i <= idx; i++) {
        if (result.item_index[i] !== result.item_index[i - 1]) segmentBreaks.push(dispTraj[i]);
      }
    }

    return {
      currentBlochRaw:  blochRaw,
      currentBloch:     bloch,
      currentField:     field,
      currentItemIndex: itemIdx,
      currentTime:      time,
      progress,
      stage,
      emphasis:         emphasisForStage(stage.stage),
      displayTrajectory:    dispTraj,       // full path (frame-transformed)
      trajectoryToNow,                       // path up to the current playhead
      segmentBreaks,                         // item-boundary markers reached so far
      displayTrajectoryAlt: dispTrajAlt,
      nItems,
      // Live pulse field + detector signal (backend-driven, same index)
      driveMagnitude:   Math.hypot(field?.[0] ?? 0, field?.[1] ?? 0),
      driveLevel:       driveLevel(field, maxDrive),
      signalReal:       sigRe,
      signalImag:       sigIm,
      signalMagnitude:  detectorLevel(sigMag),
      signalPhase:      signalPhase(sigRe, sigIm),
    };
  }, [result, idealResult, playIndex, items, frame, measurement.enabled, initialBloch, maxDrive]);

  // ── Scale metadata (declared visual scaling) ─────────────────────────────
  const scaleMeta = useMemo(() => {
    if (!result) return null;
    return buildScaleMetadata({
      frame,
      physicalDuration: result.total_duration,
      numPoints:        result.trajectory.length,
      hasDecoherence:   decoherence.enabled,
    });
  }, [result, frame, decoherence.enabled]);

  // ── Measurement readout (derived from backend Bloch vector) ──────────────
  const measurementReadout = useMemo(() => {
    if (!measurement.enabled) return null;
    return measurementProbabilities(derived.currentBlochRaw, measurement.axis);
  }, [measurement.enabled, measurement.axis, derived.currentBlochRaw]);

  // ── Model information (Advanced-only; scientific approximation contract) ──
  const modelInfo = useMemo(() => {
    if (!result) return null;
    const N = result.trajectory.length;
    const dt = N > 1 ? result.total_duration / (N - 1) : 0;
    return {
      solver:      result.solver_info.solver,
      version:     result.solver_info.version,
      points:      N,
      dt,
      quality,
      approximations: [
        "Single spin-½ · representative ensemble",
        "Spatially uniform B₀",
        "Rotating frame · carrier folded out (RWA)",
        decoherence.enabled ? "Markovian Lindblad relaxation (T₁/T₂)" : "Closed system (unitary)",
        "Detector: normalized transverse signal (|r_⊥| ≤ 1)",
        "Field lines: finite visual sampling",
      ],
      values: {
        time:     "physical (s)",
        drive:    "Ω angular-frequency (rad/s); no γ → not tesla",
        detector: "normalized ensemble signal",
        bloch:    "exact |r| ≤ 1",
      },
    };
  }, [result, quality, decoherence.enabled]);

  return {
    // config
    name, setName,
    initKey, setInitKey, customTheta, setCustomTheta, customPhi, setCustomPhi, initialBloch,
    items, addPulse, addFree, updateItem, removeItem, moveItem, applyPreset,
    quality, setQuality,
    frame, setFrame,
    decoherence, setDecoherence, t2Err,
    showComparison, setShowComparison,
    measurement, setMeasurement,
    autoCloseup, setAutoCloseup,
    showFuturePath, setShowFuturePath,

    // run
    status, result, idealResult, error, isStale, run,

    // playback
    playing, playIndex, play, pause, togglePlay, reset, seek, toEnd,

    // derived
    ...derived,
    maxDrive,
    scaleMeta,
    measurementReadout,
    measurementSample: result?.measurement_sample ?? null,
    modelInfo,
    STAGE,
  };
}
