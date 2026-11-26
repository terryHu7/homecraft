import { seedAdmin } from './auth.js';
import { databaseIssue } from './database.js';

const email = process.argv[2] || 'aswinrajcholakuzhi@gmail.com';
try {
  if (process.stdin.isTTY) throw Error('Pass the seed password through standard input.');
  process.stdin.setEncoding('utf8');
  let password = '';
  for await (const chunk of process.stdin) password += chunk;
  const created = await seedAdmin(email, password.replace(/\r?\n$/, ''));
  console.log(created ? 'Admin user created.' : 'Admin user already exists.');
} catch (error) {
  console.error(databaseIssue(error) || 'Could not seed the admin account. Check MongoDB connectivity and the seed inputs.');
  process.exitCode = 1;
}
