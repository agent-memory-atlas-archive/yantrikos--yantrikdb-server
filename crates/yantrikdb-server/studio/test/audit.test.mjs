import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAudit } from '../assets/js/views/audit.js';

const rows = [
  { actor: 'root', action: 'database.create', target: 'sales' },
  { actor: 'ana', action: 'token.revoke', target: 'abc123' },
];
test('filters across actor, action and target, case-insensitively', () => {
  assert.equal(filterAudit(rows, 'ROOT').length, 1);
  assert.equal(filterAudit(rows, 'revoke')[0].actor, 'ana');
  assert.equal(filterAudit(rows, 'sales')[0].action, 'database.create');
});
test('an empty needle returns everything', () => {
  assert.equal(filterAudit(rows, '').length, 2);
});
