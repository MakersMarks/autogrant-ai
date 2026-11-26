import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_QUESTION_BANK,
  STARTER_QUESTIONS,
  YES_NO_QUESTION_BANK,
} from "@/data/yesNoQuestionBank";
import { buildQuestionSequence } from "@/hooks/useSmartYesNoQuiz";

describe("Smart Match yes/no question bank", () => {
  it("provides 25 starter questions and 75 branch follow-ups", () => {
    expect(STARTER_QUESTIONS).toHaveLength(25);
    expect(FOLLOW_UP_QUESTION_BANK).toHaveLength(75);
    expect(YES_NO_QUESTION_BANK).toHaveLength(100);
  });

  it("connects every follow-up to a starter answer and uses unique question ids", () => {
    const starterTags = new Set(STARTER_QUESTIONS.map((question) => question.tag));
    expect(
      FOLLOW_UP_QUESTION_BANK.every(
        (question) => question.parentTag && starterTags.has(question.parentTag),
      ),
    ).toBe(true);
    expect(new Set(YES_NO_QUESTION_BANK.map((question) => question.id)).size).toBe(100);
  });

  it("maps existing EIN and SAM Vault evidence to auto-skip rules", () => {
    const einQuestion = STARTER_QUESTIONS.find((question) => question.tag === "ein_ready");
    const samQuestion = STARTER_QUESTIONS.find((question) => question.tag === "sam_ready");
    expect(einQuestion?.satisfiedByDocument).toContain("ein_letter");
    expect(samQuestion?.satisfiedByDocument).toContain("sam_gov_registration");
  });

  it("adds three relevant follow-ups only after a Yes and skips satisfied profile/document questions", () => {
    const starterQuestion = STARTER_QUESTIONS[0]!;
    const withBranch = buildQuestionSequence(new Set(), new Set(), { [starterQuestion.id]: "yes" });
    expect(withBranch).toHaveLength(28);
    expect(withBranch[1]?.parentTag).toBe(starterQuestion.tag);

    const noBranch = buildQuestionSequence(new Set(), new Set(), { [starterQuestion.id]: "no" });
    expect(noBranch).toHaveLength(25);

    const autoSkipped = buildQuestionSequence(
      new Set(["student_founder"]),
      new Set(["ein_letter"]),
      {},
    );
    expect(autoSkipped).toHaveLength(23);
    expect(autoSkipped.some((question) => question.tag === "ein_ready")).toBe(false);
    expect(autoSkipped.some((question) => question.tag === "student_founder")).toBe(false);
  });
});
