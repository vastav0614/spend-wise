import 'dotenv/config';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore DNS override errors on container environments like Render
}

const app = express();
const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spendwise';
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map<string, { userId: string; expiresAt: number }>();

if (!process.env.MONGODB_URI) {
  console.warn('WARNING: MONGODB_URI environment variable is not defined! Defaulting to local MongoDB.');
}

mongoose.connect(mongoUri, { tls: true, tlsAllowInvalidCertificates: true, serverSelectionTimeoutMS: 10000 })
  .then(() => console.log('Successfully connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

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

function asExpense(row: any): Expense { return { id: row.id, amount: fromCents(row.amount_cents), category: row.category, date: row.date, paymentMethod: row.payment_method, notes: row.notes }; }
function asBudget(row: any): Budget { return { category: row.category, limit: fromCents(row.limit_cents), spent: fromCents(row.spent_cents) }; }
function asIncome(row: any): Income { return { id: row.id, amount: fromCents(row.amount_cents), source: row.source, date: row.date, notes: row.notes, recurrence: row.recurrence }; }
function asEmi(row: any): Emi { return { id: row.id, name: row.name, monthlyAmount: fromCents(row.monthly_amount_cents), startDate: row.start_date, durationMonths: row.duration_months }; }
function asGoal(row: any): SavingsGoal { return { id: row.id, name: row.name, targetAmount: fromCents(row.target_amount_cents), currentAmount: fromCents(row.current_amount_cents), deadline: row.deadline, priority: row.priority }; }

function validateExpense(body: unknown): Expense { const value = body as Partial<Expense>; return { id: requiredString(value.id, 'ID'), amount: fromCents(toCents(value.amount, 1)), category: requiredString(value.category, 'Category'), date: requiredDate(value.date), paymentMethod: requiredString(value.paymentMethod, 'Payment method'), notes: typeof value.notes === 'string' ? value.notes : '' }; }
function validateBudget(body: unknown): Budget { const value = body as Partial<Budget>; return { category: requiredString(value.category, 'Category'), limit: fromCents(toCents(value.limit)), spent: fromCents(toCents(value.spent)) }; }
function validateIncome(body: unknown): Income { const value = body as Partial<Income>; const recurrence = value.recurrence === 'monthly' || value.recurrence === 'one_time' ? value.recurrence : (() => { throw new Error('Invalid recurrence'); })(); return { id: requiredString(value.id, 'ID'), amount: fromCents(toCents(value.amount, 1)), source: requiredString(value.source, 'Source'), date: requiredDate(value.date), notes: typeof value.notes === 'string' ? value.notes : '', recurrence }; }
function validateEmi(body: unknown): Emi { const value = body as Partial<Emi>; const durationMonths = Number(value.durationMonths); if (!Number.isInteger(durationMonths) || durationMonths < 1) throw new Error('Duration must be a positive whole number'); return { id: requiredString(value.id, 'ID'), name: requiredString(value.name, 'Name'), monthlyAmount: fromCents(toCents(value.monthlyAmount, 1)), startDate: requiredDate(value.startDate), durationMonths }; }
function validateGoal(body: unknown): SavingsGoal { const value = body as Partial<SavingsGoal>; const targetAmount = fromCents(toCents(value.targetAmount, 1)); const currentAmount = fromCents(toCents(value.currentAmount)); if (currentAmount > targetAmount) throw new Error('Saved amount cannot exceed target'); if (!['high', 'medium', 'low'].includes(value.priority || '')) throw new Error('Invalid priority'); return { id: requiredString(value.id, 'ID'), name: requiredString(value.name, 'Name'), targetAmount, currentAmount, deadline: requiredDate(value.deadline), priority: value.priority as SavingsGoal['priority'] }; }

app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'mongodb', path: mongoUri }));
app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const { email, password, fullName } = req.body as Record<string, unknown>;
  const normalizedEmail = requiredString(email, 'Email').toLowerCase(); const safeName = requiredString(fullName, 'Name');
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || typeof password !== 'string' || password.length < 8) throw new Error('Provide a valid email and password of at least 8 characters');
  
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw new Error('UNIQUE constraint failed: users.email');

  const salt = randomBytes(16).toString('hex'); const userId = randomUUID(); const passwordHash = await hashPassword(password, salt);
  
  await User.create({ id: userId, email: normalizedEmail, full_name: safeName, password_hash: passwordHash, password_salt: salt });
  res.status(201).json({ token: createSession(userId), user: { fullName: safeName, email: normalizedEmail } });
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body as Record<string, unknown>; const normalizedEmail = requiredString(email, 'Email').toLowerCase();
  if (typeof password !== 'string') throw new Error('Invalid email or password');
  
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) { res.status(401).json({ message: 'Invalid email or password' }); return; }
  const suppliedHash = await hashPassword(password, user.password_salt);
  if (!timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(user.password_hash, 'hex'))) { res.status(401).json({ message: 'Invalid email or password' }); return; }
  res.json({ token: createSession(user.id), user: { fullName: user.full_name, email: user.email } });
}));
app.post('/api/auth/google', asyncRoute(async (req, res) => {
  const { email, fullName, googleId } = req.body as Record<string, unknown>;
  const normalizedEmail = requiredString(email, 'Email').toLowerCase();
  const safeName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : normalizedEmail.split('@')[0];
  
  let user = await User.findOne({ email: normalizedEmail });
  
  if (!user) {
    const salt = randomBytes(16).toString('hex');
    const userId = randomUUID();
    const passwordHash = await hashPassword(googleId ? String(googleId) : randomUUID(), salt);
    user = await User.create({ id: userId, email: normalizedEmail, full_name: safeName, password_hash: passwordHash, password_salt: salt });
  }
  
  res.json({ token: createSession(user.id), user: { fullName: user.full_name, email: user.email } });
}));
app.post('/api/auth/github', asyncRoute(async (req, res) => {
  const { email, fullName, githubId, username } = req.body as Record<string, unknown>;
  const rawEmail = typeof email === 'string' && email.trim() ? email.trim() : `${username || githubId || 'github_user'}@github.com`;
  const normalizedEmail = rawEmail.toLowerCase();
  const safeName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : (username ? String(username) : normalizedEmail.split('@')[0]);

  let user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    const salt = randomBytes(16).toString('hex');
    const userId = randomUUID();
    const passwordHash = await hashPassword(githubId ? String(githubId) : randomUUID(), salt);
    user = await User.create({ id: userId, email: normalizedEmail, full_name: safeName, password_hash: passwordHash, password_salt: salt });
  }

  res.json({ token: createSession(user.id), user: { fullName: user.full_name, email: user.email } });
}));
app.post('/api/auth/logout', requireAuth, (req, res) => { const token = req.header('authorization')?.replace(/^Bearer\s+/i, ''); if (token) sessions.delete(token); res.status(204).send(); });
app.use('/api', requireAuth);

app.post('/api/bootstrap', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const owner = idOf(req); const payload = req.body as { expenses?: unknown[]; budgets?: unknown[]; income?: unknown[]; emiPlans?: unknown[]; savingsGoals?: unknown[] };
  
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const expCount = await ExpenseModel.countDocuments({ user_id: owner }).session(session);
    if (expCount === 0 && payload.expenses?.length) {
      const expenses = payload.expenses.map(validateExpense).map(item => ({ user_id: owner, id: item.id, amount_cents: toCents(item.amount, 1), category: item.category, date: item.date, payment_method: item.paymentMethod, notes: item.notes }));
      await ExpenseModel.insertMany(expenses, { session });
    }

    const budCount = await BudgetModel.countDocuments({ user_id: owner }).session(session);
    if (budCount === 0 && payload.budgets?.length) {
      const budgets = payload.budgets.map(validateBudget).map(item => ({ user_id: owner, category: item.category, limit_cents: toCents(item.limit), spent_cents: toCents(item.spent) }));
      await BudgetModel.insertMany(budgets, { session });
    }

    const incCount = await IncomeModel.countDocuments({ user_id: owner }).session(session);
    if (incCount === 0 && payload.income?.length) {
      const incomes = payload.income.map(validateIncome).map(item => ({ user_id: owner, id: item.id, amount_cents: toCents(item.amount, 1), source: item.source, date: item.date, notes: item.notes, recurrence: item.recurrence }));
      await IncomeModel.insertMany(incomes, { session });
    }

    const emiCount = await EmiPlanModel.countDocuments({ user_id: owner }).session(session);
    if (emiCount === 0 && payload.emiPlans?.length) {
      const emis = payload.emiPlans.map(validateEmi).map(item => ({ user_id: owner, id: item.id, name: item.name, monthly_amount_cents: toCents(item.monthlyAmount, 1), start_date: item.startDate, duration_months: item.durationMonths }));
      await EmiPlanModel.insertMany(emis, { session });
    }

    const sgCount = await SavingsGoalModel.countDocuments({ user_id: owner }).session(session);
    if (sgCount === 0 && payload.savingsGoals?.length) {
      const sgs = payload.savingsGoals.map(validateGoal).map(item => ({ user_id: owner, id: item.id, name: item.name, target_amount_cents: toCents(item.targetAmount, 1), current_amount_cents: toCents(item.currentAmount), deadline: item.deadline, priority: item.priority }));
      await SavingsGoalModel.insertMany(sgs, { session });
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
  res.json({ ok: true });
}));

app.get('/api/expenses', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const expenses = await ExpenseModel.find({ user_id: idOf(req) }).sort({ date: -1 });
  res.json(expenses.map(asExpense));
}));
app.post('/api/expenses', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateExpense(req.body);
  await ExpenseModel.create({ user_id: idOf(req), id: item.id, amount_cents: toCents(item.amount, 1), category: item.category, date: item.date, payment_method: item.paymentMethod, notes: item.notes });
  res.status(201).json(item);
}));
app.put('/api/expenses/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateExpense(req.body);
  if (item.id !== req.params.id) throw new Error('Record ID cannot be changed');
  const result = await ExpenseModel.updateOne(
    { user_id: idOf(req), id: item.id },
    { $set: { amount_cents: toCents(item.amount, 1), category: item.category, date: item.date, payment_method: item.paymentMethod, notes: item.notes } }
  );
  if (result.matchedCount === 0) { res.status(404).json({ message: 'Expense not found' }); return; }
  res.json(item);
}));
app.delete('/api/expenses/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  await ExpenseModel.deleteOne({ user_id: idOf(req), id: req.params.id });
  res.status(204).send();
}));

app.get('/api/budgets', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const budgets = await BudgetModel.find({ user_id: idOf(req) }).sort({ category: 1 });
  res.json(budgets.map(asBudget));
}));
app.put('/api/budgets/:category', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateBudget(req.body);
  if (item.category !== req.params.category) throw new Error('Category cannot be changed');
  await BudgetModel.updateOne(
    { user_id: idOf(req), category: item.category },
    { $set: { limit_cents: toCents(item.limit), spent_cents: toCents(item.spent) } },
    { upsert: true }
  );
  res.json(item);
}));
app.delete('/api/budgets/:category', asyncRoute(async (req: AuthenticatedRequest, res) => {
  await BudgetModel.deleteOne({ user_id: idOf(req), category: req.params.category });
  res.status(204).send();
}));

app.get('/api/income', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const incomes = await IncomeModel.find({ user_id: idOf(req) }).sort({ date: -1 });
  res.json(incomes.map(asIncome));
}));
app.post('/api/income', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateIncome(req.body);
  await IncomeModel.create({ user_id: idOf(req), id: item.id, amount_cents: toCents(item.amount, 1), source: item.source, date: item.date, notes: item.notes, recurrence: item.recurrence });
  res.status(201).json(item);
}));
app.put('/api/income/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateIncome(req.body);
  if (item.id !== req.params.id) throw new Error('Record ID cannot be changed');
  const result = await IncomeModel.updateOne(
    { user_id: idOf(req), id: item.id },
    { $set: { amount_cents: toCents(item.amount, 1), source: item.source, date: item.date, notes: item.notes, recurrence: item.recurrence } }
  );
  if (result.matchedCount === 0) { res.status(404).json({ message: 'Income entry not found' }); return; }
  res.json(item);
}));
app.delete('/api/income/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  await IncomeModel.deleteOne({ user_id: idOf(req), id: req.params.id });
  res.status(204).send();
}));

app.get('/api/emi-plans', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const plans = await EmiPlanModel.find({ user_id: idOf(req) }).sort({ start_date: -1 });
  res.json(plans.map(asEmi));
}));
app.post('/api/emi-plans', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateEmi(req.body);
  await EmiPlanModel.create({ user_id: idOf(req), id: item.id, name: item.name, monthly_amount_cents: toCents(item.monthlyAmount, 1), start_date: item.startDate, duration_months: item.durationMonths });
  res.status(201).json(item);
}));
app.delete('/api/emi-plans/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  await EmiPlanModel.deleteOne({ user_id: idOf(req), id: req.params.id });
  res.status(204).send();
}));

app.get('/api/savings-goals', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const goals = await SavingsGoalModel.find({ user_id: idOf(req) }).sort({ deadline: 1 });
  res.json(goals.map(asGoal));
}));
app.post('/api/savings-goals', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateGoal(req.body);
  await SavingsGoalModel.create({ user_id: idOf(req), id: item.id, name: item.name, target_amount_cents: toCents(item.targetAmount, 1), current_amount_cents: toCents(item.currentAmount), deadline: item.deadline, priority: item.priority });
  res.status(201).json(item);
}));
app.put('/api/savings-goals/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const item = validateGoal(req.body);
  if (item.id !== req.params.id) throw new Error('Record ID cannot be changed');
  const result = await SavingsGoalModel.updateOne(
    { user_id: idOf(req), id: item.id },
    { $set: { name: item.name, target_amount_cents: toCents(item.targetAmount, 1), current_amount_cents: toCents(item.currentAmount), deadline: item.deadline, priority: item.priority } }
  );
  if (result.matchedCount === 0) { res.status(404).json({ message: 'Savings goal not found' }); return; }
  res.json(item);
}));
app.delete('/api/savings-goals/:id', asyncRoute(async (req: AuthenticatedRequest, res) => {
  await SavingsGoalModel.deleteOne({ user_id: idOf(req), id: req.params.id });
  res.status(204).send();
}));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const rawMessage = error instanceof Error ? error.message : 'Unexpected server error';
  if (error instanceof SyntaxError || /required|valid|cannot|Invalid|exceed|positive|UNIQUE|constraint/i.test(rawMessage)) {
    const message = /UNIQUE constraint failed: users\.email/i.test(rawMessage) || /E11000 duplicate key error collection:.*index: email/i.test(rawMessage)
      ? 'An account with this email address already exists'
      : rawMessage;
    res.status(/UNIQUE|constraint|E11000/i.test(rawMessage) ? 409 : 400).json({ message });
    return;
  }
  console.error('Unhandled API error', error); res.status(500).json({ message: 'Unexpected server error' });
});

// Serve frontend static files in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distPath = resolve(__dirname, '../dist');

app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(resolve(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => console.log(`SpendWise MongoDB API running on http://0.0.0.0:${port}`));
