"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  users,
  memberships,
  shortlistItems,
  longListItems,
  questionnaireResponses,
  aiSummaries,
  auditEvents,
} from "@/db/schema";
import { requireProject } from "@/lib/tenancy";
import { newToken, hashToken } from "@/lib/auth";
import { send } from "@/lib/mail";
import { questionnaireInvite } from "@/lib/mail/templates";
import { summarize } from "@/lib/ai/summarize";
import type { Answers } from "@/lib/questionnaire";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INVITE_DAYS = 45;

/**
 * Assigns people to one shortlisted initiative. Each row is its own task, so a
 * person assigned to three initiatives gets three separate links.
 */
export async function assignToInitiative(
  projectId: string,
  shortlistItemId: string,
  rawEmails: string[],
): Promise<{ added: string[]; skipped: { email: string; why: string }[]; error?: string }> {
  const ctx = await requireProject(projectId);

  const [sl] = await db
    .select({ id: shortlistItems.id })
    .from(shortlistItems)
    .where(and(eq(shortlistItems.id, shortlistItemId), eq(shortlistItems.projectId, projectId)));
  if (!sl) return { added: [], skipped: [], error: "That initiative is not on this shortlist." };

  const emails = [...new Set(rawEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const added: string[] = [];
  const skipped: { email: string; why: string }[] = [];

  for (const email of emails) {
    if (!EMAIL.test(email)) {
      skipped.push({ email, why: "not a valid address" });
      continue;
    }
    let [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!user) [user] = await db.insert(users).values({ email }).returning({ id: users.id });

    await db
      .insert(memberships)
      .values({ userId: user.id, workspaceId: ctx.workspaceId, role: "contributor" })
      .onConflictDoNothing();

    const [dupe] = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(
        and(
          eq(assignments.projectId, projectId),
          eq(assignments.kind, "questionnaire"),
          eq(assignments.shortlistItemId, shortlistItemId),
          eq(assignments.userId, user.id),
        ),
      );
    if (dupe) {
      skipped.push({ email, why: "already assigned to this one" });
      continue;
    }

    await db.insert(assignments).values({
      projectId,
      kind: "questionnaire",
      userId: user.id,
      shortlistItemId,
      tokenHash: hashToken(newToken()), // replaced when the task is actually sent
      status: "draft",
      expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
    });
    added.push(email);
  }

  revalidatePath(`/p/${projectId}/deepdive`);
  return { added, skipped };
}

export async function unassign(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const assignmentId = String(formData.get("assignmentId"));
  await requireProject(projectId);
  await db
    .delete(assignments)
    .where(
      and(
        eq(assignments.id, assignmentId),
        eq(assignments.projectId, projectId),
        eq(assignments.status, "draft"),
      ),
    );
  revalidatePath(`/p/${projectId}/deepdive`);
}

/** Sends every not-yet-sent questionnaire task, optionally for one initiative. */
export async function sendTasks(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const only = formData.get("shortlistItemId");
  const message = String(formData.get("message") ?? "");
  const ctx = await requireProject(projectId);

  const where = only
    ? and(
        eq(assignments.projectId, projectId),
        eq(assignments.kind, "questionnaire"),
        eq(assignments.status, "draft"),
        eq(assignments.shortlistItemId, String(only)),
      )
    : and(
        eq(assignments.projectId, projectId),
        eq(assignments.kind, "questionnaire"),
        eq(assignments.status, "draft"),
      );

  const pending = await db
    .select({
      id: assignments.id,
      email: users.email,
      title: longListItems.title,
    })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(shortlistItems, eq(shortlistItems.id, assignments.shortlistItemId))
    .innerJoin(longListItems, eq(longListItems.id, shortlistItems.longListItemId))
    .where(where);

  for (const a of pending) {
    const token = newToken();
    await db
      .update(assignments)
      .set({
        tokenHash: hashToken(token),
        status: "sent",
        sentAt: new Date(),
        message: message.trim() || null,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
      })
      .where(eq(assignments.id, a.id));

    await send(
      questionnaireInvite({
        to: a.email,
        projectName: ctx.project.name,
        initiativeTitle: a.title,
        adminName: ctx.user.name || ctx.user.email,
        token,
        message,
        assignmentId: a.id,
      }),
    );
  }

  if (pending.length) {
    await db.insert(auditEvents).values({
      workspaceId: ctx.workspaceId,
      projectId,
      actorId: ctx.user.id,
      action: "stage4.tasks_sent",
      detail: { count: pending.length },
    });
  }
  revalidatePath(`/p/${projectId}/deepdive`);
}

export async function regenerateSummary(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const assignmentId = String(formData.get("assignmentId"));
  const ctx = await requireProject(projectId);

  const [row] = await db
    .select({
      response: questionnaireResponses,
      title: longListItems.title,
    })
    .from(questionnaireResponses)
    .innerJoin(assignments, eq(assignments.id, questionnaireResponses.assignmentId))
    .innerJoin(shortlistItems, eq(shortlistItems.id, assignments.shortlistItemId))
    .innerJoin(longListItems, eq(longListItems.id, shortlistItems.longListItemId))
    .where(and(eq(assignments.id, assignmentId), eq(assignments.projectId, projectId)));
  if (!row) return;

  const result = await summarize(row.title, row.response.answers as Answers);
  await db.insert(aiSummaries).values({
    responseId: row.response.id,
    model: result.model,
    points: result.points,
    error: result.error ?? null,
  });
  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "ai.summary_regenerated",
    detail: { assignmentId },
  });
  revalidatePath(`/p/${projectId}/deepdive`);
}

export async function latestSummary(responseId: string) {
  const [row] = await db
    .select()
    .from(aiSummaries)
    .where(eq(aiSummaries.responseId, responseId))
    .orderBy(desc(aiSummaries.createdAt))
    .limit(1);
  return row ?? null;
}

/** Which of the shortlist rows carry into the Stage 5 calendar. */
export async function toggleFinalPlan(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const ids = formData.getAll("inFinalPlan").map(String);
  await requireProject(projectId);

  const all = await db
    .select({ id: shortlistItems.id })
    .from(shortlistItems)
    .where(eq(shortlistItems.projectId, projectId));

  await db.transaction(async (tx) => {
    await tx
      .update(shortlistItems)
      .set({ inFinalPlan: false })
      .where(eq(shortlistItems.projectId, projectId));
    if (ids.length) {
      await tx
        .update(shortlistItems)
        .set({ inFinalPlan: true })
        .where(inArray(shortlistItems.id, ids.filter((i) => all.some((a) => a.id === i))));
    }
  });
  revalidatePath(`/p/${projectId}/plan`);
}
