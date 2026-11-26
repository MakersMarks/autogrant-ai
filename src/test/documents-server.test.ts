import { describe, expect, it } from "vitest";
import { extractDocumentText } from "@/lib/ai/documents.server";

describe("server document extraction", () => {
  it("preserves CSV rows and columns as text evidence", async () => {
    const csv = "milestone,metric,value\nPilot,customers,12";

    await expect(extractDocumentText(new TextEncoder().encode(csv), "text/csv")).resolves.toBe(csv);
  });
});
