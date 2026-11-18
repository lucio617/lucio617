import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCalendars, utcDates } from '../scripts/generate-heatmap.mjs';
import { buildSnakeGrid, buildSnakeRoute, renderSnake } from '../scripts/generate-snake.mjs';

function combinedSummary() {
  const dates = utcDates(365, new Date('2026-11-18T00:00:00Z'));
  return aggregateCalendars({
    personal: [{ contributionDays: [{ date: dates[0], contributionCount: 2 }, { date: dates.at(-1), contributionCount: 3 }] }],
    openSource: [{ contributionDays: [{ date: dates[0], contributionCount: 4 }, { date: dates[100], contributionCount: 5 }] }],
  }, dates);
}

test('snake uses the sum of both profiles on the correct weekday and week', () => {
  const { cells, width } = buildSnakeGrid(combinedSummary().days);
  assert.equal(width, 53);
  assert.deepEqual(cells[0], { date: '2025-11-19', personal: 2, openSource: 4, total: 6, x: 0, y: 3 });
  assert.equal(cells[100].total, 5);
  assert.equal(cells.at(-1).total, 3);
  for (const cell of cells) assert.equal(cell.y, new Date(`${cell.date}T00:00:00Z`).getUTCDay());
});

test('route eats every cell without jumps or collisions, including the loop boundary', () => {
  for (const width of [1, 2, 52, 53, 54]) {
    const route = buildSnakeRoute(width);
    const unique = new Set(route.map(({ x, y }) => `${x},${y}`));
    assert.equal(unique.size, route.length);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < 7; y++) assert.ok(unique.has(`${x},${y}`));
    }
    for (let i = 0; i < route.length; i++) {
      const current = route[i];
      const next = route[(i + 1) % route.length];
      assert.equal(Math.abs(current.x - next.x) + Math.abs(current.y - next.y), 1);
      const body = Array.from({ length: 5 }, (_, segment) => route[(i - segment + route.length) % route.length]);
      assert.equal(new Set(body.map(({ x, y }) => `${x},${y}`)).size, 5);
    }
  }
});

test('SVG animates real merged activity and supports reduced motion', () => {
  const svg = renderSnake(combinedSummary());
  assert.match(svg, /14 public GitHub contributions \(5 personal \+ 9 open-source\)/);
  assert.match(svg, /2025-11-19: 6 contributions \(2 personal, 4 open-source\)/);
  assert.equal((svg.match(/class="day"/g) || []).length, 365);
  assert.equal((svg.match(/class="snake"/g) || []).length, 5);
  assert.equal((svg.match(/@keyframes eat\d+/g) || []).length, 3);
  assert.match(svg, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(svg, /NaN|undefined|<script|<foreignObject|href=/);
});

test('empty calendars render an honest empty grid and invalid data is rejected', () => {
  const dates = utcDates(365, new Date('2024-03-01T00:00:00Z'));
  const empty = aggregateCalendars({ personal: [], openSource: [] }, dates);
  assert.match(renderSnake(empty), /0 public GitHub contributions/);
  assert.doesNotMatch(renderSnake(empty), /@keyframes eat/);
  const broken = combinedSummary();
  broken.days[0].total = 100;
  assert.throws(() => renderSnake(broken), /Invalid daily contribution data/);
  assert.throws(() => buildSnakeGrid([]), /365/);
});
