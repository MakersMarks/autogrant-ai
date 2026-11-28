import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Logo } from "./Logo";
import { trackLovableEvent } from "@/lib/lovable-error-reporting";

const GOOGLE_G = (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
    />
  </svg>
);

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const social = async (provider: "google" | "apple") => {
    setError("");
    const r = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (r.error) setError(r.error.message ?? "Sign-in failed.");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (mode === "signup" && password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      else {
        trackLovableEvent("sign_up_completed");
        if (!data.session) setInfo("Check your email to confirm your account, then log in.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setBusy(false);
  };

  const input =
    "w-full bg-background border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-primary";
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="bg-card border border-border p-8 rounded-2xl max-w-md w-full space-y-6 shadow-2xl">
        <div className="text-center flex flex-col items-center gap-2">
          <Logo />
          <p className="text-xs text-muted-foreground">Autonomous Grant Web Platform</p>
        </div>
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded-lg font-semibold">
            {error}
          </div>
        )}
        {info && (
          <div className="p-3 bg-success/10 border border-success/30 text-success text-xs rounded-lg font-semibold">
            {info}
          </div>
        )}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => social("google")}
            style={{ background: "#131314", color: "#E3E3E3", border: "1px solid #8E918F" }}
            className="w-full h-11 px-3 rounded-xl flex items-center justify-center gap-[10px] text-sm font-medium"
          >
            {GOOGLE_G}
            <span>Continue with Google</span>
          </button>
          <button
            type="button"
            onClick={() => social("apple")}
            style={{ background: "#FFFFFF", color: "#000000" }}
            className="w-full h-11 rounded-xl flex items-center justify-center text-[17px] font-medium"
          >
            Continue with Apple
          </button>
        </div>
        <div className="flex items-center">
          <div className="flex-grow border-t border-border" />
          <span className="px-3 text-xs text-muted-foreground uppercase">Or email</span>
          <div className="flex-grow border-t border-border" />
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1 font-semibold uppercase">
              Email Address
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="founder@company.com"
              className={input}
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1 font-semibold uppercase">
              Password
            </span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </label>
          {mode === "signup" && (
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1 font-semibold uppercase">
                Confirm Password
              </span>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={input}
              />
            </label>
          )}
          <button
            disabled={busy}
            type="submit"
            className="w-full py-3.5 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider rounded-xl hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
          </button>
        </form>
        <div className="text-center">
          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
              setInfo("");
            }}
            className="text-xs text-primary hover:underline"
          >
            {mode === "login" ? "Need an account? Sign Up" : "Already have an account? Log In"}
          </button>
        </div>
      </div>
    </div>
  );
}
