import Link from "next/link";
import { requireProject } from "@/lib/tenancy";
import { projectFacts } from "@/lib/project";
import { AdminShell, PageHead } from "@/components/chrome";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireProject(id);
  const p = ctx.project;
  const f = await projectFacts(p);

  const objectivesFilled = f.direction.objectives.filter((o) => o.title.trim()).length;
  const initiativesFilled = f.direction.initiatives.filter((o) => o.title.trim()).length;

  const rows: {
    n: number;
    title: string;
    blurb: string;
    state: "done" | "now" | "off";
    meta: string;
    empty: string;
    href?: string;
  }[] = [
    {
      n: 1,
      title: "Access and people",
      blurb: "Your account, and the people you bring into this project.",
      state: "done",
      meta: `${f.participants.length + f.deepDive.length === 0 ? "Nobody invited yet" : `${new Set([...f.participants, ...f.deepDive].map((x) => x.userId)).size} people involved`}`,
      empty: "",
    },
    {
      n: 2,
      title: "Business direction",
      blurb: "Business objectives and strategic initiatives, set with the CEO.",
      state: p.directionConfirmedAt ? "done" : "now",
      meta: p.directionConfirmedAt
        ? `Confirmed ${fmtDate(p.directionConfirmedAt)}`
        : objectivesFilled + initiativesFilled === 0
          ? "Not started"
          : `${objectivesFilled} objectives · ${initiativesFilled} initiatives in draft`,
      empty: "Nothing has been written here yet.",
      href: `/p/${id}/direction`,
    },
    {
      n: 3,
      title: "Long list and scoring",
      blurb: "Score the long list on the three criteria, then rank it.",
      state: p.shortlistApprovedAt ? "done" : p.directionConfirmedAt ? "now" : "off",
      meta: !f.items.length
        ? "No long list yet"
        : `${f.items.length} initiatives · ${f.submitted} of ${f.participants.length || 0} scored`,
      empty: "The long list is built after the management meeting.",
      href: `/p/${id}/longlist`,
    },
    {
      n: 4,
      title: "Deep dive",
      blurb: "A scope and success plan for each shortlisted initiative.",
      state: p.shortlistApprovedAt ? "now" : "off",
      meta: p.shortlistApprovedAt
        ? `${f.shortlist.length} initiatives · ${f.deepDiveSubmitted} of ${f.deepDive.length} plans in`
        : "",
      empty: "Opens once you approve a shortlist.",
      href: `/p/${id}/deepdive`,
    },
    {
      n: 5,
      title: "Annual plan",
      blurb: "The shortlist mapped across the year.",
      state: p.planCompletedAt ? "done" : p.shortlistApprovedAt ? "now" : "off",
      meta: p.planCompletedAt ? `Marked done ${fmtDate(p.planCompletedAt)}` : "",
      empty: "The grid fills in from the shortlist.",
      href: `/p/${id}/plan`,
    },
  ];

  return (
    <AdminShell
      projectId={id}
      projectName={p.name}
      active="overview"
      state={f.states}
      who={ctx.user.email}
    >
      <PageHead
        title={p.name}
        sub="From business strategy to marketing focus. Work through the stages in order — each one unlocks the next."
      />

      {rows.map((r) => {
        const off = r.state === "off";
        return (
          <div key={r.n} className={`stage ${off ? "locked" : ""}`}>
            <span
              className={`dot ${r.state === "done" ? "done" : r.state === "now" ? "now" : ""}`}
              style={{ width: 32, height: 32, fontSize: 12 }}
            >
              {r.state === "done" ? "✓" : r.n}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="row">
                <span className="name" style={{ fontSize: 15 }}>{r.title}</span>
                <span className={`tag ${r.state === "now" ? "on" : r.state === "done" ? "ok" : ""}`}>
                  {off ? "Locked" : r.state === "done" ? "Done" : "In progress"}
                </span>
              </div>
              <div className="desc">{r.blurb}</div>
              <div className="lab" style={{ marginTop: 5 }}>{off ? r.empty : r.meta || r.empty}</div>
            </div>
            <span className="spread" />
            {off ? (
              <span className="lab">Opens when stage {r.n - 1} is done</span>
            ) : r.href ? (
              <Link className={`btn ${r.state === "now" ? "pri" : ""}`} href={r.href}>Open</Link>
            ) : null}
          </div>
        );
      })}

      <div className="note" style={{ marginTop: 16 }}>
        A locked stage holds no documents and shows nothing until the stage before it is approved.
        Completed stages stay open — you can go back and read them at any time.
      </div>
    </AdminShell>
  );
}
