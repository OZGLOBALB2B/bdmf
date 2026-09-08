import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scores, questionnaireResponses } from "@/db/schema";
import { resolveTask, markOpened } from "@/lib/task";
import { currentUser } from "@/lib/auth";
import { Topbar } from "@/components/chrome";
import { ScoringForm } from "./scoring-form";
import { PlanForm } from "./plan-form";
import { blankAnswers, type Answers } from "@/lib/questionnaire";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await currentUser();
  const task = await resolveTask(token, viewer?.id);

  if (task.kind === "invalid") {
    const message = {
      unknown: "This link does not match anything in the system. It may have been mistyped, or replaced by a newer one — check for a more recent email.",
      expired: "This link has expired. Ask the person who invited you to send a fresh one.",
      revoked: "This task has been withdrawn by the project admin.",
    }[task.reason];
    return (
      <>
        <Topbar />
        <main className="main">
          <div className="wrap-narrow">
            <div className="card pad" style={{ textAlign: "center", padding: 52 }}>
              <h1 className="title" style={{ fontSize: 24 }}>That link does not work</h1>
              <p className="sub" style={{ margin: "10px auto 0", maxWidth: "46ch" }}>{message}</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  await markOpened(task.assignment.id, task.assignment.status);
  const submitted = task.assignment.status === "submitted";
  const who = task.person.name || task.person.email;

  if (task.kind === "scoring") {
    const existing = await db.select().from(scores).where(eq(scores.assignmentId, task.assignment.id));
    const initial: Record<string, Record<string, number>> = {};
    for (const s of existing) {
      (initial[s.longListItemId] ??= {})[s.criterion] = s.value;
    }

    return (
      <>
        <Topbar crumbs={[{ label: task.project.name }]} />
        <main className="main">
          <div className="wrap-narrow">
            <ScoringForm
              token={token}
              projectName={task.project.name}
              items={task.items.map((i) => ({ id: i.id, title: i.title, description: i.description }))}
              initial={initial}
              submitted={submitted}
              message={task.assignment.message}
              who={who}
            />
          </div>
        </main>
      </>
    );
  }

  const [row] = task.response
    ? [task.response]
    : await db
        .select()
        .from(questionnaireResponses)
        .where(eq(questionnaireResponses.assignmentId, task.assignment.id));

  const answers: Answers = { ...blankAnswers(), ...((row?.answers as Answers) ?? {}) };

  return (
    <>
      <Topbar crumbs={[{ label: task.project.name }]} />
      <main className="main">
        <div className="wrap-narrow">
          <PlanForm
            token={token}
            projectName={task.project.name}
            initiative={task.initiative}
            initial={answers}
            submitted={submitted}
            message={task.assignment.message}
            who={who}
          />
        </div>
      </main>
    </>
  );
}
