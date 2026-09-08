import "server-only";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  directionItems,
  longListVersions,
  longListItems,
  assignments,
  scores,
  shortlistItems,
  questionnaireResponses,
  users,
} from "@/db/schema";
import { consolidate, type RankedItem } from "./scoring";
import type { StageKey, StageState } from "@/components/chrome";

type Project = typeof projects.$inferSelect;

/** The rail's lock/unlock rules, in one place. */
export function stageStates(p: Project): Record<Exclude<StageKey, "overview">, StageState> {
  const directionDone = Boolean(p.directionConfirmedAt);
  const shortlistDone = Boolean(p.shortlistApprovedAt);
  return {
    direction: directionDone ? "done" : "now",
    longlist: shortlistDone ? "done" : directionDone ? "now" : "off",
    deepdive: shortlistDone ? "now" : "off",
    plan: p.planCompletedAt ? "done" : shortlistDone ? "now" : "off",
  };
}

export async function loadDirection(projectId: string) {
  const rows = await db
    .select()
    .from(directionItems)
    .where(eq(directionItems.projectId, projectId))
    .orderBy(directionItems.kind, directionItems.position);

  const parents = rows.filter((r) => !r.parentId);
  const children = rows.filter((r) => r.parentId);
  const withSubs = parents.map((p) => ({
    ...p,
    subs: children.filter((c) => c.parentId === p.id),
  }));
  return {
    objectives: withSubs.filter((r) => r.kind === "objective"),
    initiatives: withSubs.filter((r) => r.kind === "initiative"),
  };
}

/** The newest long-list version for a project, creating one if none exists. */
export async function currentLongListVersion(projectId: string) {
  const [v] = await db
    .select()
    .from(longListVersions)
    .where(eq(longListVersions.projectId, projectId))
    .orderBy(desc(longListVersions.versionNumber))
    .limit(1);
  if (v) return v;

  const [created] = await db
    .insert(longListVersions)
    .values({ projectId, versionNumber: 1 })
    .returning();
  return created;
}

export async function loadLongList(versionId: string) {
  return db
    .select()
    .from(longListItems)
    .where(eq(longListItems.versionId, versionId))
    .orderBy(longListItems.position);
}

export type Participant = {
  assignmentId: string;
  userId: string;
  name: string | null;
  email: string;
  jobTitle: string | null;
  status: (typeof assignments.$inferSelect)["status"];
  sentAt: Date | null;
  openedAt: Date | null;
  submittedAt: Date | null;
  remindersSent: number;
  lastReminderAt: Date | null;
};

export async function loadScoringParticipants(projectId: string): Promise<Participant[]> {
  return db
    .select({
      assignmentId: assignments.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      jobTitle: users.jobTitle,
      status: assignments.status,
      sentAt: assignments.sentAt,
      openedAt: assignments.openedAt,
      submittedAt: assignments.submittedAt,
      remindersSent: assignments.remindersSent,
      lastReminderAt: assignments.lastReminderAt,
    })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .where(and(eq(assignments.projectId, projectId), eq(assignments.kind, "scoring")))
    .orderBy(users.name);
}

/** Consolidated ranking across every SUBMITTED scoring response. */
export async function loadRanking(
  projectId: string,
  versionId: string,
): Promise<{ items: (typeof longListItems.$inferSelect)[]; ranked: RankedItem[]; respondents: number }> {
  const items = await loadLongList(versionId);
  if (!items.length) return { items, ranked: [], respondents: 0 };

  const submittedAssignments = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(
      and(
        eq(assignments.projectId, projectId),
        eq(assignments.kind, "scoring"),
        eq(assignments.status, "submitted"),
      ),
    );

  if (!submittedAssignments.length) {
    return { items, ranked: consolidate(items.map((i) => i.id), []), respondents: 0 };
  }

  const ids = submittedAssignments.map((a) => a.id);
  const rows = await db
    .select({
      longListItemId: scores.longListItemId,
      assignmentId: scores.assignmentId,
      criterion: scores.criterion,
      value: scores.value,
    })
    .from(scores)
    .where(inArray(scores.assignmentId, ids));

  return {
    items,
    ranked: consolidate(items.map((i) => i.id), rows),
    respondents: ids.length,
  };
}

export async function loadShortlist(projectId: string) {
  return db
    .select({
      id: shortlistItems.id,
      rank: shortlistItems.rank,
      meanTotal: shortlistItems.meanTotal,
      sumTotal: shortlistItems.sumTotal,
      responseCount: shortlistItems.responseCount,
      inFinalPlan: shortlistItems.inFinalPlan,
      longListItemId: shortlistItems.longListItemId,
      title: longListItems.title,
      description: longListItems.description,
      directionItemId: longListItems.directionItemId,
    })
    .from(shortlistItems)
    .innerJoin(longListItems, eq(longListItems.id, shortlistItems.longListItemId))
    .where(eq(shortlistItems.projectId, projectId))
    .orderBy(shortlistItems.rank);
}

export type DeepDiveAssignment = Participant & {
  shortlistItemId: string | null;
  hasSummary: boolean;
};

export async function loadDeepDiveAssignments(projectId: string): Promise<DeepDiveAssignment[]> {
  return db
    .select({
      assignmentId: assignments.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      jobTitle: users.jobTitle,
      status: assignments.status,
      sentAt: assignments.sentAt,
      openedAt: assignments.openedAt,
      submittedAt: assignments.submittedAt,
      remindersSent: assignments.remindersSent,
      lastReminderAt: assignments.lastReminderAt,
      shortlistItemId: assignments.shortlistItemId,
      hasSummary: sql<boolean>`false`,
    })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .where(and(eq(assignments.projectId, projectId), eq(assignments.kind, "questionnaire")))
    .orderBy(users.name);
}

export async function loadQuestionnaireResponse(assignmentId: string) {
  const [row] = await db
    .select()
    .from(questionnaireResponses)
    .where(eq(questionnaireResponses.assignmentId, assignmentId))
    .limit(1);
  return row ?? null;
}

/** Everything the project overview needs, in one place. */
export async function projectFacts(p: Project) {
  const version = await currentLongListVersion(p.id);
  const items = await loadLongList(version.id);
  const participants = await loadScoringParticipants(p.id);
  const submitted = participants.filter((x) => x.status === "submitted").length;
  const deepDive = await loadDeepDiveAssignments(p.id);
  const shortlist = await loadShortlist(p.id);
  const direction = await loadDirection(p.id);

  return {
    version,
    items,
    participants,
    submitted,
    deepDive,
    deepDiveSubmitted: deepDive.filter((d) => d.status === "submitted").length,
    shortlist,
    direction,
    states: stageStates(p),
  };
}
