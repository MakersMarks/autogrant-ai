import { inferEntityTypes, inferOpportunityColumns, stripHtml } from "./rules.ts";

Deno.test("stripHtml removes markup and normalizes whitespace", () => {
  const value = stripHtml("<td>  Small <strong>business</strong> grant </td>");
  if (value !== "Small business grant") {
    throw new Error(`Unexpected plain text: ${value}`);
  }
});

Deno.test("inferEntityTypes retains small-business eligibility", () => {
  const entityTypes = inferEntityTypes("Small Business Innovation Grant", "Iowa");
  if (!entityTypes.includes("for_profit") || !entityTypes.includes("small_business")) {
    throw new Error(`Expected small-business applicant types, got: ${entityTypes.join(", ")}`);
  }
});

Deno.test("inferOpportunityColumns skips IowaGrants status cells before reading the title", () => {
  const columns = inferOpportunityColumns([
    "10001",
    "Posted",
    "Small Business Growth Grant",
    "IEDA",
    "12/31/2026",
  ]);
  if (columns.title !== "Small Business Growth Grant" || columns.agency !== "IEDA") {
    throw new Error(`Unexpected IowaGrants columns: ${JSON.stringify(columns)}`);
  }
});
