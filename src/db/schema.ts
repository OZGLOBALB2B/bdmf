/**
 * BDMF data model.
 *
 * Tenancy rule: every row that holds client content carries a workspaceId,
 * directly or through its parent. Nothing is queried without one — see
 * src/lib/tenancy.ts. Hiding UI is not access control.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const roleEnum = pgEnum("role", ["admin", "contributor"]);
export const projectStatusEnum = pgEnum("project_status", ["active", "archived"]);
export const directionKindEnum = pgEnum("direction_kind", ["objective", "initiative"]);
export const assignmentKindEnum = pgEnum("assignment_kind", ["scoring", "questionnaire"]);
export const assignmentStatusEnum = pgEnum("assignment_status", [
  "draft", // created, invitation not sent
  "sent", // invitation delivered, task not opened
  "opened", // link followed at least once
  "in_progress", // a draft answer has been saved
  "submitted",
  "revoked",
]);
export const stageStatusEnum = pgEnum("stage_status", [
  "not_started",
  "in_progress",
  "awaiting_responses",
  "ready_for_review",
  "complete",
]);

/* ---------------------------------------------------------------- tenants */

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  clientDescriptor: text("client_descriptor"), // e.g. "Medical imaging"
  suspended: boolean("suspended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    jobTitle: text("job_title"),
    passwordHash: text("password_hash"), // null for contributors who only ever use magic links
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false), // OZ staff
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("contributor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_user_workspace_key").on(t.userId, t.workspaceId),
    index("memberships_workspace_idx").on(t.workspaceId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(), // sha256 of the opaque cookie value
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_key").on(t.tokenHash)],
);

/* --------------------------------------------------------------- projects */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    planYear: integer("plan_year").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    status: projectStatusEnum("status").notNull().default("active"),

    // stage gates. Numbering follows the brief: 1 access, 2 direction,
    // 3 long list, 4 deep dive, 5 annual plan.
    directionConfirmedAt: timestamp("direction_confirmed_at", { withTimezone: true }),
    directionConfirmedBy: uuid("direction_confirmed_by").references(() => users.id),
    shortlistApprovedAt: timestamp("shortlist_approved_at", { withTimezone: true }),
    shortlistApprovedBy: uuid("shortlist_approved_by").references(() => users.id),
    planCompletedAt: timestamp("plan_completed_at", { withTimezone: true }),

    /** How many ranked items survive the cut into the shortlist. */
    cutLine: integer("cut_line").notNull().default(6),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_workspace_idx").on(t.workspaceId)],
);

/* ------------------------------------------------- stage 2: direction ---- */

export const directionItems = pgTable(
  "direction_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: directionKindEnum("kind").notNull(),
    /** Optional one level of nesting, matching 1.1 / 1.2 in the Spectrum deck. */
    parentId: uuid("parent_id"),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("direction_items_project_idx").on(t.projectId, t.kind, t.position)],
);

/* ------------------------------------------------ stage 3: long list ----- */

/**
 * The long list is versioned: respondents must always score a frozen version,
 * so editing after invitations have gone out creates a new version rather than
 * silently changing what people already scored.
 */
export const longListVersions = pgTable(
  "long_list_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull().default(1),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("long_list_versions_project_idx").on(t.projectId)],
);

export const longListItems = pgTable(
  "long_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => longListVersions.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    /** Optional provenance: which Stage 2 objective/initiative this serves. */
    directionItemId: uuid("direction_item_id").references(() => directionItems.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("long_list_items_version_idx").on(t.versionId, t.position)],
);

/* ------------------------------------------------------- assignments ----- */

/**
 * One row per person per task. Carries the single-purpose access token that
 * scopes a contributor to exactly one page.
 */
export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: assignmentKindEnum("kind").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** scoring: the frozen list version. questionnaire: null. */
    longListVersionId: uuid("long_list_version_id").references(() => longListVersions.id, {
      onDelete: "cascade",
    }),
    /** questionnaire: which shortlisted initiative. scoring: null. */
    shortlistItemId: uuid("shortlist_item_id"),

    tokenHash: text("token_hash").notNull(),
    status: assignmentStatusEnum("status").notNull().default("draft"),
    message: text("message"), // optional note from the admin
    dueOn: timestamp("due_on", { withTimezone: true }),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    remindersSent: integer("reminders_sent").notNull().default(0),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assignments_token_key").on(t.tokenHash),
    index("assignments_project_idx").on(t.projectId, t.kind),
    index("assignments_user_idx").on(t.userId),
  ],
);

/* -------------------------------------------------- scoring responses ---- */

/**
 * One score per (assignment, long list item, criterion). Criteria are keyed
 * strings rather than columns so the criteria set can change without a
 * migration — see CRITERIA in src/lib/scoring.ts.
 */
export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    longListItemId: uuid("long_list_item_id")
      .notNull()
      .references(() => longListItems.id, { onDelete: "cascade" }),
    criterion: text("criterion").notNull(),
    value: integer("value").notNull(), // 1..5
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("scores_unique").on(t.assignmentId, t.longListItemId, t.criterion),
    index("scores_item_idx").on(t.longListItemId),
  ],
);

/* --------------------------------------------------------- shortlist ----- */

export const shortlistItems = pgTable(
  "shortlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    longListItemId: uuid("long_list_item_id")
      .notNull()
      .references(() => longListItems.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    /** Snapshot of the ranking maths at the moment the admin approved. */
    meanTotal: text("mean_total").notNull().default("0"),
    sumTotal: integer("sum_total").notNull().default(0),
    responseCount: integer("response_count").notNull().default(0),
    /** Carried into the Stage 5 calendar. */
    inFinalPlan: boolean("in_final_plan").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shortlist_project_idx").on(t.projectId, t.rank)],
);

/* -------------------------------------------- stage 4: questionnaire ----- */

export const questionnaireResponses = pgTable(
  "questionnaire_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    /** Which version of the question set was answered. */
    templateVersion: integer("template_version").notNull().default(1),
    /** Keyed by question id; see src/lib/questionnaire.ts. */
    answers: jsonb("answers").notNull().default({}),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("questionnaire_responses_assignment_key").on(t.assignmentId)],
);

export const aiSummaries = pgTable(
  "ai_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => questionnaireResponses.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    /** [{ heading, body }] — always traceable back to responseId. */
    points: jsonb("points").notNull().default([]),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_summaries_response_idx").on(t.responseId)],
);

/* ------------------------------------------------------------- audit ----- */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    detail: jsonb("detail").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_workspace_idx").on(t.workspaceId, t.createdAt)],
);

export const mailLog = pgTable("mail_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  template: text("template").notNull(),
  assignmentId: uuid("assignment_id").references(() => assignments.id, { onDelete: "set null" }),
  providerId: text("provider_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
