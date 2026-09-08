/**
 * Stage 4's "ten-question questionnaire".
 *
 * Slide 9 of the Spectrum deck is still a placeholder reading "insert 10
 * questions", so the authoritative source is the Word form "Marketing
 * initiative scope and success plan". Its eleven field groups become ten
 * questions here because the initiative title is inherited from the shortlist
 * rather than retyped, and strategic alignment is pre-filled from the Stage 2
 * objective the long-list row was linked to.
 *
 * ASSUMPTION, flagged for OZ: if a canonical list of ten questions exists
 * elsewhere, bump TEMPLATE_VERSION and add it — responses store the version
 * they answered, so old submissions stay readable.
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
    label: "What is this initiative?",
    help: "A concise overview, and why it matters strategically.",
    required: true,
    placeholder: "What it is, and why it is worth doing now…",
  },
  {
    id: "alignment",
    n: 2,
    type: "long_text",
    label: "How does it advance the business?",
    help: "The business objective this initiative is intended to move. Pre-filled from the business direction where the long list was linked to one.",
    required: true,
  },
  {
    id: "owner",
    n: 3,
    type: "short_text",
    label: "Who is accountable?",
    help: "One name. The person answerable for the outcome, not the person doing the work.",
    required: true,
  },
  {
    id: "team",
    n: 4,
    type: "long_text",
    label: "Who else is involved?",
    help: "The colleagues who will execute it with you, the advisors you can consult, and the internal or external contacts who hold information you will need.",
    required: true,
  },
  {
    id: "milestones",
    n: 5,
    type: "milestones",
    label: "What are the milestones?",
    help: "Four to six. Realistic dates, and a clear definition of done for each.",
    required: true,
  },
  {
    id: "golive",
    n: 6,
    type: "date",
    label: "What is the go-live date?",
    help: "A single, board-level date. Every milestone above should roll up to it.",
    required: true,
  },
  {
    id: "metrics",
    n: 7,
    type: "metrics",
    label: "How will you know it worked?",
    help: "Up to three SMART indicators — specific, measurable, achievable, relevant, time-bound.",
    required: true,
  },
  {
    id: "resources",
    n: 8,
    type: "long_text",
    label: "What will it take?",
    help: "People and effort, budget and amount, and the managerial capacity required.",
    required: true,
  },
  {
    id: "risks",
    n: 9,
    type: "risks",
    label: "What could go wrong?",
    help: "The top three risks, each with a likelihood and a one-line counter-measure. For example — Risk: delays in regulatory approval. Counter-measure: early engagement with the FDA and parallel submission planning.",
    required: true,
  },
  {
    id: "extra",
    n: 10,
    type: "long_text",
    label: "Anything else?",
    help: "Factors, insights or support needs that would strengthen this initiative but were not captured above.",
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

/** 0..1, for the progress indicator on the contributor's form. */
export function completion(a: Answers): number {
  const answered = QUESTIONS.length - missingAnswers(a).length;
  return answered / QUESTIONS.length;
}
