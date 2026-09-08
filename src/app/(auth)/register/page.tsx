"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register, type AuthState } from "../actions";

export default function RegisterPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(register, {});

  return (
    <div className="centered">
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div className="brand" style={{ marginBottom: 22 }}>BDMF</div>
        <h1 className="title" style={{ fontSize: 24 }}>Create your workspace</h1>
        <p className="sub">
          Your workspace is yours alone. Nobody outside it — including other BDMF customers — can
          see your projects or the people in them.
        </p>

        <form action={action} className="card pad stack" style={{ marginTop: 20 }}>
          {state.error && <div className="err">{state.error}</div>}
          <div>
            <label className="lab" htmlFor="name">Your name</label>
            <input id="name" name="name" type="text" autoComplete="name" required autoFocus />
          </div>
          <div>
            <label className="lab" htmlFor="company">Company</label>
            <input id="company" name="company" type="text" autoComplete="organization" required
              placeholder="The client company this workspace is for" />
          </div>
          <div>
            <label className="lab" htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label className="lab" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required
              minLength={10} />
            <p className="desc">At least 10 characters.</p>
          </div>
          <button className="btn pri" type="submit" disabled={pending} style={{ width: "100%" }}>
            {pending ? "Creating…" : "Create workspace"}
          </button>
        </form>

        <p className="desc" style={{ marginTop: 16, textAlign: "center" }}>
          Already have an account? <Link href="/login" style={{ color: "var(--accent)" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
