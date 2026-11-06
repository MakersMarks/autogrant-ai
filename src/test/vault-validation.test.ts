import { describe, expect, it } from "vitest";
import { validateVaultFile, generateDailyGrants } from "@/lib/grants";

const PDF = "application/pdf";
describe("vault upload rules", () => {
  it("accepts a PDF under 15MB", () => expect(validateVaultFile({ name: "a.pdf", type: PDF, size: 1000 })).toBeNull());
  it("accepts a DOCX", () => expect(validateVaultFile({ name: "a.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1000 })).toBeNull());
  it("rejects a PNG renamed to .pdf", () => expect(validateVaultFile({ name: "a.pdf", type: "image/png", size: 1000 })).toMatch(/PDF or DOCX/));
  it("rejects .doc files", () => expect(validateVaultFile({ name: "a.doc", type: "application/msword", size: 1000 })).toMatch(/PDF or DOCX/));
  it("rejects files over 15MB", () => expect(validateVaultFile({ name: "a.pdf", type: PDF, size: 15 * 1024 * 1024 + 1 })).toMatch(/15MB/));
});
describe("discovery feed", () => {
  it("has 50 cards", () => expect(generateDailyGrants("ST")).toHaveLength(50));
});
