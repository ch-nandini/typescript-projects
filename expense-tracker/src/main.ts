import { drawDonut } from "./chart.js";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  applyFilters,
  availableMonths,
  formatMoney,
  isTransaction,
  summarize,
  toCSV,
  toCents,
  type ExpenseCategory,
  type Filters,
  type IncomeCategory,
  type Transaction,
} from "./ledger.js";

const STORAGE_KEY = "expense-tracker:transactions";

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Housing: "#3b6ef5",
  Food: "#f2a33a",
  Transport: "#18a989",
  Shopping: "#d9548a",
  Bills: "#7a5af5",
  Health: "#e5533d",
  Fun: "#2bb3d9",
  Other: "#8c8c8c",
};

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
};

const form = $<HTMLFormElement>("#tx-form");
const kindInputs = form.querySelectorAll<HTMLInputElement>('input[name="kind"]');
const descInput = $<HTMLInputElement>("#description");
const amountInput = $<HTMLInputElement>("#amount");
const categorySelect = $<HTMLSelectElement>("#category");
const dateInput = $<HTMLInputElement>("#date");
const formError = $<HTMLParagraphElement>("#form-error");

const monthFilter = $<HTMLSelectElement>("#filter-month");
const categoryFilter = $<HTMLSelectElement>("#filter-category");
const list = $<HTMLUListElement>("#tx-list");
const emptyState = $<HTMLDivElement>("#empty");
const exportBtn = $<HTMLButtonElement>("#export");
const sampleBtn = $<HTMLButtonElement>("#load-sample");

const incomeEl = $<HTMLElement>("#total-income");
const expenseEl = $<HTMLElement>("#total-expense");
const balanceEl = $<HTMLElement>("#total-balance");
const canvas = $<HTMLCanvasElement>("#donut");
const legend = $<HTMLUListElement>("#legend");

const todayISO = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function load(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isTransaction) : [];
  } catch {
    return [];
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

let transactions: Transaction[] = load();
const filters: Filters = { month: "all", category: "all" };

const selectedKind = (): Transaction["kind"] =>
  form.querySelector<HTMLInputElement>('input[name="kind"]:checked')?.value === "income" ? "income" : "expense";

function fillCategoryOptions(): void {
  const options = selectedKind() === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  categorySelect.replaceChildren(...options.map((c) => new Option(c, c)));
}

function fillFilterOptions(): void {
  const months = availableMonths(transactions);
  const fmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
  monthFilter.replaceChildren(
    new Option("All months", "all"),
    ...months.map((m) => new Option(fmt.format(new Date(`${m}-01T00:00:00`)), m)),
  );
  if (filters.month !== "all" && !months.includes(filters.month)) filters.month = "all";
  monthFilter.value = filters.month;

  const categories = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])];
  categoryFilter.replaceChildren(new Option("All categories", "all"), ...categories.map((c) => new Option(c, c)));
  categoryFilter.value = filters.category;
}

function renderList(visible: readonly Transaction[]): void {
  const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  list.replaceChildren(
    ...visible.map((t) => {
      const li = document.createElement("li");
      li.className = `tx tx--${t.kind}`;

      const dot = document.createElement("span");
      dot.className = "tx__dot";
      dot.style.background = t.kind === "expense" ? CATEGORY_COLORS[t.category] : "var(--good)";

      const info = document.createElement("div");
      info.className = "tx__info";
      const title = document.createElement("strong");
      title.textContent = t.description;
      const meta = document.createElement("span");
      meta.textContent = `${t.category} · ${dateFmt.format(new Date(`${t.date}T00:00:00`))}`;
      info.append(title, meta);

      const amount = document.createElement("span");
      amount.className = "tx__amount";
      amount.textContent = `${t.kind === "expense" ? "−" : "+"}${formatMoney(t.amountCents)}`;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "tx__delete";
      del.dataset.id = t.id;
      del.setAttribute("aria-label", `Delete ${t.description}`);
      del.textContent = "×";

      li.append(dot, info, amount, del);
      return li;
    }),
  );
  emptyState.hidden = visible.length > 0;
  sampleBtn.hidden = transactions.length > 0;
}

function renderSummary(visible: readonly Transaction[]): void {
  const s = summarize(visible);
  incomeEl.textContent = formatMoney(s.incomeCents);
  expenseEl.textContent = formatMoney(s.expenseCents);
  balanceEl.textContent = formatMoney(s.balanceCents);
  balanceEl.dataset.tone = s.balanceCents < 0 ? "bad" : "good";

  const slices = s.byCategory.map(({ category, cents }) => ({
    label: category,
    value: cents,
    color: CATEGORY_COLORS[category],
  }));
  drawDonut(canvas, slices, formatMoney(s.expenseCents));

  legend.replaceChildren(
    ...s.byCategory.map(({ category, cents }) => {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = CATEGORY_COLORS[category];
      const pct = s.expenseCents ? Math.round((cents / s.expenseCents) * 100) : 0;
      li.append(swatch, `${category}`);
      const value = document.createElement("span");
      value.className = "legend__value";
      value.textContent = `${formatMoney(cents)} · ${pct}%`;
      li.append(value);
      return li;
    }),
  );
}

function render(): void {
  fillFilterOptions();
  const visible = applyFilters(transactions, filters);
  renderList(visible);
  renderSummary(visible);
}

function addTransaction(event: SubmitEvent): void {
  event.preventDefault();
  const description = descInput.value.trim();
  const amountCents = toCents(amountInput.value);
  const date = dateInput.value;

  if (!description) return showError("Add a short description.");
  if (amountCents === null) return showError("Amount must be a positive number.");
  if (!date) return showError("Pick a date.");
  showError("");

  const base = { id: crypto.randomUUID(), description, amountCents, date };
  const tx: Transaction =
    selectedKind() === "income"
      ? { ...base, kind: "income", category: categorySelect.value as IncomeCategory }
      : { ...base, kind: "expense", category: categorySelect.value as ExpenseCategory };

  transactions = [...transactions, tx];
  save();
  form.reset();
  dateInput.value = date; // keep the date handy for logging several items
  fillCategoryOptions();
  descInput.focus();
  render();
}

function showError(message: string): void {
  formError.textContent = message;
}

function loadSample(): void {
  const now = new Date();
  const ym = (offset: number): string => {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const rows: [string, Transaction["kind"], string, string, number][] = [
    [`${ym(0)}-01`, "income", "Salary", "Paycheck", 420000],
    [`${ym(0)}-01`, "expense", "Housing", "Rent", 185000],
    [`${ym(0)}-03`, "expense", "Food", "Groceries", 9640],
    [`${ym(0)}-05`, "expense", "Transport", "Monthly transit pass", 9900],
    [`${ym(0)}-07`, "expense", "Bills", "Internet", 6500],
    [`${ym(0)}-09`, "expense", "Fun", "Concert tickets", 12000],
    [`${ym(0)}-10`, "expense", "Food", "Dinner out", 5875],
    [`${ym(0)}-12`, "income", "Freelance", "Dashboard project", 75000],
    [`${ym(0)}-14`, "expense", "Shopping", "Running shoes", 13999],
    [`${ym(1)}-01`, "income", "Salary", "Paycheck", 420000],
    [`${ym(1)}-01`, "expense", "Housing", "Rent", 185000],
    [`${ym(1)}-04`, "expense", "Food", "Groceries", 11220],
    [`${ym(1)}-18`, "expense", "Health", "Dentist", 8000],
  ];
  transactions = rows.flatMap(([date, kind, category, description, amountCents]) => {
    const candidate: unknown = { id: crypto.randomUUID(), date, kind, category, description, amountCents };
    return isTransaction(candidate) ? [candidate] : [];
  });
  save();
  render();
}

function exportCSV(): void {
  const visible = applyFilters(transactions, filters);
  const blob = new Blob([toCSV(visible)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions-${filters.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

form.addEventListener("submit", addTransaction);
kindInputs.forEach((input) => input.addEventListener("change", fillCategoryOptions));
monthFilter.addEventListener("change", () => {
  filters.month = monthFilter.value;
  render();
});
categoryFilter.addEventListener("change", () => {
  filters.category = categoryFilter.value;
  render();
});
list.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".tx__delete");
  if (!btn) return;
  transactions = transactions.filter((t) => t.id !== btn.dataset.id);
  save();
  render();
});
exportBtn.addEventListener("click", exportCSV);
sampleBtn.addEventListener("click", loadSample);
window.addEventListener("resize", () => renderSummary(applyFilters(transactions, filters)));
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

dateInput.value = todayISO();
fillCategoryOptions();
render();
