/**
 * The BDMF prioritization maths.
 *
 * Source of truth is the scoring matrix on slides 8 and 23 of the Spectrum
 * deck: three criteria, each scored 1-5, anchored Low 1 / Moderate 3 / High 5.
 * Every respondent scores every initiative on all three, so one respondent
 * contributes at most 15 points to an initiative.
 *
 * Ranking uses the MEAN across respondents, not the sum. The deck sums, which
 * ranks identically when everyone submits but silently penalises initiatives
 * whenever someone does not — and this product deliberately lets an admin look
 * at results while responses are still outstanding. The sum is still shown, so
 * the number in the product reconciles with the number in the deck.
 */

export type CriterionKey = "impact" | "differentiation" | "feasibility";

export const CRITERIA: {
  key: CriterionKey;
  label: string;
  short: string;
  question: string;
}[] = [
  {
    key: "impact",
    label: "Business impact",
    short: "Impact",
    question:
      "Does this initiative directly advance a defined business objective — growth, market expansion, strategic accounts, profitability?",
  },
  {
    key: "differentiation",
    label: "Strategic differentiation",
    short: "Differentiation",
    question:
      "Will this initiative meaningfully strengthen our competitive position, or create a defensible advantage?",
  },
  {
    key: "feasibility",
    label: "Feasibility & focus",
    short: "Feasibility",
    question:
      "Can we realistically execute this within the next 12 months — with leadership attention and the resources available?",
  },
];

export const SCALE = [
  { value: 1, label: "Low" },
  { value: 2, label: "" },
  { value: 3, label: "Moderate" },
  { value: 4, label: "" },
  { value: 5, label: "High" },
] as const;

export const MAX_PER_RESPONDENT = CRITERIA.length * 5; // 15

export type RawScore = {
  longListItemId: string;
  assignmentId: string;
  criterion: string;
  value: number;
};

export type RankedItem = {
  itemId: string;
  /** Mean of each criterion across respondents who scored it. */
  byCriterion: Record<CriterionKey, { mean: number; sum: number; count: number }>;
  /** Sum of the three criterion means — the ranking key, out of 15. */
  meanTotal: number;
  /** Raw sum across all respondents — comparable with the deck's matrix. */
  sumTotal: number;
  /** How many respondents scored this item at all. */
  responseCount: number;
  rank: number;
  /** True when this item was scored by fewer people than the leader. */
  incomplete: boolean;
};

/**
 * Consolidate submitted scores into a ranking.
 *
 * `itemIds` fixes the row set and the tie-break order, so an initiative nobody
 * scored still appears (with zero) rather than vanishing.
 */
export function consolidate(itemIds: string[], rows: RawScore[]): RankedItem[] {
  const respondentsPerItem = new Map<string, Set<string>>();
  const acc = new Map<string, Map<CriterionKey, number[]>>();

  for (const id of itemIds) {
    acc.set(id, new Map(CRITERIA.map((c) => [c.key, [] as number[]])));
    respondentsPerItem.set(id, new Set());
  }

  for (const r of rows) {
    const item = acc.get(r.longListItemId);
    if (!item) continue;
    const bucket = item.get(r.criterion as CriterionKey);
    if (!bucket) continue;
    bucket.push(r.value);
    respondentsPerItem.get(r.longListItemId)!.add(r.assignmentId);
  }

  const maxRespondents = Math.max(
    0,
    ...itemIds.map((id) => respondentsPerItem.get(id)!.size),
  );

  const scored = itemIds.map((itemId) => {
    const byCriterion = {} as RankedItem["byCriterion"];
    let meanTotal = 0;
    let sumTotal = 0;

    for (const c of CRITERIA) {
      const values = acc.get(itemId)!.get(c.key)!;
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = values.length ? sum / values.length : 0;
      byCriterion[c.key] = { mean, sum, count: values.length };
      meanTotal += mean;
      sumTotal += sum;
    }

    const responseCount = respondentsPerItem.get(itemId)!.size;
    return {
      itemId,
      byCriterion,
      meanTotal: round2(meanTotal),
      sumTotal,
      responseCount,
      rank: 0,
      incomplete: responseCount < maxRespondents,
    };
  });

  // Rank by mean; ties break on the raw sum, then on original list order so
  // the order is stable rather than arbitrary.
  const order = new Map(itemIds.map((id, i) => [id, i]));
  scored.sort(
    (a, b) =>
      b.meanTotal - a.meanTotal ||
      b.sumTotal - a.sumTotal ||
      order.get(a.itemId)! - order.get(b.itemId)!,
  );

  // Equal means share a rank, so the admin can see a genuine tie at the cut line.
  let lastMean = Number.NaN;
  let lastRank = 0;
  scored.forEach((s, i) => {
    if (s.meanTotal === lastMean) {
      s.rank = lastRank;
    } else {
      s.rank = i + 1;
      lastRank = s.rank;
      lastMean = s.meanTotal;
    }
  });

  return scored;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Formats a mean for display: 11.67, but 12 rather than 12.00. */
export const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
