import 'dotenv/config';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';

const app = express();
const port = Number(process.env.PORT || 4000);
const databasePath = resolve(process.env.SQLITE_PATH || 'data/spendwise.sqlite');
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map<string, { userId: string; expiresAt: number }>();
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS expenses (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), category TEXT NOT NULL, date TEXT NOT NULL, payment_method TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', PRIMARY KEY(user_id, id));
  CREATE TABLE IF NOT EXISTS budgets (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, category TEXT NOT NULL, limit_cents INTEGER NOT NULL CHECK(limit_cents >= 0), spent_cents INTEGER NOT NULL CHECK(spent_cents >= 0), PRIMARY KEY(user_id, category));
  CREATE TABLE IF NOT EXISTS income (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), source TEXT NOT NULL, date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', recurrence TEXT NOT NULL CHECK(recurrence IN ('monthly', 'one_time')), PRIMARY KEY(user_id, id));
  CREATE TABLE IF NOT EXISTS emi_plans (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, name TEXT NOT NULL, monthly_amount_cents INTEGER NOT NULL CHECK(monthly_amount_cents > 0), start_date TEXT NOT NULL, duration_months INTEGER NOT NULL CHECK(duration_months > 0), PRIMARY KEY(user_id, id));
  CREATE TABLE IF NOT EXISTS savings_goals (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, name TEXT NOT NULL, target_amount_cents INTEGER NOT NULL CHECK(target_amount_cents > 0), current_amount_cents INTEGER NOT NULL CHECK(current_amount_cents >= 0 AND current_amount_cents <= target_amount_cents), deadline TEXT NOT NULL, priority TEXT NOT NULL CHECK(priority IN ('high', 'medium', 'low')), PRIMARY KEY(user_id, id));
`);

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
function changes(result: unknown) { return Number((result as { changes?: number }).changes || 0); }
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

app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'sqlite', path: databasePath }));
app.post('/api/auth/signup', asyncRoute(async (req, res) => {
  const { email, password, fullName } = req.body as Record<string, unknown>;
  const normalizedEmail = requiredString(email, 'Email').toLowerCase(); const safeName = requiredString(fullName, 'Name');
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || typeof password !== 'string' || password.length < 8) throw new Error('Provide a valid email and password of at least 8 characters');
  const salt = randomBytes(16).toString('hex'); const userId = randomUUID(); const passwordHash = await hashPassword(password, salt);
  db.prepare('INSERT INTO users (id, email, full_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)').run(userId, normalizedEmail, safeName, passwordHash, salt);
  res.status(201).json({ token: createSession(userId), user: { fullName: safeName, email: normalizedEmail } });
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body as Record<string, unknown>; const normalizedEmail = requiredString(email, 'Email').toLowerCase();
  if (typeof password !== 'string') throw new Error('Invalid email or password');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as any;
  if (!user) { res.status(401).json({ message: 'Invalid email or password' }); return; }
  const suppliedHash = await hashPassword(password, user.password_salt);
  if (!timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(user.password_hash, 'hex'))) { res.status(401).json({ message: 'Invalid email or password' }); return; }
  res.json({ token: createSession(user.id), user: { fullName: user.full_name, email: user.email } });
}));
app.post('/api/auth/google', asyncRoute(async (req, res) => {
  const { email, fullName, googleId } = req.body as Record<string, unknown>;
  const normalizedEmail = requiredString(email, 'Email').toLowerCase();
  const safeName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : normalizedEmail.split('@')[0];
  
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as any;
  
  if (!user) {
    const salt = randomBytes(16).toString('hex');
    const userId = randomUUID();
    const passwordHash = await hashPassword(googleId ? String(googleId) : randomUUID(), salt);
    db.prepare('INSERT INTO users (id, email, full_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)').run(userId, normalizedEmail, safeName, passwordHash, salt);
    user = { id: userId, email: normalizedEmail, full_name: safeName };
  }
  
  res.json({ token: createSession(user.id), user: { fullName: user.full_name, email: user.email } });
}));
app.post('/api/auth/github', asyncRoute(async (req, res) => {
  const { email, fullName, githubId, username } = req.body as Record<string, unknown>;
  const rawEmail = typeof email === 'string' && email.trim() ? email.trim() : `${username || githubId || 'github_user'}@github.com`;
  const normalizedEmail = rawEmail.toLowerCase();
  const safeName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : (username ? String(username) : normalizedEmail.split('@')[0]);

  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as any;

  if (!user) {
    const salt = randomBytes(16).toString('hex');
    const userId = randomUUID();
    const passwordHash = await hashPassword(githubId ? String(githubId) : randomUUID(), salt);
    db.prepare('INSERT INTO users (id, email, full_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)').run(userId, normalizedEmail, safeName, passwordHash, salt);
    user = { id: userId, email: normalizedEmail, full_name: safeName };
  }

  res.json({ token: createSession(user.id), user: { fullName: user.full_name, email: user.email } });
}));
app.post('/api/auth/logout', requireAuth, (req, res) => { const token = req.header('authorization')?.replace(/^Bearer\s+/i, ''); if (token) sessions.delete(token); res.status(204).send(); });
app.use('/api', requireAuth);

app.post('/api/bootstrap', (req: AuthenticatedRequest, res) => { const owner = idOf(req); const payload = req.body as { expenses?: unknown[]; budgets?: unknown[]; income?: unknown[]; emiPlans?: unknown[]; savingsGoals?: unknown[] }; db.exec('BEGIN IMMEDIATE'); try {
  if (!Number(db.prepare('SELECT COUNT(*) AS count FROM expenses WHERE user_id = ?').get(owner)?.count) && payload.expenses?.length) { const insert = db.prepare('INSERT INTO expenses VALUES (?, ?, ?, ?, ?, ?, ?)'); payload.expenses.map(validateExpense).forEach((item) => insert.run(owner, item.id, toCents(item.amount, 1), item.category, item.date, item.paymentMethod, item.notes)); }
  if (!Number(db.prepare('SELECT COUNT(*) AS count FROM budgets WHERE user_id = ?').get(owner)?.count) && payload.budgets?.length) { const insert = db.prepare('INSERT INTO budgets VALUES (?, ?, ?, ?)'); payload.budgets.map(validateBudget).forEach((item) => insert.run(owner, item.category, toCents(item.limit), toCents(item.spent))); }
  if (!Number(db.prepare('SELECT COUNT(*) AS count FROM income WHERE user_id = ?').get(owner)?.count) && payload.income?.length) { const insert = db.prepare('INSERT INTO income VALUES (?, ?, ?, ?, ?, ?, ?)'); payload.income.map(validateIncome).forEach((item) => insert.run(owner, item.id, toCents(item.amount, 1), item.source, item.date, item.notes, item.recurrence)); }
  if (!Number(db.prepare('SELECT COUNT(*) AS count FROM emi_plans WHERE user_id = ?').get(owner)?.count) && payload.emiPlans?.length) { const insert = db.prepare('INSERT INTO emi_plans VALUES (?, ?, ?, ?, ?, ?)'); payload.emiPlans.map(validateEmi).forEach((item) => insert.run(owner, item.id, item.name, toCents(item.monthlyAmount, 1), item.startDate, item.durationMonths)); }
  if (!Number(db.prepare('SELECT COUNT(*) AS count FROM savings_goals WHERE user_id = ?').get(owner)?.count) && payload.savingsGoals?.length) { const insert = db.prepare('INSERT INTO savings_goals VALUES (?, ?, ?, ?, ?, ?, ?)'); payload.savingsGoals.map(validateGoal).forEach((item) => insert.run(owner, item.id, item.name, toCents(item.targetAmount, 1), toCents(item.currentAmount), item.deadline, item.priority)); }
  db.exec('COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; } res.json({ ok: true }); });

app.get('/api/expenses', (req: AuthenticatedRequest, res) => res.json(db.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC').all(idOf(req)).map(asExpense)));
app.post('/api/expenses', (req: AuthenticatedRequest, res) => { const item = validateExpense(req.body); db.prepare('INSERT INTO expenses VALUES (?, ?, ?, ?, ?, ?, ?)').run(idOf(req), item.id, toCents(item.amount, 1), item.category, item.date, item.paymentMethod, item.notes); res.status(201).json(item); });
app.put('/api/expenses/:id', (req: AuthenticatedRequest, res) => { const item = validateExpense(req.body); if (item.id !== req.params.id) throw new Error('Record ID cannot be changed'); if (!changes(db.prepare('UPDATE expenses SET amount_cents=?, category=?, date=?, payment_method=?, notes=? WHERE user_id=? AND id=?').run(toCents(item.amount, 1), item.category, item.date, item.paymentMethod, item.notes, idOf(req), item.id))) { res.status(404).json({ message: 'Expense not found' }); return; } res.json(item); });
app.delete('/api/expenses/:id', (req: AuthenticatedRequest, res) => { db.prepare('DELETE FROM expenses WHERE user_id=? AND id=?').run(idOf(req), req.params.id); res.status(204).send(); });

app.get('/api/budgets', (req: AuthenticatedRequest, res) => res.json(db.prepare('SELECT * FROM budgets WHERE user_id=? ORDER BY category').all(idOf(req)).map(asBudget)));
app.put('/api/budgets/:category', (req: AuthenticatedRequest, res) => { const item = validateBudget(req.body); if (item.category !== req.params.category) throw new Error('Category cannot be changed'); db.prepare('INSERT INTO budgets (user_id, category, limit_cents, spent_cents) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, category) DO UPDATE SET limit_cents=excluded.limit_cents, spent_cents=excluded.spent_cents').run(idOf(req), item.category, toCents(item.limit), toCents(item.spent)); res.json(item); });
app.delete('/api/budgets/:category', (req: AuthenticatedRequest, res) => { db.prepare('DELETE FROM budgets WHERE user_id=? AND category=?').run(idOf(req), req.params.category); res.status(204).send(); });

app.get('/api/income', (req: AuthenticatedRequest, res) => res.json(db.prepare('SELECT * FROM income WHERE user_id=? ORDER BY date DESC').all(idOf(req)).map(asIncome)));
app.post('/api/income', (req: AuthenticatedRequest, res) => { const item = validateIncome(req.body); db.prepare('INSERT INTO income VALUES (?, ?, ?, ?, ?, ?, ?)').run(idOf(req), item.id, toCents(item.amount, 1), item.source, item.date, item.notes, item.recurrence); res.status(201).json(item); });
app.put('/api/income/:id', (req: AuthenticatedRequest, res) => { const item = validateIncome(req.body); if (item.id !== req.params.id) throw new Error('Record ID cannot be changed'); if (!changes(db.prepare('UPDATE income SET amount_cents=?, source=?, date=?, notes=?, recurrence=? WHERE user_id=? AND id=?').run(toCents(item.amount, 1), item.source, item.date, item.notes, item.recurrence, idOf(req), item.id))) { res.status(404).json({ message: 'Income entry not found' }); return; } res.json(item); });
app.delete('/api/income/:id', (req: AuthenticatedRequest, res) => { db.prepare('DELETE FROM income WHERE user_id=? AND id=?').run(idOf(req), req.params.id); res.status(204).send(); });

app.get('/api/emi-plans', (req: AuthenticatedRequest, res) => res.json(db.prepare('SELECT * FROM emi_plans WHERE user_id=? ORDER BY start_date DESC').all(idOf(req)).map(asEmi)));
app.post('/api/emi-plans', (req: AuthenticatedRequest, res) => { const item = validateEmi(req.body); db.prepare('INSERT INTO emi_plans VALUES (?, ?, ?, ?, ?, ?)').run(idOf(req), item.id, item.name, toCents(item.monthlyAmount, 1), item.startDate, item.durationMonths); res.status(201).json(item); });
app.delete('/api/emi-plans/:id', (req: AuthenticatedRequest, res) => { db.prepare('DELETE FROM emi_plans WHERE user_id=? AND id=?').run(idOf(req), req.params.id); res.status(204).send(); });

app.get('/api/savings-goals', (req: AuthenticatedRequest, res) => res.json(db.prepare('SELECT * FROM savings_goals WHERE user_id=? ORDER BY deadline').all(idOf(req)).map(asGoal)));
app.post('/api/savings-goals', (req: AuthenticatedRequest, res) => { const item = validateGoal(req.body); db.prepare('INSERT INTO savings_goals VALUES (?, ?, ?, ?, ?, ?, ?)').run(idOf(req), item.id, item.name, toCents(item.targetAmount, 1), toCents(item.currentAmount), item.deadline, item.priority); res.status(201).json(item); });
app.put('/api/savings-goals/:id', (req: AuthenticatedRequest, res) => { const item = validateGoal(req.body); if (item.id !== req.params.id) throw new Error('Record ID cannot be changed'); if (!changes(db.prepare('UPDATE savings_goals SET name=?, target_amount_cents=?, current_amount_cents=?, deadline=?, priority=? WHERE user_id=? AND id=?').run(item.name, toCents(item.targetAmount, 1), toCents(item.currentAmount), item.deadline, item.priority, idOf(req), item.id))) { res.status(404).json({ message: 'Savings goal not found' }); return; } res.json(item); });
app.delete('/api/savings-goals/:id', (req: AuthenticatedRequest, res) => { db.prepare('DELETE FROM savings_goals WHERE user_id=? AND id=?').run(idOf(req), req.params.id); res.status(204).send(); });

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const rawMessage = error instanceof Error ? error.message : 'Unexpected server error';
  if (error instanceof SyntaxError || /required|valid|cannot|Invalid|exceed|positive|UNIQUE|constraint/i.test(rawMessage)) {
    const message = /UNIQUE constraint failed: users\.email/i.test(rawMessage)
      ? 'An account with this email address already exists'
      : rawMessage;
    res.status(/UNIQUE|constraint/i.test(rawMessage) ? 409 : 400).json({ message });
    return;
  }
  console.error('Unhandled API error', error); res.status(500).json({ message: 'Unexpected server error' });
});

// Serve frontend static files in production
app.use(express.static(resolve(process.cwd(), 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(resolve(process.cwd(), 'dist', 'index.html'));
});

app.listen(port, '0.0.0.0', () => console.log(`SpendWise SQLite API running on http://0.0.0.0:${port}`));
