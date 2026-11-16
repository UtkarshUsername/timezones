import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { canAccessApp, Link, retryAuth, SignInWithGoogle, signOut, useAuth } from "lakebed/client";
import { control, primary } from "./controls";
export function Gate({ children }: { children: ComponentChildren }) {
  const auth = useAuth();
  if (auth.isLoading) return <main className="p-6">Checking session…</main>;
  if (!canAccessApp()) return <main className="mx-auto max-w-xl p-6"><p role="alert">{auth.error || "Sign in to continue"}</p><button className="mr-3 underline" onClick={() => void retryAuth()}>Retry</button><SignInWithGoogle /></main>;
  return children;
}
export function Shell({ children, showAllPolls = true }: { children: ComponentChildren; showAllPolls?: boolean }) {
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  async function leaveAccount() {
    setSigningOut(true);
    setError("");
    try { await signOut(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not sign out"); }
    finally { setSigningOut(false); }
  }
  return <main className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "Verdana, Arial, Helvetica, sans-serif" }}>
    <div className="mx-auto max-w-[1100px] px-3 py-4">
      <nav className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 text-sm">
        <Link to="/" className="text-lg font-bold tracking-tight text-black">Timezones</Link>
        <div className="flex flex-wrap items-center gap-3">
          {showAllPolls && <Link to="/polls" className="py-2 text-slate-600 underline-offset-4 hover:text-[#0879bc] hover:underline">All polls</Link>}
          {auth.isSignedIn ? <><span className="text-xs text-slate-600">Signed in with Google</span><button type="button" className={control} disabled={signingOut} onClick={() => void leaveAccount()}>{signingOut ? "Signing out…" : "Sign out"}</button></> : <SignInWithGoogle className={control} />}
        </div>
      </nav>
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      {auth.isGuest && <p className="mb-4 text-xs text-slate-500">You can participate as a guest. Sign in to keep your polls and availability across devices.</p>}
      {children}
    </div>
  </main>;
}

export function PollAuthCallback() {
  return <Gate><Shell><p className="mb-3 text-sm">Your session is ready.</p><Link to="/polls" className={primary}>Continue to polls</Link></Shell></Gate>;
}
