import { strToU8, zipSync } from "fflate";
import { buildBudgetJustification, type BudgetCalculation, type BudgetInput } from "@/lib/budget";
import type { GrantRequirementBOM } from "@/lib/ai/rfp-parser";

export type PackageDocument = {
  fileName: string;
  sections: Array<{ title: string; body: string }>;
};

export type PackageAttachment = {
  fileName: string;
  bytes: Uint8Array;
};

const WIN_ANSI_SPECIALS: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  ƒ: 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  ˆ: 0x88,
  "‰": 0x89,
  Š: 0x8a,
  "‹": 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  š: 0x9a,
  "›": 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};
const PDF_TEXT_SUBSTITUTIONS: Record<string, string> = {
  "≤": "<=",
  "≥": ">=",
  "−": "-",
  "→": "->",
  "×": "x",
};

function pdfLiteral(text: string) {
  let encoded = "";
  const normalized = [...text].map((char) => PDF_TEXT_SUBSTITUTIONS[char] ?? char).join("");
  for (const char of normalized) {
    const code = char.codePointAt(0)!;
    const byte =
      WIN_ANSI_SPECIALS[char] ?? (code <= 0xff && !(code >= 0x80 && code <= 0x9f) ? code : null);
    if (byte === null)
      throw new Error(
        `PDF export does not support the character "${char}". Remove it or use the DOCX export.`,
      );
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c)
      encoded += `\\${String.fromCharCode(byte)}`;
    else if (byte < 0x20 || byte >= 0x7f) encoded += `\\${byte.toString(8).padStart(3, "0")}`;
    else encoded += String.fromCharCode(byte);
  }
  return `(${encoded})`;
}

function wrapPdfLine(text: string, maxLength = 92) {
  const words = text.split(/\s+/u);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!word) continue;
    if (line && line.length + word.length + 1 > maxLength) {
      lines.push(line);
      line = "";
    }
    if (word.length > maxLength) {
      if (line) lines.push(line);
      for (let offset = 0; offset < word.length; offset += maxLength) {
        const fragment = word.slice(offset, offset + maxLength);
        if (offset + maxLength < word.length) lines.push(fragment);
        else line = fragment;
      }
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function createPdf(document: PackageDocument) {
  const pageLines: Array<Array<{ text: string; heading: boolean }>> = [[]];
  let page = 0;
  const addLine = (text: string, heading = false) => {
    if (pageLines[page]!.length >= 48) {
      page += 1;
      pageLines.push([]);
    }
    pageLines[page]!.push({ text, heading });
  };
  addLine(document.fileName.replace(/\.[^.]+$/u, ""), true);
  addLine("");
  for (const section of document.sections) {
    addLine(section.title, true);
    for (const paragraphText of section.body.split(/\r?\n/u)) {
      for (const line of wrapPdfLine(paragraphText)) addLine(line);
      addLine("");
    }
  }

  const objects: string[] = [];
  const addObject = (value: string) => {
    objects.push(value);
    return objects.length;
  };
  const catalogId = addObject("");
  const pagesId = addObject("");
  const regularFontId = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const boldFontId = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  const pageIds: number[] = [];

  for (const lines of pageLines) {
    const commands = ["BT"];
    let y = 790;
    for (const line of lines) {
      const fontSize = line.heading ? 12 : 9;
      const fontId = line.heading ? boldFontId : regularFontId;
      commands.push(
        `/${fontId === boldFontId ? "F2" : "F1"} ${fontSize} Tf 1 0 0 1 50 ${y} Tm ${pdfLiteral(line.text)} Tj`,
      );
      y -= fontSize + 5;
    }
    commands.push("ET");
    const stream = commands.join("\n");
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return strToU8(pdf);
}

function safeFileName(value: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, "_")
    .replace(/^\.+/u, "")
    .trim();
  return cleaned || "document";
}

function uniquePath(path: string, used: Set<string>) {
  const [base, ...extensionParts] = path.split(".");
  const extension = extensionParts.length ? `.${extensionParts.join(".")}` : "";
  let candidate = `${base}${extension}`;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${index}${extension}`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function escapeXml(text: string) {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function paragraph(text: string) {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function createDocx(document: PackageDocument) {
  const content = document.sections
    .flatMap((section) => [
      paragraph(section.title),
      ...section.body.split(/\r?\n/u).map((line) => paragraph(line)),
    ])
    .join("");
  const entries = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
    ),
  };
  return zipSync(entries, { level: 6 });
}

function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@]/u.test(value)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}

export function createBudgetCsv(input: BudgetInput, calculation: BudgetCalculation) {
  const rows: Array<Array<string | number>> = [
    [
      "Type",
      "Category / vendor",
      "Basis / description",
      "Quantity",
      "Unit cost",
      "Freight",
      "Tax",
      "Amount",
    ],
  ];
  if (input.track === "federal" && input.federalCosts) {
    for (const [category, amount] of Object.entries(input.federalCosts)) {
      if (amount > 0) rows.push(["Federal cost", category, "", "", "", "", "", amount]);
    }
  } else {
    for (const item of input.equipment) {
      const amount = item.quantity * item.unitCost + item.freight + item.tax;
      if (amount > 0)
        rows.push([
          "Equipment",
          item.vendor,
          "",
          item.quantity,
          item.unitCost,
          item.freight,
          item.tax,
          amount,
        ]);
    }
    for (const item of input.institutional) {
      if (item.amount > 0)
        rows.push(["Institutional", item.category, item.basis, "", "", "", "", item.amount]);
    }
  }
  rows.push(["Total project cost", "", "", "", "", "", "", calculation.totalProjectCost]);
  rows.push(["Grant request", "", "", "", "", "", "", calculation.grantRequest]);
  rows.push(["Required match", "", "", "", "", "", "", calculation.requiredMatch]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function buildApplicationPackage(input: {
  grantTitle: string;
  funder: string;
  amount: string;
  documents: PackageDocument[];
  portalUrl?: string;
  guidelinesUrl?: string;
  budget?: { input: BudgetInput; calculation: BudgetCalculation };
  requirements?: GrantRequirementBOM;
  attachments?: PackageAttachment[];
}) {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();

  for (const document of input.documents) {
    const baseName = safeFileName(document.fileName).replace(/\.[^.]+$/u, "");
    const path = uniquePath(`narratives/${baseName}.docx`, used);
    files[path] = createDocx(document);
    const pdfPath = uniquePath(`narratives/${baseName}.pdf`, used);
    files[pdfPath] = createPdf(document);
    const textPath = uniquePath(`narratives/${baseName}.txt`, used);
    files[textPath] = strToU8(
      document.sections.map((section) => `${section.title}\n\n${section.body}`).join("\n\n"),
    );
  }
  if (input.budget?.calculation.valid) {
    const budgetCsv = createBudgetCsv(input.budget.input, input.budget.calculation);
    files["budget/budget.csv"] = strToU8(budgetCsv);
    files["budget/budget.pdf"] = createPdf({
      fileName: "Grant budget",
      sections: [{ title: "Budget worksheet (CSV rows)", body: budgetCsv }],
    });
    files["budget/budget-justification.txt"] = strToU8(
      buildBudgetJustification(input.budget.input, input.budget.calculation),
    );
  }
  for (const [index, attachment] of (input.attachments ?? []).entries()) {
    const safeName = safeFileName(attachment.fileName);
    const path = uniquePath(`vault/${index + 1}-${safeName}`, used);
    files[path] = attachment.bytes;
  }
  if (input.requirements) {
    const checklist = [
      `Program: ${input.requirements.grantTitle}`,
      `Submission method: ${input.requirements.formatting.submissionMedium}`,
      `Page limit: ${input.requirements.formatting.pageLimit ?? "Not stated"}`,
      `Word limit: ${input.requirements.formatting.wordCountLimit ?? "Not stated"}`,
      `Required font: ${input.requirements.formatting.fontFamilyRequired ?? "Not stated"}`,
      ...(input.requirements.formatting.evidenceQuote
        ? [
            `Formatting source quote: "${input.requirements.formatting.evidenceQuote}"${input.requirements.formatting.sourceUrl ? ` — ${input.requirements.formatting.sourceUrl}` : ""}`,
          ]
        : []),
      "",
      "AI-draftable documents:",
      ...input.requirements.aiDraftableDocuments.flatMap((document) => [
        `- ${document.documentType.replaceAll("_", " ")}${document.fileFormats?.length ? ` (formats: ${document.fileFormats.join(", ")})` : " (file format not stated)"}`,
        ...document.requiredHeadings.map(
          (heading) =>
            `  - ${heading}${document.wordLimitsPerSection?.[heading] ? ` (up to ${document.wordLimitsPerSection[heading]} words)` : ""}`,
        ),
        ...(document.evidenceQuote
          ? [
              `  Source quote: "${document.evidenceQuote}"${document.sourceUrl ? ` — ${document.sourceUrl}` : ""}`,
            ]
          : []),
      ]),
      "",
      "Applicant-provided evidence:",
      ...(input.requirements.userRequiredEvidence.length
        ? input.requirements.userRequiredEvidence.flatMap((item) => [
            `- ${item.isMandatory ? "Mandatory" : "Requested"}: ${item.name}${item.fileFormats?.length ? ` (formats: ${item.fileFormats.join(", ")})` : ""} — ${item.reason}`,
            ...(item.evidenceQuote
              ? [
                  `  Source quote: "${item.evidenceQuote}"${item.sourceUrl ? ` — ${item.sourceUrl}` : ""}`,
                ]
              : []),
          ])
        : ["- No evidence attachments were identified by the parser."]),
      "",
      "Verified application prompts:",
      ...(input.requirements.extractedPrompts?.length
        ? input.requirements.extractedPrompts.flatMap((item) => [
            `- ${item.question}${item.maxWords ? ` (max ${item.maxWords} words)` : ""}${item.maxCharacters ? ` (max ${item.maxCharacters} characters)` : ""}`,
            `  Source quote: "${item.evidenceQuote}"${item.sourceUrl ? ` — ${item.sourceUrl}` : ""}`,
          ])
        : ["- No exact application prompts were verified."]),
      "",
      "Verified evaluation criteria:",
      ...(input.requirements.rubricCriteria?.length
        ? input.requirements.rubricCriteria.map(
            (item) =>
              `- ${item.criterion}${item.weightPercent === undefined ? "" : ` (${item.weightPercent}%)`} — "${item.evidenceQuote}"${item.sourceUrl ? ` — ${item.sourceUrl}` : ""}`,
          )
        : ["- No exact scoring criteria or weights were verified."]),
      "",
      `Extraction status: ${input.requirements.extractionStatus ?? "partial"}.`,
      ...(input.requirements.extractionNotes ?? []).map((note) => `Extraction note: ${note}`),
      "Verify exact prompt wording and rubric weights directly in the funder's official guidelines before submitting. This checklist is not an authoritative compliance determination.",
    ].join("\n");
    files["requirements/compliance-checklist.txt"] = strToU8(checklist);
  }

  files["submission-checklist.txt"] = strToU8(
    [
      `Program: ${input.grantTitle}`,
      `Official application portal: ${input.portalUrl?.trim() || "Not listed; verify the official funder site."}`,
      `Official guidelines: ${input.guidelinesUrl?.trim() || "Not listed; locate the current official notice before drafting or submitting."}`,
      "",
      "Before submitting:",
      "- Confirm the program is open and that this notice is the current funding cycle.",
      "- Verify applicant eligibility, deadline, award limits, and all submission instructions on the official notice.",
      "- Review every generated draft and replace each [Needs evidence: ...] note with verified applicant information.",
      "- Attach every mandatory form and evidence item required by the current solicitation.",
      "- Confirm budget totals, matching funds, file formats, and page or word limits.",
      "- Verify exact prompt wording and rubric weights directly in the funder's official guidelines before submitting.",
      "- Submit through the official portal and save the submission confirmation.",
    ].join("\n"),
  );

  files["README.txt"] = strToU8(
    [
      `Grant application working package`,
      `Funder: ${input.funder}`,
      `Program: ${input.grantTitle}`,
      `Listed award: ${input.amount}`,
      `Official application portal: ${input.portalUrl?.trim() || "Not listed; verify the official funder site."}`,
      `Official guidelines: ${input.guidelinesUrl?.trim() || "Not listed; locate the current official notice before drafting or submitting."}`,
      "",
      "Use submission-checklist.txt before filing.",
      "Generated narratives are editable working drafts. Review all facts, headings, limits, and evidence against the current official solicitation.",
      "Verify exact prompt wording and rubric weights directly in the funder's official guidelines before submitting; unavailable or gated instructions are never inferred.",
      "Narrative drafts are exported as PDF, DOCX, and TXT. Budget exports are PDF, CSV, and plain-text justification. Other required formats must be prepared in the funder's official system or with an approved tool.",
      "These are working drafts, not official SF-424/SF-424A forms. Verify SAM.gov registration and submit through the funder's official portal.",
      "Any included compliance checklist is AI-extracted from publicly fetched guidelines or user-provided text and must be checked against the current official notice.",
      "Vault attachments are included only when the user selected the include-evidence option.",
    ].join("\n"),
  );

  return zipSync(files, { level: 6 });
}
