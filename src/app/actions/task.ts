"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  scores,
  questionnaireResponses,
  aiSummaries,
  users,
  projects,
  longListItems,
  shortlistItems,
  auditEvents,
} from "@/db/schema";
import { assignmentForToken } from "@/lib/task";
import { currentUser } from "@/lib/auth";
import { CRITERIA } from "@/lib/scoring";
import { missingAnswers, missingDetail, TEMPLATE_VERSION, type Answers } from "@/lib/questionnaire";
import { send } from "@/lib/mail";
import { submissionReceipt } from "@/lib/mail/templates";
import { summarize } from "@/lib/ai/summarize";

const CRITERION_KEYS = new Set(CRITERIA.map((c) => c.key as string));

/* -------------------------------------------------------------- scoring */

export async function saveScore(token: string, itemId: string, criterion: string, value: number) {
  const a = await assignmentForToken(token, (await currentUser())?.id);
  if (a.status === "submitted") throw new Error("Already submitted.");
  if (!CRITERION_KEYS.has(criterion)) throw new Error("Unknown criterion.");
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error("Scores run 1 to 5.");

  // The item must belong to the exact list version this person was invited to.
  const [item] = await db
    .select({ id: longListItems.id })
    .from(longListItems)
    .where(and(eq(longListItems.id, itemId), eq(longListItems.versionId, a.longListVersionId!)));
  if (!item) throw new Error("That initiative is not on your list.");

  await db
    .insert(scores)
    .values({ assignmentId: a.id, longListItemId: itemId, criterion, value })
    .onConflictDoUpdate({
      target: [scores.assignmentId, scores.longListItemId, scores.criterion],
      set: { value, updatedAt: new Date() },
    });

  if (a.status === "sent" || a.status === "opened") {
    await db.update(assignments).set({ status: "in_progress" }).where(eq(assignments.id, a.id));
  }
}

export async function submitScores(token: string): Promise<{ error?: string }> {
  const a = await assignmentForToken(token, (await currentUser())?.id);
  if (a.status === "submitted") return {};

  const items = await db
    .select({ id: longListItems.id })
    .from(longListItems)
    .where(eq(longListItems.versionId, a.longListVersionId!));
  const named = items.map((i) => i.id);

  const given = await db.select().from(scores).where(eq(scores.assignmentId, a.id));
  const have = new Set(given.map((g) => `${g.longListItemId}:${g.criterion}`));
  const missing = named.flatMap((id) =>
    CRITERIA.filter((c) => !have.has(`${id}:${c.key}`)).map(() => 1),
  ).length;

  if (missing > 0) return { error: `${missing} scores are still blank.` };

  await db
    .update(assignments)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(assignments.id, a.id));

  const [row] = await db
    .select({ email: users.email, projectName: projects.name, workspaceId: projects.workspaceId })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(projects, eq(projects.id, assignments.projectId))
    .where(eq(assignments.id, a.id));

  await send(submissionReceipt({ to: row.email, projectName: row.projectName, what: "the initiative scoring" }));
  await db.insert(auditEvents).values({
    workspaceId: row.workspaceId,
    projectId: a.projectId,
    actorId: a.userId,
    action: "scoring.submitted",
    detail: { assignmentId: a.id },
  });

  revalidatePath(`/t/${token}`);
  revalidatePath(`/p/${a.projectId}/longlist`);
  return {};
}

/* -------------------------------------------------------- questionnaire */

export async function saveAnswers(token: string, answers: Answers) {
  const a = await assignmentForToken(token, (await currentUser())?.id);
  if (a.status === "submitted") throw new Error("Already submitted.");

  await db
    .insert(questionnaireResponses)
    .values({ assignmentId: a.id, templateVersion: TEMPLATE_VERSION, answers })
    .onConflictDoUpdate({
      target: questionnaireResponses.assignmentId,
      set: { answers, updatedAt: new Date() },
    });

  if (a.status === "sent" || a.status === "opened") {
    await db.update(assignments).set({ status: "in_progress" }).where(eq(assignments.id, a.id));
  }
}

export async function submitAnswers(token: string, answers: Answers): Promise<{ error?: string }> {
  const a = await assignmentForToken(token, (await currentUser())?.id);
  if (a.status === "submitted") return {};

  const missing = missingAnswers(answers);
  if (missing.length) {
    return {
      error: `Still to answer — ${missing
        .map((q) => `${q.n}. ${q.label} (${missingDetail(q, answers)})`)
        .join("; ")}.`,
    };
  }

  const [response] = await db
    .insert(questionnaireResponses)
    .values({
      assignmentId: a.id,
      templateVersion: TEMPLATE_VERSION,
      answers,
      submittedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: questionnaireResponses.assignmentId,
      set: { answers, submittedAt: new Date(), updatedAt: new Date() },
    })
    .returning();

  await db
    .update(assignments)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(assignments.id, a.id));

  const [row] = await db
    .select({
      email: users.email,
      projectName: projects.name,
      workspaceId: projects.workspaceId,
      title: longListItems.title,
    })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(projects, eq(projects.id, assignments.projectId))
    .innerJoin(shortlistItems, eq(shortlistItems.id, assignments.shortlistItemId))
    .innerJoin(longListItems, eq(longListItems.id, shortlistItems.longListItemId))
    .where(eq(assignments.id, a.id));

  await send(
    submissionReceipt({
      to: row.email,
      projectName: row.projectName,
      what: `the plan for "${row.title}"`,
    }),
  );

  // AI-07: a failed summary must never lose the response, so this runs after
  // the submission is already durable and stores its own error state.
  try {
    const result = await summarize(row.title, answers);
    await db.insert(aiSummaries).values({
      responseId: response.id,
      model: result.model,
      points: result.points,
      error: result.error ?? null,
    });
  } catch (e) {
    await db.insert(aiSummaries).values({
      responseId: response.id,
      model: "none",
      points: [],
      error: e instanceof Error ? e.message : String(e),
    });
  }

  await db.insert(auditEvents).values({
    workspaceId: row.workspaceId,
    projectId: a.projectId,
    actorId: a.userId,
    action: "questionnaire.submitted",
    detail: { assignmentId: a.id, initiative: row.title },
  });

  revalidatePath(`/t/${token}`);
  revalidatePath(`/p/${a.projectId}/deepdive`);
  return {};
}
