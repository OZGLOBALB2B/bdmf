"use client";

import { useState, useRef, useTransition, useCallback } from "react";
import {
  saveDirectionItem,
  addDirectionItem,
  deleteDirectionItem,
  moveDirectionItem,
  directionItemUsage,
} from "@/app/actions/direction";

export type Item = {
  id: string;
  title: string;
  body: string;
  position: number;
  subs: { id: string; title: string; body: string; position: number }[];
};

/** Autosaves 700ms after typing stops, and immediately on blur. */
function useAutosave(projectId: string, itemId: string, onState: (s: SaveState) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ title?: string; body?: string }>({});

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    onState("saving");
    try {
      await saveDirectionItem(projectId, itemId, patch);
      onState("saved");
    } catch {
      onState("error");
    }
  }, [projectId, itemId, onState]);

  const queue = useCallback(
    (patch: { title?: string; body?: string }) => {
      pending.current = { ...pending.current, ...patch };
      onState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush, onState],
  );

  return { queue, flush };
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function ItemCard({
  projectId,
  item,
  index,
  count,
  locked,
  numberPrefix,
}: {
  projectId: string;
  item: Item;
  index: number;
  count: number;
  locked: boolean;
  numberPrefix: string;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [, startTransition] = useTransition();
  const { queue, flush } = useAutosave(projectId, item.id, setState);

  const askDelete = async () => {
    const used = await directionItemUsage(projectId, item.id);
    setConfirming(used);
  };

  return (
    <div className="card pad" style={{ padding: "15px 17px", marginBottom: 10 }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span className="lab" style={{ paddingTop: 3, width: 20, flex: "none" }}>
          {numberPrefix}
        </span>
        <input
          type="text"
          defaultValue={item.title}
          disabled={locked}
          placeholder="Give it a name"
          onChange={(e) => queue({ title: e.target.value })}
          onBlur={flush}
          className="inline-edit"
          style={{ fontWeight: 500, fontSize: 14 }}
        />
        {!locked && (
          <>
            <span className="lab" style={{ minWidth: 46, textAlign: "right" }}>
              {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Failed" : ""}
            </span>
            <button
              className="btn sm ghost"
              title="Move up"
              disabled={index === 0}
              onClick={() => startTransition(() => void moveDirectionItem(projectId, item.id, -1))}
            >↑</button>
            <button
              className="btn sm ghost"
              title="Move down"
              disabled={index === count - 1}
              onClick={() => startTransition(() => void moveDirectionItem(projectId, item.id, 1))}
            >↓</button>
            <button className="btn sm ghost danger" onClick={askDelete}>Remove</button>
          </>
        )}
      </div>

      <textarea
        rows={2}
        defaultValue={item.body}
        disabled={locked}
        placeholder="A sentence or two on what it means"
        onChange={(e) => queue({ body: e.target.value })}
        onBlur={flush}
        className="inline-edit"
        style={{ marginTop: 5, color: "var(--muted)", fontSize: 12.5 }}
      />

      {item.subs.length > 0 && (
        <div style={{ paddingLeft: 14, borderLeft: "2px solid var(--hair)", marginTop: 8 }}>
          {item.subs.map((s, j) => (
            <SubItem
              key={s.id}
              projectId={projectId}
              sub={s}
              label={`${numberPrefix}${j + 1}`}
              locked={locked}
            />
          ))}
        </div>
      )}

      {!locked && (
        <button
          className="btn sm ghost"
          style={{ marginTop: 6 }}
          onClick={() => startTransition(() => void addDirectionItem(projectId, "initiative", item.id))}
        >
          + Add a sub-item
        </button>
      )}

      {confirming && (
        <div className="backdrop" onClick={(e) => e.target === e.currentTarget && setConfirming(null)}>
          <div className="modal">
            <h2 className="title" style={{ fontSize: 19 }}>Remove “{item.title || "this item"}”?</h2>
            {confirming.length > 0 ? (
              <div className="note warn" style={{ marginTop: 14 }}>
                {confirming.length} long-list {confirming.length === 1 ? "row is" : "rows are"} linked
                to this: {confirming.join(", ")}. Removing it leaves {confirming.length === 1 ? "that row" : "those rows"} without
                a stated business objective.
              </div>
            ) : (
              <p className="sub" style={{ marginTop: 10 }}>Nothing downstream refers to it yet.</p>
            )}
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn" onClick={() => setConfirming(null)}>Keep it</button>
              <button
                className="btn pri"
                onClick={() => {
                  setConfirming(null);
                  startTransition(() => void deleteDirectionItem(projectId, item.id));
                }}
              >Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubItem({
  projectId,
  sub,
  label,
  locked,
}: {
  projectId: string;
  sub: { id: string; title: string; body: string };
  label: string;
  locked: boolean;
}) {
  const [, setState] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const { queue, flush } = useAutosave(projectId, sub.id, setState);

  return (
    <div className="row" style={{ margin: "3px 0", alignItems: "flex-start" }}>
      <span className="lab" style={{ paddingTop: 4, flex: "none" }}>{label}</span>
      <input
        type="text"
        defaultValue={sub.title}
        disabled={locked}
        placeholder="Sub-initiative"
        onChange={(e) => queue({ title: e.target.value })}
        onBlur={flush}
        className="inline-edit"
        style={{ fontSize: 12.5, color: "var(--muted)" }}
      />
      {!locked && (
        <button
          className="btn sm ghost danger"
          onClick={() => startTransition(() => void deleteDirectionItem(projectId, sub.id))}
        >✕</button>
      )}
    </div>
  );
}

export function DirectionEditor({
  projectId,
  objectives,
  initiatives,
  locked,
}: {
  projectId: string;
  objectives: Item[];
  initiatives: Item[];
  locked: boolean;
}) {
  const [, startTransition] = useTransition();

  return (
    <div className="grid2">
      <section>
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Business objectives</h2>
          <span className="tag">{objectives.length}</span>
        </div>
        <p className="desc" style={{ marginBottom: 12 }}>
          Two or three targets the company is measured on. In the Spectrum case these were the growth
          rate, the EBITDA date, and that growth had to be organic.
        </p>
        {objectives.map((o, i) => (
          <ItemCard
            key={o.id}
            projectId={projectId}
            item={o}
            index={i}
            count={objectives.length}
            locked={locked}
            numberPrefix={`${i + 1}`}
          />
        ))}
        {!locked && (
          <button
            className="dash"
            onClick={() => startTransition(() => void addDirectionItem(projectId, "objective"))}
          >
            Add an objective
          </button>
        )}
      </section>

      <section>
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Strategic initiatives</h2>
          <span className="tag">{initiatives.length}</span>
        </div>
        <p className="desc" style={{ marginBottom: 12 }}>
          Five answers to one question: where will growth come from? Each can carry sub-items —
          1.1, 1.2 — when an initiative splits.
        </p>
        {initiatives.map((o, i) => (
          <ItemCard
            key={o.id}
            projectId={projectId}
            item={o}
            index={i}
            count={initiatives.length}
            locked={locked}
            numberPrefix={`${i + 1}.`}
          />
        ))}
        {!locked && (
          <button
            className="dash"
            onClick={() => startTransition(() => void addDirectionItem(projectId, "initiative"))}
          >
            Add an initiative
          </button>
        )}
      </section>
    </div>
  );
}
