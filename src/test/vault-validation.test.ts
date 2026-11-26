import { describe, expect, it } from "vitest";
import {
  inferVaultSlotKey,
  resolveVaultSlotKey,
  validateVaultFile,
} from "@/lib/grants";

const PDF = "application/pdf";
describe("vault upload rules", () => {
  it("maps document filenames to matching evidence slots", () => {
    expect(inferVaultSlotKey("Business_Plan_Final.pdf")).toBe("business_plan");
    expect(inferVaultSlotKey("IRS_CP575_EIN.pdf")).toBe("ein");
    expect(inferVaultSlotKey("Drivers-License.jpg")).toBe("photo_id");
    expect(inferVaultSlotKey("Partner_Letter_of_Support.pdf")).toBe("support_letter");
    expect(inferVaultSlotKey("Founder_Resume.pdf")).toBe("founder_resume");
    expect(inferVaultSlotKey("Pilot_Milestone_Metrics.pdf")).toBe("milestone_metric");
    expect(resolveVaultSlotKey("chat-upload-old-id", "Founder Passport.pdf")).toBe("photo_id");
    expect(resolveVaultSlotKey("manually-selected-slot", "A different file.pdf")).toBe(
      "manually-selected-slot",
    );
  });

  it("accepts a PDF under 15MB", () => expect(validateVaultFile({ name: "a.pdf", type: PDF, size: 1000 })).toBeNull());
  it("accepts a DOCX", () => expect(validateVaultFile({ name: "a.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1000 })).toBeNull());
  it("accepts TXT, JPG, and PNG evidence", () => {
    expect(validateVaultFile({ name: "notes.txt", type: "text/plain", size: 1000 })).toBeNull();
    expect(validateVaultFile({ name: "metrics.csv", type: "text/csv", size: 1000 })).toBeNull();
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
    name: type === "image/jpeg"
      ? "photo.jpg"
      : type === "image/png"
        ? "photo.png"
        : type === "text/csv"
          ? "metrics.csv"
          : "file",
  }) as File;
  it("accepts JPG and PNG photos of documents", () => {
    expect(validateUpload(f("image/jpeg")).valid).toBe(true);
    expect(validateUpload(f("image/png")).valid).toBe(true);
    expect(validateUpload(f("text/csv")).valid).toBe(true);
  });
  it("still rejects GIFs and files over 15MB", () => {
    expect(validateUpload(f("image/gif")).valid).toBe(false);
    expect(validateUpload(f("image/png", 15 * 1024 * 1024 + 1)).valid).toBe(false);
  });
});
