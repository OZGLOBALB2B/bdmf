import Link from "next/link";
import { eq, and, ne, desc } from "drizzle-orm";
import { db } from "@/db";
import { assignments, projects, shortlistItems, longListItems } from "@/db/schema";
import { requireUser } from "@/lib/tenancy";
import { Topbar, PageHead } from "@/components/chrome";

export const dynamic = "force-dynamic";

/**
 * What a contributor sees if they sign in rather than following their emailed
 * link. Deliberately narrow: their own tasks and nothing about the projects
 * those tasks belong to beyond the name.
 */
export default async function TasksPage() {
  const user = await requireUser();

  const rows = await db
    .select({
      id: assignments.id,
      kind: assignments.kind,
      status: assignments.status,
      dueOn: assignments.dueOn,
      submittedAt: assignments.submittedAt,
      projectName: projects.name,
      initiative: longListItems.title,
    })
    .from(assignments)
    .innerJoin(projects, eq(projects.id, assignments.projectId))
    .leftJoin(shortlistItems, eq(shortlistItems.id, assignments.shortlistItemId))
    .leftJoin(longListItems, eq(longListItems.id, shortlistItems.longListItemId))
    .where(
      and(
        eq(assignments.userId, user.id),
        ne(assignments.status, "draft"),
        ne(assignments.status, "revoked"),
      ),
    )
    .orderBy(desc(assignments.sentAt));

  const open = rows.filter((r) => r.status !== "submitted");
  const done = rows.filter((r) => r.status === "submitted");

  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <div className="stage">
      <div style={{ minWidth: 0 }}>
        <div className="row">
          <span className="name" style={{ fontSize: 15 }}>
            {r.kind === "scoring" ? "Score the marketing initiatives" : r.initiative}
          </span>
          <span className={`tag ${r.status === "submitted" ? "ok" : "on"}`}>
            {r.status === "submitted" ? "Submitted" : r.status === "in_progress" ? "In progress" : "Not started"}
          </span>
        </div>
        <div className="desc">
          {r.projectName} · {r.kind === "scoring" ? "three criteria, 1 to 5 each" : "a ten-question scope and success plan"}
        </div>
      </div>
      <span className="spread" />
      <Link className={`btn ${r.status === "submitted" ? "" : "pri"}`} href={`/t/${r.id}`}>
        {r.status === "submitted" ? "View" : "Open"}
      </Link>
    </div>
  );

  return (
    <>
      <Topbar who={user.email} />
      <main className="main">
        <div className="wrap-narrow">
          <PageHead
            title="What is waiting for you"
            sub="Tasks people have asked you to complete. You only ever see your own."
          />

          {rows.length === 0 ? (
            <div className="empty">
              <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>Nothing to do</div>
              <p style={{ margin: "8px auto 0", maxWidth: "46ch" }}>
                When someone asks you to score a list of initiatives or write a plan for one, it
                will appear here — and you will get an email.
              </p>
            </div>
          ) : (
            <>
              {open.map((r) => <Row key={r.id} r={r} />)}
              {done.length > 0 && (
                <>
                  <h2 className="lab" style={{ margin: "26px 0 10px" }}>Already sent</h2>
                  {done.map((r) => <Row key={r.id} r={r} />)}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
