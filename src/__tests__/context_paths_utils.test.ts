import { describe, it, expect } from "vitest";
import { validateChatContext } from "@/ipc/utils/context_paths_utils";

const EMPTY = {
  contextPaths: [],
  smartContextAutoIncludes: [],
  excludePaths: [],
};

describe("validateChatContext", () => {
  it("returns an empty context for null or undefined", () => {
    expect(validateChatContext(null)).toEqual(EMPTY);
    expect(validateChatContext(undefined)).toEqual(EMPTY);
  });

  it("returns a valid context unchanged", () => {
    const ctx = {
      contextPaths: [{ globPath: "src/**/*.ts" }],
      smartContextAutoIncludes: [{ globPath: "README.md" }],
      excludePaths: [{ globPath: "node_modules/**" }],
    };
    expect(validateChatContext(ctx)).toEqual(ctx);
  });

  it("accepts a context without excludePaths", () => {
    const ctx = {
      contextPaths: [{ globPath: "src/**" }],
      smartContextAutoIncludes: [],
    };
    expect(validateChatContext(ctx)).toEqual(ctx);
  });

  it("falls back to an empty context for invalid data", () => {
    expect(validateChatContext({ contextPaths: ["src/**"] })).toEqual(EMPTY);
    expect(validateChatContext("src/**")).toEqual(EMPTY);
  });
});
