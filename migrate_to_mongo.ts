import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);

const databasePath = resolve(process.env.SQLITE_PATH || 'data/spendwise.sqlite');
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spendwise';

console.log(`Connecting to SQLite at ${databasePath}...`);
const db = new DatabaseSync(databasePath);

console.log(`Connecting to MongoDB at ${mongoUri}...`);
await mongoose.connect(mongoUri, { tls: true, tlsAllowInvalidCertificates: true, serverSelectionTimeoutMS: 5000 });

// Define Schemas
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  full_name: { type: String, required: true },
  password_hash: { type: String, required: true },
  password_salt: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

const ExpenseSchema = new mongoose.Schema({
  user_id: { type: String, required: true, index: true },
  id: { type: String, required: true, unique: true },
  amount_cents: { type: Number, required: true },
  category: { type: String, required: true },
  date: { type: String, required: true },
  payment_method: { type: String, required: true },
  notes: { type: String, default: '' }
});
const ExpenseModel = mongoose.model('Expense', ExpenseSchema);

const BudgetSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  category: { type: String, required: true },
  limit_cents: { type: Number, required: true },
  spent_cents: { type: Number, required: true }
});
const BudgetModel = mongoose.model('Budget', BudgetSchema);

const IncomeSchema = new mongoose.Schema({
  user_id: { type: String, required: true, index: true },
  id: { type: String, required: true, unique: true },
  amount_cents: { type: Number, required: true },
  source: { type: String, required: true },
  date: { type: String, required: true },
  notes: { type: String, default: '' },
  recurrence: { type: String, enum: ['monthly', 'one_time'], required: true }
});
const IncomeModel = mongoose.model('Income', IncomeSchema);

const EmiPlanSchema = new mongoose.Schema({
  user_id: { type: String, required: true, index: true },
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  monthly_amount_cents: { type: Number, required: true },
  start_date: { type: String, required: true },
  duration_months: { type: Number, required: true }
});
const EmiPlanModel = mongoose.model('EmiPlan', EmiPlanSchema);

const SavingsGoalSchema = new mongoose.Schema({
  user_id: { type: String, required: true, index: true },
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  target_amount_cents: { type: Number, required: true },
  current_amount_cents: { type: Number, required: true },
  deadline: { type: String, required: true },
  priority: { type: String, enum: ['high', 'medium', 'low'], required: true }
});
const SavingsGoalModel = mongoose.model('SavingsGoal', SavingsGoalSchema);

async function migrate() {
  try {
    // 1. Users
    const users = db.prepare('SELECT * FROM users').all();
    console.log(`Found ${users.length} users. Migrating...`);
    for (const u of users as any[]) {
      await User.updateOne({ email: u.email }, { $set: u }, { upsert: true });
    }

    // 2. Expenses
    const expenses = db.prepare('SELECT * FROM expenses').all();
    console.log(`Found ${expenses.length} expenses. Migrating...`);
    for (const e of expenses as any[]) {
      await ExpenseModel.updateOne({ id: e.id }, { $set: e }, { upsert: true });
    }

    // 3. Budgets
    const budgets = db.prepare('SELECT * FROM budgets').all();
    console.log(`Found ${budgets.length} budgets. Migrating...`);
    for (const b of budgets as any[]) {
      await BudgetModel.updateOne({ user_id: b.user_id, category: b.category }, { $set: b }, { upsert: true });
    }

    // 4. Income
    const incomes = db.prepare('SELECT * FROM income').all();
    console.log(`Found ${incomes.length} income records. Migrating...`);
    for (const i of incomes as any[]) {
      await IncomeModel.updateOne({ id: i.id }, { $set: i }, { upsert: true });
    }

    // 5. EMI Plans
    const emis = db.prepare('SELECT * FROM emi_plans').all();
    console.log(`Found ${emis.length} EMI plans. Migrating...`);
    for (const emi of emis as any[]) {
      await EmiPlanModel.updateOne({ id: emi.id }, { $set: emi }, { upsert: true });
    }

    // 6. Savings Goals
    const goals = db.prepare('SELECT * FROM savings_goals').all();
    console.log(`Found ${goals.length} savings goals. Migrating...`);
    for (const g of goals as any[]) {
      await SavingsGoalModel.updateOne({ id: g.id }, { $set: g }, { upsert: true });
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    db.close();
  }
}

migrate();
