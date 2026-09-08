"use client";

import { useState, useTransition } from "react";
import { inviteToScore, type InviteResult } from "@/app/actions/longlist";

/**
 * Figma-style invitation: type or paste addresses, they become chips, send once.
 */
export function InvitePanel({
  projectId,
  disabled,
  disabledReason,
}: {
  projectId: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [pending, startTransition] = useTransition();

  const commit = (raw: string) => {
    const parts = raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (parts.length) setEmails((e) => [...new Set([...e, ...parts])]);
    setDraft("");
  };

  const close = () => {
    setOpen(false);
    setResult(null);
    setEmails([]);
    setDraft("");
    setMessage("");
  };

  return (
    <>
      <button
        className="btn pri"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => setOpen(true)}
      >
        Invite people to score
      </button>

      {open && (
        <div className="backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="modal">
            {result ? (
              <>
                <h2 className="title" style={{ fontSize: 20 }}>
                  {result.sent.length
                    ? `${result.sent.length} ${result.sent.length === 1 ? "invitation" : "invitations"} sent`
                    : "Nothing sent"}
                </h2>
                {result.error && <div className="err" style={{ marginTop: 14 }}>{result.error}</div>}
                {result.sent.length > 0 && (
                  <>
                    <p className="sub">
                      Each person gets a link that opens the scoring page and nothing else. The long
                      list is now locked, so everyone scores the same version.
                    </p>
                    <div className="row" style={{ flexWrap: "wrap", gap: 7, marginTop: 14 }}>
                      {result.sent.map((e) => <span key={e} className="chip">{e}</span>)}
                    </div>
                  </>
                )}
                {result.skipped.length > 0 && (
                  <div className="note warn" style={{ marginTop: 14 }}>
                    Skipped: {result.skipped.map((s) => `${s.email} (${s.why})`).join(", ")}
                  </div>
                )}
                <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
                  <button className="btn pri" onClick={close}>Done</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="title" style={{ fontSize: 20 }}>Invite people to score</h2>
                <p className="sub">
                  They will see the long list and the criteria — nothing else about the project, and
                  never each other&apos;s scores.
                </p>

                <div className="card pad" style={{ marginTop: 16, padding: "10px 12px" }}>
                  <div className="row" style={{ flexWrap: "wrap", gap: 7 }}>
                    {emails.map((e) => (
                      <span key={e} className="chip">
                        {e}
                        <button onClick={() => setEmails((list) => list.filter((x) => x !== e))}>✕</button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={draft}
                      autoFocus
                      placeholder={emails.length ? "Add another…" : "name@company.com, paste several at once"}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/[,;\s]$/.test(v)) commit(v);
                        else setDraft(v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commit(draft); }
                        if (e.key === "Backspace" && !draft) setEmails((l) => l.slice(0, -1));
                      }}
                      onBlur={() => commit(draft)}
                      style={{ border: 0, padding: 4, boxShadow: "none", flex: 1, minWidth: 180 }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <label className="lab" htmlFor="inv-msg">A note, if it helps (optional)</label>
                  <textarea
                    id="inv-msg"
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Why you are asking them, and by when."
                  />
                </div>

                <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
                  <button className="btn" onClick={close}>Cancel</button>
                  <button
                    className="btn pri"
                    disabled={pending || (!emails.length && !draft.trim())}
                    onClick={() => {
                      const all = draft.trim() ? [...emails, draft.trim().toLowerCase()] : emails;
                      startTransition(async () => {
                        setResult(await inviteToScore(projectId, all, message));
                      });
                    }}
                  >
                    {pending ? "Sending…" : `Send ${emails.length + (draft.trim() ? 1 : 0) || ""}`.trim()}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
