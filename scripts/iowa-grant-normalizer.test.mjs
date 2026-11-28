import assert from "node:assert/strict";
import test from "node:test";
import {
  deadlineHasPassed,
  normalizeGrantRecord,
  parseIowaGrantRow,
} from "./iowa-grant-normalizer.mjs";

test("uses opportunity title and agency instead of Status or Category columns", () => {
  const row = parseIowaGrantRow({
    headers: [
      "ID",
      "Status",
      "Categorical Area",
      "Agency",
      "Program Area",
      "Title",
      "Posted Date",
      "Final-Application Due Date",
    ],
    cells: [
      "228079",
      "Posted",
      "Community Development",
      "Economic Development Authority",
      "Downtown Resource Center",
      "Community Catalyst Building Remediation",
      "Oct 20, 2026 10:37 AM",
      "Apr 14, 2027 4:30 PM",
    ],
    href: "/viewStorefrontOpportunity.do?OIDString=1505139540371%7COpportunity",
    linkText: "Community Catalyst Building Remediation",
  });

  assert.deepEqual(
    {
      rawId: row.rawId,
      title: row.title,
      agency: row.agency,
      deadline: row.deadline,
      applyUrl: row.applyUrl,
    },
    {
      rawId: "228079",
      title: "Community Catalyst Building Remediation",
      agency: "Economic Development Authority",
      deadline: "Apr 14, 2027 4:30 PM",
      applyUrl:
        "https://www.iowagrants.gov/viewStorefrontOpportunity.do?OIDString=1505139540371%7COpportunity",
    },
  );
});

test("does not label missing or not-applicable deadlines open", () => {
  const now = new Date("2026-11-26T00:00:00.000Z");
  const base = { id: "sample", title: "Sample Grant" };

  assert.equal(
    normalizeGrantRecord({ ...base, deadline: "Not Applicable" }, { now }).status,
    "unknown",
  );
  assert.equal(
    normalizeGrantRecord({ ...base, deadline: "Check Current Cycle" }, { now }).status,
    "unknown",
  );
  assert.equal(
    normalizeGrantRecord(
      { ...base, deadline: "Jan 29, 2027", open_date: "Jan 4, 2027", status: "open" },
      { now },
    ).status,
    "unknown",
  );
  assert.equal(
    normalizeGrantRecord(
      { ...base, deadline: "Jan 29, 2027", open_date: "Jan 4, 2027", status: "open" },
      { now: new Date("2027-01-05T00:00:00.000Z") },
    ).status,
    "open",
  );
  assert.equal(
    normalizeGrantRecord({ ...base, deadline: "Apr 14, 2027 4:30 PM" }, { now }).status,
    "open",
  );
  assert.equal(
    normalizeGrantRecord({ ...base, deadline: "Apr 14, 2024" }, { now }).status,
    "closed",
  );
  assert.equal(
    normalizeGrantRecord({ ...base, deadline: "Rolling", is_rolling: true }, { now }).status,
    "open",
  );
  assert.equal(deadlineHasPassed("Apr 14, 2024", now), true);
});
