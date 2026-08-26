import assert from "node:assert/strict";

import type { PoolClient } from "pg";

export function createBarrier(participants: number) {
  assert.ok(participants > 0);
  let arrivals = 0;
  let release: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    async arriveAndWait() {
      arrivals += 1;
      assert.ok(arrivals <= participants, "Barrier received too many arrivals");
      if (arrivals === participants) {
        release?.();
      }
      await released;
    },
  };
}

export type BackendWaitEvidence = {
  pid: number;
  state: string;
  waitEventType: string;
  waitEvent: string;
  polls: number;
};

export async function waitForBackendLock(
  observer: PoolClient,
  pid: number,
  timeoutMs = 5_000,
): Promise<BackendWaitEvidence> {
  const deadline = Date.now() + timeoutMs;
  let polls = 0;

  while (Date.now() < deadline) {
    polls += 1;
    const result = await observer.query<{
      state: string;
      wait_event_type: string | null;
      wait_event: string | null;
    }>(`
      select state, wait_event_type, wait_event
      from pg_stat_activity
      where pid = $1
    `, [pid]);
    const row = result.rows[0];
    if (row?.wait_event_type === "Lock" && row.wait_event) {
      return {
        pid,
        state: row.state,
        waitEventType: row.wait_event_type,
        waitEvent: row.wait_event,
        polls,
      };
    }

    // Polling is condition-based: elapsed time never decides test correctness.
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Backend ${pid} did not enter a lock wait before timeout`);
}

