import { useMemo, useRef, useState } from "react";
import { useSmartYesNoQuiz } from "@/hooks/useSmartYesNoQuiz";

export function SmartMatchQuiz() {
  const {
    answer,
    currentQuestion,
    goBack,
    index,
    loading,
    matchCount,
    matchCountError,
    questionCount,
    saving,
  } = useSmartYesNoQuiz();
  const [dragX, setDragX] = useState(0);
  const pointerStart = useRef<number | null>(null);

  const stamp = useMemo(() => {
    if (dragX > 20) return "YES";
    if (dragX < -20) return "NO";
    return "";
  }, [dragX]);

  const finishSwipe = (clientX: number) => {
    if (pointerStart.current === null) return;
    const distance = clientX - pointerStart.current;
    pointerStart.current = null;
    setDragX(0);
    if (distance > 80) void answer("yes");
    else if (distance < -80) void answer("no");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Loading your saved quiz profile…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Smart Match Quiz</p>
            <h1 className="mt-1 text-2xl font-bold">Discover grants that fit you</h1>
          </div>
          <span className="rounded-full border border-emerald-700 bg-emerald-950 px-3 py-1 text-xs font-bold text-emerald-200">
            {matchCount} matching grants
          </span>
        </header>

        {matchCountError && (
          <p role="status" className="text-xs text-amber-300">
            {matchCountError}
          </p>
        )}

        {currentQuestion ? (
          <>
            <section
              aria-labelledby="smart-match-question"
              className="relative min-h-72 touch-pan-y select-none rounded-3xl border border-slate-700 bg-slate-900 p-7 shadow-2xl"
              style={{ transform: `translateX(${dragX}px) rotate(${dragX / 25}deg)` }}
              onPointerDown={(event) => {
                if (saving) return;
                pointerStart.current = event.clientX;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (pointerStart.current !== null) setDragX(event.clientX - pointerStart.current);
              }}
              onPointerUp={(event) => finishSwipe(event.clientX)}
              onPointerCancel={(event) => finishSwipe(event.clientX)}
            >
              {stamp && (
                <span
                  className={`absolute right-5 top-5 rounded border px-3 py-1 text-lg font-black ${
                    stamp === "YES"
                      ? "border-emerald-400 text-emerald-300"
                      : "border-slate-400 text-slate-300"
                  }`}
                >
                  {stamp}
                </span>
              )}
              <span className="text-xs font-bold uppercase text-slate-400">
                {currentQuestion.category}
              </span>
              <h2 id="smart-match-question" className="mt-6 text-2xl font-bold leading-tight">
                {currentQuestion.question}
              </h2>
              <p className="mt-5 text-sm leading-6 text-slate-300">{currentQuestion.helper}</p>
              <p className="absolute bottom-5 text-xs text-slate-500">
                Question {index + 1} of {questionCount}
              </p>
            </section>

            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void answer("no")}
                className="rounded-xl border border-red-900 bg-red-950 px-3 py-4 font-bold text-red-200 disabled:opacity-50"
              >
                No
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void answer("skip")}
                className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-4 text-sm text-slate-300 disabled:opacity-50"
              >
                Skip / Prefer not to say
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void answer("yes")}
                className="rounded-xl border border-emerald-700 bg-emerald-700 px-3 py-4 font-bold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Yes"}
              </button>
            </div>
            <button
              type="button"
              disabled={index === 0 || saving}
              onClick={goBack}
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 disabled:opacity-40"
            >
              Back
            </button>
          </>
        ) : (
          <section className="rounded-3xl border border-emerald-800 bg-slate-900 p-8 text-center">
            <h2 className="text-2xl font-bold">Your matches are ready</h2>
            <p className="mt-2 text-sm text-slate-300">
              {matchCount} grants match your saved profile and quiz answers.
            </p>
            <a
              href="/"
              className="mt-6 inline-flex rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white"
            >
              View My Matches
            </a>
          </section>
        )}
      </div>
    </main>
  );
}
