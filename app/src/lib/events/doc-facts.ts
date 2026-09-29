/**
 * Cost and age facts from a stored event document. Ingestion has written both
 * flat fields (costAmount, minAge) and nested ones (cost.amount, ageRange.min).
 */
export interface CostAndAge {
  costAmount: number | null;
  isFree: boolean | null;
  minAge: number | null;
  maxAge: number | null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function readCostAndAge(data: Record<string, unknown>): CostAndAge {
  const cost = record(data.cost);
  const age = record(data.ageRange);
  const costAmount = finiteNumber(data.costAmount) ?? finiteNumber(cost?.amount);
  const isFree = typeof data.isFree === "boolean"
    ? data.isFree
    : cost?.type === "free"
      ? true
      : costAmount != null
        ? costAmount === 0
        : null;
  return {
    costAmount,
    isFree,
    minAge: finiteNumber(data.minAge) ?? finiteNumber(age?.min),
    maxAge: finiteNumber(data.maxAge) ?? finiteNumber(age?.max),
  };
}

/** "Free · Ages 3–5", "$15 · Ages 18+", or "" when the source listed neither. */
export function costAndAgeLabel(facts: CostAndAge): string {
  const cost = facts.isFree
    ? "Free"
    : facts.costAmount != null && facts.costAmount > 0
      ? `$${Number.isInteger(facts.costAmount) ? facts.costAmount : facts.costAmount.toFixed(2)}`
      : "";
  const { minAge, maxAge } = facts;
  const ages = minAge != null && maxAge != null
    ? minAge === maxAge ? `Age ${minAge}` : `Ages ${minAge}–${maxAge}`
    : minAge != null
      ? `Ages ${minAge}+`
      : maxAge != null
        ? `Ages up to ${maxAge}`
        : "";
  return [cost, ages].filter(Boolean).join(" · ");
}
