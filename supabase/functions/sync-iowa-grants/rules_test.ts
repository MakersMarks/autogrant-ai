import { inferEntityTypes, stripHtml } from "./rules.ts";

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
