import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mergeDemographicTags, Onboarding, type ProfileInput } from "@/components/autogrant/Onboarding";

const initial: ProfileInput = {
  entity_type: "LLC / Corporation",
  sector_code: "BC",
  funding_goal: "General Working Capital",
  demographics: ["Existing Certification", "Women-Owned"],
  lifecycle_stage: "Established >2 yrs",
  location: "TN",
  funding_purpose: "",
};

describe("Priority 5 onboarding qualifier", () => {
  it("preserves unselected profile tags while replacing selected tags", () => {
    expect(mergeDemographicTags(["Existing Certification", "Women-Owned"], ["Women-Owned"], ["Woman-Owned"]))
      .toEqual(["Existing Certification", "Woman-Owned"]);
  });

  it("renders all six sliding cards and clearly notes the unsaved card", () => {
    render(<Onboarding initial={initial} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Card 1 of 6")).toBeInTheDocument();
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    expect(screen.getByText("Unique Identifiers")).toBeInTheDocument();
    expect(screen.getByText(/Not saved: the current profile schema/)).toBeInTheDocument();
  });

  it("submits an error without falsely completing and reports save failures", async () => {
    const onComplete = vi.fn().mockRejectedValue(new Error("Save failed"));
    render(<Onboarding initial={initial} onComplete={onComplete} />);
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getAllByRole("button", { name: "Continue" })[0]!);
    }
    fireEvent.click(screen.getByRole("button", { name: "Launch Web Platform" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  });
});
