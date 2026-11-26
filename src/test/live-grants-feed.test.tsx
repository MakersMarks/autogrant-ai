import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverFns = vi.hoisted(() => ({
  searchLiveGrants: vi.fn(async () => ({ grants: [], total: 0 })),
  searchSbirSolicitations: vi.fn(async () => ({ solicitations: [] })),
  getGrantDetail: vi.fn(),
  summarizeGrant: vi.fn(),
  auditGrantFit: vi.fn(),
  siteGrantRows: [] as unknown[],
  getMultiPoolRegistry: vi.fn(async () => ({
    pools: { State: [], Local: [], Corporate: [], Foundation: [] },
  })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(async () => ({ data: serverFns.siteGrantRows, error: null })),
    })),
  },
}));

vi.mock("@/lib/grants-gov/grants.functions", () => serverFns);

vi.mock("@/components/autogrant/SamRegistrationCheck", () => ({
  SamRegistrationCheck: () => null,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn:
    (serverFn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      serverFn(...args),
}));

import { LiveGrantsFeed } from "@/components/autogrant/LiveGrantsFeed";
import { mapSiteGrantToUnified } from "@/lib/grants/site-grant-mapping";
import { createGrantIssueUrl } from "@/lib/grant-feedback";

describe("Live grants feed effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverFns.siteGrantRows = [];
  });

  it("does not rerun searches or pool loading when async results update state", async () => {
    render(
      <LiveGrantsFeed
        signedIn
        drafting={false}
        onDraft={() => {}}
        profile={{
          projectName: "Example business",
          sector: "BC",
          industry: "Manufacturing",
          lifecycleStage: "Established Business",
          fundingPurpose: "Equipment",
          fundingGoal: "25000",
          location: "Des Moines, Iowa",
          entityType: "LLC / Corporation",
          demographics: [],
        }}
      />,
    );

    await waitFor(() => {
      expect(serverFns.searchLiveGrants).toHaveBeenCalledTimes(1);
      expect(serverFns.getMultiPoolRegistry).toHaveBeenCalledTimes(1);
    });
    expect(serverFns.searchLiveGrants).toHaveBeenCalledWith({
      data: expect.objectContaining({ includeFederal: true }),
    });
  });

  it("keeps portal directories distinct from confirmed open opportunities", () => {
    const mapped = mapSiteGrantToUnified({
      id: "program-directory",
      title: "Funder Directory",
      pool_tier: "state_territory",
      grant_tier: "State",
      funder_name: "Example Funder",
      funder_type: "government",
      award_floor: 0,
      award_ceiling: 0,
      min_months_in_business: 0,
      eligible_states: ["ALL"],
      application_time_minutes: null,
      deadline: "Check Current Cycle",
      open_date: null,
      close_date: null,
      is_rolling: false,
      cost_sharing_required: false,
      cost_sharing_percentage: null,
      eligible_entity_types: ["for_profit"],
      demographic_set_asides: [],
      geographic_restriction: "national",
      geographic_scope: null,
      application_method: "online_portal",
      direct_apply_url: "https://example.org/programs",
      official_application_url: "https://example.org/programs",
      portal_url: "https://example.org/programs",
      source_solicitation_url: null,
      is_free_to_apply: true,
      directory_only: true,
      summary_text: "Browse the current programs.",
      prerequisites: [],
      status: "open",
    });

    expect(mapped).toMatchObject({ status: "unknown", directoryOnly: true });
  });

  it("shows directories as research links, not draftable grant cards", async () => {
    serverFns.siteGrantRows = [
      {
        id: "program-directory",
        title: "Funder Directory",
        pool_tier: "state_territory",
        grant_tier: "State",
        funder_name: "Example Funder",
        funder_type: "government",
        award_floor: 0,
        award_ceiling: 0,
        min_months_in_business: 0,
        eligible_states: ["ALL"],
        application_time_minutes: null,
        deadline: "Check Current Cycle",
        open_date: null,
        close_date: null,
        is_rolling: false,
        cost_sharing_required: false,
        cost_sharing_percentage: null,
        eligible_entity_types: ["for_profit"],
        demographic_set_asides: [],
        geographic_restriction: "national",
        geographic_scope: null,
        application_method: "online_portal",
        direct_apply_url: "https://example.org/programs",
        official_application_url: "https://example.org/programs",
        portal_url: "https://example.org/programs",
        source_solicitation_url: null,
        is_free_to_apply: true,
        directory_only: true,
        summary_text: "Browse the current programs.",
        prerequisites: [],
        status: "unknown",
      },
    ];

    render(
      <LiveGrantsFeed
        signedIn
        drafting={false}
        onDraft={() => {}}
        profile={{
          projectName: "Example business",
          sector: "BC",
          industry: "Manufacturing",
          lifecycleStage: "Established Business",
          fundingPurpose: "Equipment",
          fundingGoal: "25000",
          location: "Des Moines, Iowa",
          entityType: "LLC / Corporation",
          demographics: [],
        }}
      />,
    );

    expect(await screen.findByText("Program directories (1)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open directory" })).toHaveAttribute(
      "href",
      "https://example.org/programs",
    );
    expect(screen.queryByRole("button", { name: "Draft Proposal" })).not.toBeInTheDocument();
  });

  it("prefills a GitHub issue with public grant listing details", () => {
    const issueUrl = new URL(
      createGrantIssueUrl({
        id: "sample-grant",
        title: "Sample Grant & Awards",
        sourceUrl: "https://example.org/apply",
      }),
    );

    expect(issueUrl.origin + issueUrl.pathname).toBe(
      "https://github.com/MakersMarks/autogrant-ai/issues/new",
    );
    expect(issueUrl.searchParams.get("title")).toBe("Grant listing issue: Sample Grant & Awards");
    expect(issueUrl.searchParams.get("body")).toContain("Grant ID: sample-grant");
    expect(issueUrl.searchParams.get("body")).toContain("https://example.org/apply");
  });
});
