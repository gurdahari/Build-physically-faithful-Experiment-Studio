/**
 * trajectoryAudit — development-only consistency checker for a backend
 * experiment result.  It performs NO physics; it only validates invariants of
 * the already-computed trajectory so a rendering/config bug can be caught early.
 *
 * Surface it only in Advanced / dev mode — never permanently in the UI.
 */

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * @param {object} result  backend experiment response
 * @param {object} [opts]
 * @param {{enabled:boolean, zEq:number}} [opts.decoherence]
 * @param {number[][]} [opts.field] field_trajectory override (defaults to result's)
 * @returns {{ok:boolean, issues:string[], stats:object}}
 */
export function auditTrajectory(result, { decoherence, tol = 1e-3 } = {}) {
  const issues = [];
  if (!result || !Array.isArray(result.trajectory) || result.trajectory.length === 0) {
    return { ok: false, issues: ["no trajectory"], stats: {} };
  }

  const traj = result.trajectory;
  const times = result.times ?? null;
  const itemIndex = result.item_index ?? null;
  const purity = result.purity ?? null;
  const field = result.field_trajectory ?? null;
  const n = traj.length;

  let maxNorm = 0, minNorm = Infinity, maxJump = 0;
  let hasDrive = false;

  for (let i = 0; i < n; i++) {
    const p = traj[i];
    if (!p || !p.every(Number.isFinite)) { issues.push(`non-finite Bloch at ${i}`); break; }
    const r = Math.hypot(p[0], p[1], p[2]);
    maxNorm = Math.max(maxNorm, r);
    minNorm = Math.min(minNorm, r);
    if (r > 1 + tol) { issues.push(`|r| = ${r.toFixed(4)} > 1 at ${i}`); break; }
    if (i > 0) maxJump = Math.max(maxJump, dist(traj[i], traj[i - 1]));
    if (field && Math.hypot(field[i]?.[0] ?? 0, field[i]?.[1] ?? 0) > 1e-6) hasDrive = true;
  }

  if (purity) {
    for (let i = 0; i < purity.length; i++) {
      if (purity[i] < 0.5 - tol || purity[i] > 1 + tol) {
        issues.push(`purity ${purity[i].toFixed(4)} out of [0.5,1] at ${i}`); break;
      }
    }
  }
  if (times) {
    for (let i = 1; i < times.length; i++) {
      if (times[i] < times[i - 1] - 1e-9) { issues.push(`times not monotonic at ${i}`); break; }
    }
  }
  if (itemIndex) {
    for (let i = 1; i < itemIndex.length; i++) {
      if (itemIndex[i] < itemIndex[i - 1]) { issues.push(`item_index decreased at ${i} (bad ordering)`); break; }
    }
  }
  // A gross point-to-point jump would indicate mis-ordered or duplicated segments.
  if (maxJump > 0.35) issues.push(`large point jump ${maxJump.toFixed(3)} (possible ordering/segment bug)`);

  const open = !!decoherence?.enabled;
  if (!open) {
    // Closed system: |r| is preserved.
    if (isFinite(minNorm) && maxNorm - minNorm > 5e-3) {
      issues.push(`closed-system ‖r‖ drifted by ${(maxNorm - minNorm).toFixed(4)}`);
    }
  } else if (!hasDrive) {
    // Pure relaxation (no drive): distance to the equilibrium is non-increasing.
    const req = [0, 0, decoherence.zEq ?? 1];
    let prev = dist(traj[0], req);
    for (let i = 1; i < n; i++) {
      const d = dist(traj[i], req);
      if (d > prev + 5e-3) { issues.push(`relaxation moved away from equilibrium at ${i}`); break; }
      prev = d;
    }
  }
  // (With drive + decoherence, |r| may rise toward a pure equilibrium — no blanket check.)

  return {
    ok: issues.length === 0,
    issues,
    stats: { points: n, maxNorm: +maxNorm.toFixed(4), minNorm: +minNorm.toFixed(4), maxJump: +maxJump.toFixed(4), hasDrive, open },
  };
}
