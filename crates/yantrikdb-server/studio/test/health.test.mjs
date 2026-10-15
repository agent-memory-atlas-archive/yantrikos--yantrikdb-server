import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAlerts, healthScore } from '../assets/js/app/health.js';

const healthy = {
  accepts_writes: true, inflight: 0, max_inflight: 256, databases: [], maintenance: [],
  cluster: { healthy: true, replication_lag: 0 },
};

test('a healthy node has no alerts and a perfect score', () => {
  const alerts = computeAlerts(healthy);
  assert.equal(alerts.length, 0);
  assert.equal(healthScore(alerts), 100);
});
test('quarantine is critical', () => {
  const alerts = computeAlerts({ ...healthy, quarantine: ['CommitBeyondLog'] });
  assert.equal(alerts[0][0], 'bad');
  assert.equal(healthScore(alerts), 60);
});
test('open conflicts and a follower node are warnings', () => {
  const alerts = computeAlerts({ ...healthy, accepts_writes: false, databases: [{ name: 'x', open_conflicts: 3 }] });
  assert.equal(alerts.length, 2);
  assert.ok(alerts.every((a) => a[0] === 'warn'));
  assert.equal(healthScore(alerts), 76);
});
test('load shedding warns above 75% in-flight', () => {
  assert.equal(computeAlerts({ ...healthy, inflight: 200 }).length, 1);
  assert.equal(computeAlerts({ ...healthy, inflight: 100 }).length, 0);
});
test('the score never goes below zero', () => {
  const many = Array.from({ length: 5 }, () => ['bad', 't', 'd']);
  assert.equal(healthScore(many), 0);
});
