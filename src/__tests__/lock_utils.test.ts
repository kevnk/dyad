import { describe, it, expect } from "vitest";
import { acquireLock, withLock } from "@/ipc/utils/lock_utils";

describe("withLock", () => {
  it("returns the result of the wrapped function", async () => {
    await expect(withLock("result", async () => 42)).resolves.toBe(42);
  });

  it("runs two calls on the same id one after the other", async () => {
    const events: string[] = [];
    let finishFirst!: () => void;

    const first = withLock("same", async () => {
      events.push("first:start");
      await new Promise<void>((r) => (finishFirst = r));
      events.push("first:end");
    });
    const second = withLock("same", async () => {
      events.push("second:start");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    finishFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  // Known bug: when two callers wait on the same held lock, both wake on
  // release and run at once. Remove `.fails` once withLock queues waiters.
  it.fails("runs three calls on the same id one at a time", async () => {
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    };

    await Promise.all([
      withLock("three", task),
      withLock("three", task),
      withLock("three", task),
    ]);
    expect(maxRunning).toBe(1);
  });

  it("does not block calls on different ids", async () => {
    const events: string[] = [];
    let finishA!: () => void;

    const a = withLock("a", async () => {
      await new Promise<void>((r) => (finishA = r));
      events.push("a");
    });
    await withLock("b", async () => {
      events.push("b");
    });

    expect(events).toEqual(["b"]);
    finishA();
    await a;
    expect(events).toEqual(["b", "a"]);
  });

  it("releases the lock when the function throws", async () => {
    await expect(
      withLock("throws", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(withLock("throws", async () => "next")).resolves.toBe("next");
  });

  it("treats numeric and string ids as different locks", async () => {
    const held = acquireLock(1);
    await expect(withLock("1", async () => "string id")).resolves.toBe(
      "string id",
    );
    held.release();
    await held.promise;
  });
});

describe("acquireLock", () => {
  it("resolves its promise on release", async () => {
    const { release, promise } = acquireLock("manual");
    let resolved = false;
    promise.then(() => (resolved = true));

    await Promise.resolve();
    expect(resolved).toBe(false);

    release();
    await promise;
    expect(resolved).toBe(true);
  });
});
