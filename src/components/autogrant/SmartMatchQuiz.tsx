import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CARDS = [
  { tag: "black_owned", category: "Identity & Heritage", question: "Is your business at least 51% owned by someone who identifies as Black or African American?", helper: "Unlocks Black-founder grants and Black community funding programs." },
  { tag: "hispanic_owned", category: "Identity & Heritage", question: "Is your business at least 51% owned by someone who identifies as Hispanic or Latino?", helper: "Unlocks Hispanic Chamber and Latino founder opportunities." },
  { tag: "asian_owned", category: "Identity & Heritage", question: "Is your business at least 51% owned by an Asian American founder?", helper: "Unlocks AAPI and East, South, or Southeast Asian founder grants." },
  { tag: "pacific_islander_owned", category: "Identity & Heritage", question: "Is your business at least 51% owned by a Native Hawaiian or Pacific Islander?", helper: "Unlocks Native Hawaiian and Pacific Islander programs." },
  { tag: "indigenous_owned", category: "Identity & Heritage", question: "Is your business at least 51% owned by an enrolled or Native American/Alaska Native founder?", helper: "Unlocks tribal, Native CDFI, and Indigenous business funding." },
  { tag: "mena_owned", category: "Identity & Heritage", question: "Is your business at least 51% owned by a Middle Eastern or North African founder?", helper: "Unlocks MENA-owned and immigrant community programs." },
  { tag: "immigrant_owned", category: "Identity & Heritage", question: "Is the business founded or primarily owned by an immigrant, refugee, or first-generation founder?", helper: "Unlocks newcomer and immigrant entrepreneurship funding." },
  { tag: "women_owned", category: "Identity & Heritage", question: "Is your business at least 51% woman-owned?", helper: "Unlocks women-owned and intersectional women-of-color grants." },
  { tag: "lgbtq_owned", category: "Identity & Heritage", question: "Is your business at least 51% LGBTQ+-owned?", helper: "Unlocks NGLCC, Pride, and LGBTQ+ founder programs." },
  { tag: "veteran_owned", category: "Service & Community", question: "Is your business at least 51% owned by a veteran or service-disabled veteran?", helper: "Unlocks veteran and defense-linked grants." },
  { tag: "military_spouse_owned", category: "Service & Community", question: "Is your business owned by a military spouse entrepreneur?", helper: "Unlocks military spouse and military-family programs." },
  { tag: "disability_owned", category: "Identity & Heritage", question: "Is your business at least 51% owned by a founder with a disability?", helper: "Unlocks Disability:IN, vocational, and accessibility grants." },
  { tag: "rural_business", category: "Location & Stage", question: "Is your business located in a USDA-eligible rural area or small town?", helper: "Unlocks USDA and rural community development funding." },
  { tag: "hubzone_or_low_income", category: "Location & Stage", question: "Is your business located in a HUBZone or Opportunity/low-income community?", helper: "Unlocks HUBZone, CDFI, and place-based grants." },
  { tag: "student_founder", category: "Location & Stage", question: "Are you currently enrolled at a college or university?", helper: "Unlocks student pitch competitions and entrepreneurship scholarships." },
] as const;

export function SmartMatchQuiz() {
  const [index, setIndex] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [dragX, setDragX] = useState(0);
  const pointerStart = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void supabase
      .from("profiles")
      .select("demographics")
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data?.demographics) return;
        setTags(data.demographics.filter((tag: string) => CARDS.some((card) => card.tag === tag)));
      });
    void supabase
      .from("site_grants")
      .select("id")
      .then(({ data }) => active && setMatchCount(data?.length ?? 0));
    return () => { active = false; };
  }, []);

  const card = CARDS[index];
  const complete = index >= CARDS.length;

  const persistTags = async (next: string[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ demographics: next }).eq("id", user.id);
    await (supabase as any).from("user_profiles").upsert({
      user_id: user.id,
      demographic_tags: next,
      is_student_founder: next.includes("student_founder"),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  };

  const choose = async (answer: "yes" | "no" | "skip") => {
    if (complete) return;
    let next = tags;
    if (answer === "yes") next = [...new Set([...tags, card.tag])];
    if (answer === "no") next = tags.filter((tag) => tag !== card.tag);
    setTags(next);
    setDragX(0);
    if (answer !== "skip") {
      await persistTags(next);
      const { data } = await (supabase as any).from("site_grants").select("id, demographic_tags");
      const matches = (data ?? []).filter((grant: { demographic_tags?: string[] }) =>
        !grant.demographic_tags?.length || grant.demographic_tags.some((tag: string) => next.includes(tag)),
      ).length;
      setMatchCount(matches);
    }
    setIndex((current) => current + 1);
  };

  const stamp = useMemo(() => {
    if (dragX > 20) return "YES";
    if (dragX < -20) return "NO";
    return "";
  }, [dragX]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Smart Match Quiz</p>
            <h1 className="mt-1 text-2xl font-bold">Discover grants that fit you</h1>
          </div>
          <span className="rounded-full border border-emerald-700 bg-emerald-950 px-3 py-1 text-xs font-bold text-emerald-200">
            {matchCount} matching grants
          </span>
        </header>

        {!complete ? (
          <>
            <section
              className="relative min-h-72 cursor-grab rounded-3xl border border-slate-700 bg-slate-900 p-7 shadow-2xl select-none"
              style={{ transform: `translateX(${dragX}px) rotate(${dragX / 25}deg)` }}
              onPointerDown={(event) => { pointerStart.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={(event) => { if (pointerStart.current !== null) setDragX(event.clientX - pointerStart.current); }}
              onPointerUp={() => {
                if (dragX > 80) void choose("yes");
                else if (dragX < -80) void choose("no");
                else setDragX(0);
                pointerStart.current = null;
              }}
            >
              {stamp && <span className={`absolute right-5 top-5 rounded border px-3 py-1 text-lg font-black ${stamp === "YES" ? "border-emerald-400 text-emerald-300" : "border-slate-400 text-slate-300"}`}>{stamp}</span>}
              <span className="text-xs font-bold uppercase text-slate-400">{card.category}</span>
              <h2 className="mt-6 text-2xl font-bold leading-tight">{card.question}</h2>
              <p className="mt-5 text-sm leading-6 text-slate-300">{card.helper}</p>
              <p className="absolute bottom-5 text-xs text-slate-500">Card {index + 1} of {CARDS.length}</p>
            </section>
            <div className="grid grid-cols-3 gap-3">
              <button type="button" onClick={() => void choose("no")} className="rounded-xl border border-red-900 bg-red-950 px-3 py-4 font-bold text-red-200">No</button>
              <button type="button" onClick={() => void choose("skip")} className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-4 text-sm text-slate-300">Skip / Prefer not to say</button>
              <button type="button" onClick={() => void choose("yes")} className="rounded-xl border border-emerald-700 bg-emerald-700 px-3 py-4 font-bold text-white">Yes</button>
            </div>
          </>
        ) : (
          <section className="rounded-3xl border border-emerald-800 bg-slate-900 p-8 text-center">
            <h2 className="text-2xl font-bold">Your matches are ready</h2>
            <p className="mt-2 text-sm text-slate-300">{matchCount} grants are available based on your profile and preferences.</p>
            <a href="/" className="mt-6 inline-flex rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white">View My Matches</a>
          </section>
        )}
      </div>
    </main>
  );
}
