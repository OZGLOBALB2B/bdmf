"use client";

import { useActionState } from "react";
import { resendVerification, type ResendState } from "./actions";

export function ResendButton() {
  const [state, action, pending] = useActionState<ResendState, FormData>(
    async () => resendVerification(),
    {},
  );

  return (
    <form action={action}>
      {state.error && <div className="err" style={{ marginBottom: 12 }}>{state.error}</div>}
      {state.message && (
        <div className="note" style={{ marginBottom: 12 }}>{state.message}</div>
      )}
      <button className="btn pri" type="submit" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Sending…" : "Send the link again"}
      </button>
    </form>
  );
}
