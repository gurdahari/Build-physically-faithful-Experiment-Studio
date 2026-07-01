/**
 * useVerifiedSimulation — send a pulse sequence to the Python backend,
 * compare the backend result against the frontend physics, and report any
 * discrepancy.
 *
 * The hook never throws: all network errors are caught and surfaced as
 * { status: "offline" | "error", ... } so the caller can degrade gracefully.
 */

import { useState, useCallback } from "react";
import { applyRotation, applyFreeEvolution } from "./blochPhysics.js";

const BACKEND_URL = "http://localhost:8000";
const COMPARE_TOLERANCE = 1e-6;
const FETCH_TIMEOUT_MS  = 5000;

function frontendFinalState(initialVec, pulses) {
  let state = initialVec;
  for (const item of pulses) {
    if (item.type === "free") {
      state = applyFreeEvolution(item.omega0, item.tau, state);
    } else {
      state = applyRotation(item.axis, item.angle, state);
    }
  }
  return state;
}

function euclidean(a, b) {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

export function useVerifiedSimulation() {
  // "idle" | "loading" | "ok" | "mismatch" | "error" | "offline"
  const [status, setStatus]   = useState("idle");
  const [result, setResult]   = useState(null);

  const runVerified = useCallback(async (initialVec, pulses) => {
    if (!initialVec || pulses.length === 0) return;

    setStatus("loading");
    setResult(null);

    const feState = frontendFinalState(initialVec, pulses);

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const resp = await fetch(`${BACKEND_URL}/simulate/ideal-sequence`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  controller.signal,
        body: JSON.stringify({
          initial_bloch: initialVec,
          sequence: pulses.map(p =>
            p.type === "free"
              ? { type: "free",  omega0: p.omega0, tau: p.tau }
              : { type: "pulse", axis:   p.axis,   angle: p.angle }
          ),
        }),
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        let detail = "Request failed";
        try { detail = (await resp.json()).detail ?? detail; } catch (_) { /* ok */ }
        setStatus("error");
        setResult({ error: detail });
        return;
      }

      const data = await resp.json();
      const beState = data.final_state;
      const delta   = euclidean(feState, beState);
      const match   = delta <= COMPARE_TOLERANCE;

      setStatus(match ? "ok" : "mismatch");
      setResult({
        backendFinal:  beState,
        frontendFinal: feState,
        delta,
        tolerance:     COMPARE_TOLERANCE,
        states:        data.states,
        steps:         data.steps,
      });

    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError" || err.name === "TypeError") {
        // TypeError covers "Failed to fetch" (server unreachable)
        setStatus("offline");
        setResult({ error: "Backend offline" });
      } else {
        setStatus("error");
        setResult({ error: String(err) });
      }
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
  }, []);

  return { status, result, runVerified, reset };
}
