import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  profileTags: [] as string[],
  documents: [] as { slot_key: string }[],
  grants: [] as {
    id: string;
    states?: string[] | null;
    eligible_states?: string[] | null;
    eligible_entity_types?: string[] | null;
    min_months_in_business?: number | null;
    stage_tags?: string[] | null;
    demographic_tags: string[] | null;
    demographic_set_asides?: string[] | null;
    requires_strict_demographic: boolean;
    directory_only?: boolean;
    status?: string;
  }[],
  pools: [] as {
    id: string;
    demographicSetAsides: string[];
    requiresStrictDemographic: boolean;
    directoryOnly?: boolean;
    status?: string;
    eligibleStates?: string[];
    eligibleEntityTypes?: string[];
    minMonthsInBusiness?: number;
  }[],
  registryRequests: [] as unknown[],
}));

vi.mock("@/lib/grants-gov/grants.functions", () => ({
  getMultiPoolRegistry: vi.fn(async (input: unknown) => {
    mockState.registryRequests.push(input);
    return { pools: { Corporate: mockState.pools } };
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  demographics: mockState.profileTags,
                  location: "Des Moines, Iowa",
                  lifecycle_stage: "Established Business",
                  entity_type: "LLC / Corporation",
                },
                error: null,
              }),
            }),
          }),
          update: (values: { demographics: string[] }) => ({
            eq: async () => {
              mockState.profileTags = values.demographics;
              return { error: null };
            },
          }),
        };
      }
      if (table === "vault_documents") {
        return {
          select: () => ({
            eq: async () => ({ data: mockState.documents, error: null }),
          }),
        };
      }
      if (table === "site_grants") {
        return { select: async () => ({ data: mockState.grants, error: null }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

import { STARTER_QUESTIONS } from "@/data/yesNoQuestionBank";
import { applyDemographicAnswer, useSmartYesNoQuiz } from "@/hooks/useSmartYesNoQuiz";

describe("Smart Match quiz profile integration", () => {
  it("clears legacy aliases on No but preserves saved profile tags on Skip", () => {
    expect(applyDemographicAnswer(["Woman-Owned", "Women-Owned"], "women_owned", "no")).toEqual([]);
    expect(applyDemographicAnswer(["Woman-Owned"], "women_owned", "skip")).toEqual(["Woman-Owned"]);
  });

  beforeEach(() => {
    mockState.profileTags = [];
    mockState.documents = [];
    mockState.registryRequests = [];
    const firstTag = STARTER_QUESTIONS[0]!.tag;
    mockState.grants = [
      { id: "site-general", demographic_tags: [], requires_strict_demographic: false },
      { id: "site-black", demographic_tags: [firstTag], requires_strict_demographic: true },
      {
        id: "site-directory",
        demographic_tags: [],
        requires_strict_demographic: false,
        directory_only: true,
        status: "unknown",
      },
      {
        id: "site-closed",
        demographic_tags: [],
        requires_strict_demographic: false,
        status: "closed",
      },
      {
        id: "site-out-of-state",
        demographic_tags: [],
        requires_strict_demographic: false,
        eligible_states: ["CA"],
      },
      {
        id: "site-nonprofit-only",
        demographic_tags: [],
        requires_strict_demographic: false,
        eligible_entity_types: ["nonprofit_501c3"],
      },
    ];
    mockState.pools = [
      {
        id: "amber-grant-for-women",
        demographicSetAsides: ["women_owned"],
        requiresStrictDemographic: true,
      },
      { id: "pool-general", demographicSetAsides: [], requiresStrictDemographic: false },
      {
        id: "pool-directory",
        demographicSetAsides: [],
        requiresStrictDemographic: false,
        directoryOnly: true,
      },
      {
        id: "pool-closed",
        demographicSetAsides: [],
        requiresStrictDemographic: false,
        status: "closed",
      },
      {
        id: "pool-out-of-state",
        demographicSetAsides: [],
        requiresStrictDemographic: false,
        eligibleStates: ["CA"],
      },
      {
        id: "pool-nonprofit-only",
        demographicSetAsides: [],
        requiresStrictDemographic: false,
        eligibleEntityTypes: ["nonprofit_501c3"],
      },
    ];
  });

  it("counts database and portal-pool matches, saves survey tags, and refreshes Vault evidence", async () => {
    const { result } = renderHook(() => useSmartYesNoQuiz());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.matchCount).toBe(2);
    expect(result.current.questionCount).toBe(STARTER_QUESTIONS.length);
    expect(mockState.registryRequests).toContainEqual({
      data: { state: "IA", lifecycleStage: "Established Business" },
    });

    await act(async () => {
      await result.current.answer("yes");
    });
    expect(result.current.matchCount).toBe(3);
    expect(mockState.profileTags).toContain(STARTER_QUESTIONS[0]!.tag);

    mockState.documents = [{ slot_key: "ein_letter" }];
    const questionCountBeforeRefresh = result.current.questionCount;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() =>
      expect(result.current.questionCount).toBeLessThan(questionCountBeforeRefresh),
    );
  });
});
