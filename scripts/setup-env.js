#!/usr/bin/env node
// Ensures server/.env exists and that JWT_SECRET / JWT_REFRESH_SECRET are real
// random values rather than the placeholder text from .env.example, so first-time
// setup works without a separate manual "generate a secret and paste it in" step.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const examplePath = path.join(root, '.env.example');
const envPath = path.join(root, 'server', '.env');

const PLACEHOLDERS = {
  JWT_SECRET: 'change-me-to-a-long-random-string',
  JWT_REFRESH_SECRET: 'change-me-to-another-long-random-string',
};

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(examplePath, envPath);
  console.log('[setup-env] Created server/.env from .env.example');
}

let contents = fs.readFileSync(envPath, 'utf8');
let generated = false;

for (const [key, placeholder] of Object.entries(PLACEHOLDERS)) {
  const line = new RegExp(`^${key}=(.*)$`, 'm');
  const match = contents.match(line);
  const currentValue = match ? match[1].trim() : '';

  if (!currentValue || currentValue === placeholder) {
    const secret = crypto.randomBytes(48).toString('hex');
    contents = match
      ? contents.replace(line, `${key}=${secret}`)
      : `${contents}\n${key}=${secret}\n`;
    generated = true;
  }
}

if (generated) {
  fs.writeFileSync(envPath, contents);
  console.log('[setup-env] Generated JWT_SECRET / JWT_REFRESH_SECRET in server/.env');
} else {
  console.log('[setup-env] server/.env already has real secrets set — leaving it untouched');
}
