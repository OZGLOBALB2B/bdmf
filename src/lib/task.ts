import "server-only";
import { eq, and, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { alias } from "drizzle-orm/pg-core";
import {
  assignments,
  users,
  projects,
  longListItems,
  shortlistItems,
  directionItems,
  questionnaireResponses,
} from "@/db/schema";
import { hashToken } from "./auth";
import { markVerifiedByLink } from "./verification";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Contributor access. The invitation token IS the credential — there is no
 * session, no password, and no way to reach anything but this one task. The
 * token is only ever stored hashed, so a leaked database does not hand out
 * working links.
 */

export type ResolvedTask =
  | { kind: "invalid"; reason: "unknown" | "expired" | "revoked" }
  | {
      kind: "scoring";
      assignment: typeof assignments.$inferSelect;
      person: { name: string | null; email: string };
      project: { id: string; name: string };
      items: (typeof longListItems.$inferSelect)[];
    }
  | {
      kind: "questionnaire";
      assignment: typeof assignments.$inferSelect;
      person: { name: string | null; email: string };
      project: { id: string; name: string };
      initiative: {
        id: string;
        title: string;
        description: string;
        /** Where this sat in the consolidated ranking, and out of how many. */
        rank: number;
        outOf: number;
        sumTotal: number;
        /** The Stage 2 objective the long-list row was linked to, if any. */
        linkedObjective: string | null;
      };
      response: typeof questionnaireResponses.$inferSelect | null;
    };

/**
 * `token` is normally the emailed invitation token. A signed-in contributor
 * reaching a task from their own task list passes the assignment id instead —
 * that path requires `viewerId` to own the assignment, so it grants nothing
 * the session did not already carry.
 */
export async function resolveTask(token: string, viewerId?: string): Promise<ResolvedTask> {
  const byId = UUID.test(token);
  if (byId && !viewerId) return { kind: "invalid", reason: "unknown" };

  const [row] = await db
    .select({
      a: assignments,
      name: users.name,
      email: users.email,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .innerJoin(projects, eq(projects.id, assignments.projectId))
    .where(
      byId
        ? and(eq(assignments.id, token), eq(assignments.userId, viewerId!))
        : eq(assignments.tokenHash, hashToken(token)),
    )
    .limit(1);

  if (!row) return { kind: "invalid", reason: "unknown" };
  if (row.a.status === "revoked") return { kind: "invalid", reason: "revoked" };
  if (row.a.expiresAt.getTime() < Date.now()) return { kind: "invalid", reason: "expired" };

  const person = { name: row.name, email: row.email };
  const project = { id: row.projectId, name: row.projectName };

  if (row.a.kind === "scoring") {
    const items = await db
      .select()
      .from(longListItems)
      .where(eq(longListItems.versionId, row.a.longListVersionId!))
      .orderBy(longListItems.position);
    return {
      kind: "scoring",
      assignment: row.a,
      person,
      project,
      items: items.filter((i) => i.title.trim()),
    };
  }

  // The linked objective may itself be a sub-item (1.1, 1.2), so its parent is
  // joined too — the wireframe shows the pair as "parent → child".
  const objective = alias(directionItems, "objective");
  const objectiveParent = alias(directionItems, "objective_parent");

  const [sl] = await db
    .select({
      id: shortlistItems.id,
      title: longListItems.title,
      description: longListItems.description,
      rank: shortlistItems.rank,
      sumTotal: shortlistItems.sumTotal,
      versionId: longListItems.versionId,
      objectiveTitle: objective.title,
      parentTitle: objectiveParent.title,
    })
    .from(shortlistItems)
    .innerJoin(longListItems, eq(longListItems.id, shortlistItems.longListItemId))
    .leftJoin(objective, eq(objective.id, longListItems.directionItemId))
    .leftJoin(objectiveParent, eq(objectiveParent.id, objective.parentId))
    .where(eq(shortlistItems.id, row.a.shortlistItemId!));

  if (!sl) return { kind: "invalid", reason: "unknown" };

  const [{ outOf }] = await db
    .select({ outOf: sql<number>`count(*)` })
    .from(longListItems)
    .where(eq(longListItems.versionId, sl.versionId));

  const linkedObjective = sl.objectiveTitle
    ? sl.parentTitle
      ? `${sl.parentTitle} → ${sl.objectiveTitle}`
      : sl.objectiveTitle
    : null;

  const [response] = await db
    .select()
    .from(questionnaireResponses)
    .where(eq(questionnaireResponses.assignmentId, row.a.id))
    .limit(1);

  return {
    kind: "questionnaire",
    assignment: row.a,
    person,
    project,
    initiative: {
      id: sl.id,
      title: sl.title,
      description: sl.description,
      rank: sl.rank,
      outOf: Number(outOf),
      sumTotal: sl.sumTotal,
      linkedObjective,
    },
    response: response ?? null,
  };
}

/**
 * Records the first open, so the admin's tracker can tell "sent" from "seen".
 *
 * Following the link also proves the person controls the address it was sent
 * to, so their email is marked confirmed here rather than making them prove
 * the same thing a second time.
 */
export async function markOpened(assignmentId: string, status: string, userId?: string) {
  if (status === "sent") {
    await db
      .update(assignments)
      .set({ status: "opened", openedAt: new Date() })
      .where(and(eq(assignments.id, assignmentId), eq(assignments.status, "sent")));
  }
  if (userId) await markVerifiedByLink(userId);
}

/** Resolves a token to an assignment for a write, or throws. */
export async function assignmentForToken(token: string, viewerId?: string) {
  const byId = UUID.test(token);
  if (byId && !viewerId) throw new Error("This link is no longer valid.");

  const [row] = await db
    .select()
    .from(assignments)
    .where(
      and(
        byId
          ? and(eq(assignments.id, token), eq(assignments.userId, viewerId!))
          : eq(assignments.tokenHash, hashToken(token)),
        gt(assignments.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row || row.status === "revoked") throw new Error("This link is no longer valid.");
  return row;
}
