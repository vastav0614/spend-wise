import { scrypt as scryptCallback } from 'node:crypto';

async function hashPassword(password, salt) { 
  const key = await new Promise((resolveKey, reject) => 
    scryptCallback(password, salt, 64, (error, value) => error ? reject(error) : resolveKey(value))
  ); 
  return key.toString('hex'); 
}

(async () => {
  const password = '06140523';
  const salt = '1372d9cbf8c8f057f7030fe99edb2ff1';
  const storedHash = '32483bf2262c3eea31744c93b09cd6282c0adfac6b8f703afe45a3f1c3b0cbcfd164343d2c81980d4e4ff3865c7676315458200e072930f12fc7e4e5c0feb9b0';
  
  const generatedHash = await hashPassword(password, salt);
  console.log('Generated hash:', generatedHash);
  console.log('Stored hash:   ', storedHash);
  console.log('Match?', generatedHash === storedHash);
})();
