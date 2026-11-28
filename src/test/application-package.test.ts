import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { buildApplicationPackage, createBudgetCsv, createPdf } from "@/lib/application-package";
import { calculateBudget, type BudgetInput } from "@/lib/budget";
import { extractDocumentText } from "@/lib/ai/documents.server";

describe("application package export", () => {
  it("creates editable DOCX drafts and includes explicit review limitations", () => {
    const archive = unzipSync(
      buildApplicationPackage({
        grantTitle: "Community Grant",
        funder: "Example Funder",
        amount: "Check current cycle",
        portalUrl: "https://example.gov/apply",
        guidelinesUrl: "https://example.gov/nofo",
        documents: [
          {
            fileName: "Need Narrative.txt",
            sections: [{ title: "Project Need", body: "A community needs this project." }],
          },
        ],
        attachments: [
          {
            fileName: "EIN verification.pdf",
            bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          },
        ],
        requirements: {
          grantId: "grant-1",
          grantTitle: "Community Grant",
          formatting: { submissionMedium: "pdf_upload", pageLimit: 5 },
          aiDraftableDocuments: [
            {
              documentType: "institutional",
              requiredHeadings: ["Project Need"],
              fileFormats: ["PDF"],
            },
          ],
          userRequiredEvidence: [
            {
              evidenceId: "quote",
              name: "Vendor quote",
              category: "vendor_quote",
              isMandatory: true,
              reason: "The notice requires a cost quote.",
              evidenceQuote: "Applicants must upload a vendor quote.",
              sourceUrl: "https://example.gov/nofo",
              autoMatchVaultTag: "vendor_quote",
              fileFormats: ["PDF"],
            },
          ],
          extractionStatus: "partial",
          guidelinesUrl: "https://example.gov/nofo",
          extractedPrompts: [
            {
              question: "Describe the expected measurable outcomes.",
              evidenceQuote: "Applicants must describe measurable outcomes.",
              sourceUrl: "https://example.gov/nofo",
              maxWords: 250,
            },
          ],
          rubricCriteria: [
            {
              criterion: "Project outcomes",
              evidenceQuote: "Outcomes receive 30 points.",
              sourceUrl: "https://example.gov/nofo",
              weightPercent: 30,
            },
          ],
        },
      }),
    );
    const document = unzipSync(archive["narratives/Need Narrative.docx"]!);

    expect(strFromU8(document["word/document.xml"]!)).toContain("Project Need");
    expect(strFromU8(document["word/document.xml"]!)).toContain("A community needs this project.");
    expect(strFromU8(archive["narratives/Need Narrative.pdf"]!)).toContain("%PDF-1.4");
    expect(strFromU8(archive["narratives/Need Narrative.txt"]!)).toContain(
      "A community needs this project.",
    );
    expect(strFromU8(archive["requirements/compliance-checklist.txt"]!)).toContain("Vendor quote");
    expect(strFromU8(archive["requirements/compliance-checklist.txt"]!)).toContain("formats: PDF");
    expect(strFromU8(archive["requirements/compliance-checklist.txt"]!)).toContain(
      "Applicants must upload a vendor quote.",
    );
    expect(strFromU8(archive["requirements/compliance-checklist.txt"]!)).toContain(
      "Describe the expected measurable outcomes.",
    );
    expect(strFromU8(archive["requirements/compliance-checklist.txt"]!)).toContain(
      "Outcomes receive 30 points.",
    );
    expect(strFromU8(archive["submission-checklist.txt"]!)).toContain(
      "Verify exact prompt wording and rubric weights directly in the funder's official guidelines before submitting.",
    );
    expect(strFromU8(archive["submission-checklist.txt"]!)).toContain("https://example.gov/apply");
    expect(strFromU8(archive["submission-checklist.txt"]!)).toContain("https://example.gov/nofo");
    expect(strFromU8(archive["README.txt"]!)).toContain("not official SF-424/SF-424A forms");
    expect(Array.from(archive["vault/1-EIN verification.pdf"]!)).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  it("creates a readable, paginated PDF and reports unsupported glyphs rather than dropping them", async () => {
    const bytes = createPdf({
      fileName: "Project narrative.txt",
      sections: [{ title: "Need", body: `Founder’s story ${"details ".repeat(600)}` }],
    });
    const pdf = strFromU8(bytes);
    expect(pdf).toContain("%PDF-1.4");
    expect(pdf).toContain("/Count 2");
    expect(pdf).toContain("%%EOF");
    expect(await extractDocumentText(bytes, "application/pdf")).toContain("Founder’s story");

    expect(() =>
      createPdf({
        fileName: "Project.txt",
        sections: [{ title: "Need", body: "Unsupported emoji 🚀" }],
      }),
    ).toThrow(/does not support the character/);
  });

  it("exports federal budget categories and neutralizes spreadsheet formula cells", () => {
    const input: BudgetInput = {
      track: "federal",
      federalCosts: {
        Personnel: 1000,
        "Fringe benefits": 0,
        Travel: 0,
        Equipment: 0,
        Supplies: 0,
        Contractual: 0,
        Construction: 0,
        "Other direct costs": 0,
        "Indirect costs": 0,
      },
      equipment: [],
      institutional: [],
      awardCeiling: null,
      costSharingPercentage: null,
    };
    const calculation = calculateBudget(input);
    const csv = createBudgetCsv(input, calculation);
    expect(csv).toContain('"Federal cost","Personnel"');
    const packageFiles = unzipSync(
      buildApplicationPackage({
        grantTitle: "Federal Grant",
        funder: "Federal Agency",
        amount: "$1,000",
        documents: [],
        budget: { input, calculation },
      }),
    );
    expect(strFromU8(packageFiles["budget/budget.pdf"]!)).toContain("%PDF-1.4");
    expect(strFromU8(packageFiles["budget/budget.csv"]!)).toContain('"Federal cost","Personnel"');

    const unsafe: BudgetInput = {
      ...input,
      track: "small_business",
      equipment: [{ vendor: "=IMPORTXML()", quantity: 1, unitCost: 10, freight: 0, tax: 0 }],
    };
    expect(createBudgetCsv(unsafe, calculateBudget(unsafe))).toContain('"\'=IMPORTXML()"');
  });
});
