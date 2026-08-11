import type { Budget, EMIPlan, Expense, IncomeEntry, SavingsGoal } from '../types';
import { expireSession, getAuthToken } from './auth';

const EXPENSES_KEY = 'expenses';
const BUDGETS_KEY = 'budgets';
const INCOME_KEY = 'income';
const EMI_KEY = 'emiPlans';
const SAVINGS_KEY = 'savingsGoals';
const BOOTSTRAP_KEY = 'mongoBootstrapComplete';
let bootstrapPromise: Promise<void> | null = null;

function readLocalArray<T>(key: string, fallback: T[] = []) {
  let savedValue: string | null;
  try {
    savedValue = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (!savedValue) {
    return fallback;
  }

  try {
    return JSON.parse(savedValue) as T[];
  } catch {
    return fallback;
  }
}

function writeLocalArray<T>(key: string, value: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the current UI usable if browser storage is unavailable or full.
  }
}

function notifyDataChanged() {
  window.dispatchEvent(new CustomEvent('financeDataUpdated'));
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    if (response.status === 401) {
      expireSession();
      window.location.assign('/login');
    }
    throw new Error(`Request failed for ${path}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function bootstrapServerData() {
  if (!getAuthToken()) return;
  if (localStorage.getItem(BOOTSTRAP_KEY) === 'done') {
    return;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    const expenses = readLocalArray<Expense>(EXPENSES_KEY);
    const budgets = readLocalArray<Budget>(BUDGETS_KEY);
    const income = readLocalArray<IncomeEntry>(INCOME_KEY);
    const emiPlans = readLocalArray<EMIPlan>(EMI_KEY);
    const savingsGoals = readLocalArray<SavingsGoal>(SAVINGS_KEY);

    await requestJson('/api/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ expenses, budgets, income, emiPlans, savingsGoals }),
    });

    localStorage.setItem(BOOTSTRAP_KEY, 'done');
  })();

  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

export async function getExpenses() {
  try {
    await bootstrapServerData();
    const expenses = await requestJson<Expense[]>('/api/expenses');
    writeLocalArray(EXPENSES_KEY, expenses);
    return expenses;
  } catch {
    return readLocalArray<Expense>(EXPENSES_KEY);
  }
}

export async function createExpense(expense: Expense) {
  try {
    const createdExpense = await requestJson<Expense>('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
    const expenses = [...readLocalArray<Expense>(EXPENSES_KEY), createdExpense];
    writeLocalArray(EXPENSES_KEY, expenses);
    notifyDataChanged();
    return createdExpense;
  } catch {
    const expenses = [...readLocalArray<Expense>(EXPENSES_KEY), expense];
    writeLocalArray(EXPENSES_KEY, expenses);
    notifyDataChanged();
    return expense;
  }
}

export async function updateExpense(expense: Expense) {
  try {
    const updatedExpense = await requestJson<Expense>(`/api/expenses/${expense.id}`, {
      method: 'PUT',
      body: JSON.stringify(expense),
    });
    const expenses = readLocalArray<Expense>(EXPENSES_KEY).map((entry) =>
      entry.id === updatedExpense.id ? updatedExpense : entry,
    );
    writeLocalArray(EXPENSES_KEY, expenses);
    notifyDataChanged();
    return updatedExpense;
  } catch {
    const expenses = readLocalArray<Expense>(EXPENSES_KEY).map((entry) =>
      entry.id === expense.id ? expense : entry,
    );
    writeLocalArray(EXPENSES_KEY, expenses);
    notifyDataChanged();
    return expense;
  }
}

export async function deleteExpense(expenseId: string) {
  try {
    await requestJson<void>(`/api/expenses/${expenseId}`, { method: 'DELETE' });
  } finally {
    const expenses = readLocalArray<Expense>(EXPENSES_KEY).filter((expense) => expense.id !== expenseId);
    writeLocalArray(EXPENSES_KEY, expenses);
    notifyDataChanged();
  }
}

export async function getBudgets() {
  let budgets: Budget[] = [];
  try {
    await bootstrapServerData();
    budgets = await requestJson<Budget[]>('/api/budgets');
    writeLocalArray(BUDGETS_KEY, budgets);
  } catch {
    budgets = readLocalArray<Budget>(BUDGETS_KEY);
  }

  const expenses = readLocalArray<Expense>(EXPENSES_KEY);
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return budgets.map((budget) => {
    const categorySpent = expenses
      .filter((expense) => expense.category === budget.category && expense.date && expense.date.slice(0, 7) === currentMonthKey)
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

    const categoryPreviousSpent = expenses
      .filter((expense) => expense.category === budget.category && expense.date && expense.date.slice(0, 7) < currentMonthKey)
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

    return {
      ...budget,
      spent: Math.round((categorySpent + Number.EPSILON) * 100) / 100,
      previousSpent: Math.round((categoryPreviousSpent + Number.EPSILON) * 100) / 100,
    };
  });
}

export async function saveBudget(budget: Budget, previousCategory?: string) {
  const expenses = readLocalArray<Expense>(EXPENSES_KEY);
  const categorySpent = expenses
    .filter((e) => e.category === budget.category)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const budgetToSave = {
    ...budget,
    spent: Math.round((categorySpent + Number.EPSILON) * 100) / 100,
  };

  if (previousCategory && previousCategory !== budgetToSave.category) {
    try {
      await requestJson<void>(`/api/budgets/${previousCategory}`, { method: 'DELETE' });
    } catch {
      // Ignore and continue with the latest local state.
    }
  }

  try {
    const savedBudget = await requestJson<Budget>(`/api/budgets/${budgetToSave.category}`, {
      method: 'PUT',
      body: JSON.stringify(budgetToSave),
    });

    const currentBudgets = readLocalArray<Budget>(BUDGETS_KEY)
      .filter((entry) => entry.category !== previousCategory && entry.category !== savedBudget.category);
    const budgets = [...currentBudgets, { ...savedBudget, spent: budgetToSave.spent }];
    writeLocalArray(BUDGETS_KEY, budgets);
    notifyDataChanged();
    return { ...savedBudget, spent: budgetToSave.spent };
  } catch {
    const currentBudgets = readLocalArray<Budget>(BUDGETS_KEY)
      .filter((entry) => entry.category !== previousCategory && entry.category !== budgetToSave.category);
    const budgets = [...currentBudgets, budgetToSave];
    writeLocalArray(BUDGETS_KEY, budgets);
    notifyDataChanged();
    return budgetToSave;
  }
}

export async function deleteBudget(category: string) {
  try {
    await requestJson<void>(`/api/budgets/${category}`, { method: 'DELETE' });
  } finally {
    const budgets = readLocalArray<Budget>(BUDGETS_KEY).filter((budget) => budget.category !== category);
    writeLocalArray(BUDGETS_KEY, budgets);
    notifyDataChanged();
  }
}

export async function getIncomeEntries() {
  try {
    await bootstrapServerData();
    const incomeEntries = await requestJson<IncomeEntry[]>('/api/income');
    writeLocalArray(INCOME_KEY, incomeEntries);
    return incomeEntries;
  } catch {
    return readLocalArray<IncomeEntry>(INCOME_KEY);
  }
}

export async function createIncomeEntry(incomeEntry: IncomeEntry) {
  try {
    const createdIncome = await requestJson<IncomeEntry>('/api/income', {
      method: 'POST',
      body: JSON.stringify(incomeEntry),
    });
    const income = [...readLocalArray<IncomeEntry>(INCOME_KEY), createdIncome];
    writeLocalArray(INCOME_KEY, income);
    notifyDataChanged();
    return createdIncome;
  } catch {
    const income = [...readLocalArray<IncomeEntry>(INCOME_KEY), incomeEntry];
    writeLocalArray(INCOME_KEY, income);
    notifyDataChanged();
    return incomeEntry;
  }
}

export async function updateIncomeEntry(incomeEntry: IncomeEntry) {
  try {
    const updatedIncome = await requestJson<IncomeEntry>(`/api/income/${incomeEntry.id}`, {
      method: 'PUT',
      body: JSON.stringify(incomeEntry),
    });
    const income = readLocalArray<IncomeEntry>(INCOME_KEY).map((entry) =>
      entry.id === updatedIncome.id ? updatedIncome : entry
    );
    writeLocalArray(INCOME_KEY, income);
    notifyDataChanged();
    return updatedIncome;
  } catch {
    const income = readLocalArray<IncomeEntry>(INCOME_KEY).map((entry) =>
      entry.id === incomeEntry.id ? incomeEntry : entry
    );
    writeLocalArray(INCOME_KEY, income);
    notifyDataChanged();
    return incomeEntry;
  }
}

export async function deleteIncomeEntry(incomeId: string) {
  try {
    await requestJson<void>(`/api/income/${incomeId}`, { method: 'DELETE' });
  } finally {
    const income = readLocalArray<IncomeEntry>(INCOME_KEY).filter((entry) => entry.id !== incomeId);
    writeLocalArray(INCOME_KEY, income);
    notifyDataChanged();
  }
}


export async function getEmiPlans() {
  try {
    await bootstrapServerData();
    const emiPlans = await requestJson<EMIPlan[]>('/api/emi-plans');
    writeLocalArray(EMI_KEY, emiPlans);
    return emiPlans;
  } catch {
    return readLocalArray<EMIPlan>(EMI_KEY);
  }
}

export async function createEmiPlan(emiPlan: EMIPlan) {
  try {
    const createdPlan = await requestJson<EMIPlan>('/api/emi-plans', {
      method: 'POST',
      body: JSON.stringify(emiPlan),
    });
    const emiPlans = [createdPlan, ...readLocalArray<EMIPlan>(EMI_KEY)];
    writeLocalArray(EMI_KEY, emiPlans);
    notifyDataChanged();
    return createdPlan;
  } catch {
    const emiPlans = [emiPlan, ...readLocalArray<EMIPlan>(EMI_KEY)];
    writeLocalArray(EMI_KEY, emiPlans);
    notifyDataChanged();
    return emiPlan;
  }
}

export async function deleteEmiPlan(emiId: string) {
  try {
    await requestJson<void>(`/api/emi-plans/${emiId}`, { method: 'DELETE' });
  } finally {
    const emiPlans = readLocalArray<EMIPlan>(EMI_KEY).filter((emiPlan) => emiPlan.id !== emiId);
    writeLocalArray(EMI_KEY, emiPlans);
    notifyDataChanged();
  }
}

export async function createSavingsGoal(savingsGoal: SavingsGoal) {
  try {
    const createdGoal = await requestJson<SavingsGoal>('/api/savings-goals', {
      method: 'POST',
      body: JSON.stringify(savingsGoal),
    });
    const goals = [...readLocalArray<SavingsGoal>(SAVINGS_KEY), createdGoal];
    writeLocalArray(SAVINGS_KEY, goals);
    notifyDataChanged();
    return createdGoal;
  } catch {
    const goals = [...readLocalArray<SavingsGoal>(SAVINGS_KEY), savingsGoal];
    writeLocalArray(SAVINGS_KEY, goals);
    notifyDataChanged();
    return savingsGoal;
  }
}

export async function updateSavingsGoal(savingsGoal: SavingsGoal) {
  try {
    const updatedGoal = await requestJson<SavingsGoal>(`/api/savings-goals/${savingsGoal.id}`, {
      method: 'PUT',
      body: JSON.stringify(savingsGoal),
    });
    const goals = readLocalArray<SavingsGoal>(SAVINGS_KEY).map((goal) =>
      goal.id === updatedGoal.id ? updatedGoal : goal
    );
    writeLocalArray(SAVINGS_KEY, goals);
    notifyDataChanged();
    return updatedGoal;
  } catch {
    const goals = readLocalArray<SavingsGoal>(SAVINGS_KEY).map((goal) =>
      goal.id === savingsGoal.id ? savingsGoal : goal
    );
    writeLocalArray(SAVINGS_KEY, goals);
    notifyDataChanged();
    return savingsGoal;
  }
}

export async function deleteSavingsGoal(goalId: string) {
  try {
    await requestJson<void>(`/api/savings-goals/${goalId}`, { method: 'DELETE' });
  } finally {
    const goals = readLocalArray<SavingsGoal>(SAVINGS_KEY).filter((goal) => goal.id !== goalId);
    writeLocalArray(SAVINGS_KEY, goals);
    notifyDataChanged();
  }
}

export async function getSavingsGoals(): Promise<SavingsGoal[]> {
  try {
    await bootstrapServerData();
    const savingsGoals = await requestJson<SavingsGoal[]>(`/api/savings-goals`);
    writeLocalArray(SAVINGS_KEY, savingsGoals);
    return savingsGoals;
  } catch {
    return readLocalArray<SavingsGoal>(SAVINGS_KEY, []);
  }
}

export function calculatePreviousSavingsPool(): number {
  const expenses = readLocalArray<Expense>(EXPENSES_KEY);
  const storedIncome = readLocalArray<IncomeEntry>(INCOME_KEY);
  const storedEmis = readLocalArray<EMIPlan>(EMI_KEY);

  const emiInstallments = storedEmis.flatMap((plan) => {
    if (!plan.startDate || !plan.durationMonths || !plan.monthlyAmount) return [];
    const installments: Expense[] = [];
    const [year, month] = plan.startDate.split('-').map(Number);
    for (let i = 0; i < plan.durationMonths; i++) {
      const date = new Date(year, month - 1 + i, 1);
      installments.push({
        id: `emi-${plan.id}-${i}`,
        amount: plan.monthlyAmount,
        category: 'EMI',
        date: date.toISOString().split('T')[0],
        paymentMethod: 'EMI',
        notes: plan.name,
      });
    }
    return installments;
  });

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const allExpenses = [...expenses, ...emiInstallments];

  const pastIncomes = storedIncome.filter((inc) => inc.date && inc.date.slice(0, 7) < currentMonthKey);
  const pastExpenses = allExpenses.filter((exp) => exp.date && exp.date.slice(0, 7) < currentMonthKey);

  const pastIncomeTotal = pastIncomes.reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0);
  const pastExpenseTotal = pastExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

  return Math.max(0, Math.round((pastIncomeTotal - pastExpenseTotal + Number.EPSILON) * 100) / 100);
}

export interface SavingsGoalWithAllocation extends SavingsGoal {
  autoAllocatedAmount: number;
  effectiveCurrentAmount: number;
  effectivePercentage: number;
  isFullyFunded: boolean;
}

export function allocatePreviousSavingsToGoals(
  goals: SavingsGoal[],
  previousSavingsPool: number
): {
  allocatedGoals: SavingsGoalWithAllocation[];
  totalAllocated: number;
  unallocatedRemaining: number;
} {
  const prioWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };

  const sorted = [...goals].sort((a, b) => {
    const wA = prioWeight[a.priority || 'medium'] || 2;
    const wB = prioWeight[b.priority || 'medium'] || 2;
    if (wA !== wB) return wB - wA;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  let poolRemaining = previousSavingsPool;
  let totalAllocated = 0;

  const allocatedGoals: SavingsGoalWithAllocation[] = sorted.map((goal) => {
    const manualSaved = Number(goal.currentAmount) || 0;
    const target = Number(goal.targetAmount) || 0;
    const needed = Math.max(0, target - manualSaved);
    const allocated = Math.min(poolRemaining, needed);

    poolRemaining -= allocated;
    totalAllocated += allocated;

    const effectiveCurrentAmount = Math.round((manualSaved + allocated + Number.EPSILON) * 100) / 100;
    const effectivePercentage = target > 0 ? Math.min(100, Math.round((effectiveCurrentAmount / target) * 100)) : 0;

    return {
      ...goal,
      autoAllocatedAmount: Math.round((allocated + Number.EPSILON) * 100) / 100,
      effectiveCurrentAmount,
      effectivePercentage,
      isFullyFunded: effectiveCurrentAmount >= target && target > 0,
    };
  });

  return {
    allocatedGoals,
    totalAllocated: Math.round((totalAllocated + Number.EPSILON) * 100) / 100,
    unallocatedRemaining: Math.round((poolRemaining + Number.EPSILON) * 100) / 100,
  };
}
