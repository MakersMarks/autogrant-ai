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

    fireEvent.click(screen.getByRole("button", { name: "AI Copilot" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in to chat or upload" }));

    expect(onSignIn).toHaveBeenCalledOnce();
    expect(screen.getByText(/Sign in to chat with Grant/)).toBeInTheDocument();
  });
});
