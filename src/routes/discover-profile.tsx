import { createFileRoute } from "@tanstack/react-router";
import { SmartMatchQuiz } from "@/components/autogrant/SmartMatchQuiz";

export const Route = createFileRoute("/discover-profile")({
  ssr: false,
  component: SmartMatchQuiz,
});
