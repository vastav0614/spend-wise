import 'dotenv/config';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import dns from 'node:dns';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 4000);

// Initialize SQLite fallback database
const dataDir = resolve(__dirname, '../data');
try { mkdirSync(dataDir, { recursive: true }); } catch {}
const sqlitePath = resolve(dataDir, 'spendwise.sqlite');
const sqlite = new DatabaseSync(sqlitePath);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS expenses (
    user_id TEXT NOT NULL,
    id TEXT PRIMARY KEY,
    amount_cents INTEGER NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    notes TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS budgets (
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    limit_cents INTEGER NOT NULL,
    spent_cents INTEGER NOT NULL,
    PRIMARY KEY (user_id, category)
  );
  CREATE TABLE IF NOT EXISTS income (
    user_id TEXT NOT NULL,
    id TEXT PRIMARY KEY,
    amount_cents INTEGER NOT NULL,
    source TEXT NOT NULL,
    date TEXT NOT NULL,
    notes TEXT DEFAULT '',
    recurrence TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS emi_plans (
    user_id TEXT NOT NULL,
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    monthly_amount_cents INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    duration_months INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS savings_goals (
    user_id TEXT NOT NULL,
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target_amount_cents INTEGER NOT NULL,
    current_amount_cents INTEGER NOT NULL,
    deadline TEXT NOT NULL,
    priority TEXT NOT NULL
  );
`);

// Clean MONGODB_URI to remove surrounding quotes if entered into Render dashboard
const rawMongoUri = process.env.MONGODB_URI?.trim().replace(/^["']|["']$/g, '');
const mongoUri = rawMongoUri || 'mongodb://127.0.0.1:27017/spendwise';
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map<string, { userId: string; expiresAt: number }>();

let isMongoActive = false;

mongoose.set('bufferCommands', false);

async function connectToMongo(): Promise<boolean> {
  const tryConnect = async () => {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 4000,
      tlsAllowInvalidCertificates: true,
    });
    return true;
  };

  try {
    return await tryConnect();
  } catch (err: any) {
    // If SRV lookup failed on local DNS, try setting public DNS fallback
    if (/querySrv ECONNREFUSED/i.test(err?.message || '')) {
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        return await tryConnect();
      } catch {}
    }
    return false;
  }
}

const dbInitPromise = (async () => {
  const connected = await connectToMongo();
  if (connected) {
    isMongoActive = true;
    console.log('Successfully connected to MongoDB as primary database');
  } else {
    isMongoActive = false;
    console.warn(`[Database Warning] Could not connect to MongoDB (${mongoUri}).`);
    console.warn(`[Database Notice] Operating smoothly with local SQLite database at ${sqlitePath}`);
  }
})();

// Define Mongoose Schemas
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  full_name: { type: String, required: true },
  password_hash: { type: String, required: true },
  password_salt: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

const ExpenseSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  id: { type: String, required: true },
  amount_cents: { type: Number, required: true },
  category: { type: String, required: true },
  date: { type: String, required: true },
  payment_method: { type: String, required: true },
  notes: { type: String, default: '' }
});
ExpenseSchema.index({ user_id: 1, id: 1 }, { unique: true });
const ExpenseModel = mongoose.model('Expense', ExpenseSchema);

const BudgetSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  category: { type: String, required: true },
  limit_cents: { type: Number, required: true },
  spent_cents: { type: Number, required: true }
});
BudgetSchema.index({ user_id: 1, category: 1 }, { unique: true });
const BudgetModel = mongoose.model('Budget', BudgetSchema);

const IncomeSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  id: { type: String, required: true },
  amount_cents: { type: Number, required: true },
  source: { type: String, required: true },
  date: { type: String, required: true },
  notes: { type: String, default: '' },
  recurrence: { type: String, enum: ['monthly', 'one_time'], required: true }
});
IncomeSchema.index({ user_id: 1, id: 1 }, { unique: true });
const IncomeModel = mongoose.model('Income', IncomeSchema);

const EmiPlanSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  id: { type: String, required: true },
  name: { type: String, required: true },
  monthly_amount_cents: { type: Number, required: true },
  start_date: { type: String, required: true },
  duration_months: { type: Number, required: true }
});
EmiPlanSchema.index({ user_id: 1, id: 1 }, { unique: true });
const EmiPlanModel = mongoose.model('EmiPlan', EmiPlanSchema);

const SavingsGoalSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  id: { type: String, required: true },
  name: { type: String, required: true },
  target_amount_cents: { type: Number, required: true },
  current_amount_cents: { type: Number, required: true },
  deadline: { type: String, required: true },
  priority: { type: String, enum: ['high', 'medium', 'low'], required: true }
});
SavingsGoalSchema.index({ user_id: 1, id: 1 }, { unique: true });
const SavingsGoalModel = mongoose.model('SavingsGoal', SavingsGoalSchema);

app.use(express.json({ limit: '100kb' }));

// Ensure DB initialization is done before handling API calls
app.use(async (req, _res, next) => {
  if (req.path.startsWith('/api')) {
    await dbInitPromise;
  }
  next();
});

type AuthenticatedRequest = express.Request & { userId?: string };
type Expense = { id: string; amount: number; category: string; date: string; paymentMethod: string; notes: string };
type Budget = { category: string; limit: number; spent: number };
type Income = { id: string; amount: number; source: string; date: string; notes: string; recurrence: 'monthly' | 'one_time' };
type Emi = { id: string; name: string; monthlyAmount: number; startDate: string; durationMonths: number };
type SavingsGoal = { id: string; name: string; targetAmount: number; currentAmount: number; deadline: string; priority: 'high' | 'medium' | 'low' };

function toCents(value: unknown, minimum = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Amount must be a valid number');
  const cents = Math.round((value + Number.EPSILON) * 100);
  if (cents < minimum) throw new Error(minimum ? 'Amount must be greater than zero' : 'Amount cannot be negative');
  return cents;
}
function fromCents(value: unknown) { return Number(value) / 100; }
function requiredString(value: unknown, label: string) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`); return value.trim(); }
function requiredDate(value: unknown) { const date = requiredString(value, 'Date'); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must use YYYY-MM-DD'); return date; }
function createSession(userId: string) { const token = randomBytes(32).toString('hex'); sessions.set(token, { userId, expiresAt: Date.now() + sessionLifetimeMs }); return token; }
async function hashPassword(password: string, salt: string) { const key = await new Promise<Buffer>((resolveKey, reject) => scryptCallback(password, salt, 64, (error, value) => error ? reject(error) : resolveKey(value))); return key.toString('hex'); }
function requireAuth(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, ''); const session = token ? sessions.get(token) : undefined;
  if (!session || session.expiresAt <= Date.now()) { if (token) sessions.delete(token); res.status(401).json({ message: 'Authentication required' }); return; }
  req.userId = session.userId; next();
}
function idOf(req: AuthenticatedRequest) { if (!req.userId) throw new Error('Authentication required'); return req.userId; }
function asyncRoute(handler: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>): express.RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

function asExpense(row: any): Expense { return { id: row.id, amount: fromCents(row.amount_cents), category: row.category, date: row.date, paymentMethod: row.payment_method, notes: row.notes || '' }; }
function asBudget(row: any): Budget { return { category: row.category, limit: fromCents(row.limit_cents), spent: fromCents(row.spent_cents) }; }
function asIncome(row: any): Income { return { id: row.id, amount: fromCents(row.amount_cents), source: row.source, date: row.date, notes: row.notes || '', recurrence: row.recurrence }; }
function asEmi(row: any): Emi { return { id: row.id, name: row.name, monthlyAmount: fromCents(row.monthly_amount_cents), startDate: row.start_date, durationMonths: row.duration_months }; }
function asGoal(row: any): SavingsGoal { return { id: row.id, name: row.name, targetAmount: fromCents(row.target_amount_cents), currentAmount: fromCents(row.current_amount_cents), deadline: row.deadline, priority: row.priority }; }

function validateExpense(body: unknown): Expense { const value = body as Partial<Expense>; return { id: requiredString(value.id, 'ID'), amount: fromCents(toCents(value.amount, 1)), category: requiredString(value.category, 'Category'), date: requiredDate(value.date), paymentMethod: requiredString(value.paymentMethod, 'Payment method'), notes: typeof value.notes === 'string' ? value.notes : '' }; }
function validateBudget(body: unknown): Budget { const value = body as Partial<Budget>; return { category: requiredString(value.category, 'Category'), limit: fromCents(toCents(value.limit)), spent: fromCents(toCents(value.spent)) }; }
function validateIncome(body: unknown): Income { const value = body as Partial<Income>; const recurrence = value.recurrence === 'monthly' || value.recurrence === 'one_time' ? value.recurrence : (() => { throw new Error('Invalid recurrence'); })(); return { id: requiredString(value.id, 'ID'), amount: fromCents(toCents(value.amount, 1)), source: requiredString(value.source, 'Source'), date: requiredDate(value.date), notes: typeof value.notes === 'string' ? value.notes : '', recurrence }; }
function validateEmi(body: unknown): Emi { const value = body as Partial<Emi>; const durationMonths = Number(value.durationMonths); if (!Number.isInteger(durationMonths) || durationMonths < 1) throw new Error('Duration must be a positive whole number'); return { id: requiredString(value.id, 'ID'), name: requiredString(value.name, 'Name'), monthlyAmount: fromCents(toCents(value.monthlyAmount, 1)), startDate: requiredDate(value.startDate), durationMonths }; }
function validateGoal(body: unknown): SavingsGoal { const value = body as Partial<SavingsGoal>; const targetAmount = fromCents(toCents(value.targetAmount, 1)); const currentAmount = fromCents(toCents(value.currentAmount)); if (currentAmount > targetAmount) throw new Error('Saved amount cannot exceed target'); if (!['high', 'medium', 'low'].includes(value.priority || '')) throw new Error('Invalid priority'); return { id: requiredString(value.id, 'ID'), name: requiredString(value.name, 'Name'), targetAmount, currentAmount, deadline: requiredDate(value.deadline), priority: value.priority as SavingsGoal['priority'] }; }

// Unified Database Provider
const dbProvider = {
  async findUserByEmail(email: string) {
    if (isMongoActive) {
      return User.findOne({ email });
    }
    const row = sqlite.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    return row || null;
  },

  async createUser(u: { id: string; email: string; full_name: string; password_hash: string; password_salt: string }) {
    if (isMongoActive) {
      return User.create(u);
    }
    sqlite.prepare(
      'INSERT INTO users (id, email, full_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)'
    ).run(u.id, u.email, u.full_name, u.password_hash, u.password_salt);
    return u;
  },

  async getExpenses(userId: string) {
    if (isMongoActive) {
      const expenses = await ExpenseModel.find({ user_id: userId }).sort({ date: -1 });
      return expenses.map(asExpense);
    }
    const rows = sqlite.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC').all(userId) as any[];
    return rows.map(asExpense);
  },

  async createExpense(userId: string, item: Expense) {
    const amountCents = toCents(item.amount, 1);
    if (isMongoActive) {
      await ExpenseModel.create({ user_id: userId, id: item.id, amount_cents: amountCents, category: item.category, date: item.date, payment_method: item.paymentMethod, notes: item.notes });
      return item;
    }
    sqlite.prepare(
      'INSERT INTO expenses (user_id, id, amount_cents, category, date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, item.id, amountCents, item.category, item.date, item.paymentMethod, item.notes);
    return item;
  },

  async updateExpense(userId: string, item: Expense) {
    const amountCents = toCents(item.amount, 1);
    if (isMongoActive) {
      const res = await ExpenseModel.updateOne(
        { user_id: userId, id: item.id },
        { $set: { amount_cents: amountCents, category: item.category, date: item.date, payment_method: item.paymentMethod, notes: item.notes } }
      );
      if (res.matchedCount === 0) return false;
      return true;
    }
    const res = sqlite.prepare(
      'UPDATE expenses SET amount_cents = ?, category = ?, date = ?, payment_method = ?, notes = ? WHERE user_id = ? AND id = ?'
    ).run(amountCents, item.category, item.date, item.paymentMethod, item.notes, userId, item.id);
    return res.changes > 0;
  },

  async deleteExpense(userId: string, id: string) {
    if (isMongoActive) {
      await ExpenseModel.deleteOne({ user_id: userId, id });
      return;
    }
    sqlite.prepare('DELETE FROM expenses WHERE user_id = ? AND id = ?').run(userId, id);
  },

  async getBudgets(userId: string) {
    if (isMongoActive) {
      const budgets = await BudgetModel.find({ user_id: userId }).sort({ category: 1 });
      return budgets.map(asBudget);
    }
    const rows = sqlite.prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY category ASC').all(userId) as any[];
    return rows.map(asBudget);
  },

  async saveBudget(userId: string, item: Budget) {
    const limitCents = toCents(item.limit);
    const spentCents = toCents(item.spent);
    if (isMongoActive) {
      await BudgetModel.updateOne(
        { user_id: userId, category: item.category },
        { $set: { limit_cents: limitCents, spent_cents: spentCents } },
        { upsert: true }
      );
      return item;
    }
    sqlite.prepare(`
      INSERT INTO budgets (user_id, category, limit_cents, spent_cents)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, category) DO UPDATE SET
        limit_cents = excluded.limit_cents,
        spent_cents = excluded.spent_cents
    `).run(userId, item.category, limitCents, spentCents);
    return item;
  },

  async deleteBudget(userId: string, category: string) {
    if (isMongoActive) {
      await BudgetModel.deleteOne({ user_id: userId, category });
      return;
    }
    sqlite.prepare('DELETE FROM budgets WHERE user_id = ? AND category = ?').run(userId, category);
  },

  async getIncomes(userId: string) {
    if (isMongoActive) {
      const incomes = await IncomeModel.find({ user_id: userId }).sort({ date: -1 });
      return incomes.map(asIncome);
    }
    const rows = sqlite.prepare('SELECT * FROM income WHERE user_id = ? ORDER BY date DESC').all(userId) as any[];
    return rows.map(asIncome);
  },

  async createIncome(userId: string, item: Income) {
    const amountCents = toCents(item.amount, 1);
    if (isMongoActive) {
      await IncomeModel.create({ user_id: userId, id: item.id, amount_cents: amountCents, source: item.source, date: item.date, notes: item.notes, recurrence: item.recurrence });
      return item;
    }
    sqlite.prepare(
      'INSERT INTO income (user_id, id, amount_cents, source, date, notes, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, item.id, amountCents, item.source, item.date, item.notes, item.recurrence);
    return item;
  },

  async updateIncome(userId: string, item: Income) {
    const amountCents = toCents(item.amount, 1);
    if (isMongoActive) {
      const res = await IncomeModel.updateOne(
        { user_id: userId, id: item.id },
        { $set: { amount_cents: amountCents, source: item.source, date: item.date, notes: item.notes, recurrence: item.recurrence } }
      );
      return res.matchedCount > 0;
    }
    const res = sqlite.prepare(
      'UPDATE income SET amount_cents = ?, source = ?, date = ?, notes = ?, recurrence = ? WHERE user_id = ? AND id = ?'
    ).run(amountCents, item.source, item.date, item.notes, item.recurrence, userId, item.id);
    return res.changes > 0;
  },

  async deleteIncome(userId: string, id: string) {
    if (isMongoActive) {
      await IncomeModel.deleteOne({ user_id: userId, id });
      return;
    }
    sqlite.prepare('DELETE FROM income WHERE user_id = ? AND id = ?').run(userId, id);
  },

  async getEmiPlans(userId: string) {
    if (isMongoActive) {
      const plans = await EmiPlanModel.find({ user_id: userId }).sort({ start_date: -1 });
      return plans.map(asEmi);
    }
    const rows = sqlite.prepare('SELECT * FROM emi_plans WHERE user_id = ? ORDER BY start_date DESC').all(userId) as any[];
    return rows.map(asEmi);
  },

  async createEmiPlan(userId: string, item: Emi) {
    const amountCents = toCents(item.monthlyAmount, 1);
    if (isMongoActive) {
      await EmiPlanModel.create({ user_id: userId, id: item.id, name: item.name, monthly_amount_cents: amountCents, start_date: item.startDate, duration_months: item.durationMonths });
      return item;
    }
    sqlite.prepare(
      'INSERT INTO emi_plans (user_id, id, name, monthly_amount_cents, start_date, duration_months) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, item.id, item.name, amountCents, item.startDate, item.durationMonths);
    return item;
  },

  async deleteEmiPlan(userId: string, id: string) {
    if (isMongoActive) {
      await EmiPlanModel.deleteOne({ user_id: userId, id });
      return;
    }
    sqlite.prepare('DELETE FROM emi_plans WHERE user_id = ? AND id = ?').run(userId, id);
  },

  async getSavingsGoals(userId: string) {
    if (isMongoActive) {
      const goals = await SavingsGoalModel.find({ user_id: userId }).sort({ deadline: 1 });
      return goals.map(asGoal);
    }
    const rows = sqlite.prepare('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY deadline ASC').all(userId) as any[];
    return rows.map(asGoal);
  },

  async createSavingsGoal(userId: string, item: SavingsGoal) {
    const targetCents = toCents(item.targetAmount, 1);
    const currentCents = toCents(item.currentAmount);
    if (isMongoActive) {
      await SavingsGoalModel.create({ user_id: userId, id: item.id, name: item.name, target_amount_cents: targetCents, current_amount_cents: currentCents, deadline: item.deadline, priority: item.priority });
      return item;
    }
    sqlite.prepare(
      'INSERT INTO savings_goals (user_id, id, name, target_amount_cents, current_amount_cents, deadline, priority) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, item.id, item.name, targetCents, currentCents, item.deadline, item.priority);
    return item;
  },

  async updateSavingsGoal(userId: string, item: SavingsGoal) {
    const targetCents = toCents(item.targetAmount, 1);
    const currentCents = toCents(item.currentAmount);
    if (isMongoActive) {
      const res = await SavingsGoalModel.updateOne(
        { user_id: userId, id: item.id },
        { $set: { name: item.name, target_amount_cents: targetCents, current_amount_cents: currentCents, deadline: item.deadline, priority: item.priority } }
      );
      return res.matchedCount > 0;
    }
    const res = sqlite.prepare(
      'UPDATE savings_goals SET name = ?, target_amount_cents = ?, current_amount_cents = ?, deadline = ?, priority = ? WHERE user_id = ? AND id = ?'
    ).run(item.name, targetCents, currentCents, item.deadline, item.priority, userId, item.id);
    return res.changes > 0;
  },

  async deleteSavingsGoal(userId: string, id: string) {
    if (isMongoActive) {
      await SavingsGoalModel.deleteOne({ user_id: userId, id });
      return;
    }
    sqlite.prepare('DELETE FROM savings_goals WHERE user_id = ? AND id = ?').run(userId, id);
  },

  async bootstrap(owner: string, payload: { expenses?: unknown[]; budgets?: unknown[]; income?: unknown[]; emiPlans?: unknown[]; savingsGoals?: unknown[] }) {
    if (isMongoActive) {
      const expCount = await ExpenseModel.countDocuments({ user_id: owner });
      if (expCount === 0 && payload.expenses?.length) {
        const expenses = payload.expenses.map(validateExpense).map(item => ({ user_id: owner, id: item.id, amount_cents: toCents(item.amount, 1), category: item.category, date: item.date, payment_method: item.paymentMethod, notes: item.notes }));
        await ExpenseModel.insertMany(expenses);
      }

      const budCount = await BudgetModel.countDocuments({ user_id: owner });
      if (budCount === 0 && payload.budgets?.length) {
        const budgets = payload.budgets.map(validateBudget).map(item => ({ user_id: owner, category: item.category, limit_cents: toCents(item.limit), spent_cents: toCents(item.spent) }));
        await BudgetModel.insertMany(budgets);
      }

      const incCount = await IncomeModel.countDocuments({ user_id: owner });
      if (incCount === 0 && payload.income?.length) {
        const incomes = payload.income.map(validateIncome).map(item => ({ user_id: owner, id: item.id, amount_cents: toCents(item.amount, 1), source: item.source, date: item.date, notes: item.notes, recurrence: item.recurrence }));
        await IncomeModel.insertMany(incomes);
      }

      const emiCount = await EmiPlanModel.countDocuments({ user_id: owner });
      if (emiCount === 0 && payload.emiPlans?.length) {
        const emis = payload.emiPlans.map(validateEmi).map(item => ({ user_id: owner, id: item.id, name: item.name, monthly_amount_cents: toCents(item.monthlyAmount, 1), start_date: item.startDate, duration_months: item.durationMonths }));
        await EmiPlanModel.insertMany(emis);
      }

      const sgCount = await SavingsGoalModel.countDocuments({ user_id: owner });
      if (sgCount === 0 && payload.savingsGoals?.length) {
        const sgs = payload.savingsGoals.map(validateGoal).map(item => ({ user_id: owner, id: item.id, name: item.name, target_amount_cents: toCents(item.targetAmount, 1), current_amount_cents: toCents(item.currentAmount), deadline: item.deadline, priority: item.priority }));
        await SavingsGoalModel.insertMany(sgs);
      }
      return;
    }

    // SQLite Bootstrap
    const expRow = sqlite.prepare('SELECT COUNT(*) as count FROM expenses WHERE user_id = ?').get(owner) as any;
    if (expRow.count === 0 && payload.expenses?.length) {
      const stmt = sqlite.prepare('INSERT INTO expenses (user_id, id, amount_cents, category, date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const item of payload.expenses.map(validateExpense)) {
        stmt.run(owner, item.id, toCents(item.amount, 1), item.category, item.date, item.paymentMethod, item.notes);
      }
    }

    const budRow = sqlite.prepare('SELECT COUNT(*) as count FROM budgets WHERE user_id = ?').get(owner) as any;
    if (budRow.count === 0 && payload.budgets?.length) {
      const stmt = sqlite.prepare('INSERT INTO budgets (user_id, category, limit_cents, spent_cents) VALUES (?, ?, ?, ?)');
      for (const item of payload.budgets.map(validateBudget)) {
        stmt.run(owner, item.category, toCents(item.limit), toCents(item.spent));
      }
    }

    const incRow = sqlite.prepare('SELECT COUNT(*) as count FROM income WHERE user_id = ?').get(owner) as any;
    if (incRow.count === 0 && payload.income?.length) {
      const stmt = sqlite.prepare('INSERT INTO income (user_id, id, amount_cents, source, date, notes, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const item of payload.income.map(validateIncome)) {
        stmt.run(owner, item.id, toCents(item.amount, 1), item.source, item.date, item.notes, item.recurrence);
      }
    }

    const emiRow = sqlite.prepare('SELECT COUNT(*) as count FROM emi_plans WHERE user_id = ?').get(owner) as any;
    if (emiRow.count === 0 && payload.emiPlans?.length) {
      const stmt = sqlite.prepare('INSERT INTO emi_plans (user_id, id, name, monthly_amount_cents, start_date, duration_months) VALUES (?, ?, ?, ?, ?, ?)');
      for (const item of payload.emiPlans.map(validateEmi)) {
        stmt.run(owner, item.id, item.name, toCents(item.monthlyAmount, 1), item.startDate, item.durationMonths);
      }
    }

    const sgRow = sqlite.prepare('SELECT COUNT(*) as count FROM savings_goals WHERE user_id = ?').get(owner) as any;
    if (sgRow.count === 0 && payload.savingsGoals?.length) {
      const stmt = sqlite.prepare('INSERT INTO savings_goals (user_id, id, name, target_amount_cents, current_amount_cents, deadline, priority) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const item of payload.savingsGoals.map(validateGoal)) {
        stmt.run(owner, item.id, item.name, toCents(item.targetAmount, 1), toCents(item.currentAmount), item.deadline, item.priority);
      }
    }
  }
};

app.get('/api/health', (_req, res) => res.json({ ok: true, database: isMongoActive ? 'mongodb' : 'sqlite', path: isMongoActive ? mongoUri : sqlitePath }));

app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const { email, password, fullName } = req.body as Record<string, unknown>;
  const normalizedEmail = requiredString(email, 'Email').toLowerCase();
  const safeName = requiredString(fullName, 'Name');
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || typeof password !== 'string' || password.length < 8) throw new Error('Provide a valid email and password of at least 8 characters');
  
  const existing = await dbProvider.findUserByEmail(normalizedEmail);
  if (existing) throw new Error('UNIQUE constraint failed: users.email');

  const salt = randomBytes(16).toString('hex');
  const userId = randomUUID();
  const passwordHash = await hashPassword(password, salt);
  
  await dbProvider.createUser({ id: userId, email: normalizedEmail, full_name: safeName, password_hash: passwordHash, password_salt: salt });
  res.status(201).json({ token: createSession(userId), user: { fullName: safeName, email: normalizedEmail } });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body as Record<string, unknown>;
  const normalizedEmail = requiredString(email, 'Email').toLowerCase();
  if (typeof password !== 'string') throw new Error('Invalid email or password');
  
  const user = await dbProvider.findUserByEmail(normalizedEmail);
  if (!user) { res.status(401).json({ message: 'Invalid email or password' }); return; }
  const suppliedHash = await hashPassword(password, user.password_salt);
  if (!timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(user.password_hash, 'hex'))) { res.status(401).json({ message: 'Invalid email or password' }); return; }
  res.json({ token: createSession(user.id), user: { fullName: user.full_name, email: user.email } });
}));

app.post('/api/auth/google', asyncRoute(async (req, res) => {
  const { email, fullName, googleId } = req.body as Record<string, unknown>;
  const normalizedEmail = requiredString(email, 'Email').toLowerCase();
  const safeName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : normalizedEmail.split('@')[0];
  
  let user = await dbProvider.findUserByEmail(normalizedEmail);
  
  if (!user) {
    const salt = randomBytes(16).toString('hex');
    const userId = randomUUID();
    const passwordHash = await hashPassword(googleId ? String(googleId) : randomUUID(), salt);
    user = await dbProvider.createUser({ id: userId, email: normalizedEmail, full_name: safeName, password_hash: passwordHash, password_salt: salt }) as any;
  }
  
  res.json({ token: createSession(user.id), user: { fullName: user.full_name, email: user.email } });
}));

app.post('/api/auth/github', asyncRoute(async (req, res) => {
  const { email, fullName, githubId, username } = req.body as Record<string, unknown>;
  const rawEmail = typeof email === 'string' && email.trim() ? email.trim() : `${username || githubId || 'github_user'}@github.com`;
  const normalizedEmail = rawEmail.toLowerCase();
  const safeName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : (username ? String(username) : normalizedEmail.split('@')[0]);

  let user = await dbProvider.findUserByEmail(normalizedEmail);

  if (!user) {
    const salt = randomBytes(16).toString('hex');
    const userId = randomUUID();
    const passwordHash = await hashPassword(githubId ? String(githubId) : randomUUID(), salt);
    user = await dbProvider.createUser({ id: userId, email: normalizedEmail, full_name: safeName, password_hash: passwordHash, password_salt: salt }) as any;
  }

  res.json({ token: createSession(user.id), user: { fullName: user.full_name, email: user.email } });
}));

app.post('/api/auth/logout', requireAuth, (req, res) => { const token = req.header('authorization')?.replace(/^Bearer\s+/i, ''); if (token) sessions.delete(token); res.status(204).send(); });
app.use('/api', requireAuth);

app.post('/api/bootstrap', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const owner = idOf(req);
  await dbProvider.bootstrap(owner, req.body || {});
  res.json({ ok: true });
}));

app.get('/api/expenses', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const expenses = await dbProvider.getExpenses(idOf(req));
  res.json(expenses);
}));

app.post('/api/expenses', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateExpense(req.body);
  const created = await dbProvider.createExpense(idOf(req), item);
  res.status(201).json(created);
}));

app.put('/api/expenses/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateExpense(req.body);
  if (item.id !== req.params.id) throw new Error('Record ID cannot be changed');
  const updated = await dbProvider.updateExpense(idOf(req), item);
  if (!updated) { res.status(404).json({ message: 'Expense not found' }); return; }
  res.json(item);
}));

app.delete('/api/expenses/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  await dbProvider.deleteExpense(idOf(req), req.params.id);
  res.status(204).send();
}));

app.get('/api/budgets', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const budgets = await dbProvider.getBudgets(idOf(req));
  res.json(budgets);
}));

app.put('/api/budgets/:category', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateBudget(req.body);
  if (item.category !== req.params.category) throw new Error('Category cannot be changed');
  const saved = await dbProvider.saveBudget(idOf(req), item);
  res.json(saved);
}));

app.delete('/api/budgets/:category', asyncRoute(async (req: AuthenticatedRequest, res) => {
  await dbProvider.deleteBudget(idOf(req), req.params.category);
  res.status(204).send();
}));

app.get('/api/income', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const incomes = await dbProvider.getIncomes(idOf(req));
  res.json(incomes);
}));

app.post('/api/income', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateIncome(req.body);
  const created = await dbProvider.createIncome(idOf(req), item);
  res.status(201).json(created);
}));

app.put('/api/income/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateIncome(req.body);
  if (item.id !== req.params.id) throw new Error('Record ID cannot be changed');
  const updated = await dbProvider.updateIncome(idOf(req), item);
  if (!updated) { res.status(404).json({ message: 'Income entry not found' }); return; }
  res.json(item);
}));

app.delete('/api/income/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  await dbProvider.deleteIncome(idOf(req), req.params.id);
  res.status(204).send();
}));

app.get('/api/emi-plans', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const plans = await dbProvider.getEmiPlans(idOf(req));
  res.json(plans);
}));

app.post('/api/emi-plans', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateEmi(req.body);
  const created = await dbProvider.createEmiPlan(idOf(req), item);
  res.status(201).json(created);
}));

app.delete('/api/emi-plans/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  await dbProvider.deleteEmiPlan(idOf(req), req.params.id);
  res.status(204).send();
}));

app.get('/api/savings-goals', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const goals = await dbProvider.getSavingsGoals(idOf(req));
  res.json(goals);
}));

app.post('/api/savings-goals', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateGoal(req.body);
  const created = await dbProvider.createSavingsGoal(idOf(req), item);
  res.status(201).json(created);
}));

app.put('/api/savings-goals/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateGoal(req.body);
  if (item.id !== req.params.id) throw new Error('Record ID cannot be changed');
  const updated = await dbProvider.updateSavingsGoal(idOf(req), item);
  if (!updated) { res.status(404).json({ message: 'Savings goal not found' }); return; }
  res.json(item);
}));

app.delete('/api/savings-goals/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  await dbProvider.deleteSavingsGoal(idOf(req), req.params.id);
  res.status(204).send();
}));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const rawMessage = error instanceof Error ? error.message : 'Unexpected server error';
  if (/buffering timed out|MongooseServerSelectionError|MongoNetworkError|client has been closed/i.test(rawMessage)) {
    console.error('Database connection error:', rawMessage);
    res.status(503).json({ message: 'Database connection unavailable. Please check MONGODB_URI in your environment settings.' });
    return;
  }
  if (error instanceof SyntaxError || /required|valid|cannot|Invalid|exceed|positive|UNIQUE|constraint/i.test(rawMessage)) {
    const message = /UNIQUE constraint failed: users\.email/i.test(rawMessage) || /E11000 duplicate key error collection:.*index: email/i.test(rawMessage)
      ? 'An account with this email address already exists'
      : rawMessage;
    res.status(/UNIQUE|constraint|E11000/i.test(rawMessage) ? 409 : 400).json({ message });
    return;
  }
  console.error('Unhandled API error', error);
  res.status(500).json({ message: 'Unexpected server error' });
});

// Serve frontend static files in production
const distPath = resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(resolve(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => console.log(`SpendWise API running on http://0.0.0.0:${port}`));
