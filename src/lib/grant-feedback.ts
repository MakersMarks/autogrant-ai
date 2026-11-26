export function createGrantIssueUrl(input: {
  id: string;
  title: string;
  sourceUrl?: string | null;
}) {
  const query = new URLSearchParams({
    title: `Grant listing issue: ${input.title}`,
    body: [
      "Please review this grant listing.",
      `Grant ID: ${input.id}`,
      `Listing URL: ${input.sourceUrl || "Not provided"}`,
      "",
      "Issue type: closed / incorrect eligibility / broken link / other",
      "Details:",
    ].join("\n"),
  });
  return `https://github.com/MakersMarks/autogrant-ai/issues/new?${query.toString()}`;
}
