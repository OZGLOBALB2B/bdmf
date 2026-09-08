"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  longListItems,
  longListVersions,
  assignments,
  users,
  memberships,
  projects,
  shortlistItems,
  auditEvents,
} from "@/db/schema";
import { requireProject } from "@/lib/tenancy";
import { newToken, hashToken } from "@/lib/auth";
import { currentLongListVersion, loadLongList, loadRanking } from "@/lib/project";
import { send } from "@/lib/mail";
import { scoringInvite, reminder as reminderMail } from "@/lib/mail/templates";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INVITE_DAYS = 30;

/* ------------------------------------------------------------- the list */

async function editableVersion(projectId: string) {
  const v = await currentLongListVersion(projectId);
  if (v.lockedAt) throw new Error("The long list is locked because invitations have gone out.");
  return v;
}

export async function addLongListItem(projectId: string) {
  await requireProject(projectId);
  const v = await editableVersion(projectId);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${longListItems.position}), -1)` })
    .from(longListItems)
    .where(eq(longListItems.versionId, v.id));
  await db.insert(longListItems).values({ versionId: v.id, position: max + 1 });
  revalidatePath(`/p/${projectId}/longlist`);
}

export async function saveLongListItem(
  projectId: string,
  itemId: string,
  patch: { title?: string; description?: string; directionItemId?: string | null },
) {
  await requireProject(projectId);
  const v = await currentLongListVersion(projectId);
  if (v.lockedAt) throw new Error("The long list is locked.");
  await db
    .update(longListItems)
    .set(patch)
    .where(and(eq(longListItems.id, itemId), eq(longListItems.versionId, v.id)));
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function deleteLongListItem(projectId: string, itemId: string) {
  await requireProject(projectId);
  const v = await editableVersion(projectId);
  await db
    .delete(longListItems)
    .where(and(eq(longListItems.id, itemId), eq(longListItems.versionId, v.id)));
  revalidatePath(`/p/${projectId}/longlist`);
}

export async function moveLongListItem(projectId: string, itemId: string, delta: -1 | 1) {
  await requireProject(projectId);
  const v = await editableVersion(projectId);
  const items = await loadLongList(v.id);
  const i = items.findIndex((x) => x.id === itemId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= items.length) return;
  await db.transaction(async (tx) => {
    await tx.update(longListItems).set({ position: items[j].position }).where(eq(longListItems.id, items[i].id));
    await tx.update(longListItems).set({ position: items[i].position }).where(eq(longListItems.id, items[j].id));
  });
  revalidatePath(`/p/${projectId}/longlist`);
}

/* --------------------------------------------------------- invitations */

export type InviteResult = { sent: string[]; skipped: { email: string; why: string }[]; error?: string };

/**
 * Invites people to score. Locking happens here rather than as a separate
 * step: the moment the first invitation goes out, everyone must be scoring
 * the same list, so the version freezes.
 */
export async function inviteToScore(
  projectId: string,
  rawEmails: string[],
  message: string,
): Promise<InviteResult> {
  const ctx = await requireProject(projectId);
  const v = await currentLongListVersion(projectId);
  const items = await loadLongList(v.id);

  if (items.filter((i) => i.title.trim()).length < 2) {
    return { sent: [], skipped: [], error: "Write at least two initiatives before inviting anyone." };
  }

  const emails = [...new Set(rawEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const sent: string[] = [];
  const skipped: { email: string; why: string }[] = [];

  for (const email of emails) {
    if (!EMAIL.test(email)) {
      skipped.push({ email, why: "not a valid address" });
      continue;
    }

    // Find or create the person. Contributors are passwordless until they
    // ever need an account of their own.
    let [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!user) {
      [user] = await db.insert(users).values({ email }).returning({ id: users.id });
    }
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
          eq(assignments.kind, "scoring"),
          eq(assignments.userId, user.id),
        ),
      );
    if (dupe) {
      skipped.push({ email, why: "already invited" });
      continue;
    }

    const token = newToken();
    const [a] = await db
      .insert(assignments)
      .values({
        projectId,
        kind: "scoring",
        userId: user.id,
        longListVersionId: v.id,
        tokenHash: hashToken(token),
        status: "sent",
        message: message.trim() || null,
        sentAt: new Date(),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
      })
      .returning({ id: assignments.id });

    await send(
      scoringInvite({
        to: email,
        projectName: ctx.project.name,
        adminName: ctx.user.name || ctx.user.email,
        itemCount: items.filter((i) => i.title.trim()).length,
        token,
        message,
        assignmentId: a.id,
      }),
    );
    sent.push(email);
  }

  if (sent.length && !v.lockedAt) {
    await db.update(longListVersions).set({ lockedAt: new Date() }).where(eq(longListVersions.id, v.id));
  }
  if (sent.length) {
    await db.insert(auditEvents).values({
      workspaceId: ctx.workspaceId,
      projectId,
      actorId: ctx.user.id,
      action: "stage3.invited",
      detail: { emails: sent },
    });
  }

  revalidatePath(`/p/${projectId}/longlist`);
  return { sent, skipped };
}

/** Rate-limited so a reminder cannot be fired repeatedly by accident. */
const REMINDER_COOLDOWN_HOURS = 20;

export async function sendReminder(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const assignmentId = String(formData.get("assignmentId"));
  const ctx = await requireProject(projectId);

  const [row] = await db
    .select({ a: assignments, email: users.email })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .where(and(eq(assignments.id, assignmentId), eq(assignments.projectId, projectId)));
  if (!row || row.a.status === "submitted") return;

  if (row.a.lastReminderAt) {
    const hours = (Date.now() - row.a.lastReminderAt.getTime()) / 36e5;
    if (hours < REMINDER_COOLDOWN_HOURS) return;
  }

  // Reminders reissue the link rather than storing the original: the token is
  // only ever held hashed, so it cannot be read back out.
  const token = newToken();
  await db
    .update(assignments)
    .set({
      tokenHash: hashToken(token),
      remindersSent: row.a.remindersSent + 1,
      lastReminderAt: new Date(),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
    })
    .where(eq(assignments.id, assignmentId));

  await send(
    reminderMail({
      to: row.email,
      projectName: ctx.project.name,
      what: row.a.kind === "scoring" ? "the initiative scoring" : "a scope and success plan",
      token,
      assignmentId,
    }),
  );

  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "assignment.reminded",
    detail: { assignmentId, to: row.email },
  });
  revalidatePath(`/p/${projectId}/longlist`);
  revalidatePath(`/p/${projectId}/deepdive`);
}

export async function revokeAssignment(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const assignmentId = String(formData.get("assignmentId"));
  const ctx = await requireProject(projectId);
  await db
    .update(assignments)
    .set({ status: "revoked", expiresAt: new Date() })
    .where(and(eq(assignments.id, assignmentId), eq(assignments.projectId, projectId)));
  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "assignment.revoked",
    detail: { assignmentId },
  });
  revalidatePath(`/p/${projectId}/longlist`);
  revalidatePath(`/p/${projectId}/deepdive`);
}

/** Lets an admin unlock a submitted response so the person can change it. */
export async function reopenAssignment(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const assignmentId = String(formData.get("assignmentId"));
  const ctx = await requireProject(projectId);
  await db
    .update(assignments)
    .set({ status: "in_progress", submittedAt: null })
    .where(and(eq(assignments.id, assignmentId), eq(assignments.projectId, projectId)));
  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "assignment.reopened",
    detail: { assignmentId },
  });
  revalidatePath(`/p/${projectId}/longlist`);
  revalidatePath(`/p/${projectId}/deepdive`);
}

/* ------------------------------------------------------------ cut line */

export async function setCutLine(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const cutLine = Math.max(1, Math.min(20, Number(formData.get("cutLine")) || 6));
  await requireProject(projectId);
  await db.update(projects).set({ cutLine }).where(eq(projects.id, projectId));
  revalidatePath(`/p/${projectId}/longlist`);
}

/**
 * Freezes the ranking above the cut line into the shortlist and opens Stage 4.
 * The maths is snapshotted, so a later submission cannot silently rewrite
 * history for a shortlist that has already been acted on.
 */
export async function approveShortlist(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const ctx = await requireProject(projectId);
  const v = await currentLongListVersion(projectId);
  const { ranked } = await loadRanking(projectId, v.id);

  const keep = ranked.slice(0, ctx.project.cutLine);
  if (!keep.length) return;

  await db.transaction(async (tx) => {
    await tx.delete(shortlistItems).where(eq(shortlistItems.projectId, projectId));
    await tx.insert(shortlistItems).values(
      keep.map((r, i) => ({
        projectId,
        longListItemId: r.itemId,
        rank: i + 1,
        meanTotal: String(r.meanTotal),
        sumTotal: r.sumTotal,
        responseCount: r.responseCount,
      })),
    );
    await tx
      .update(projects)
      .set({ shortlistApprovedAt: new Date(), shortlistApprovedBy: ctx.user.id, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  });

  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "stage3.shortlist_approved",
    detail: { cutLine: ctx.project.cutLine, items: keep.map((k) => k.itemId) },
  });
  revalidatePath(`/p/${projectId}`, "layout");
}

export async function reopenShortlist(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const ctx = await requireProject(projectId);

  const existing = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.projectId, projectId), eq(assignments.kind, "questionnaire")));

  await db.transaction(async (tx) => {
    if (existing.length) {
      await tx.delete(assignments).where(inArray(assignments.id, existing.map((e) => e.id)));
    }
    await tx.delete(shortlistItems).where(eq(shortlistItems.projectId, projectId));
    await tx
      .update(projects)
      .set({ shortlistApprovedAt: null, shortlistApprovedBy: null, planCompletedAt: null })
      .where(eq(projects.id, projectId));
  });

  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "stage3.shortlist_reopened",
    detail: { discardedAssignments: existing.length },
  });
  revalidatePath(`/p/${projectId}`, "layout");
}
