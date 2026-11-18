#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateCalendars, fetchPublicCalendars, utcDates } from './generate-heatmap.mjs';

const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/snake.svg');
const SNAKE_LENGTH = 5;

export function buildSnakeGrid(days) {
  if (!Array.isArray(days) || days.length !== 365) throw new Error('Expected 365 daily contribution counts');
  const dates = utcDates(365, new Date(`${days.at(-1).date}T00:00:00Z`));
  const offset = new Date(`${dates[0]}T00:00:00Z`).getUTCDay();
  const cells = days.map((day, index) => {
    if (day.date !== dates[index] || ![day.personal, day.openSource, day.total].every(n => Number.isSafeInteger(n) && n >= 0)
        || day.total !== day.personal + day.openSource) {
      throw new Error('Invalid daily contribution data');
    }
    return { ...day, x: Math.floor((index + offset) / 7), y: (index + offset) % 7 };
  });
  return { cells, width: Math.ceil((days.length + offset) / 7) };
}

// A closed, self-avoiding route visits every calendar square, then returns
// outside the grid. Adjacent positions remain one cell apart, even at the loop.
export function buildSnakeRoute(width) {
  if (!Number.isInteger(width) || width < 1) throw new Error('Expected a positive grid width');
  const route = [{ x: -1, y: 0 }];
  for (let x = 0; x < width; x++) {
    for (let row = 0; row < 7; row++) route.push({ x, y: x % 2 ? 6 - row : row });
  }
  const returnRow = width % 2 ? 7 : -1;
  for (let x = width - 1; x >= -1; x--) route.push({ x, y: returnRow });
  if (returnRow === 7) {
    for (let y = 6; y >= 1; y--) route.push({ x: -1, y });
  }
  return route;
}

function level(count) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

export function renderSnake(summary) {
  const { cells, width } = buildSnakeGrid(summary.days);
  const route = buildSnakeRoute(width);
  const visitedAt = new Map(route.map((point, index) => [`${point.x},${point.y}`, index]));
  const personalTotal = cells.reduce((sum, day) => sum + day.personal, 0);
  const openSourceTotal = cells.reduce((sum, day) => sum + day.openSource, 0);
  const total = personalTotal + openSourceTotal;
  const stepSeconds = 0.07;
  const startPause = 2;
  const duration = startPause + route.length * stepSeconds + 2;
  const percent = seconds => (seconds / duration * 100).toFixed(5);
  const pointAt = index => route[(index + route.length) % route.length];
  const transform = point => `transform:translate(${48 + point.x * 16}px,${48 + point.y * 16}px)`;
  const animations = [];

  const squares = cells.map(day => {
    const contributionLevel = level(day.total);
    const visit = visitedAt.get(`${day.x},${day.y}`);
    if (contributionLevel) {
      const eatenAt = startPause + visit * stepSeconds;
      animations.push(`@keyframes eat${visit}{0%,${percent(eatenAt - 0.001)}%{fill:var(--l${contributionLevel})}${percent(eatenAt)}%,100%{fill:var(--empty)}}`);
    }
    const animation = contributionLevel ? `animation:eat${visit} ${duration}s linear infinite;` : '';
    return `<rect class="day" data-date="${day.date}" x="${48 + day.x * 16}" y="${48 + day.y * 16}" width="14" height="14" rx="2" style="fill:var(--${contributionLevel ? `l${contributionLevel}` : 'empty'});${animation}"><title>${day.date}: ${day.total} contributions (${day.personal} personal, ${day.openSource} open-source)</title></rect>`;
  }).join('\n  ');

  const segments = Array.from({ length: SNAKE_LENGTH }, (_, index) => {
    const frames = [`0%,${percent(startPause)}%{${transform(pointAt(-index))}}`];
    for (let step = 1; step <= route.length; step++) {
      frames.push(`${percent(startPause + step * stepSeconds)}%{${transform(pointAt(step - index))}}`);
    }
    frames.push(`100%{${transform(pointAt(-index))}}`);
    animations.push(`@keyframes snake${index}{${frames.join('')}}`);
    return `<rect class="snake" width="14" height="14" rx="4" style="${transform(pointAt(-index))};opacity:${1 - index * 0.09};animation:snake${index} ${duration}s linear infinite"/>`;
  }).reverse().join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="snake-title snake-description" width="${width * 16 + 72}" height="208" viewBox="0 0 ${width * 16 + 72} 208">
  <title id="snake-title">Combined contribution snake: @lucio617 + @tiwari-nishant</title>
  <desc id="snake-description">${total} public GitHub contributions (${personalTotal} personal + ${openSourceTotal} open-source) from ${cells[0].date} to ${cells.at(-1).date}. The snake eats the combined calendar and loops. Gerrit-only and private activity are excluded.</desc>
  <style>
    svg{--empty:#ebedf0;--border:#d1d9e0;--ink:#57606a;--snake:#8250df;--l1:#9be9a8;--l2:#40c463;--l3:#30a14e;--l4:#216e39}
    text{fill:var(--ink);font-family:Arial,sans-serif}
    .day{stroke:var(--border);stroke-width:.5}
    .snake{fill:var(--snake)}
    @media(prefers-color-scheme:dark){svg{--empty:#161b22;--border:#30363d;--ink:#adbac7;--snake:#c4a5ff;--l1:#0e4429;--l2:#006d32;--l3:#26a641;--l4:#39d353}}
    ${animations.join('\n    ')}
    @media(prefers-reduced-motion:reduce){.day{animation:none!important}.snake{display:none}}
  </style>
  <text x="48" y="22" font-size="12">${total} contributions · @lucio617 (${personalTotal}) + @tiwari-nishant (${openSourceTotal})</text>
  <text x="10" y="75" font-size="10">Mon</text>
  <text x="10" y="107" font-size="10">Wed</text>
  <text x="10" y="139" font-size="10">Fri</text>
  ${squares}
  ${segments}
  <text x="48" y="194" font-size="11">Combined public activity · ${cells[0].date} – ${cells.at(-1).date} UTC · refreshes every 12 hours</text>
</svg>\n`;
}

export async function main() {
  const dates = utcDates();
  const calendars = await fetchPublicCalendars(process.env.GITHUB_TOKEN, dates[0], dates.at(-1));
  const summary = aggregateCalendars(calendars, dates);
  const svg = renderSnake(summary);
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, svg, 'utf8');
  process.stdout.write(`Rendered combined snake: ${summary.total} contributions (${summary.personalTotal} personal + ${summary.openSourceTotal} open-source).\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
