import Link from "next/link";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { assignments, users, questionnaireResponses, aiSummaries, longListItems, shortlistItems } from "@/db/schema";
import { requireProject } from "@/lib/tenancy";
import { projectFacts } from "@/lib/project";
import { AdminShell, PageHead } from "@/components/chrome";
import { AssignBox } from "./assign";
import { sendTasks, unassign, regenerateSummary } from "@/app/actions/deepdive";
import { sendReminder, reopenAssignment } from "@/app/actions/longlist";
import { QUESTIONS, type Answers, type Milestone, type Risk } from "@/lib/questionnaire";
import { fmt } from "@/lib/scoring";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="card pad" style={{ marginBottom: 10 }}>
      <div className="lab">{label}</div>
      <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
        {value?.trim() || <span className="lab">— left blank —</span>}
      </div>
    </div>
  );
}

const when = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default async function DeepDivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { id } = await params;
  const { plan } = await searchParams;
  const ctx = await requireProject(id);
  const p = ctx.project;
  const f = await projectFacts(p);

  if (!p.shortlistApprovedAt) {
    return (
      <AdminShell projectId={id} projectName={p.name} active="deepdive" state={f.states} who={ctx.user.email}>
        <PageHead title="Deep dive" />
        <div className="empty">
          <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>Nothing here yet</div>
          <p style={{ margin: "8px auto 0", maxWidth: "50ch" }}>
            Approve a shortlist and each surviving initiative becomes its own task here — a scope and
            success plan, written by whoever knows it best.
          </p>
          <div style={{ marginTop: 18 }}>
            <Link className="btn pri" href={`/p/${id}/longlist?tab=results`}>Go to the ranking</Link>
          </div>
        </div>
      </AdminShell>
    );
  }

  if (plan) return <PlanView projectId={id} assignmentId={plan} ctx={ctx} facts={f} />;

  const all = await db
    .select({
      id: assignments.id,
      shortlistItemId: assignments.shortlistItemId,
      status: assignments.status,
      sentAt: assignments.sentAt,
      submittedAt: assignments.submittedAt,
      remindersSent: assignments.remindersSent,
      name: users.name,
      email: users.email,
    })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .where(and(eq(assignments.projectId, id), eq(assignments.kind, "questionnaire")));

  const suggestions = [...f.participants, ...f.deepDive]
    .map((x) => ({ email: x.email, name: x.name }))
    .filter((v, i, arr) => arr.findIndex((a) => a.email === v.email) === i);

  const unsent = all.filter((a) => a.status === "draft").length;

  return (
    <AdminShell projectId={id} projectName={p.name} active="deepdive" state={f.states} who={ctx.user.email}>
      <PageHead
        title="Deep dive"
        sub="Each initiative is its own task. Assign the people who will write it, then send. Everyone answers the same ten questions."
        actions={
          <form action={sendTasks}>
            <input type="hidden" name="projectId" value={id} />
            <button className="btn pri" type="submit" disabled={!unsent}>
              {unsent ? `Send ${unsent} ${unsent === 1 ? "task" : "tasks"}` : "Everything is sent"}
            </button>
          </form>
        }
      />

      {f.shortlist.map((s, i) => {
        const mine = all.filter((a) => a.shortlistItemId === s.id);
        const inCount = mine.filter((a) => a.status === "submitted").length;
        const status = !mine.length
          ? { text: "Nobody assigned", cls: "" }
          : mine.every((a) => a.status === "draft")
            ? { text: "Not sent yet", cls: "" }
            : inCount === mine.length
              ? { text: `All ${inCount} in`, cls: "ok" }
              : { text: `${inCount} of ${mine.length} in`, cls: "on" };

        return (
          <div key={s.id} className="stage" style={{ alignItems: "flex-start" }}>
            <span className="lab" style={{ width: 18, paddingTop: 5 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row">
                <span className="name" style={{ fontSize: 15 }}>{s.title}</span>
                <span className={`tag ${status.cls}`}>{status.text}</span>
              </div>
              <div className="desc">
                Ranked {s.rank} · mean {fmt(Number(s.meanTotal))} of 15 from {s.responseCount}{" "}
                {s.responseCount === 1 ? "person" : "people"}
              </div>

              <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 7 }}>
                {mine.map((a) => (
                  <span key={a.id} className="chip">
                    {a.name || a.email}
                    {a.status === "submitted" && " ✓"}
                    {a.status === "draft" && (
                      <form action={unassign} style={{ display: "inline" }}>
                        <input type="hidden" name="projectId" value={id} />
                        <input type="hidden" name="assignmentId" value={a.id} />
                        <button type="submit" title="Remove">✕</button>
                      </form>
                    )}
                  </span>
                ))}
                <AssignBox projectId={id} shortlistItemId={s.id} suggestions={suggestions} />
              </div>

              {mine.some((a) => a.status !== "draft") && (
                <div className="tbl" style={{ marginTop: 12 }}>
                  <table>
                    <tbody>
                      {mine.filter((a) => a.status !== "draft").map((a) => (
                        <tr key={a.id}>
                          <td style={{ fontSize: 12.5 }}>{a.name || a.email}</td>
                          <td style={{ width: 120 }}>
                            <span className={`tag ${a.status === "submitted" ? "ok" : "on"}`}>
                              {a.status === "submitted" ? "Submitted" : a.status === "in_progress" ? "In progress" : a.status === "opened" ? "Opened" : "Sent"}
                            </span>
                          </td>
                          <td className="lab" style={{ width: 150 }}>{when(a.submittedAt ?? a.sentAt)}</td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap", width: 200 }}>
                            {a.status === "submitted" ? (
                              <>
                                <Link className="btn sm" href={`/p/${id}/deepdive?plan=${a.id}`}>Read the plan</Link>
                                <form action={reopenAssignment} style={{ display: "inline" }}>
                                  <input type="hidden" name="projectId" value={id} />
                                  <input type="hidden" name="assignmentId" value={a.id} />
                                  <button className="btn sm ghost">Reopen</button>
                                </form>
                              </>
                            ) : (
                              <form action={sendReminder} style={{ display: "inline" }}>
                                <input type="hidden" name="projectId" value={id} />
                                <input type="hidden" name="assignmentId" value={a.id} />
                                <button className="btn sm">Remind</button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </AdminShell>
  );
}

/* -------------------------------------------------------- one plan ---- */

async function PlanView({
  projectId,
  assignmentId,
  ctx,
  facts,
}: {
  projectId: string;
  assignmentId: string;
  ctx: Awaited<ReturnType<typeof requireProject>>;
  facts: Awaited<ReturnType<typeof projectFacts>>;
}) {
  const [row] = await db
    .select({
      response: questionnaireResponses,
      title: longListItems.title,
      name: users.name,
      email: users.email,
      submittedAt: assignments.submittedAt,
    })
    .from(questionnaireResponses)
    .innerJoin(assignments, eq(assignments.id, questionnaireResponses.assignmentId))
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(shortlistItems, eq(shortlistItems.id, assignments.shortlistItemId))
    .innerJoin(longListItems, eq(longListItems.id, shortlistItems.longListItemId))
    .where(and(eq(assignments.id, assignmentId), eq(assignments.projectId, projectId)));

  if (!row) {
    return (
      <AdminShell projectId={projectId} projectName={ctx.project.name} active="deepdive" state={facts.states} who={ctx.user.email}>
        <div className="empty">That plan is not part of this project.</div>
      </AdminShell>
    );
  }

  const [summary] = await db
    .select()
    .from(aiSummaries)
    .where(eq(aiSummaries.responseId, row.response.id))
    .orderBy(desc(aiSummaries.createdAt))
    .limit(1);

  const a = row.response.answers as Answers;
  const points = (summary?.points ?? []) as { heading: string; body: string }[];

  const q = (n: number) => QUESTIONS[n - 1].label;

  return (
    <AdminShell projectId={projectId} projectName={ctx.project.name} active="deepdive" state={facts.states} who={ctx.user.email}>
      <Link className="btn sm ghost" href={`/p/${projectId}/deepdive`} style={{ marginBottom: 14, display: "inline-block" }}>
        ← Back to the deep dive
      </Link>
      <PageHead
        title={row.title}
        sub={`Written by ${row.name || row.email} · submitted ${when(row.submittedAt)}`}
      />

      <div className="grid2" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <div>
          <Field label={q(1)} value={a.description} />
          <Field label={q(2)} value={a.alignment} />
          <Field label={q(3)} value={a.owner} />
          <Field label={q(4)} value={a.team} />

          <div className="card pad" style={{ marginBottom: 10 }}>
            <div className="lab" style={{ marginBottom: 8 }}>{q(5)}</div>
            <table>
              <tbody>
                {(a.milestones ?? []).filter((m: Milestone) => m.what?.trim()).map((m: Milestone, i: number) => (
                  <tr key={i}>
                    <td className="lab" style={{ width: 24 }}>{i + 1}</td>
                    <td>{m.what}</td>
                    <td className="lab" style={{ width: 110 }}>{m.date || "—"}</td>
                    <td className="lab" style={{ width: 120 }}>{m.leader || "—"}</td>
                    <td className="desc" style={{ width: 200 }}>{m.done || "—"}</td>
                  </tr>
                ))}
                {!(a.milestones ?? []).some((m: Milestone) => m.what?.trim()) && (
                  <tr><td className="lab">No milestones entered.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <Field label={q(6)} value={a.golive} />

          <div className="card pad" style={{ marginBottom: 10 }}>
            <div className="lab" style={{ marginBottom: 6 }}>{q(7)}</div>
            {(a.metrics ?? []).filter(Boolean).map((m: string, i: number) => (
              <div key={i} className="row" style={{ marginBottom: 4 }}>
                <span className="lab" style={{ width: 16 }}>{i + 1}</span><span>{m}</span>
              </div>
            ))}
            {!(a.metrics ?? []).some(Boolean) && <span className="lab">— left blank —</span>}
          </div>

          <Field label={q(8)} value={a.resources} />

          <div className="card pad" style={{ marginBottom: 10 }}>
            <div className="lab" style={{ marginBottom: 6 }}>{q(9)}</div>
            {(a.risks ?? []).filter((r: Risk) => r.risk?.trim()).map((r: Risk, i: number) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div className="row">
                  <span className="lab" style={{ width: 16 }}>{i + 1}</span>
                  <span className="name" style={{ fontSize: 13 }}>{r.risk}</span>
                  {r.likelihood && <span className="tag">{r.likelihood}</span>}
                </div>
                <div className="desc" style={{ marginLeft: 26 }}>
                  {r.counter || "No counter-measure given."}
                </div>
              </div>
            ))}
            {!(a.risks ?? []).some((r: Risk) => r.risk?.trim()) && <span className="lab">— left blank —</span>}
          </div>

          <Field label={q(10)} value={a.extra} />
        </div>

        <div>
          <div className="ai">
            <h3>The short version</h3>
            <p className="desc" style={{ marginTop: 4 }}>
              Pulled out of this plan automatically. It sits beside the original, never instead of
              it — everything here traces back to the answers on the left.
            </p>
            {points.map((pt, i) => (
              <div key={i} className="item">
                <div className="k">{pt.heading}</div>
                <div>{pt.body}</div>
              </div>
            ))}
            {summary?.error && (
              <div className="note warn" style={{ marginTop: 12 }}>
                The model was not reachable, so this is the built-in summariser. ({summary.error})
              </div>
            )}
            <div className="row" style={{ marginTop: 14 }}>
              <span className="lab">
                {summary?.model === "fallback" ? "Generated without a model" : `AI-generated · ${summary?.model ?? "none"}`}
              </span>
              <span className="spread" />
              <form action={regenerateSummary}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="assignmentId" value={assignmentId} />
                <button className="btn sm">Regenerate</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
