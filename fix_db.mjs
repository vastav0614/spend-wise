import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/spendwise.sqlite');

try {
  db.exec('BEGIN TRANSACTION');
  
  // 1. Reset spent_cents to 0 for all budgets
  db.prepare('UPDATE budgets SET spent_cents = 0').run();
  
  // 2. Calculate sum of expenses per user and category
  const expenses = db.prepare('SELECT user_id, category, SUM(amount_cents) as total FROM expenses GROUP BY user_id, category').all();
  
  // 3. Update budgets with the calculated total
  const updateBudget = db.prepare('UPDATE budgets SET spent_cents = ? WHERE user_id = ? AND category = ?');
  
  let fixedCount = 0;
  for (const exp of expenses) {
    const result = updateBudget.run(exp.total, exp.user_id, exp.category);
    if (result && typeof result === 'object' && 'changes' in result && result.changes > 0) {
        fixedCount++;
    } else if (result === undefined) {
        // node:sqlite returns undefined or statement for run?
        // Let's just run it. node:sqlite db.prepare().run() might just return { changes, lastInsertRowid }
        // Oh wait, node:sqlite .run() returns an object with changes and lastInsertRowid
    }
  }
  db.exec('COMMIT');
  console.log('Fixed spent_cents for budgets based on expenses.');
  
  console.log('Updated Budgets:', db.prepare('SELECT * FROM budgets').all());
} catch(e) {
  db.exec('ROLLBACK');
  console.error(e);
}
