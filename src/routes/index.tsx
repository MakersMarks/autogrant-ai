import { createFileRoute } from "@tanstack/react-router";
import { AutoGrantApp } from "@/components/autogrant/AutoGrantApp";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AutoGrant.ai — AI grant discovery & proposal drafting" },
      { name: "description", content: "Find matched grants, store credentials in a private vault, and draft proposals in your own voice with AI." },
      { property: "og:title", content: "AutoGrant.ai — AI grant discovery & proposal drafting" },
      { property: "og:description", content: "Find matched grants, store credentials in a private vault, and draft proposals in your own voice with AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutoGrantApp,
});
