"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthState } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});

  return (
    <div className="centered">
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div className="brand" style={{ marginBottom: 22 }}>BDMF</div>
        <h1 className="title" style={{ fontSize: 24 }}>Sign in</h1>
        <p className="sub">Business-Driven Marketing Focus.</p>

        <form action={action} className="card pad stack" style={{ marginTop: 20 }}>
          {state.error && <div className="err">{state.error}</div>}
          <div>
            <label className="lab" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>
          <div>
            <label className="lab" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn pri" type="submit" disabled={pending} style={{ width: "100%" }}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="desc" style={{ marginTop: 16, textAlign: "center" }}>
          No account yet? <Link href="/register" style={{ color: "var(--accent)" }}>Create a workspace</Link>
        </p>
        <p className="lab" style={{ marginTop: 26, textAlign: "center" }}>
          A method and a tool from OZ Global B2B.
        </p>
      </div>
    </div>
  );
}
