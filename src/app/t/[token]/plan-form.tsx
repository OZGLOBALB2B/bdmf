"use client";

import { useState, useTransition, useRef } from "react";
import { saveAnswers, submitAnswers } from "@/app/actions/task";
import {
  QUESTIONS,
  completion,
  emptyMilestone,
  type Answers,
  type Milestone,
  type Risk,
} from "@/lib/questionnaire";

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
  projectName,
  initiative,
  initial,
  submitted,
  message,
  who,
}: {
  token: string;
  projectName: string;
  initiative: { title: string; description: string };
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
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Plain function: the React Compiler memoizes this, and a manual useCallback
  // here only fights it.
  const autosave = (next: Answers) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaved("saving");
      await saveAnswers(token, next);
      setSaved("saved");
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

  const pct = Math.round(completion(a) * 100);

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
        This initiative made the shortlist for {projectName}. Ten questions on what it actually
        takes to do it — scope, milestones, what success looks like, and what could go wrong.
        {initiative.description && ` The list described it as: ${initiative.description}`}
      </p>

      {message && (
        <div className="note" style={{ marginTop: 16, fontStyle: "italic" }}>&ldquo;{message}&rdquo;</div>
      )}

      <div className="legend" style={{ margin: "20px 0 16px" }}>
        <span>{pct}% complete</span>
        <span className="spread" />
        <span>{saved === "saving" ? "Saving…" : saved === "saved" ? "Draft saved" : "Saves as you type"}</span>
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
                <th style={{ width: 150 }}>Who leads it</th>
                <th>Done when</th>
              </tr>
            </thead>
            <tbody>
              {(a.milestones ?? []).map((m, i) => (
                <tr key={i}>
                  <td className="lab">{i + 1}</td>
                  <td>
                    <input type="text" value={m.what} placeholder="What gets finished"
                      onChange={(e) => setMilestone(i, { what: e.target.value })}
                      style={{ border: 0, padding: 0, boxShadow: "none", fontSize: 13 }} />
                  </td>
                  <td>
                    <input type="date" value={m.date}
                      onChange={(e) => setMilestone(i, { date: e.target.value })}
                      style={{ border: 0, padding: 0, boxShadow: "none", fontSize: 12.5 }} />
                  </td>
                  <td>
                    <input type="text" value={m.leader} placeholder="Name"
                      onChange={(e) => setMilestone(i, { leader: e.target.value })}
                      style={{ border: 0, padding: 0, boxShadow: "none", fontSize: 12.5 }} />
                  </td>
                  <td>
                    <input type="text" value={m.done} placeholder="The test for done"
                      onChange={(e) => setMilestone(i, { done: e.target.value })}
                      style={{ border: 0, padding: 0, boxShadow: "none", fontSize: 12.5 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(a.milestones ?? []).length < 6 && (
          <button className="dash" style={{ marginTop: 8 }}
            onClick={() => patch({ milestones: [...(a.milestones ?? []), emptyMilestone()] })}>
            Add a milestone
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
        {(a.risks ?? []).map((r, i) => (
          <div key={i} className="card pad" style={{ padding: "11px 13px", marginBottom: 8 }}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <span className="lab" style={{ width: 16, paddingTop: 8 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <input type="text" value={r.risk} placeholder="The risk"
                  onChange={(e) => setRisk(i, { risk: e.target.value })}
                  style={{ border: 0, padding: 0, boxShadow: "none", fontSize: 13 }} />
                <div className="row" style={{ marginTop: 6 }}>
                  <select value={r.likelihood} onChange={(e) => setRisk(i, { likelihood: e.target.value })}
                    style={{ width: 130, fontSize: 12.5, padding: "5px 8px" }}>
                    <option value="">Likelihood…</option>
                    <option value="Low">Low</option>
                    <option value="Moderate">Moderate</option>
                    <option value="High">High</option>
                  </select>
                  <input type="text" value={r.counter} placeholder="Counter-measure, in one line"
                    onChange={(e) => setRisk(i, { counter: e.target.value })}
                    style={{ fontSize: 12.5, padding: "5px 8px" }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </Q>

      <Q n={10}>
        <textarea rows={3} value={a.extra ?? ""}
          placeholder="Anything that would strengthen this but was not asked about above."
          onChange={(e) => patch({ extra: e.target.value })} />
      </Q>

      {error && <div className="err" style={{ marginTop: 14 }}>{error}</div>}

      <div className="card pad row" style={{ marginTop: 18 }}>
        <div>
          <div className="name">{pct}% complete</div>
          <div className="desc">Saved as you type. You can close this and come back to the same link.</div>
        </div>
        <span className="spread" />
        <button className="btn" disabled={pending}
          onClick={() => startTransition(async () => { setSaved("saving"); await saveAnswers(token, latest.current); setSaved("saved"); })}>
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
          {pending ? "Sending…" : "Submit the plan"}
        </button>
      </div>

      <p className="lab" style={{ marginTop: 14, textAlign: "center" }}>
        Writing as {who}. BDMF — a method and a tool from OZ Global B2B.
      </p>
    </>
  );
}
