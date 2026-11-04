import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isLockedError, retryOnLocked } from "@/ipc/utils/retryOnLocked";

const locked = () =>
  Object.assign(new Error("locked"), { response: { status: 423 } });
const childBranch = () =>
  Object.assign(new Error("child"), { response: { status: 422 } });

describe("isLockedError", () => {
  it("is true only for HTTP 423", () => {
    expect(isLockedError(locked())).toBe(true);
    expect(isLockedError(childBranch())).toBe(false);
    expect(isLockedError(new Error("plain"))).toBe(false);
  });
});

describe("retryOnLocked", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns on the first success without retrying", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    await expect(retryOnLocked(op, "test")).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries a 423 with exponential backoff, then succeeds", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(locked())
      .mockRejectedValueOnce(locked())
      .mockResolvedValue("ok");

    const result = retryOnLocked(op, "test");

    await vi.advanceTimersByTimeAsync(999);
    expect(op).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(op).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(op).toHaveBeenCalledTimes(3);

    await expect(result).resolves.toBe("ok");
  });

  it("throws non-locked errors immediately", async () => {
    const err = Object.assign(new Error("server"), {
      response: { status: 500 },
    });
    const op = vi.fn().mockRejectedValue(err);

    await expect(retryOnLocked(op, "test")).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("throws a 422 immediately unless retryBranchWithChildError is set", async () => {
    const err = childBranch();
    const op = vi.fn().mockRejectedValue(err);
    await expect(retryOnLocked(op, "test")).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);

    const op2 = vi
      .fn()
      .mockRejectedValueOnce(childBranch())
      .mockResolvedValue("ok");
    const result = retryOnLocked(op2, "test", {
      retryBranchWithChildError: true,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe("ok");
    expect(op2).toHaveBeenCalledTimes(2);
  });

  it("gives up after 7 attempts and throws the last error", async () => {
    const err = locked();
    const op = vi.fn().mockRejectedValue(err);

    const result = retryOnLocked(op, "test");
    const assertion = expect(result).rejects.toBe(err);
    // Delays: 1s, 2s, 4s, 8s, 16s, 32s = 63s before the 7th attempt.
    await vi.advanceTimersByTimeAsync(63_000);
    await assertion;
    expect(op).toHaveBeenCalledTimes(7);
  });
});
