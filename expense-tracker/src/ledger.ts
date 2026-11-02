// Domain types and pure functions. No DOM, so it's unit-testable in Node.

export const EXPENSE_CATEGORIES = [
  "Housing", "Food", "Transport", "Shopping", "Bills", "Health", "Fun", "Other",
] as const;
export const INCOME_CATEGORIES = ["Salary", "Freelance", "Gift", "Other"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

interface BaseTransaction {
  id: string;
  description: string;
  amountCents: number; // integer cents: avoids floating-point rounding bugs
  date: string;        // ISO date, YYYY-MM-DD
}

// A discriminated union: `kind` decides which categories are valid.
export type Transaction =
  | (BaseTransaction & { kind: "expense"; category: ExpenseCategory })
  | (BaseTransaction & { kind: "income"; category: IncomeCategory });

export interface Filters {
  month: string | "all";   // YYYY-MM
  category: string | "all";
}

export interface Summary {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  byCategory: { category: ExpenseCategory; cents: number }[]; // expenses only, largest first
}

export const toCents = (input: string): number | null => {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

export const formatMoney = (cents: number, currency = "USD"): string =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);

export const monthOf = (isoDate: string): string => isoDate.slice(0, 7);

export function applyFilters(list: readonly Transaction[], f: Filters): Transaction[] {
  return list
    .filter((t) => f.month === "all" || monthOf(t.date) === f.month)
    .filter((t) => f.category === "all" || t.category === f.category)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function summarize(list: readonly Transaction[]): Summary {
  let incomeCents = 0;
  let expenseCents = 0;
  const totals = new Map<ExpenseCategory, number>();

  for (const t of list) {
    if (t.kind === "income") {
      incomeCents += t.amountCents;
    } else {
      expenseCents += t.amountCents;
      totals.set(t.category, (totals.get(t.category) ?? 0) + t.amountCents);
    }
  }

  const byCategory = [...totals.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);

  return { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents, byCategory };
}

export function availableMonths(list: readonly Transaction[]): string[] {
  return [...new Set(list.map((t) => monthOf(t.date)))].sort().reverse();
}

const csvCell = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function toCSV(list: readonly Transaction[]): string {
  const header = ["date", "kind", "category", "description", "amount"];
  const rows = list.map((t) =>
    [t.date, t.kind, t.category, t.description, (t.amountCents / 100).toFixed(2)].map(csvCell).join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

/** Runtime check for data loaded from storage, which TypeScript can't verify. */
export function isTransaction(value: unknown): value is Transaction {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  const base =
    typeof t.id === "string" &&
    typeof t.description === "string" &&
    Number.isInteger(t.amountCents) &&
    typeof t.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.date);
  if (!base) return false;
  if (t.kind === "expense") return (EXPENSE_CATEGORIES as readonly unknown[]).includes(t.category);
  if (t.kind === "income") return (INCOME_CATEGORIES as readonly unknown[]).includes(t.category);
  return false;
}
