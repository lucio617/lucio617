import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCalendars, fetchPublicCalendars, renderHeatmap, utcDates } from '../scripts/generate-heatmap.mjs';

test('365 UTC dates are stable across a leap-day boundary', () => {
  const dates = utcDates(3, new Date('2024-03-01T23:59:59Z'));
  assert.deepEqual(dates, ['2024-02-28', '2024-02-29', '2024-03-01']);
});

test('aggregates contribution counts across different GitHub identities', () => {
  const dates = utcDates(365, new Date('2026-11-18T00:00:00Z'));
  const target = dates.at(-1);
  const summary = aggregateCalendars({
    personal: [{ contributionDays: [{ date: target, contributionCount: 3 }] }],
    openSource: [{ contributionDays: [{ date: target, contributionCount: 5 }] }],
  }, dates);

  assert.equal(summary.personalTotal, 3);
  assert.equal(summary.openSourceTotal, 5);
  assert.equal(summary.total, 8);
  assert.equal(summary.activeDays, 1);
  assert.equal(summary.days.at(-1).total, 8);

  const svg = renderHeatmap(summary, new Date('2026-11-18T12:00:00Z'));
  assert.match(svg, /One developer\. Two GitHub accounts\./);
  assert.match(svg, /2026-11-18: 8 contributions \(3 personal, 5 open-source\)/);
  assert.equal((svg.match(/<rect x="\d+" y="\d+" width="12" height="12" rx="3" fill="[^"]+"><title>/g) || []).length, 365);
  assert.match(svg, /Updated 2026-11-18 UTC/);
});

test('rejects inaccurate activity data', () => {
  assert.throws(() => aggregateCalendars({
    personal: [{ contributionDays: [{ date: '2026-01-01', contributionCount: -1 }] }],
    openSource: [],
  }, ['2026-01-01']), /invalid contribution-calendar entry/);
});

test('queries both users and refuses incomplete API responses', async () => {
  let checked = false;
  const mockFetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.match(request.query, /personal: user\(login: "lucio617"\)/);
    assert.match(request.query, /openSource: user\(login: "tiwari-nishant"\)/);
    assert.equal(request.variables.from, '2026-01-01T00:00:00Z');
    checked = true;
    return {
      ok: true,
      json: async () => ({ data: { personal: { contributionsCollection: { contributionCalendar: { weeks: [] } } } } }),
    };
  };

  await assert.rejects(fetchPublicCalendars('test-not-real', '2026-01-01', '2026-01-31', mockFetch), /incomplete public calendars/);
  assert.equal(checked, true);
});
