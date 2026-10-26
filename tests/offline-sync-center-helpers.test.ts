import { describe, expect, it } from "vitest";
import { badgeFor, compareVersions, errorMessageKey, formatBytes, groupOps, reportMessage, safeCode, snippet, usagePercent } from "@/components/field/sync/helpers";
import type { OutboxOp } from "@/lib/offline/types";

const op = (p: Partial<OutboxOp>): OutboxOp => ({
  opId: "o", entityType: "visit", entityId: "v1", op: "update", payload: {}, chain: "v1", schemaVersion: 1,
  createdAt: "", lastAttemptAt: null, nextAttemptAt: null, retryCount: 0, status: "queued", ...p,
});

describe("sync center helpers", () => {
  it("maps known codes and leaves unknown ones", () => {
    expect(errorMessageKey("visit_locked")).toBe("sync.err.visit_locked");
    expect(errorMessageKey("weird")).toBeNull();
    expect(errorMessageKey(undefined)).toBeNull();
  });
  it("never shows free text as a code", () => {
    expect(safeCode("network")).toBe("network");
    expect(safeCode("my secret observation text")).toBe("unknown");
  });
  it("groups operations per record, most serious first", () => {
    const g = groupOps([op({ opId: "a", status: "queued" }), op({ opId: "b", entityId: "v2", status: "rejected" }), op({ opId: "c", status: "failed" })]);
    expect(g).toHaveLength(2);
    expect(g[0].entityId).toBe("v2");
    expect(g[1].status).toBe("failed");
    expect(badgeFor("rejected")).toBe("failed");
    expect(badgeFor("inflight")).toBe("pending");
  });
  it("cuts snippets", () => {
    expect(snippet("a  b\nc", 40)).toBe("a b c");
    expect(snippet("x".repeat(50), 40)).toHaveLength(41);
  });
  it("marks differing fields", () => {
    const rows = compareVersions("observation", { evidence: "a", worked_well: null }, { evidence: "b", worked_well: "" });
    expect(rows.find((r) => r.key === "evidence")?.differs).toBe(true);
    expect(rows.find((r) => r.key === "worked_well")?.differs).toBe(false);
  });
  it("words sync reports honestly", () => {
    expect(reportMessage(null).key).toBe("sync.result.offline");
    expect(reportMessage({ status: "ok", applied: 2, duplicates: 1 })).toEqual({ key: "sync.result.sent", n: 3 });
  });
  it("formats storage", () => {
    expect(formatBytes(1536, "en-IN")).toBe("1.5 KB");
    expect(usagePercent(50, 100)).toBe(50);
    expect(usagePercent(null, 100)).toBeNull();
  });
});
