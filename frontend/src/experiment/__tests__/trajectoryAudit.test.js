/**
 * Tests for the dev-only trajectoryAudit helper.
 */

import { describe, it, expect } from "vitest";
import { auditTrajectory } from "../trajectoryAudit.js";

// A clean closed-system result: |r|=1 circle, monotonic time, single item.
function goodResult(n = 12) {
  const traj = [], times = [], item_index = [], purity = [], field = [];
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI;      // half sweep on the unit sphere
    traj.push([Math.sin(a), 0, Math.cos(a)]); // |r| = 1
    times.push(i * 0.1);
    item_index.push(0);
    purity.push(1);
    field.push([0, 0, 0]);
  }
  return { trajectory: traj, times, item_index, purity, field_trajectory: field };
}

describe("auditTrajectory", () => {
  it("passes a clean closed-system result", () => {
    const a = auditTrajectory(goodResult(), { decoherence: { enabled: false } });
    expect(a.ok).toBe(true);
    expect(a.issues).toEqual([]);
    expect(a.stats.points).toBe(12);
  });

  it("flags |r| > 1", () => {
    const r = goodResult();
    r.trajectory[5] = [2, 0, 0];
    const a = auditTrajectory(r, { decoherence: { enabled: false } });
    expect(a.ok).toBe(false);
    expect(a.issues.join(" ")).toMatch(/> 1/);
  });

  it("flags non-monotonic times", () => {
    const r = goodResult();
    r.times[6] = r.times[5] - 1;
    const a = auditTrajectory(r);
    expect(a.issues.join(" ")).toMatch(/times not monotonic/);
  });

  it("flags decreasing item_index (bad ordering)", () => {
    const r = goodResult();
    r.item_index = r.item_index.map((_, i) => (i < 6 ? 0 : 1));
    r.item_index[8] = 0; // goes back
    const a = auditTrajectory(r);
    expect(a.issues.join(" ")).toMatch(/item_index decreased/);
  });

  it("flags closed-system ‖r‖ drift", () => {
    const r = goodResult();
    r.trajectory = r.trajectory.map((p, i) => {
      const s = 1 - i * 0.02;                 // shrink |r| over time
      return [p[0] * s, p[1] * s, p[2] * s];
    });
    const a = auditTrajectory(r, { decoherence: { enabled: false } });
    expect(a.issues.join(" ")).toMatch(/‖r‖ drifted/);
  });

  it("flags relaxation moving away from equilibrium", () => {
    // Pure relaxation (no drive), zEq = +1 → distance to [0,0,1] must not grow.
    const n = 8;
    const traj = [], field = [], times = [], item_index = [], purity = [];
    for (let i = 0; i < n; i++) {
      const z = 0.9 - i * 0.1;                 // moving AWAY from +z equilibrium
      traj.push([0, 0, z]); field.push([0, 0, 0]); times.push(i * 0.1);
      item_index.push(0); purity.push((1 + z * z) / 2);
    }
    const a = auditTrajectory(
      { trajectory: traj, times, item_index, purity, field_trajectory: field },
      { decoherence: { enabled: true, zEq: 1 } }
    );
    expect(a.issues.join(" ")).toMatch(/away from equilibrium/);
  });

  it("handles an empty result", () => {
    expect(auditTrajectory(null).ok).toBe(false);
    expect(auditTrajectory({ trajectory: [] }).ok).toBe(false);
  });
});
