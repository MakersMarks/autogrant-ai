import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  FOLLOW_UP_QUESTION_BANK,
  STARTER_QUESTIONS,
  type YesNoQuestion,
} from "@/data/yesNoQuestionBank";
import { getMultiPoolRegistry } from "@/lib/grants-gov/grants.functions";
import { stateCodeFromLocation } from "@/lib/grants-gov/rules";
import { standardizedDemographicTags } from "@/lib/grants-gov/scoring";

type Answer = "yes" | "no" | "skip";
type SiteGrantRow = {
  id: string;
  demographic_tags?: string[] | null;
  requires_strict_demographic?: boolean | null;
};
type CustomTableClient = {
  from(table: "site_grants"): {
    select(columns: string): PromiseLike<{
      data: SiteGrantRow[] | null;
      error: { message: string } | null;
    }>;
  };
};
const customTables = supabase as unknown as CustomTableClient;

export function applyDemographicAnswer(
  tags: readonly string[],
  questionTag: string,
  answer: Answer,
): string[] {
  if (answer === "skip") return [...tags];
  const retained = tags.filter(
    (tag) => tag !== questionTag && !standardizedDemographicTags([tag]).includes(questionTag),
  );
  return answer === "yes" ? [...new Set([...retained, questionTag])] : retained;
}

function demographicRequirementMatches(
  grantTags: readonly string[] | null | undefined,
  isStrict: boolean | null | undefined,
  profileTags: ReadonlySet<string>,
): boolean {
  if (!isStrict || !grantTags?.length) return true;
  return standardizedDemographicTags(grantTags).some((tag) => profileTags.has(tag));
}

async function loadMatchCount(
  demographics: readonly string[],
  state: string,
  lifecycleStage: string,
): Promise<number> {
  const [siteGrantResult, registryResult] = await Promise.all([
    customTables.from("site_grants").select("id, demographic_tags, requires_strict_demographic"),
    getMultiPoolRegistry({ data: { state, lifecycleStage } }),
  ]);
  if (siteGrantResult.error) throw new Error(siteGrantResult.error.message);

  const profileTags = new Set(standardizedDemographicTags(demographics));
  const matchingIds = new Set<string>();
  for (const grant of siteGrantResult.data ?? []) {
    if (
      demographicRequirementMatches(
        grant.demographic_tags,
        grant.requires_strict_demographic,
        profileTags,
      )
    ) {
      matchingIds.add(grant.id);
    }
  }
  for (const grant of Object.values(registryResult.pools).flat()) {
    const tags = grant.demographicTags?.length ? grant.demographicTags : grant.demographicSetAsides;
    if (demographicRequirementMatches(tags, grant.requiresStrictDemographic, profileTags)) {
      matchingIds.add(grant.id);
    }
  }
  return matchingIds.size;
}

function isSatisfied(
  question: YesNoQuestion,
  tags: ReadonlySet<string>,
  documentKeys: ReadonlySet<string>,
): boolean {
  return (
    tags.has(question.tag) ||
    (question.satisfiedByDocument ?? []).some((key) => documentKeys.has(key))
  );
}

export function buildQuestionSequence(
  tags: ReadonlySet<string>,
  documentKeys: ReadonlySet<string>,
  answers: Readonly<Record<string, Answer>>,
): YesNoQuestion[] {
  return STARTER_QUESTIONS.flatMap((question) => {
    const followUps =
      answers[question.id] === "yes"
        ? FOLLOW_UP_QUESTION_BANK.filter(
            (followUp) =>
              followUp.parentTag === question.tag && !isSatisfied(followUp, tags, documentKeys),
          )
        : [];
    return [...(!isSatisfied(question, tags, documentKeys) ? [question] : []), ...followUps];
  });
}

export function useSmartYesNoQuiz() {
  const [tags, setTags] = useState<string[]>([]);
  const [documentKeys, setDocumentKeys] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [index, setIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matchCountError, setMatchCountError] = useState("");
  const [profileContext, setProfileContext] = useState({ state: "", lifecycleStage: "" });

  useEffect(() => {
    let active = true;
    const loadProfileAndVault = async () => {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error("Sign in to use the Smart Match Quiz.");

        const [{ data: profile, error: profileError }, { data: documents, error: docsError }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("demographics, location, lifecycle_stage")
              .eq("id", user.id)
              .maybeSingle(),
            supabase.from("vault_documents").select("slot_key").eq("user_id", user.id),
          ]);
        if (profileError) throw profileError;
        if (docsError) throw docsError;
        if (!active) return;

        const nextDocumentKeys = (documents ?? []).map((document) => document.slot_key);
        const docSatisfiedTags = STARTER_QUESTIONS.filter((question) =>
          (question.satisfiedByDocument ?? []).some((key) => nextDocumentKeys.includes(key)),
        ).map((question) => question.tag);
        const profileTags = profile?.demographics ?? [];
        const context = {
          state: stateCodeFromLocation(profile?.location ?? "") ?? "",
          lifecycleStage: profile?.lifecycle_stage ?? "",
        };
        setTags([...new Set([...profileTags, ...docSatisfiedTags])]);
        setDocumentKeys(nextDocumentKeys);
        setProfileContext(context);
        try {
          setMatchCount(
            await loadMatchCount(
              [...profileTags, ...docSatisfiedTags],
              context.state,
              context.lifecycleStage,
            ),
          );
          setMatchCountError("");
        } catch (error) {
          setMatchCountError(
            `Could not calculate the match count: ${error instanceof Error ? error.message : "Grant sources are unavailable."}`,
          );
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Could not load your quiz profile.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadProfileAndVault();
    const refreshOnFocus = () => void loadProfileAndVault();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadProfileAndVault();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const questions = useMemo(
    () => buildQuestionSequence(new Set(tags), new Set(documentKeys), answers),
    [answers, documentKeys, tags],
  );
  const currentQuestion = questions[index] ?? null;

  const answer = useCallback(
    async (value: Answer) => {
      if (!currentQuestion || saving) return;
      const current = currentQuestion;
      const nextAnswers = { ...answers, [current.id]: value };
      const nextTags = applyDemographicAnswer(tags, current.tag, value);
      const tagsChanged =
        nextTags.length !== tags.length || nextTags.some((tag, tagIndex) => tag !== tags[tagIndex]);
      if (tagsChanged) {
        setSaving(true);
        try {
          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser();
          if (authError) throw authError;
          if (!user) throw new Error("Sign in to save your quiz answers.");
          const { error } = await supabase
            .from("profiles")
            .update({ demographics: nextTags })
            .eq("id", user.id);
          if (error) throw new Error(`Could not save your profile: ${error.message}`);
          setTags(nextTags);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save your quiz answer.");
          return;
        } finally {
          setSaving(false);
        }
      }

      setTags(nextTags);
      setAnswers(nextAnswers);
      const nextQuestions = buildQuestionSequence(
        new Set(nextTags),
        new Set(documentKeys),
        nextAnswers,
      );
      const nextPosition = nextQuestions.findIndex((question) => question.id === current.id);
      setIndex(Math.max(0, nextPosition + 1));

      if (tagsChanged) {
        try {
          setMatchCount(
            await loadMatchCount(nextTags, profileContext.state, profileContext.lifecycleStage),
          );
          setMatchCountError("");
        } catch (error) {
          setMatchCountError(
            `Could not calculate the match count: ${error instanceof Error ? error.message : "Grant sources are unavailable."}`,
          );
        }
      }
    },
    [answers, currentQuestion, documentKeys, profileContext, saving, tags],
  );

  const goBack = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  return {
    answer,
    currentQuestion,
    goBack,
    index,
    loading,
    matchCount,
    matchCountError,
    questionCount: questions.length,
    saving,
  };
}
