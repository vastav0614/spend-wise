import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/spendwise.sqlite');
console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
try {
  console.log('Users:', db.prepare('SELECT * FROM users').all());
  console.log('Expenses:', db.prepare('SELECT * FROM expenses').all());
  console.log('Budgets:', db.prepare('SELECT * FROM budgets').all());
  console.log('Income:', db.prepare('SELECT * FROM income').all());
  console.log('EMI:', db.prepare('SELECT * FROM emi_plans').all());
  console.log('Savings Goals:', db.prepare('SELECT * FROM savings_goals').all());
} catch(e) {
  console.error(e);
}
