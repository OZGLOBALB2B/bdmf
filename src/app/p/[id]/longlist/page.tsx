import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { assignments, scores, users } from "@/db/schema";
import { requireProject } from "@/lib/tenancy";
import { projectFacts, loadRanking, currentLongListVersion, loadLongList } from "@/lib/project";
import { AdminShell, PageHead } from "@/components/chrome";
import { CRITERIA, MAX_PER_RESPONDENT, fmt } from "@/lib/scoring";
import { LongListBuilder } from "./builder";
import { InvitePanel } from "./invite";
import { CutLine } from "./cutline";
import { sendReminder, revokeAssignment, reopenAssignment, approveShortlist, reopenShortlist } from "@/app/actions/longlist";

export const dynamic = "force-dynamic";

type Tab = "list" | "people" | "results";

const when = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default async function LongListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; who?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (["list", "people", "results"].includes(sp.tab ?? "") ? sp.tab : "list") as Tab;

  const ctx = await requireProject(id);
  const p = ctx.project;
  const f = await projectFacts(p);
  const version = await currentLongListVersion(id);
  const items = await loadLongList(version.id);
  const locked = Boolean(version.lockedAt);

  const options = [
    ...f.direction.objectives.filter((o) => o.title.trim()).map((o) => ({ id: o.id, label: `Objective — ${o.title}` })),
    ...f.direction.initiatives.filter((o) => o.title.trim()).map((o) => ({ id: o.id, label: `Initiative — ${o.title}` })),
  ];

  const named = items.filter((i) => i.title.trim());
  const submittedCount = f.participants.filter((x) => x.status === "submitted").length;
  const outstanding = f.participants.filter((x) => x.status !== "submitted" && x.status !== "revoked");

  const tabLink = (t: Tab, label: string, badge?: string) => (
    <Link
      href={`/p/${id}/longlist?tab=${t}`}
      className={`btn sm ${tab === t ? "pri" : "ghost"}`}
      style={{ textDecoration: "none" }}
    >
      {label}{badge ? ` · ${badge}` : ""}
    </Link>
  );

  return (
    <AdminShell projectId={id} projectName={p.name} active="longlist" state={f.states} who={ctx.user.email}>
      <PageHead
        title="Long list and scoring"
        sub="The pool of candidate initiatives from the management meeting, scored by the people whose judgement you want, then ranked."
        actions={
          <InvitePanel
            projectId={id}
            disabled={named.length < 2 || Boolean(p.shortlistApprovedAt)}
            disabledReason={
              p.shortlistApprovedAt ? "The shortlist is already approved." : "Write at least two initiatives first."
            }
          />
        }
      />

      <div className="row" style={{ marginBottom: 18 }}>
        {tabLink("list", "The list", String(named.length))}
        {tabLink("people", "People", f.participants.length ? `${submittedCount}/${f.participants.length}` : undefined)}
        {tabLink("results", "Ranking")}
      </div>

      {tab === "list" && (
        <>
          {locked && (
            <div className="note" style={{ marginBottom: 14 }}>
              Locked at version {version.versionNumber}. Invitations have gone out, so everyone is
              scoring this exact list — changing it now would mean people had answered different
              questions.
            </div>
          )}
          <LongListBuilder projectId={id} rows={items} options={options} locked={locked} />
        </>
      )}

      {tab === "people" && (
        <PeopleTab projectId={id} participants={f.participants} outstanding={outstanding.length} />
      )}

      {tab === "results" && (
        <ResultsTab
          projectId={id}
          versionId={version.id}
          cutLine={p.cutLine}
          approved={Boolean(p.shortlistApprovedAt)}
          totalInvited={f.participants.filter((x) => x.status !== "revoked").length}
          submitted={submittedCount}
          who={sp.who}
        />
      )}
    </AdminShell>
  );
}

/* ------------------------------------------------------------- people */

async function PeopleTab({
  projectId,
  participants,
  outstanding,
}: {
  projectId: string;
  participants: Awaited<ReturnType<typeof projectFacts>>["participants"];
  outstanding: number;
}) {
  if (!participants.length) {
    return (
      <div className="empty">
        <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>Nobody invited yet</div>
        <p style={{ margin: "8px auto 0", maxWidth: "50ch" }}>
          Invite the people whose judgement should shape the ranking — typically the management team.
          They get a link to one page and see nothing else about the project.
        </p>
      </div>
    );
  }

  const label: Record<string, { text: string; cls: string }> = {
    draft: { text: "Not sent", cls: "" },
    sent: { text: "Invited", cls: "on" },
    opened: { text: "Opened", cls: "on" },
    in_progress: { text: "In progress", cls: "on" },
    submitted: { text: "Submitted", cls: "ok" },
    revoked: { text: "Revoked", cls: "" },
  };

  return (
    <>
      {outstanding > 0 && (
        <div className="note" style={{ marginBottom: 14 }}>
          {outstanding} {outstanding === 1 ? "person has" : "people have"} not scored yet. The ranking
          on the next tab is built from what has come in so far — worth waiting before you approve a
          shortlist.
        </div>
      )}
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Person</th><th>Status</th><th>Invited</th><th>Submitted</th><th>Reminders</th><th />
            </tr>
          </thead>
          <tbody>
            {participants.map((x) => {
              const l = label[x.status];
              return (
                <tr key={x.assignmentId}>
                  <td>
                    <div className="name">{x.name || x.email}</div>
                    {x.name && <div className="desc">{x.email}</div>}
                  </td>
                  <td><span className={`tag ${l.cls}`}>{l.text}</span></td>
                  <td className="lab">{when(x.sentAt)}</td>
                  <td className="lab">{when(x.submittedAt)}</td>
                  <td className="lab">
                    {x.remindersSent ? `${x.remindersSent} · last ${when(x.lastReminderAt)}` : "—"}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {x.status === "submitted" ? (
                      <>
                        <Link className="btn sm" href={`/p/${projectId}/longlist?tab=results&who=${x.assignmentId}`}>
                          View
                        </Link>
                        <form action={reopenAssignment} style={{ display: "inline" }}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="assignmentId" value={x.assignmentId} />
                          <button className="btn sm ghost">Reopen</button>
                        </form>
                      </>
                    ) : x.status === "revoked" ? null : (
                      <>
                        <form action={sendReminder} style={{ display: "inline" }}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="assignmentId" value={x.assignmentId} />
                          <button className="btn sm">Remind</button>
                        </form>
                        <form action={revokeAssignment} style={{ display: "inline" }}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="assignmentId" value={x.assignmentId} />
                          <button className="btn sm ghost danger">Revoke</button>
                        </form>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="lab" style={{ marginTop: 12 }}>
        A reminder can be sent once a day per person, and every one is logged.
      </p>
    </>
  );
}

/* ------------------------------------------------------------ results */

async function ResultsTab({
  projectId,
  versionId,
  cutLine,
  approved,
  totalInvited,
  submitted,
  who,
}: {
  projectId: string;
  versionId: string;
  cutLine: number;
  approved: boolean;
  totalInvited: number;
  submitted: number;
  who?: string;
}) {
  const { items, ranked, respondents } = await loadRanking(projectId, versionId);
  const byId = new Map(items.map((i) => [i.id, i]));

  if (!submitted) {
    return (
      <div className="empty">
        <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>No scores in yet</div>
        <p style={{ margin: "8px auto 0", maxWidth: "50ch" }}>
          {totalInvited
            ? `${totalInvited} ${totalInvited === 1 ? "person has" : "people have"} been invited. The ranking appears as soon as the first one submits.`
            : "Invite people to score the list and their answers will be consolidated here."}
        </p>
      </div>
    );
  }

  // An individual person's matrix, when one is selected from the People tab.
  if (who) return <IndividualMatrix projectId={projectId} assignmentId={who} versionId={versionId} />;

  const missing = totalInvited - submitted;

  return (
    <>
      <div className="row" style={{ marginBottom: 14, alignItems: "flex-start" }}>
        <div className="note" style={{ flex: 1 }}>
          Ranked on the <strong>mean</strong> of each respondent&apos;s three scores, out of{" "}
          {MAX_PER_RESPONDENT}. The sum across all {respondents} respondents is shown alongside so it
          reconciles with the scoring matrix in the deck.
          {missing > 0 && (
            <> {missing} invited {missing === 1 ? "person has" : "people have"} not submitted; their
            scores are not in these numbers.</>
          )}
        </div>
      </div>

      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>Initiative</th>
              {CRITERIA.map((c) => (
                <th key={c.key} style={{ textAlign: "right", width: 120 }}>{c.short}</th>
              ))}
              <th style={{ textAlign: "right", width: 90 }}>Mean</th>
              <th style={{ textAlign: "right", width: 80 }}>Sum</th>
              <th style={{ textAlign: "right", width: 70 }}>Scored by</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => {
              const item = byId.get(r.itemId)!;
              const below = i >= cutLine;
              const isCut = i === cutLine - 1;
              return (
                <tr key={r.itemId} className={`${below ? "below" : ""} ${isCut ? "cut" : ""}`}>
                  <td className="lab">{r.rank}</td>
                  <td>
                    <div className="name">{item.title || <span className="lab">Untitled</span>}</div>
                    <div className="desc">{item.description}</div>
                  </td>
                  {CRITERIA.map((c) => (
                    <td key={c.key} className="num">{fmt(r.byCriterion[c.key].mean)}</td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>{fmt(r.meanTotal)}</td>
                  <td className="num lab">{r.sumTotal}</td>
                  <td className="num lab">
                    {r.responseCount}
                    {r.incomplete && <span title="Fewer people scored this than the top item"> ⚠</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CutLine
        projectId={projectId}
        cutLine={cutLine}
        max={ranked.length}
        approved={approved}
        outstanding={missing}
        approveAction={approveShortlist}
        reopenAction={reopenShortlist}
      />
    </>
  );
}

async function IndividualMatrix({
  projectId,
  assignmentId,
  versionId,
}: {
  projectId: string;
  assignmentId: string;
  versionId: string;
}) {
  const [row] = await db
    .select({ a: assignments, name: users.name, email: users.email })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .where(and(eq(assignments.id, assignmentId), eq(assignments.projectId, projectId)));
  if (!row) return <div className="empty">That response is not part of this project.</div>;

  const items = await loadLongList(versionId);
  const raw = await db.select().from(scores).where(eq(scores.assignmentId, assignmentId));
  const map = new Map(raw.map((s) => [`${s.longListItemId}:${s.criterion}`, s.value]));

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <Link className="btn sm ghost" href={`/p/${projectId}/longlist?tab=results`}>← Back to the ranking</Link>
        <span className="spread" />
        <span className="lab">
          {row.name || row.email} · submitted {when(row.a.submittedAt)}
        </span>
      </div>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Initiative</th>
              {CRITERIA.map((c) => <th key={c.key} style={{ textAlign: "right", width: 130 }}>{c.short}</th>)}
              <th style={{ textAlign: "right", width: 80 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const vals = CRITERIA.map((c) => map.get(`${it.id}:${c.key}`));
              const total = vals.reduce<number>((a, b) => a + (b ?? 0), 0);
              return (
                <tr key={it.id}>
                  <td><div className="name">{it.title}</div></td>
                  {vals.map((v, i) => <td key={i} className="num">{v ?? "—"}</td>)}
                  <td className="num" style={{ fontWeight: 600 }}>{total || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
