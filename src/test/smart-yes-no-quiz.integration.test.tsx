import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  profileTags: [] as string[],
  documents: [] as { slot_key: string }[],
  grants: [] as { demographic_tags: string[] | null }[],
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
                data: { demographics: mockState.profileTags },
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
        return {
          select: async () => ({ data: mockState.grants, error: null }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

import { STARTER_QUESTIONS } from "@/data/yesNoQuestionBank";
import { useSmartYesNoQuiz } from "@/hooks/useSmartYesNoQuiz";

describe("Smart Match quiz profile integration", () => {
  beforeEach(() => {
    mockState.profileTags = [];
    mockState.documents = [];
    const firstTag = STARTER_QUESTIONS[0]!.tag;
    mockState.grants = [{ demographic_tags: [] }, { demographic_tags: [firstTag] }];
  });

  it("recalculates match counts after answers and refreshes Vault auto-skip evidence on focus", async () => {
    const { result } = renderHook(() => useSmartYesNoQuiz());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.matchCount).toBe(1);
    expect(result.current.questionCount).toBe(STARTER_QUESTIONS.length);

    await act(async () => {
      await result.current.answer("yes");
    });
    expect(result.current.matchCount).toBe(2);
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
