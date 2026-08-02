/**
 * paperr — admin password reset utility
 * Usage:  node reset-password.cjs <newPassword>
 * Example: node reset-password.cjs myNewPassword123
 */
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('./server/node_modules/bcryptjs');

const newPassword = process.argv[2];
if (!newPassword) {
  console.error('Usage: node reset-password.cjs <newPassword>');
  process.exit(1);
}

async function main() {
  const db = new DatabaseSync(path.join(__dirname, 'server', 'data', 'databases', 'paperr.db'));

  const users = db.prepare('SELECT id, username, display_name, role FROM users').all();
  console.log('\nExisting users:');
  users.forEach(u => console.log(`  [${u.id}] ${u.username} (${u.display_name}) — ${u.role}`));

  const hash = await bcrypt.hash(newPassword, 12);

  // Reset the admin user's password (or first user if only one exists)
  const admin = users.find(u => u.role === 'admin') || users[0];
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, admin.id);

  console.log(`\n✅ Password reset for "${admin.username}" (${admin.display_name})`);
  console.log(`   Username: ${admin.username}`);
  console.log(`   Password: ${newPassword}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
