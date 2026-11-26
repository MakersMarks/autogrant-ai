import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverFns = vi.hoisted(() => ({
  searchLiveGrants: vi.fn(async () => ({ grants: [], total: 0 })),
  searchSbirSolicitations: vi.fn(async () => ({ solicitations: [] })),
  getGrantDetail: vi.fn(),
  summarizeGrant: vi.fn(),
  auditGrantFit: vi.fn(),
  getMultiPoolRegistry: vi.fn(async () => ({
    pools: { State: [], Local: [], Corporate: [], Foundation: [] },
  })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(async () => ({ data: [], error: null })),
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

describe("Live grants feed effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
