"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { saveAnswers, submitAnswers } from "@/app/actions/task";
import {
  QUESTIONS,
  missingAnswers,
  emptyCount,
  emptyMilestone,
  type Answers,
  type Milestone,
  type Risk,
} from "@/lib/questionnaire";

function relativeTime(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
}

/** One numbered question, with its guidance and whatever control it needs. */
function Q({ n, children }: { n: number; children: React.ReactNode }) {
  const q = QUESTIONS[n - 1];
  return (
    <div className="card pad" style={{ marginBottom: 12 }}>
      <div className="row" style={{ alignItems: "baseline" }}>
        <span className="lab" style={{ width: 20, flex: "none" }}>{q.n}</span>
        <div style={{ flex: 1 }}>
          <div className="name" style={{ fontSize: 14.5 }}>
            {q.label}
            {!q.required && <span className="lab" style={{ marginLeft: 8 }}>optional</span>}
          </div>
          <div className="desc" style={{ marginBottom: 10 }}>{q.help}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function PlanForm({
  token,
  initiative,
  initial,
  submitted,
  message,
  who,
  savedAt,
}: {
  token: string;
  initiative: {
    title: string;
    description: string;
    rank: number;
    outOf: number;
    sumTotal: number;
    linkedObjective: string | null;
  };
  savedAt: Date | null;
  initial: Answers;
  submitted: boolean;
  message: string | null;
  who: string;
}) {
  const [a, setA] = useState<Answers>(initial);
  const latest = useRef<Answers>(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(submitted);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [savedTime, setSavedTime] = useState<Date | null>(savedAt);
  const [, setTick] = useState(0);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // one slow tick so "saved 2 minutes ago" does not sit frozen at "just now"
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const lastSaved = savedTime ? relativeTime(savedTime) : null;

  // Plain function: the React Compiler memoizes this, and a manual useCallback
  // here only fights it.
  const autosave = (next: Answers) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaved("saving");
      await saveAnswers(token, next);
      setSaved("saved");
      setSavedTime(new Date());
    }, 900);
  };

  /**
   * Functional update, not `{...a, ...p}` — two edits landing in the same
   * React batch would otherwise both build on the same stale snapshot and the
   * second would silently discard the first. The autosave reads the merged
   * value from inside the updater for the same reason.
   */
  const patch = (p: Partial<Answers>) => {
    setA((prev) => {
      const next = { ...prev, ...p };
      latest.current = next;
      autosave(next);
      return next;
    });
    setError(null);
  };

  if (done) {
    return (
      <div className="card pad" style={{ textAlign: "center", padding: 52 }}>
        <h1 className="title" style={{ fontSize: 26 }}>Sent — thank you</h1>
        <p className="sub" style={{ margin: "10px auto 0", maxWidth: "46ch" }}>
          Your plan for <strong>{initiative.title}</strong> has gone to the project admin.
        </p>
        <p className="lab" style={{ marginTop: 20 }}>
          Ask the admin to reopen it if something needs changing.
        </p>
      </div>
    );
  }

  const left = emptyCount(a);
  const blocking = missingAnswers(a).length;

  /**
   * Row editors merge from the previous state too — editing two cells of the
   * same milestone in quick succession must not lose the first.
   */
  const patchRow = <K extends "milestones" | "risks" | "metrics">(
    key: K,
    i: number,
    update: (row: NonNullable<Answers[K]>[number]) => NonNullable<Answers[K]>[number],
  ) => {
    setA((prev) => {
      const list = [...((prev[key] ?? []) as NonNullable<Answers[K]>)];
      list[i] = update(list[i]);
      const next = { ...prev, [key]: list } as Answers;
      latest.current = next;
      autosave(next);
      return next;
    });
    setError(null);
  };

  const setMilestone = (i: number, p: Partial<Milestone>) =>
    patchRow("milestones", i, (row) => ({ ...(row as Milestone), ...p }));

  const setRisk = (i: number, p: Partial<Risk>) =>
    patchRow("risks", i, (row) => ({ ...(row as Risk), ...p }));

  const setMetric = (i: number, value: string) => patchRow("metrics", i, () => value);

  return (
    <>
      <h1 className="title">{initiative.title}</h1>
      <p className="sub">
        You have been asked to build the scope and success plan for this initiative. Ten
        questions. Save as you go — nothing is shared with the admin until you submit.
      </p>

      {message && (
        <div className="note" style={{ marginTop: 16, fontStyle: "italic" }}>&ldquo;{message}&rdquo;</div>
      )}

      <div className="provenance">
        <div className="lab">From the long list</div>
        <p>
          {initiative.description}
          {initiative.linkedObjective && (
            <> {" · "}Linked objective: {initiative.linkedObjective}.</>
          )}
          {" · "}Ranked {initiative.rank} of {initiative.outOf}, total score {initiative.sumTotal}.
        </p>
      </div>

      <Q n={1}>
        <textarea rows={4} value={a.description ?? ""} placeholder="What it is, and why it is worth doing now…"
          onChange={(e) => patch({ description: e.target.value })} />
      </Q>

      <Q n={2}>
        <textarea rows={3} value={a.alignment ?? ""} placeholder="The business objective this moves, and how…"
          onChange={(e) => patch({ alignment: e.target.value })} />
      </Q>

      <Q n={3}>
        <input type="text" value={a.owner ?? ""} placeholder="Name"
          onChange={(e) => patch({ owner: e.target.value })} />
      </Q>

      <Q n={4}>
        <textarea rows={3} value={a.team ?? ""} placeholder="Who executes, who advises, who holds the information…"
          onChange={(e) => patch({ team: e.target.value })} />
      </Q>

      <Q n={5}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th style={{ width: 24 }} />
                <th>Milestone</th>
                <th style={{ width: 140 }}>Finish line</th>
                <th style={{ width: 150 }}>Milestone leader</th>
                <th>Definition of done</th>
              </tr>
            </thead>
            <tbody>
              {(a.milestones ?? []).map((m, i) => (
                <tr key={i}>
                  <td className="lab">{i + 1}</td>
                  <td>
                    <input type="text" value={m.what} placeholder="What gets finished"
                      onChange={(e) => setMilestone(i, { what: e.target.value })}
                      className="inline-edit"
                      style={{ fontSize: 13 }} />
                  </td>
                  <td>
                    <input type="date" value={m.date}
                      onChange={(e) => setMilestone(i, { date: e.target.value })}
                      className="inline-edit"
                      style={{ fontSize: 12.5 }} />
                  </td>
                  <td>
                    <input type="text" value={m.leader} placeholder="Name"
                      onChange={(e) => setMilestone(i, { leader: e.target.value })}
                      className="inline-edit"
                      style={{ fontSize: 12.5 }} />
                  </td>
                  <td>
                    <input type="text" value={m.done} placeholder="The test for done"
                      onChange={(e) => setMilestone(i, { done: e.target.value })}
                      className="inline-edit"
                      style={{ fontSize: 12.5 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(a.milestones ?? []).length < 6 && (
          <button className="dash" style={{ marginTop: 8 }}
            onClick={() => patch({ milestones: [...(a.milestones ?? []), emptyMilestone()] })}>
            + Add milestone ({6 - (a.milestones ?? []).length} more allowed)
          </button>
        )}
      </Q>

      <Q n={6}>
        <input type="date" value={a.golive ?? ""} style={{ maxWidth: 200 }}
          onChange={(e) => patch({ golive: e.target.value })} />
      </Q>

      <Q n={7}>
        {(a.metrics ?? []).map((m, i) => (
          <div key={i} className="row" style={{ marginBottom: 7 }}>
            <span className="lab" style={{ width: 16 }}>{i + 1}</span>
            <input type="text" value={m} placeholder="Specific, measurable, time-bound"
              onChange={(e) => setMetric(i, e.target.value)} />
          </div>
        ))}
      </Q>

      <Q n={8}>
        <textarea rows={3} value={a.resources ?? ""}
          placeholder="People and effort. Budget and amount. Managerial capacity."
          onChange={(e) => patch({ resources: e.target.value })} />
      </Q>

      <Q n={9}>
        {(a.risks ?? []).map((r, i) => {
          // A row with a likelihood or a counter-measure but no risk named is
          // the one that silently blocked submission, so it says so here
          // rather than only in the error at the bottom of the page.
          const started = Boolean(r.likelihood || r.counter.trim());
          const needsRisk = started && !r.risk.trim();
          return (
            <div key={i} className="card pad" style={{ padding: "13px 15px", marginBottom: 8 }}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <span className="lab" style={{ width: 16, paddingTop: 22 }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <label className="lab" htmlFor={`risk-${i}`}>What could go wrong</label>
                  <input
                    id={`risk-${i}`}
                    type="text"
                    value={r.risk}
                    placeholder="Name the risk"
                    onChange={(e) => setRisk(i, { risk: e.target.value })}
                    style={
                      needsRisk
                        ? { fontSize: 13, borderColor: "var(--danger)" }
                        : { fontSize: 13 }
                    }
                  />
                  {needsRisk && (
                    <div className="lab" style={{ color: "var(--danger)", marginTop: 4 }}>
                      Name the risk itself — the rest of this row is filled in.
                    </div>
                  )}

                  <div className="row" style={{ marginTop: 10, alignItems: "flex-end" }}>
                    <div style={{ width: 140, flex: "none" }}>
                      <label className="lab" htmlFor={`likelihood-${i}`}>Likelihood</label>
                      <select
                        id={`likelihood-${i}`}
                        value={r.likelihood}
                        onChange={(e) => setRisk(i, { likelihood: e.target.value })}
                        style={{ fontSize: 12.5, padding: "8px 9px" }}
                      >
                        <option value="">Choose…</option>
                        <option value="Low">Low</option>
                        <option value="Moderate">Moderate</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="lab" htmlFor={`counter-${i}`}>Counter-measure</label>
                      <input
                        id={`counter-${i}`}
                        type="text"
                        value={r.counter}
                        placeholder="What you will do about it, in one line"
                        onChange={(e) => setRisk(i, { counter: e.target.value })}
                        style={{ fontSize: 12.5, padding: "8px 9px" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </Q>

      <Q n={10}>
        <textarea rows={3} value={a.extra ?? ""}
          placeholder="Anything that would strengthen this but was not asked about above."
          onChange={(e) => patch({ extra: e.target.value })} />
      </Q>

      {error && <div className="err" style={{ marginTop: 14 }}>{error}</div>}

      <div className="card pad row" style={{ marginTop: 18 }}>
        <div>
          <div className="name">
            {saved === "saving" ? "Saving…" : lastSaved ? `Draft saved ${lastSaved}` : "Saves as you type"}
          </div>
          <div className="desc">
            {left === 0
              ? "All ten answered. You can still change anything before you submit."
              : `${left} of ${QUESTIONS.length} questions still empty.` +
                (blocking === 0 ? " Only the optional one — you can submit." : "")}
          </div>
        </div>
        <span className="spread" />
        <button className="btn" disabled={pending}
          onClick={() => startTransition(async () => { setSaved("saving"); await saveAnswers(token, latest.current); setSaved("saved"); setSavedTime(new Date()); })}>
          Save draft
        </button>
        <button className="btn pri" disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await submitAnswers(token, latest.current);
              if (res.error) setError(res.error);
              else setDone(true);
            })
          }>
          {pending ? "Sending…" : "Submit"}
        </button>
      </div>

      <p className="lab" style={{ marginTop: 14, textAlign: "center" }}>
        Writing as {who}. BDMF — a method and a tool from OZ Global B2B.
      </p>
    </>
  );
}
