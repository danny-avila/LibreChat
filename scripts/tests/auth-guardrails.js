#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const templateFlagIndex = args.indexOf('--template');
const reportFlagIndex = args.indexOf('--report');

const templatePath = templateFlagIndex >= 0 && args[templateFlagIndex + 1]
  ? path.resolve(args[templateFlagIndex + 1])
  : path.resolve(__dirname, '../templates/org-template.json');
const reportPath = reportFlagIndex >= 0 && args[reportFlagIndex + 1]
  ? path.resolve(args[reportFlagIndex + 1])
  : path.resolve(process.cwd(), 'reports/auth-guardrails.txt');

if (!fs.existsSync(templatePath)) {
  console.error(`Template file not found: ${templatePath}`);
  process.exit(1);
}

const templateContent = fs.readFileSync(templatePath, 'utf8');
let template;
try {
  template = JSON.parse(templateContent);
} catch (err) {
  console.error('Unable to parse template JSON:', err.message);
  process.exit(1);
}

const groups = new Map((template.groups || []).map((group) => [group.name, group]));
const guardrailGroups = ['marketing', 'finance', 'normal'];

const tests = [];

function addTest(name, ok, details = '') {
  tests.push({ name, ok, details });
}

const users = template.users || [];
if (users.length === 0) {
  addTest('Users are seeded in the template', false, 'No users found in the template.');
} else {
  addTest('Users exist in the template', true, `${users.length} users seeded.`);
}

users.forEach((user) => {
  const groupStr = (user.groups || '').trim();
  const groupsList = groupStr ? groupStr.split(',').map((g) => g.trim()).filter(Boolean) : [];
  addTest(`User ${user.username} has status field`, Boolean(user.status), `found status "${user.status || 'undefined'}"`);
  addTest(
    `User ${user.username} contains users group`,
    groupsList.includes('users'),
    `groups: [${groupsList.join(', ')}]`
  );
  const missingGroups = groupsList.filter((g) => !groups.has(g));
  addTest(
    `All groups for ${user.username} exist`,
    missingGroups.length === 0,
    missingGroups.length > 0 ? `Missing groups: ${missingGroups.join(', ')}` : `groups: ${groupsList.join(', ')}`
  );
});

guardrailGroups.forEach((groupName) => {
  const group = groups.get(groupName);
  const hasRules = Boolean(group && group.rules);
  addTest(
    `Guardrail group ${groupName} defines rules`,
    hasRules,
    hasRules ? `rules: ${JSON.stringify(group.rules)}` : 'No rules object found'
  );
});

const now = new Date().toISOString();
const summary = tests.reduce(
  (acc, test) => {
    if (test.ok) acc.passed += 1;
    else acc.failed += 1;
    return acc;
  },
  { passed: 0, failed: 0 }
);

const reportLines = [];
reportLines.push(`Auth Guardrail Test Report — ${now}`);
reportLines.push(`Template: ${templatePath}`);
reportLines.push('');
tests.forEach((test) => {
  const status = test.ok ? 'PASS' : 'FAIL';
  const detail = test.details ? ` — ${test.details}` : '';
  reportLines.push(`[${status}] ${test.name}${detail}`);
});
reportLines.push('');
reportLines.push(`Summary: ${summary.passed} passed, ${summary.failed} failed (${tests.length} checks)`);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, reportLines.join('\n') + '\n');
console.log(reportLines.join('\n'));
if (summary.failed > 0) {
  process.exit(1);
}
