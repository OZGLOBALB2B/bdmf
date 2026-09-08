"use client";

import { useState, useTransition } from "react";
import { assignToInitiative } from "@/app/actions/deepdive";

export function AssignBox({
  projectId,
  shortlistItemId,
  suggestions,
}: {
  projectId: string;
  shortlistItemId: string;
  suggestions: { email: string; name: string | null }[];
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = (email: string) => {
    if (!email.trim()) return;
    setDraft("");
    setOpen(false);
    startTransition(async () => {
      const res = await assignToInitiative(projectId, shortlistItemId, [email]);
      setError(res.error ?? (res.skipped[0] ? `${res.skipped[0].email} — ${res.skipped[0].why}` : null));
    });
  };

  const matches = suggestions.filter(
    (s) => !draft || s.email.includes(draft.toLowerCase()) || s.name?.toLowerCase().includes(draft.toLowerCase()),
  );

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <input
        type="text"
        value={draft}
        placeholder="Assign someone…"
        disabled={pending}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setDraft(e.target.value); setOpen(true); setError(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ width: 200, fontSize: 12.5, padding: "5px 9px" }}
      />
      {open && (matches.length > 0 || draft.includes("@")) && (
        <div
          className="card"
          style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, minWidth: 240, zIndex: 30, padding: 4 }}
        >
          {matches.slice(0, 6).map((s) => (
            <button
              key={s.email}
              className="rail-i"
              style={{ fontSize: 12.5, padding: "6px 8px" }}
              onMouseDown={(e) => { e.preventDefault(); add(s.email); }}
            >
              <span>
                <span className="name" style={{ fontSize: 12.5 }}>{s.name || s.email}</span>
                {s.name && <span className="lab" style={{ marginLeft: 6 }}>{s.email}</span>}
              </span>
            </button>
          ))}
          {draft.includes("@") && !matches.some((m) => m.email === draft.toLowerCase()) && (
            <button
              className="rail-i"
              style={{ fontSize: 12.5, padding: "6px 8px" }}
              onMouseDown={(e) => { e.preventDefault(); add(draft); }}
            >
              Invite <strong style={{ marginLeft: 4 }}>{draft}</strong>
            </button>
          )}
        </div>
      )}
      {error && <div className="lab" style={{ color: "var(--danger)", marginTop: 4 }}>{error}</div>}
    </div>
  );
}
