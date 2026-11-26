import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (serverFn: unknown) => serverFn,
}));

vi.mock("@/lib/ai/ai.functions", () => ({
  copilotChat: vi.fn(),
  executeCopilotAction: vi.fn(),
}));

import { CopilotDrawer } from "@/components/autogrant/CopilotDrawer";
import { copilotChat } from "@/lib/ai/ai.functions";

describe("Copilot drawer access", () => {
  it("prompts visitors to sign in before chatting or uploading", () => {
    const onSignIn = vi.fn();
    render(
      <CopilotDrawer
        isAuthenticated={false}
        onSignIn={onSignIn}
        onUploadFile={vi.fn()}
        onActionComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chat with Stark" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in to chat or upload" }));

    expect(onSignIn).toHaveBeenCalledOnce();
    expect(screen.getByText(/Sign in to chat with Stark/)).toBeInTheDocument();
  });

  it("sends the selected grant context with Copilot messages", async () => {
    vi.mocked(copilotChat).mockResolvedValue({
      reply: "I can help with this grant.",
      action: { type: "none" },
    });
    render(
      <CopilotDrawer
        isAuthenticated
        onSignIn={vi.fn()}
        onUploadFile={vi.fn()}
        onActionComplete={vi.fn()}
        activeGrant={{
          id: "ia-grant-1",
          title: "Community Grant",
          funder: "Iowa Agency",
          amount: "$10,000",
          deadline: "Jan 29, 2027",
          fit: "Good fit",
          tier: "State",
          categoryCode: "CD",
          eligibilityReason: "Iowa applicants",
          portalUrl: "https://example.gov/apply",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chat with Stark" }));
    fireEvent.change(screen.getByLabelText("Message Stark"), {
      target: { value: "What do I need to apply?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await vi.waitFor(() => expect(copilotChat).toHaveBeenCalledOnce());
    expect(vi.mocked(copilotChat).mock.calls[0]?.[0]).toMatchObject({
      data: {
        activeGrant: {
          id: "ia-grant-1",
          title: "Community Grant",
          portalUrl: "https://example.gov/apply",
        },
      },
    });
  });
});
