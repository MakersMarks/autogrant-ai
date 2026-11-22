import { describe, expect, it } from "vitest";
import { validateVaultFile } from "@/lib/grants";

const PDF = "application/pdf";
describe("vault upload rules", () => {
  it("accepts a PDF under 15MB", () => expect(validateVaultFile({ name: "a.pdf", type: PDF, size: 1000 })).toBeNull());
  it("accepts a DOCX", () => expect(validateVaultFile({ name: "a.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1000 })).toBeNull());
  it("accepts TXT, JPG, and PNG evidence", () => {
    expect(validateVaultFile({ name: "notes.txt", type: "text/plain", size: 1000 })).toBeNull();
    expect(validateVaultFile({ name: "photo.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateVaultFile({ name: "photo.png", type: "image/png", size: 1000 })).toBeNull();
  });
  it("rejects mismatched MIME types", () => expect(validateVaultFile({ name: "a.pdf", type: "image/png", size: 1000 })).toBeTypeOf("string"));
  it("rejects .doc files", () => expect(validateVaultFile({ name: "a.doc", type: "application/msword", size: 1000 })).toBeTypeOf("string"));
  it("rejects files over 15MB", () => expect(validateVaultFile({ name: "a.pdf", type: PDF, size: 15 * 1024 * 1024 + 1 })).toMatch(/15MB/));
});
import { validateVaultFile as validateUpload } from "@/lib/vault";
describe("main vault uploader", () => {
  const f = (type: string, size = 1000) => ({
    type,
    size,
    name: type === "image/jpeg" ? "photo.jpg" : type === "image/png" ? "photo.png" : "file",
  }) as File;
  it("accepts JPG and PNG photos of documents", () => {
    expect(validateUpload(f("image/jpeg")).valid).toBe(true);
    expect(validateUpload(f("image/png")).valid).toBe(true);
  });
  it("still rejects GIFs and files over 15MB", () => {
    expect(validateUpload(f("image/gif")).valid).toBe(false);
    expect(validateUpload(f("image/png", 15 * 1024 * 1024 + 1)).valid).toBe(false);
  });
});
