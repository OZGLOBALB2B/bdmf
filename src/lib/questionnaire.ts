/**
 * Stage 4's ten-question questionnaire.
 *
 * The subjects and their order come from the Word form "Marketing initiative
 * scope and success plan"; the labels and guidance are taken verbatim from the
 * Figma wireframe (03 · Wireframes — Participant, frame P2 "Scope & Success
 * Plan"), which confirmed the same ten in the same sequence.
 *
 * Two places still differ from that wireframe deliberately, because the AI
 * summary reads these fields rather than just displaying them: success metrics
 * are three numbered inputs rather than one free-text box, so "up to three" is
 * enforced; and risks are three rows of risk / likelihood / counter-measure, so
 * the summary can say when a risk carries no counter-measure. Both are drawn as
 * plain text areas in the wireframe.
 */

export const TEMPLATE_VERSION = 1;

export type QuestionType = "long_text" | "short_text" | "date" | "milestones" | "metrics" | "risks";

export type Question = {
  id: string;
  n: number;
  type: QuestionType;
  label: string;
  help: string;
  required: boolean;
  placeholder?: string;
};

export const QUESTIONS: Question[] = [
  {
    id: "description",
    n: 1,
    type: "long_text",
    label: "Description",
    help: "A concise overview of the initiative and why it is strategically important.",
    required: true,
    placeholder: "What it is, and why it is worth doing now…",
  },
  {
    id: "alignment",
    n: 2,
    type: "long_text",
    label: "Strategic alignment",
    help: "Which business objective is this intended to advance? Pre-filled from the long list — change it if it is wrong.",
    required: true,
  },
  {
    id: "owner",
    n: 3,
    type: "short_text",
    label: "Owner (accountable)",
    help: "One name. The person answerable for the outcome, not the person doing the work.",
    required: true,
  },
  {
    id: "team",
    n: 4,
    type: "long_text",
    label: "Core team & stakeholders",
    help: "Who executes with you, who advises, and which internal or external contacts hold information you will need.",
    required: true,
  },
  {
    id: "milestones",
    n: 5,
    type: "milestones",
    label: "Key milestones & dates",
    help: "Four to six milestones. Realistic dates, and a clear definition of done for each.",
    required: true,
  },
  {
    id: "golive",
    n: 6,
    type: "date",
    label: "Go-live date",
    help: "A single board-level date. Every milestone above must roll up to it.",
    required: true,
  },
  {
    id: "metrics",
    n: 7,
    type: "metrics",
    label: "Success metrics",
    help: "Up to three SMART indicators that will show whether this worked.",
    required: true,
  },
  {
    id: "resources",
    n: 8,
    type: "long_text",
    label: "Required resources",
    help: "People, budget and managerial capacity — with the cost or effort against each.",
    required: true,
  },
  {
    id: "risks",
    n: 9,
    type: "risks",
    label: "Top 3 risks & counter-measures",
    help: "One line per risk, with its likelihood and the counter-measure. Example: delays in regulatory approval → early FDA engagement and parallel submission planning.",
    required: true,
  },
  {
    id: "extra",
    n: 10,
    type: "long_text",
    label: "Anything else",
    help: "Factors, insights or support needs that would strengthen this initiative and are not captured above.",
    required: false,
  },
];

export type Milestone = { what: string; date: string; leader: string; done: string };
export type Metric = string;
export type Risk = { risk: string; likelihood: string; counter: string };

export type Answers = {
  description?: string;
  alignment?: string;
  owner?: string;
  team?: string;
  milestones?: Milestone[];
  golive?: string;
  metrics?: Metric[];
  resources?: string;
  risks?: Risk[];
  extra?: string;
};

export const emptyMilestone = (): Milestone => ({ what: "", date: "", leader: "", done: "" });
export const emptyRisk = (): Risk => ({ risk: "", likelihood: "", counter: "" });

export function blankAnswers(): Answers {
  return {
    description: "",
    alignment: "",
    owner: "",
    team: "",
    milestones: Array.from({ length: 4 }, emptyMilestone),
    golive: "",
    metrics: ["", "", ""],
    resources: "",
    risks: Array.from({ length: 3 }, emptyRisk),
    extra: "",
  };
}

const filledMilestones = (m: Milestone[] = []) => m.filter((x) => x.what.trim());
const filledMetrics = (m: Metric[] = []) => m.filter((x) => x.trim());
const filledRisks = (r: Risk[] = []) => r.filter((x) => x.risk.trim());

/** Which questions still need an answer before the form can be submitted. */
export function missingAnswers(a: Answers): Question[] {
  return QUESTIONS.filter((q) => {
    if (!q.required) return false;
    switch (q.type) {
      case "milestones":
        return filledMilestones(a.milestones).length < 4;
      case "metrics":
        return filledMetrics(a.metrics).length < 1;
      case "risks":
        return filledRisks(a.risks).length < 3;
      default: {
        const v = a[q.id as keyof Answers];
        return typeof v !== "string" || !v.trim();
      }
    }
  });
}

/**
 * How many of the ten carry no answer at all — including question 10, which is
 * optional and so never appears in missingAnswers(). The footer counts out of
 * ten, so it has to count all ten or the figure contradicts the page.
 */
export function emptyCount(a: Answers): number {
  return QUESTIONS.filter((q) => {
    switch (q.type) {
      case "milestones":
        return filledMilestones(a.milestones).length === 0;
      case "metrics":
        return filledMetrics(a.metrics).length === 0;
      case "risks":
        return filledRisks(a.risks).length === 0;
      default: {
        const v = a[q.id as keyof Answers];
        return typeof v !== "string" || !v.trim();
      }
    }
  }).length;
}

/** 0..1, for any progress indicator. */
export function completion(a: Answers): number {
  const answered = QUESTIONS.length - missingAnswers(a).length;
  return answered / QUESTIONS.length;
}
