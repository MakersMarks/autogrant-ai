import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  FOLLOW_UP_QUESTION_BANK,
  STARTER_QUESTIONS,
  type YesNoQuestion,
} from "@/data/yesNoQuestionBank";

type Answer = "yes" | "no" | "skip";
type SiteGrantRow = { demographic_tags?: string[] | null };
type CustomTableClient = {
  from(table: "site_grants"): {
    select(columns: string): PromiseLike<{
      data: SiteGrantRow[] | null;
      error: { message: string } | null;
    }>;
  };
};
const customTables = supabase as unknown as CustomTableClient;

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
  return STARTER_QUESTIONS.filter(
    (question) => !isSatisfied(question, tags, documentKeys) || answers[question.id] !== undefined,
  ).flatMap((question) => [
    question,
    ...(answers[question.id] === "yes"
      ? FOLLOW_UP_QUESTION_BANK.filter(
          (followUp) =>
            followUp.parentTag === question.tag &&
            (!isSatisfied(followUp, tags, documentKeys) || answers[followUp.id] !== undefined),
        )
      : []),
  ]);
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error("Sign in to use the Smart Match Quiz.");

        const [{ data: profile, error: profileError }, { data: documents, error: docsError }] =
          await Promise.all([
            supabase.from("profiles").select("demographics").eq("id", user.id).maybeSingle(),
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
        setTags([...new Set([...profileTags, ...docSatisfiedTags])]);
        setDocumentKeys(nextDocumentKeys);

        const { data: grants, error: grantsError } = await customTables
          .from("site_grants")
          .select("id, demographic_tags");
        if (grantsError) {
          setMatchCountError(`Could not calculate the match count: ${grantsError.message}`);
        } else {
          setMatchCount(
            (grants ?? []).filter(
              (grant) =>
                !grant.demographic_tags?.length ||
                grant.demographic_tags.some((tag) =>
                  [...profileTags, ...docSatisfiedTags].includes(tag),
                ),
            ).length,
          );
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Could not load your quiz profile.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
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
      const nextTags =
        value === "yes"
          ? [...new Set([...tags, current.tag])]
          : tags.filter((tag) => tag !== current.tag);
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
        const { data: grants, error } = await customTables
          .from("site_grants")
          .select("id, demographic_tags");
        if (error) {
          setMatchCountError(`Could not calculate the match count: ${error.message}`);
        } else {
          setMatchCount(
            (grants ?? []).filter(
              (grant) =>
                !grant.demographic_tags?.length ||
                grant.demographic_tags.some((tag) => nextTags.includes(tag)),
            ).length,
          );
          setMatchCountError("");
        }
      }
    },
    [answers, currentQuestion, documentKeys, saving, tags],
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
