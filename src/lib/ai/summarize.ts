import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { QUESTIONS, type Answers } from "@/lib/questionnaire";

/**
 * Stage 4 AI summary.
 *
 * Rules from the spec, enforced here rather than left to the prompt alone:
 * the summary is admin-only, always traceable to one response, never invents
 * facts, and never produces a recommendation. When the model is unavailable
 * the deterministic fallback keeps the feature working rather than failing —
 * and says which one produced the output.
 */

export type SummaryPoint = { heading: string; body: string };
export type SummaryResult = { points: SummaryPoint[]; model: string; error?: string };

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export const aiConfigured = () => Boolean(client);

const SYSTEM = `You summarise a single completed marketing-initiative plan for the admin who has to read a dozen of them.

Rules:
- Use ONLY what the plan says. Never add facts, benchmarks, or context that is not in the text.
- Do not recommend, score, rank, or judge whether the initiative is a good idea.
- Prefer the specific over the general: names, dates, numbers and named risks beat adjectives.
- Where the plan is thin, silent or internally inconsistent, say so plainly — that is the most useful thing you can tell the reader.
- British English. No marketing register, no filler, no restating the question.

Return 3-5 points as JSON: {"points":[{"heading":"...","body":"..."}]}
Headings are 2-5 words. Bodies are one or two sentences.`;

export async function summarize(
  initiativeTitle: string,
  answers: Answers,
): Promise<SummaryResult> {
  if (!client) return { ...fallback(answers), model: "fallback" };

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: render(initiativeTitle, answers) }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { points?: SummaryPoint[] };
    const points = (parsed.points ?? [])
      .filter((p) => p?.heading && p?.body)
      .slice(0, 5);

    if (!points.length) throw new Error("Model returned no usable points");
    return { points, model };
  } catch (e) {
    // AI-07: never lose the response because the summary failed.
    return {
      ...fallback(answers),
      model: "fallback",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** The plan, rendered as the question-and-answer text the model reads. */
function render(title: string, a: Answers): string {
  const lines: string[] = [`INITIATIVE: ${title}`, ""];
  for (const q of QUESTIONS) {
    const v = a[q.id as keyof Answers];
    let body = "";
    if (q.type === "milestones") {
      const ms = (a.milestones ?? []).filter((m) => m.what.trim());
      body = ms.length
        ? ms.map((m, i) => `  ${i + 1}. ${m.what} — due ${m.date || "no date"}, led by ${m.leader || "unassigned"}. Done when: ${m.done || "not defined"}`).join("\n")
        : "";
    } else if (q.type === "metrics") {
      body = (a.metrics ?? []).filter(Boolean).map((m, i) => `  ${i + 1}. ${m}`).join("\n");
    } else if (q.type === "risks") {
      const rs = (a.risks ?? []).filter((r) => r.risk.trim());
      body = rs.map((r, i) => `  ${i + 1}. ${r.risk} (likelihood: ${r.likelihood || "not stated"}) → ${r.counter || "no counter-measure given"}`).join("\n");
    } else if (typeof v === "string") {
      body = v.trim();
    }
    lines.push(`Q${q.n}. ${q.label}`, body ? body : "  [left blank]", "");
  }
  return lines.join("\n");
}

/**
 * Deterministic fallback. Pulls out the things an admin checks first — chiefly
 * whether the milestones actually roll up to the go-live date, which the source
 * Word form asks for explicitly.
 */
function fallback(a: Answers): { points: SummaryPoint[] } {
  const points: SummaryPoint[] = [];
  const clip = (s: string, n = 220) =>
    s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s;

  if (a.owner?.trim()) {
    points.push({
      heading: "Who is accountable",
      body: `${a.owner.trim()}${a.team?.trim() ? `, working with ${clip(a.team.trim(), 120)}` : ""}`,
    });
  }
  if (a.alignment?.trim()) {
    points.push({ heading: "How it connects", body: clip(a.alignment.trim()) });
  }

  const ms = (a.milestones ?? []).filter((m) => m.what.trim());
  const dated = ms.filter((m) => m.date);
  if (a.golive && dated.length) {
    const latest = dated.map((m) => m.date).sort().at(-1)!;
    const slips = latest > a.golive;
    points.push({
      heading: slips ? "Dates do not roll up" : "Timeline",
      body: slips
        ? `The last milestone is dated ${latest}, after the stated go-live of ${a.golive}. The plan asks for every milestone to roll up to the go-live date.`
        : `${ms.length} milestones, the last on ${latest}, against a go-live of ${a.golive}.`,
    });
  } else if (ms.length) {
    points.push({
      heading: "Milestones without dates",
      body: `${ms.length} milestones are listed but ${ms.length - dated.length} carry no date, so the timeline cannot be checked against the go-live.`,
    });
  }

  const metrics = (a.metrics ?? []).filter(Boolean);
  if (metrics.length) {
    points.push({
      heading: "How success is measured",
      body: metrics.map((m) => clip(m, 110)).join(" · "),
    });
  }

  const risks = (a.risks ?? []).filter((r) => r.risk.trim());
  const uncountered = risks.filter((r) => !r.counter.trim());
  if (risks.length) {
    points.push({
      heading: uncountered.length ? "Risks without counter-measures" : "The risk to watch",
      body: uncountered.length
        ? `${uncountered.length} of ${risks.length} risks have no counter-measure, starting with: ${clip(uncountered[0].risk, 140)}`
        : clip(risks[0].risk, 200),
    });
  }

  if (!points.length) {
    points.push({
      heading: "Not enough to summarise",
      body: "The plan is still largely empty, so there is nothing to pull out of it yet.",
    });
  }
  return { points: points.slice(0, 5) };
}
