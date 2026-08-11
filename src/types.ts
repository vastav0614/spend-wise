export interface Expense {
  id: string;
  amount: number;
  category: string;
  date: string;
  paymentMethod: string;
  notes: string;
}

export interface Budget {
  category: string;
  limit: number;
  spent: number;
  previousSpent?: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface EMIPlan {
  id: string;
  name: string;
  monthlyAmount: number;
  startDate: string;
  durationMonths: number;
}

export interface IncomeEntry {
  id: string;
  amount: number;
  source: string;
  date: string;
  notes: string;
  recurrence: 'monthly' | 'one_time';
}

export type Category = 'Food' | 'Transport' | 'Entertainment' | 'Shopping' | 'Utilities' | 'Health' | 'EMI' | 'Other';

export const CATEGORIES: Category[] = ['Food', 'Transport', 'Entertainment', 'Shopping', 'Utilities', 'Health', 'EMI', 'Other'];
