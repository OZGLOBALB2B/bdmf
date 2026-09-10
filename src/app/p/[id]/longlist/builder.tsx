"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import {
  addLongListItem,
  saveLongListItem,
  deleteLongListItem,
  moveLongListItem,
} from "@/app/actions/longlist";

export type Row = {
  id: string;
  title: string;
  description: string;
  directionItemId: string | null;
};

export type DirectionOption = { id: string; label: string };

function Editable({
  projectId,
  row,
  index,
  count,
  options,
  locked,
}: {
  projectId: string;
  row: Row;
  index: number;
  count: number;
  options: DirectionOption[];
  locked: boolean;
}) {
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setSaved("saving");
    await saveLongListItem(projectId, row.id, patch);
    setSaved("saved");
  }, [projectId, row.id]);

  const queue = (patch: Record<string, unknown>) => {
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  return (
    <tr>
      <td className="lab" style={{ width: 26, verticalAlign: "top", paddingTop: 16 }}>{index + 1}</td>
      <td>
        <input
          type="text"
          defaultValue={row.title}
          disabled={locked}
          placeholder="Initiative name"
          onChange={(e) => queue({ title: e.target.value })}
          onBlur={flush}
          className="inline-edit"
          style={{ fontWeight: 500, fontSize: 13.5 }}
        />
        <textarea
          rows={1}
          defaultValue={row.description}
          disabled={locked}
          placeholder="One line on what it means"
          onChange={(e) => queue({ description: e.target.value })}
          onBlur={flush}
          className="inline-edit"
          style={{ marginTop: 2, color: "var(--muted)", fontSize: 12 }}
        />
      </td>
      <td style={{ width: 230 }}>
        <select
          defaultValue={row.directionItemId ?? ""}
          disabled={locked}
          onChange={(e) => {
            queue({ directionItemId: e.target.value || null });
            void flush();
          }}
          style={{ fontSize: 12.5, padding: "6px 8px" }}
        >
          <option value="">Not linked</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </td>
      <td style={{ width: 130, textAlign: "right" }}>
        <span className="lab" style={{ marginRight: 6 }}>
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}
        </span>
        {!locked && (
          <>
            <button className="btn sm ghost" disabled={index === 0}
              onClick={() => startTransition(() => void moveLongListItem(projectId, row.id, -1))}>↑</button>
            <button className="btn sm ghost" disabled={index === count - 1}
              onClick={() => startTransition(() => void moveLongListItem(projectId, row.id, 1))}>↓</button>
            <button className="btn sm ghost danger"
              onClick={() => startTransition(() => void deleteLongListItem(projectId, row.id))}>✕</button>
          </>
        )}
      </td>
    </tr>
  );
}

export function LongListBuilder({
  projectId,
  rows,
  options,
  locked,
}: {
  projectId: string;
  rows: Row[];
  options: DirectionOption[];
  locked: boolean;
}) {
  const [, startTransition] = useTransition();

  return (
    <>
      {rows.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>No long list yet</div>
          <p style={{ margin: "8px auto 0", maxWidth: "52ch" }}>
            This is the pool of candidate marketing initiatives that came out of the management
            meeting — read through the business strategy with a marketing lens. Ten to fifteen rows
            is normal.
          </p>
          {!locked && (
            <div style={{ marginTop: 18 }}>
              <button className="btn pri" onClick={() => startTransition(() => void addLongListItem(projectId))}>
                Add the first initiative
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th style={{ width: 26 }} />
                <th>Initiative</th>
                <th>Serves which objective</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Editable
                  key={r.id}
                  projectId={projectId}
                  row={r}
                  index={i}
                  count={rows.length}
                  options={options}
                  locked={locked}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!locked && rows.length > 0 && (
        <button
          className="dash"
          style={{ marginTop: 10 }}
          onClick={() => startTransition(() => void addLongListItem(projectId))}
        >
          Add an initiative
        </button>
      )}
    </>
  );
}
