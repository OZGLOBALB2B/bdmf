"use client";

import { useState, useTransition } from "react";
import { saveScore, submitScores } from "@/app/actions/task";
import { CRITERIA } from "@/lib/scoring";

type Item = { id: string; title: string; description: string };

export function ScoringForm({
  token,
  projectName,
  items,
  initial,
  submitted,
  message,
  who,
}: {
  token: string;
  projectName: string;
  items: Item[];
  initial: Record<string, Record<string, number>>;
  submitted: boolean;
  message: string | null;
  who: string;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(submitted);
  const [pending, startTransition] = useTransition();

  const total = items.length * CRITERIA.length;
  const filled = items.reduce(
    (n, it) => n + CRITERIA.filter((c) => values[it.id]?.[c.key]).length,
    0,
  );

  if (done) {
    return (
      <div className="card pad" style={{ textAlign: "center", padding: 52 }}>
        <h1 className="title" style={{ fontSize: 26 }}>Your scores are in</h1>
        <p className="sub" style={{ margin: "10px auto 0", maxWidth: "46ch" }}>
          Thank you. The project admin can see that you are done. If you are needed for the next
          stage, you will get another email.
        </p>
        <p className="lab" style={{ marginTop: 20 }}>
          You cannot change this yourself — ask the admin to reopen it if something needs correcting.
        </p>
      </div>
    );
  }

  const set = (itemId: string, criterion: string, value: number) => {
    setValues((v) => ({ ...v, [itemId]: { ...v[itemId], [criterion]: value } }));
    setError(null);
    void saveScore(token, itemId, criterion, value);
  };

  return (
    <>
      <h1 className="title">Which of these deserve the year?</h1>
      <p className="sub">
        You have been asked to score {items.length} candidate marketing initiatives for{" "}
        {projectName}. It takes about ten minutes. Only the project admin sees your individual
        scores — the other people scoring never do.
      </p>

      {message && (
        <div className="note" style={{ marginTop: 16, fontStyle: "italic" }}>&ldquo;{message}&rdquo;</div>
      )}

      <div className="grid2" style={{ gridTemplateColumns: "repeat(3,1fr)", margin: "24px 0 16px" }}>
        {CRITERIA.map((c) => (
          <div key={c.key} className="card pad" style={{ padding: "15px 17px" }}>
            <div className="name">{c.label}</div>
            <div className="desc" style={{ marginTop: 4 }}>{c.question}</div>
          </div>
        ))}
      </div>

      <div className="legend">
        <span><strong>1</strong> low</span>
        <span><strong>3</strong> moderate</span>
        <span><strong>5</strong> high</span>
        <span className="spread" />
        <span>{filled} of {total} scored</span>
      </div>

      <div className="tbl" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Initiative</th>
              {CRITERIA.map((c) => (
                <th key={c.key} style={{ width: 180, textAlign: "center" }}>{c.short}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <td>
                  <div className="name">{i + 1}. {it.title}</div>
                  <div className="desc">{it.description}</div>
                </td>
                {CRITERIA.map((c) => (
                  <td key={c.key} style={{ textAlign: "center" }}>
                    <span className="scale">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          className="sc"
                          aria-pressed={values[it.id]?.[c.key] === n}
                          aria-label={`${it.title}, ${c.label}, ${n} of 5`}
                          onClick={() => set(it.id, c.key, n)}
                        >
                          {n}
                        </button>
                      ))}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <div className="err" style={{ marginTop: 14 }}>{error}</div>}

      <div className="card pad row" style={{ marginTop: 18 }}>
        <div>
          <div className="name">{filled} of {total} scored</div>
          <div className="desc">
            Your answers save as you go. You can close this and come back to the same link.
          </div>
        </div>
        <span className="spread" />
        <button
          className="btn pri"
          disabled={pending || filled < total}
          onClick={() =>
            startTransition(async () => {
              const res = await submitScores(token);
              if (res.error) setError(res.error);
              else setDone(true);
            })
          }
        >
          {pending ? "Sending…" : filled < total ? `${total - filled} left` : "Submit my scores"}
        </button>
      </div>

      <p className="lab" style={{ marginTop: 14, textAlign: "center" }}>
        Scoring as {who}. BDMF — a method and a tool from OZ Global B2B.
      </p>
    </>
  );
}
