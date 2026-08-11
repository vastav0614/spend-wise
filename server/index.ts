import 'dotenv/config';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';

const app = express();
const port = Number(process.env.PORT || 4000);
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map<string, { userId: string; expiresAt: number }>();

const MONGODB_URI = process.env.DATABASE_URL || 'mongodb://localhost:27017/spendwise';
mongoose.connect(MONGODB_URI).then(() => console.log('Connected to MongoDB')).catch(err => console.error('MongoDB connection error:', err));

const userSchema = new mongoose.Schema({ _id: { type: String, required: true }, email: { type: String, required: true, unique: true }, full_name: { type: String, required: true }, password_hash: { type: String, required: true }, password_salt: { type: String, required: true } }, { _id: false });
const User = mongoose.model('User', userSchema);

const expenseSchema = new mongoose.Schema({ _id: { type: String, required: true }, user_id: { type: String, required: true, ref: 'User' }, amount_cents: { type: Number, required: true }, category: { type: String, required: true }, date: { type: String, required: true }, payment_method: { type: String, required: true }, notes: { type: String, default: '' } }, { _id: false });
const Expense = mongoose.model('Expense', expenseSchema);

const budgetSchema = new mongoose.Schema({ user_id: { type: String, required: true, ref: 'User' }, category: { type: String, required: true }, limit_cents: { type: Number, required: true }, spent_cents: { type: Number, required: true } });
budgetSchema.index({ user_id: 1, category: 1 }, { unique: true });
const Budget = mongoose.model('Budget', budgetSchema);

const incomeSchema = new mongoose.Schema({ _id: { type: String, required: true }, user_id: { type: String, required: true, ref: 'User' }, amount_cents: { type: Number, required: true }, source: { type: String, required: true }, date: { type: String, required: true }, notes: { type: String, default: '' }, recurrence: { type: String, required: true } }, { _id: false });
const Income = mongoose.model('Income', incomeSchema);

const emiSchema = new mongoose.Schema({ _id: { type: String, required: true }, user_id: { type: String, required: true, ref: 'User' }, name: { type: String, required: true }, monthly_amount_cents: { type: Number, required: true }, start_date: { type: String, required: true }, duration_months: { type: Number, required: true } }, { _id: false });
const Emi = mongoose.model('Emi', emiSchema);

const savingsGoalSchema = new mongoose.Schema({ _id: { type: String, required: true }, user_id: { type: String, required: true, ref: 'User' }, name: { type: String, required: true }, target_amount_cents: { type: Number, required: true }, current_amount_cents: { type: Number, required: true }, deadline: { type: String, required: true }, priority: { type: String, required: true } }, { _id: false });
const SavingsGoal = mongoose.model('SavingsGoal', savingsGoalSchema);

app.use(express.json({ limit: '100kb' }));

type AuthenticatedRequest = express.Request & { userId?: string };
type ExpenseType = { id: string; amount: number; category: string; date: string; paymentMethod: string; notes: string };
type BudgetType = { category: string; limit: number; spent: number };
type IncomeType = { id: string; amount: number; source: string; date: string; notes: string; recurrence: 'monthly' | 'one_time' };
type EmiType = { id: string; name: string; monthlyAmount: number; startDate: string; durationMonths: number };
type SavingsGoalType = { id: string; name: string; targetAmount: number; currentAmount: number; deadline: string; priority: 'high' | 'medium' | 'low' };

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

function validateExpense(body: unknown): ExpenseType { const value = body as Partial<ExpenseType>; return { id: requiredString(value.id, 'ID'), amount: fromCents(toCents(value.amount, 1)), category: requiredString(value.category, 'Category'), date: requiredDate(value.date), paymentMethod: requiredString(value.paymentMethod, 'Payment method'), notes: typeof value.notes === 'string' ? value.notes : '' }; }
function validateBudget(body: unknown): BudgetType { const value = body as Partial<BudgetType>; return { category: requiredString(value.category, 'Category'), limit: fromCents(toCents(value.limit)), spent: fromCents(toCents(value.spent)) }; }
function validateIncome(body: unknown): IncomeType { const value = body as Partial<IncomeType>; const recurrence = value.recurrence === 'monthly' || value.recurrence === 'one_time' ? value.recurrence : (() => { throw new Error('Invalid recurrence'); })(); return { id: requiredString(value.id, 'ID'), amount: fromCents(toCents(value.amount, 1)), source: requiredString(value.source, 'Source'), date: requiredDate(value.date), notes: typeof value.notes === 'string' ? value.notes : '', recurrence }; }
function validateEmi(body: unknown): EmiType { const value = body as Partial<EmiType>; const durationMonths = Number(value.durationMonths); if (!Number.isInteger(durationMonths) || durationMonths < 1) throw new Error('Duration must be a positive whole number'); return { id: requiredString(value.id, 'ID'), name: requiredString(value.name, 'Name'), monthlyAmount: fromCents(toCents(value.monthlyAmount, 1)), startDate: requiredDate(value.startDate), durationMonths }; }
function validateGoal(body: unknown): SavingsGoalType { const value = body as Partial<SavingsGoalType>; const targetAmount = fromCents(toCents(value.targetAmount, 1)); const currentAmount = fromCents(toCents(value.currentAmount)); if (currentAmount > targetAmount) throw new Error('Saved amount cannot exceed target'); if (!['high', 'medium', 'low'].includes(value.priority || '')) throw new Error('Invalid priority'); return { id: requiredString(value.id, 'ID'), name: requiredString(value.name, 'Name'), targetAmount, currentAmount, deadline: requiredDate(value.deadline), priority: value.priority as SavingsGoalType['priority'] }; }

app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'mongodb' }));

app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const { email, password, fullName } = req.body as Record<string, unknown>;
  const normalizedEmail = requiredString(email, 'Email').toLowerCase(); const safeName = requiredString(fullName, 'Name');
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || typeof password !== 'string' || password.length < 8) throw new Error('Provide a valid email and password of at least 8 characters');
  const salt = randomBytes(16).toString('hex'); const userId = randomUUID(); const passwordHash = await hashPassword(password, salt);
  
  await User.create({ _id: userId, email: normalizedEmail, full_name: safeName, password_hash: passwordHash, password_salt: salt });
  res.status(201).json({ token: createSession(userId), user: { fullName: safeName, email: normalizedEmail } });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body as Record<string, unknown>; const normalizedEmail = requiredString(email, 'Email').toLowerCase();
  if (typeof password !== 'string') throw new Error('Invalid email or password');
  
  const user = await User.findOne({ email: normalizedEmail }).lean() as any;
  if (!user) { res.status(401).json({ message: 'Invalid email or password' }); return; }
  
  const suppliedHash = await hashPassword(password, user.password_salt);
  if (!timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(user.password_hash, 'hex'))) { res.status(401).json({ message: 'Invalid email or password' }); return; }
  res.json({ token: createSession(user._id), user: { fullName: user.full_name, email: user.email } });
}));

app.post('/api/auth/google', asyncRoute(async (req, res) => {
  const { email, fullName, googleId } = req.body as Record<string, unknown>;
  const normalizedEmail = requiredString(email, 'Email').toLowerCase();
  const safeName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : normalizedEmail.split('@')[0];
  
  let user = await User.findOne({ email: normalizedEmail }).lean() as any;
  
  if (!user) {
    const salt = randomBytes(16).toString('hex');
    const userId = randomUUID();
    const passwordHash = await hashPassword(googleId ? String(googleId) : randomUUID(), salt);
    user = await User.create({ _id: userId, email: normalizedEmail, full_name: safeName, password_hash: passwordHash, password_salt: salt });
  }
  
  res.json({ token: createSession(user._id), user: { fullName: user.full_name || user.fullName, email: user.email } });
}));

app.post('/api/auth/github', asyncRoute(async (req, res) => {
  const { email, fullName, githubId, username } = req.body as Record<string, unknown>;
  const rawEmail = typeof email === 'string' && email.trim() ? email.trim() : `${username || githubId || 'github_user'}@github.com`;
  const normalizedEmail = rawEmail.toLowerCase();
  const safeName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : (username ? String(username) : normalizedEmail.split('@')[0]);

  let user = await User.findOne({ email: normalizedEmail }).lean() as any;

  if (!user) {
    const salt = randomBytes(16).toString('hex');
    const userId = randomUUID();
    const passwordHash = await hashPassword(githubId ? String(githubId) : randomUUID(), salt);
    user = await User.create({ _id: userId, email: normalizedEmail, full_name: safeName, password_hash: passwordHash, password_salt: salt });
  }

  res.json({ token: createSession(user._id), user: { fullName: user.full_name || user.fullName, email: user.email } });
}));

app.post('/api/auth/logout', requireAuth, (req, res) => { const token = req.header('authorization')?.replace(/^Bearer\s+/i, ''); if (token) sessions.delete(token); res.status(204).send(); });
app.use('/api', requireAuth);

app.post('/api/bootstrap', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  const owner = idOf(req); 
  const payload = req.body as { expenses?: unknown[]; budgets?: unknown[]; income?: unknown[]; emiPlans?: unknown[]; savingsGoals?: unknown[] }; 
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const expensesCount = await Expense.countDocuments({ user_id: owner });
    if (expensesCount === 0 && payload.expenses?.length) { 
      const expenses = payload.expenses.map(validateExpense).map(item => ({ _id: item.id, user_id: owner, amount_cents: toCents(item.amount, 1), category: item.category, date: item.date, payment_method: item.paymentMethod, notes: item.notes }));
      await Expense.insertMany(expenses, { session });
    }
    
    const budgetsCount = await Budget.countDocuments({ user_id: owner });
    if (budgetsCount === 0 && payload.budgets?.length) { 
      const budgets = payload.budgets.map(validateBudget).map(item => ({ user_id: owner, category: item.category, limit_cents: toCents(item.limit), spent_cents: toCents(item.spent) }));
      await Budget.insertMany(budgets, { session });
    }
    
    const incomeCount = await Income.countDocuments({ user_id: owner });
    if (incomeCount === 0 && payload.income?.length) { 
      const incomes = payload.income.map(validateIncome).map(item => ({ _id: item.id, user_id: owner, amount_cents: toCents(item.amount, 1), source: item.source, date: item.date, notes: item.notes, recurrence: item.recurrence }));
      await Income.insertMany(incomes, { session });
    }
    
    const emiCount = await Emi.countDocuments({ user_id: owner });
    if (emiCount === 0 && payload.emiPlans?.length) { 
      const emis = payload.emiPlans.map(validateEmi).map(item => ({ _id: item.id, user_id: owner, name: item.name, monthly_amount_cents: toCents(item.monthlyAmount, 1), start_date: item.startDate, duration_months: item.durationMonths }));
      await Emi.insertMany(emis, { session });
    }
    
    const savingsCount = await SavingsGoal.countDocuments({ user_id: owner });
    if (savingsCount === 0 && payload.savingsGoals?.length) { 
      const goals = payload.savingsGoals.map(validateGoal).map(item => ({ _id: item.id, user_id: owner, name: item.name, target_amount_cents: toCents(item.targetAmount, 1), current_amount_cents: toCents(item.currentAmount), deadline: item.deadline, priority: item.priority }));
      await SavingsGoal.insertMany(goals, { session });
    }
    
    await session.commitTransaction();
    session.endSession();
    res.json({ ok: true }); 
  } catch (error) { 
    await session.abortTransaction();
    session.endSession();
    throw error; 
  } 
}));

app.get('/api/expenses', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const expenses = await Expense.find({ user_id: idOf(req) }).sort({ date: -1 }).lean();
  res.json(expenses.map((row: any) => ({ id: row._id, amount: fromCents(row.amount_cents), category: row.category, date: row.date, paymentMethod: row.payment_method, notes: row.notes })));
}));

app.post('/api/expenses', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  const item = validateExpense(req.body); 
  await Expense.create({ _id: item.id, user_id: idOf(req), amount_cents: toCents(item.amount, 1), category: item.category, date: item.date, payment_method: item.paymentMethod, notes: item.notes });
  res.status(201).json(item); 
}));

app.put('/api/expenses/:id', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  const item = validateExpense(req.body); if (item.id !== req.params.id) throw new Error('Record ID cannot be changed'); 
  const updated = await Expense.findOneAndUpdate({ user_id: idOf(req), _id: item.id }, { amount_cents: toCents(item.amount, 1), category: item.category, date: item.date, payment_method: item.paymentMethod, notes: item.notes });
  if (!updated) { res.status(404).json({ message: 'Expense not found' }); return; } res.json(item); 
}));

app.delete('/api/expenses/:id', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  await Expense.deleteOne({ user_id: idOf(req), _id: req.params.id }); res.status(204).send(); 
}));

app.get('/api/budgets', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const budgets = await Budget.find({ user_id: idOf(req) }).sort({ category: 1 }).lean();
  res.json(budgets.map((row: any) => ({ category: row.category, limit: fromCents(row.limit_cents), spent: fromCents(row.spent_cents) })));
}));

app.put('/api/budgets/:category', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  const item = validateBudget(req.body); if (item.category !== req.params.category) throw new Error('Category cannot be changed'); 
  await Budget.findOneAndUpdate({ user_id: idOf(req), category: item.category }, { limit_cents: toCents(item.limit), spent_cents: toCents(item.spent) }, { upsert: true });
  res.json(item); 
}));

app.delete('/api/budgets/:category', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  await Budget.deleteOne({ user_id: idOf(req), category: req.params.category }); res.status(204).send(); 
}));

app.get('/api/income', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const income = await Income.find({ user_id: idOf(req) }).sort({ date: -1 }).lean();
  res.json(income.map((row: any) => ({ id: row._id, amount: fromCents(row.amount_cents), source: row.source, date: row.date, notes: row.notes, recurrence: row.recurrence })));
}));

app.post('/api/income', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  const item = validateIncome(req.body); 
  await Income.create({ _id: item.id, user_id: idOf(req), amount_cents: toCents(item.amount, 1), source: item.source, date: item.date, notes: item.notes, recurrence: item.recurrence });
  res.status(201).json(item); 
}));

app.put('/api/income/:id', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  const item = validateIncome(req.body); if (item.id !== req.params.id) throw new Error('Record ID cannot be changed'); 
  const updated = await Income.findOneAndUpdate({ user_id: idOf(req), _id: item.id }, { amount_cents: toCents(item.amount, 1), source: item.source, date: item.date, notes: item.notes, recurrence: item.recurrence });
  if (!updated) { res.status(404).json({ message: 'Income entry not found' }); return; } res.json(item); 
}));

app.delete('/api/income/:id', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  await Income.deleteOne({ user_id: idOf(req), _id: req.params.id }); res.status(204).send(); 
}));

app.get('/api/emi-plans', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const emis = await Emi.find({ user_id: idOf(req) }).sort({ start_date: -1 }).lean();
  res.json(emis.map((row: any) => ({ id: row._id, name: row.name, monthlyAmount: fromCents(row.monthly_amount_cents), startDate: row.start_date, durationMonths: row.duration_months })));
}));

app.post('/api/emi-plans', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  const item = validateEmi(req.body); 
  await Emi.create({ _id: item.id, user_id: idOf(req), name: item.name, monthly_amount_cents: toCents(item.monthlyAmount, 1), start_date: item.startDate, duration_months: item.durationMonths });
  res.status(201).json(item); 
}));

app.delete('/api/emi-plans/:id', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  await Emi.deleteOne({ user_id: idOf(req), _id: req.params.id }); res.status(204).send(); 
}));

app.get('/api/savings-goals', asyncRoute(async (req: AuthenticatedRequest, res) => {
  const goals = await SavingsGoal.find({ user_id: idOf(req) }).sort({ deadline: 1 }).lean();
  res.json(goals.map((row: any) => ({ id: row._id, name: row.name, targetAmount: fromCents(row.target_amount_cents), currentAmount: fromCents(row.current_amount_cents), deadline: row.deadline, priority: row.priority })));
}));

app.post('/api/savings-goals', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  const item = validateGoal(req.body); 
  await SavingsGoal.create({ _id: item.id, user_id: idOf(req), name: item.name, target_amount_cents: toCents(item.targetAmount, 1), current_amount_cents: toCents(item.currentAmount), deadline: item.deadline, priority: item.priority });
  res.status(201).json(item); 
}));

app.put('/api/savings-goals/:id', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  const item = validateGoal(req.body); if (item.id !== req.params.id) throw new Error('Record ID cannot be changed'); 
  const updated = await SavingsGoal.findOneAndUpdate({ user_id: idOf(req), _id: item.id }, { name: item.name, target_amount_cents: toCents(item.targetAmount, 1), current_amount_cents: toCents(item.currentAmount), deadline: item.deadline, priority: item.priority });
  if (!updated) { res.status(404).json({ message: 'Savings goal not found' }); return; } res.json(item); 
}));

app.delete('/api/savings-goals/:id', asyncRoute(async (req: AuthenticatedRequest, res) => { 
  await SavingsGoal.deleteOne({ user_id: idOf(req), _id: req.params.id }); res.status(204).send(); 
}));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const rawMessage = error instanceof Error ? error.message : 'Unexpected server error';
  if (error instanceof SyntaxError || /required|valid|cannot|Invalid|exceed|positive|UNIQUE|constraint|E11000 duplicate/i.test(rawMessage)) {
    const message = /UNIQUE|E11000 duplicate/i.test(rawMessage) && /email/i.test(rawMessage)
      ? 'An account with this email address already exists'
      : rawMessage;
    res.status(/UNIQUE|E11000 duplicate/i.test(rawMessage) ? 409 : 400).json({ message });
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

app.listen(port, '0.0.0.0', () => console.log(`SpendWise API running on http://0.0.0.0:${port}`));
