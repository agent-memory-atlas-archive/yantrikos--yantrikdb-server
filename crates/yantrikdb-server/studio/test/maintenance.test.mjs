import test from 'node:test';
import assert from 'node:assert/strict';
import { disabledReason } from '../assets/js/views/maintenance.js';

const leader = { accepts_writes: true, cluster: { leader_addr: 'http://x:7438' }, maintenance_run: { running: false } };

test('a leader that is idle can run maintenance', () => {
  assert.equal(disabledReason(leader), null);
});
test('a follower explains why, and where the leader is', () => {
  const why = disabledReason({ ...leader, accepts_writes: false });
  assert.match(why, /follower/);
  assert.match(why, /http:\/\/x:7438/);
});
test('a run in progress blocks a second one', () => {
  assert.match(disabledReason({ ...leader, maintenance_run: { running: true } }), /already in progress/);
});
