import { DatabaseSync } from 'node:sqlite';
import { scrypt as scryptCallback } from 'node:crypto';

async function hashPassword(password, salt) { 
  const key = await new Promise((resolveKey, reject) => 
    scryptCallback(password, salt, 64, (error, value) => error ? reject(error) : resolveKey(value))
  ); 
  return key.toString('hex'); 
}

(async () => {
  const db = new DatabaseSync('data/spendwise.sqlite');
  const email = 'sreevastav06140523@gmail.com';
  const newPassword = '06140523';
  
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    console.log('User not found');
    return;
  }
  
  const newHash = await hashPassword(newPassword, user.password_salt);
  
  db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(newHash, email);
  console.log('Password successfully updated in the database!');
})();
