import { describe, expect, it } from "vitest";
import {
  DEMO_QUOTA_LIMIT,
  clearDemoState,
  consumeQuota,
  isDemoState,
  newDemoState,
  quotaComplete,
} from "@/lib/demo";

describe("demo quota rules", () => {
  it("allows exactly 5 actions per module", () => {
    let state = newDemoState();
    for (let i = 0; i < 5; i++) {
      const result = consumeQuota(state, "employees");
      expect(result.ok).toBe(true);
      state = (result as { ok: true; state: typeof state }).state;
    }
    expect(state.quotas.employees).toBe(5);
  });

  it("blocks the 6th action without mutating state", () => {
    let state = newDemoState();
    for (let i = 0; i < DEMO_QUOTA_LIMIT; i++) state = consumeQuota(state, "ai").ok ? (consumeQuota(state, "ai") as { ok: true; state: typeof state }).state : state;
    const blocked = consumeQuota(state, "ai");
    expect(blocked.ok).toBe(false);
    expect(blocked.state.quotas.ai).toBe(DEMO_QUOTA_LIMIT);
  });

  it("tracks each module independently", () => {
    let state = newDemoState();
    state = (consumeQuota(state, "employees") as { ok: true; state: typeof state }).state;
    state = (consumeQuota(state, "leaves") as { ok: true; state: typeof state }).state;
    expect(state.quotas.employees).toBe(1);
    expect(state.quotas.leaves).toBe(1);
    expect(state.quotas.checkins).toBe(0);
  });

  it("reports completion only when every quota is full", () => {
    let state = newDemoState();
    expect(quotaComplete(state)).toBe(false);
    const keys = ["employees", "checkins", "leaves", "receipts", "ai"] as const;
    for (const k of keys) {
      for (let i = 0; i < 5; i++) state = (consumeQuota(state, k) as { ok: true; state: typeof state }).state;
    }
    expect(quotaComplete(state)).toBe(true);
  });

  it("validates persisted demo state", () => {
    expect(isDemoState(newDemoState())).toBe(true);
    expect(isDemoState({ active: true })).toBe(false);
    expect(isDemoState(null)).toBe(false);
  });
});
