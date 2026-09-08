import Link from "next/link";
import { requireProject } from "@/lib/tenancy";
import { projectFacts } from "@/lib/project";
import { AdminShell, PageHead } from "@/components/chrome";
import { toggleFinalPlan } from "@/app/actions/deepdive";
import { completePlan, reopenPlan } from "@/app/actions/plan";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireProject(id);
  const p = ctx.project;
  const f = await projectFacts(p);

  if (!p.shortlistApprovedAt) {
    return (
      <AdminShell projectId={id} projectName={p.name} active="plan" state={f.states} who={ctx.user.email}>
        <PageHead title="Annual plan" />
        <div className="empty">
          <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>The grid is empty</div>
          <p style={{ margin: "8px auto 0", maxWidth: "50ch" }}>
            The rows come from the shortlist. Approve one and the initiative names drop into place
            down the side of the calendar.
          </p>
          <div style={{ marginTop: 18 }}>
            <Link className="btn pri" href={`/p/${id}/longlist?tab=results`}>Go to the ranking</Link>
          </div>
        </div>
      </AdminShell>
    );
  }

  const chosen = f.shortlist.filter((s) => s.inFinalPlan);
  const blank = MONTHS.map((m) => <td key={m} className="m" />);
  const outOfRange = chosen.length < 4 || chosen.length > 6;

  return (
    <AdminShell projectId={id} projectName={p.name} active="plan" state={f.states} who={ctx.user.email}>
      <PageHead
        title="Annual plan"
        sub="The shortlist carries across on its own. Everything else on the grid stays open — this is the brief for building the plan, not the plan."
        actions={
          p.planCompletedAt ? (
            <form action={reopenPlan}>
              <input type="hidden" name="projectId" value={id} />
              <button className="btn">Reopen</button>
            </form>
          ) : (
            <form action={completePlan}>
              <input type="hidden" name="projectId" value={id} />
              <button className="btn pri" type="submit">Mark this done</button>
            </form>
          )
        }
      />

      <form action={toggleFinalPlan} className="card pad" style={{ marginBottom: 18 }}>
        <input type="hidden" name="projectId" value={id} />
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div className="name">Which initiatives go on the grid?</div>
            <div className="desc" style={{ marginBottom: 10 }}>
              The method lands on four to six. All {f.shortlist.length} shortlisted rows are ticked
              by default — untick anything the refine-and-commit discussion dropped.
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 14 }}>
              {f.shortlist.map((s) => (
                <label key={s.id} className="row" style={{ gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    name="inFinalPlan"
                    value={s.id}
                    defaultChecked={s.inFinalPlan}
                    style={{ width: "auto" }}
                  />
                  {s.title}
                </label>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {outOfRange && (
              <div className="tag warn" style={{ marginBottom: 8 }}>
                {chosen.length} selected — the method aims for four to six
              </div>
            )}
            <button className="btn" type="submit">Update the grid</button>
          </div>
        </div>
      </form>

      <div className="cal">
        <table>
          <thead>
            <tr>
              <th>{p.planYear}</th>
              {MONTHS.map((m) => <th key={m} style={{ textAlign: "center" }}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="band"><td>Goal</td>{blank}</tr>
            {chosen.map((s) => (
              <tr key={s.id}>
                <td className="name">{s.title}</td>
                {MONTHS.map((m) => <td key={m} className="m" />)}
              </tr>
            ))}
            {chosen.length === 0 && (
              <tr><td className="lab">Nothing selected</td>{blank}</tr>
            )}
            <tr className="band"><td>KPIs</td>{blank}</tr>
            <tr className="band"><td>Special days</td>{blank}</tr>
            <tr className="band"><td>Special events</td>{blank}</tr>
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        In this version only the initiative names are filled in, matching the framework in the
        deck. The goal row, the KPIs and the month bars are where the annual marketing plan gets
        built — that is the next conversation, not this one.
      </div>
    </AdminShell>
  );
}
