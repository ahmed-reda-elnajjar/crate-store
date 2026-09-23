"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { signIn, signOut, toast, useStore } from "@/lib/store";

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}

/** 4a Sign in · customer and admin accounts share one form; the role decides where you land. */
function SignIn() {
  const s = useStore();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const go = (role: string) => {
    // Only follow same-site paths from ?next=.
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    if (role === "admin") router.push(safe?.startsWith("/admin") ? safe : "/admin");
    else router.push(safe && !safe.startsWith("/admin") ? safe : "/");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Enter a valid email address.");
    if (pw.length < 6) return setErr("Passwords are at least 6 characters.");
    if (mode === "up" && !name.trim()) return setErr("Tell us your name.");
    setErr(null);
    go(signIn(email, mode === "up" ? name.trim() : undefined));
  };

  const demo = (addr: string) => go(signIn(addr));
  const role = s.session.role;

  return (
    <main className="auth">
      <div className="poster">
        <Link href="/" className="brand" style={{ color: "inherit", marginBottom: "auto" }}>CRATE</Link>
        <span className="display">{mode === "in" ? "SIGN IN" : "JOIN"}</span>
        <p>Members get early access to drops, order tracking and a saved fit profile.</p>
      </div>
      <form className="form" onSubmit={submit} noValidate>
        <div className="seg only-d" style={{ alignSelf: "flex-start" }}>
          <label className="seg-opt"><input type="radio" name="mode" checked={mode === "in"} onChange={() => setMode("in")} /><span>Sign in</span></label>
          <label className="seg-opt"><input type="radio" name="mode" checked={mode === "up"} onChange={() => setMode("up")} /><span>Create account</span></label>
        </div>
        {mode === "up" && (
          <div className="field"><label htmlFor="name">Name</label><input id="name" className="input h48" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
        )}
        <div className="field"><label htmlFor="email">Email</label><input id="email" className="input h48" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label htmlFor="pw">Password</label>
            {mode === "in" && <button type="button" className="unbtn u" style={{ fontSize: 13 }} onClick={() => toast("Password reset needs the real backend.")}>Forgot?</button>}
          </div>
          <input id="pw" className="input h48" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
        </div>
        {err && <span className="err-msg" role="alert">{err}</span>}
        <button type="submit" className="btn btn-primary row h56"><span>{mode === "in" ? "Sign in" : "Create account"}</span><span>→</span></button>
        <div className="socials" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button type="button" className="btn btn-secondary h48 google" style={{ justifyContent: "flex-start" }} onClick={() => toast("Google sign-in isn't connected in this demo.")}>Continue with Google</button>
          <button type="button" className="btn btn-secondary h48" style={{ justifyContent: "flex-start" }} onClick={() => toast("Apple sign-in isn't connected in this demo.")}>Continue with Apple</button>
        </div>
        <div className="bt" style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="label">Demo accounts</span>
          <div className="demo">
            <button type="button" className={`pick ${role === "customer" ? "on" : ""}`} onClick={() => demo("sam@example.com")}><b>Customer</b><span>sam@example.com</span></button>
            <button type="button" className={`pick ${role === "admin" ? "on" : ""}`} onClick={() => demo("admin@crate.store")}><b>Admin</b><span>admin@crate.store</span></button>
          </div>
          <span style={{ fontSize: 13 }}>
            Signed in as: <b>{role === "admin" ? "Admin" : role === "customer" ? "Customer" : "Guest (not signed in)"}</b>
            {role !== "guest" && <> · <button type="button" className="unbtn u" onClick={signOut}>Sign out</button></>}
          </span>
          <span className="only-m" style={{ fontSize: 13 }}>
            {mode === "in" ? <>No account? <button type="button" className="unbtn u" onClick={() => setMode("up")}>Create one</button></> : <>Have an account? <button type="button" className="unbtn u" onClick={() => setMode("in")}>Sign in</button></>}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>Demo only: any password of 6+ characters works, and roles are set by email. Real sign-in needs the backend.</span>
        </div>
      </form>
    </main>
  );
}
