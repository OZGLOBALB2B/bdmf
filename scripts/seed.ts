/**
 * Seeds the Spectrum Dynamics case study from the BDMF deck, so a fresh
 * database is immediately walkable end to end.
 *
 * Run: npm run seed  (destructive — it clears the demo workspace first)
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  workspaces, users, memberships, projects, directionItems,
  longListVersions, longListItems, assignments, scores,
} from "../src/db/schema";
import { hashPassword, newToken, hashToken } from "../src/lib/crypto";
import { CRITERIA } from "../src/lib/scoring";

const ADMIN_EMAIL = "naomi@ozglobalb2b.com";
const ADMIN_PASSWORD = "bdmf-demo-2026";

const OBJECTIVES: [string, string][] = [
  ["Consistent double-digit growth", "CAGR of 22.5% over the next three years."],
  ["Positive EBITDA from 2027", "Reach and hold profitability from 2027 onward."],
  ["Growth is organic", "Growth comes from the existing business, not acquisition."],
];

const INITIATIVES: [string, string, string[]][] = [
  ["SPECT-CT penetration", "Achieve significant penetration in the SPECT-CT segment.", [
    "Drive digital transformation — join GE in moving the market to digital",
    "Lead the theranostics segment — partner with theranostics centres",
  ]],
  ["Cardiology digital imaging", "Maintain dominant leadership in cardiology digital imaging.", []],
  ["Land and expand", "Enter accounts with an entry-level system and upgrade over time.", [
    "High-end solutions for accounts with the capability needs and the budget",
    "Entry-level entry with a defined upgrade path — refurbished to new, VISTA to Cardio",
  ]],
  ["Portfolio expansion", "Veriton All-Energy, a low-cost version, and cost optimisation of the high-end line.", []],
  ["Focus on US, Europe and China", "Expand service infrastructure: two logistics hubs in the US, three across Europe.", []],
];

/** The long list, and the deck's combined scores per criterion (out of 25). */
const LONG_LIST: [title: string, description: string, impact: number, differentiation: number, feasibility: number][] = [
  ["Company brand strategy", "Define a differentiated brand strategy and visual identity to support the next stage of growth.", 22, 24, 23],
  ["KOL strategy", "Build a structured clinical advocacy program to strengthen credibility and peer influence.", 25, 25, 23],
  ["Theranostics brand ambassador", "Engage a recognised theranostics voice to position digital SPECT-CT as a critical enabler for pharma.", 19, 19, 15],
  ["Strategic society engagement", "Prioritise and engage the key professional societies to increase visibility and influence.", 17, 14, 14],
  ["Door-opener blueprint", "Identify internal influencers and equip them with messages that open doors in target institutions.", 12, 11, 11],
  ["Reposition SPECT cardiology", "Reframe the narrative around clinical relevance, innovation potential and ongoing demand.", 13, 13, 8],
  ["Sales enablement materials", "Align sales presentations and collateral with the new value proposition and visual identity.", 22, 22, 23],
  ["Market prioritisation", "Identify the highest-potential sub-markets within existing territories.", 13, 12, 13],
  ["Brand recognition campaign", "Build awareness and communicate who we are, what we offer and why we are different.", 19, 19, 18],
  ["Next-generation education strategy", "Engage physicians and technicians early in their careers to build long-term preference.", 24, 24, 16],
  ["Trade-in and upgrade program", "Drive replacement opportunities through structured upgrade and competitive trade-in offers.", 14, 12, 17],
  ["Segment-specific GTM playbooks", "Develop tailored go-to-market approaches for priority segments and geographies.", 16, 14, 19],
  ["Cardiac.AI positioning", "Build a narrative that communicates Cardiac.AI's differentiation and clinical value.", 10, 10, 12],
];

const PEOPLE: [string, string, string][] = [
  ["Dana Levi", "dana@spectrum-demo.com", "Chief Executive"],
  ["Gil Naor", "gil@spectrum-demo.com", "VP Sales"],
  ["Ronit Bar", "ronit@spectrum-demo.com", "VP R&D"],
  ["Amit Cohen", "amit@spectrum-demo.com", "Regional Director, US"],
  ["Sara Klein", "sara@spectrum-demo.com", "Marketing Manager"],
];

/** Spreads a combined /25 score back over five respondents as plausible 1-5s. */
function spread(combined: number, respondents: number): number[] {
  const base = combined / 5;
  const out: number[] = [];
  let remaining = (base / 5) * respondents * 5; // target total for this many people
  for (let i = 0; i < respondents; i++) {
    const left = respondents - i;
    const ideal = remaining / left;
    const v = Math.max(1, Math.min(5, Math.round(ideal + (i % 2 === 0 ? 0.2 : -0.2))));
    out.push(v);
    remaining -= v;
  }
  return out;
}

async function main() {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.name, "Spectrum Dynamics"));
  if (existing) {
    await db.delete(workspaces).where(eq(workspaces.id, existing.id));
    console.log("• cleared the previous demo workspace");
  }
  await db.delete(users).where(eq(users.email, ADMIN_EMAIL));
  for (const [, email] of PEOPLE) {
    await db.delete(users).where(eq(users.email, email));
  }

  const [ws] = await db.insert(workspaces).values({
    name: "Spectrum Dynamics", clientDescriptor: "Medical imaging",
  }).returning();

  const [admin] = await db.insert(users).values({
    email: ADMIN_EMAIL, name: "Naomi Oz",
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    emailVerifiedAt: new Date(),
  }).returning();
  await db.insert(memberships).values({ userId: admin.id, workspaceId: ws.id, role: "admin" });

  const [project] = await db.insert(projects).values({
    workspaceId: ws.id, name: "Spectrum Dynamics 2027", planYear: 2027,
    ownerId: admin.id, cutLine: 6,
    directionConfirmedAt: new Date(), directionConfirmedBy: admin.id,
  }).returning();

  for (const [i, [title, body]] of OBJECTIVES.entries()) {
    await db.insert(directionItems).values({ projectId: project.id, kind: "objective", title, body, position: i });
  }
  for (const [i, [title, body, subs]] of INITIATIVES.entries()) {
    const [parent] = await db.insert(directionItems)
      .values({ projectId: project.id, kind: "initiative", title, body, position: i })
      .returning();
    for (const [j, sub] of subs.entries()) {
      await db.insert(directionItems).values({
        projectId: project.id, kind: "initiative", parentId: parent.id, title: sub, position: j,
      });
    }
  }

  const [version] = await db.insert(longListVersions)
    .values({ projectId: project.id, versionNumber: 1, lockedAt: new Date() })
    .returning();

  const itemIds: string[] = [];
  for (const [i, [title, description]] of LONG_LIST.entries()) {
    const [item] = await db.insert(longListItems)
      .values({ versionId: version.id, title, description, position: i })
      .returning();
    itemIds.push(item.id);
  }

  // Three of five have submitted, one is mid-way, one has not opened it —
  // so every state in the tracker is visible without clicking anything.
  const submittedCount = 3;
  const people = [];
  for (const [i, [name, email, jobTitle]] of PEOPLE.entries()) {
    const [u] = await db.insert(users).values({ email, name, jobTitle }).returning();
    await db.insert(memberships).values({ userId: u.id, workspaceId: ws.id, role: "contributor" });

    const token = newToken();
    const status = i < submittedCount ? "submitted" : i === 3 ? "in_progress" : "sent";
    const [a] = await db.insert(assignments).values({
      projectId: project.id, kind: "scoring", userId: u.id, longListVersionId: version.id,
      tokenHash: hashToken(token), status,
      sentAt: new Date(Date.now() - 5 * 864e5),
      openedAt: i < 4 ? new Date(Date.now() - 4 * 864e5) : null,
      submittedAt: i < submittedCount ? new Date(Date.now() - (3 - i) * 864e5) : null,
      expiresAt: new Date(Date.now() + 30 * 864e5),
    }).returning();
    people.push({ ...u, assignmentId: a.id, status, token, name });
  }

  for (const [row, itemId] of itemIds.entries()) {
    const combined = [LONG_LIST[row][2], LONG_LIST[row][3], LONG_LIST[row][4]];
    const per = CRITERIA.map((_, c) => spread(combined[c], submittedCount));
    for (const [i, p] of people.entries()) {
      if (p.status === "sent") continue;
      const partial = p.status === "in_progress" && row > 3; // stopped a third of the way in
      if (partial) continue;
      for (const [c, crit] of CRITERIA.entries()) {
        const value = i < submittedCount ? per[c][i] : Math.max(1, Math.min(5, per[c][0]));
        await db.insert(scores).values({
          assignmentId: p.assignmentId, longListItemId: itemId, criterion: crit.key, value,
        });
      }
    }
  }

  console.log(`
✓ Seeded the Spectrum Dynamics case study

  Sign in   ${ADMIN_EMAIL}
  Password  ${ADMIN_PASSWORD}

  Project   Spectrum Dynamics 2027 — stage 2 confirmed, 13 initiatives on the
            long list, 3 of 5 people scored, 1 part-way, 1 not started.

  Working links for the two people who have not finished:
${people.filter((p) => p.status !== "submitted").map((p) => `    ${p.name.padEnd(12)} ${process.env.APP_URL || "http://localhost:3000"}/t/${p.token}`).join("\n")}
`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
