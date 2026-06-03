// Generate a bcrypt hash for the owner password.
// Usage: npm run hash -- "yourPassword"
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash -- "yourPassword"');
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 10));
