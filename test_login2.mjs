import { scrypt as scryptCallback } from 'node:crypto';

async function hashPassword(password, salt) { 
  const key = await new Promise((resolveKey, reject) => 
    scryptCallback(password, salt, 64, (error, value) => error ? reject(error) : resolveKey(value))
  ); 
  return key.toString('hex'); 
}

(async () => {
  const password = 'sreevastav06140523';
  const salt = '1372d9cbf8c8f057f7030fe99edb2ff1';
  const storedHash = '32483bf2262c3eea31744c93b09cd6282c0adfac6b8f703afe45a3f1c3b0cbcfd164343d2c81980d4e4ff3865c7676315458200e072930f12fc7e4e5c0feb9b0';
  
  console.log('Testing "sreevastav06140523":', await hashPassword('sreevastav06140523', salt) === storedHash);
  console.log('Testing "sreevastav":', await hashPassword('sreevastav', salt) === storedHash);
  console.log('Testing "05230614":', await hashPassword('05230614', salt) === storedHash);
})();
