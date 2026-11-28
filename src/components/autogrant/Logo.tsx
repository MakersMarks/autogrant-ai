export function Logo({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`${small ? "w-8 h-8 text-lg" : "w-11 h-11 text-2xl"} rounded-xl bg-primary flex items-center justify-center font-display font-bold text-primary-foreground`}
      >
        A»
      </div>
      <span className={`${small ? "text-xl" : "text-2xl"} font-display font-bold`}>
        AUTOGRANT<span className="text-primary">.AI</span>
      </span>
    </div>
  );
}
