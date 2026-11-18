#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCOUNTS = Object.freeze({
  personal: 'lucio617',
  openSource: 'tiwari-nishant',
});

const DAY_COUNT = 365;
const API_URL = 'https://api.github.com/graphql';
const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/combined-heatmap.svg');

/**
 * Query GitHub's public contribution calendar for both logins.
 * Never requests, stores, or exposes the private email address of either account.
 */
export async function fetchPublicCalendars(token, firstDate, lastDate, fetchImpl = fetch) {
  if (!token) throw new Error('GITHUB_TOKEN is required. GitHub Actions provides it automatically.');

  const query = `
    query TwoPublicCalendars($from: DateTime!, $to: DateTime!) {
      personal: user(login: "${ACCOUNTS.personal}") {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar { weeks { contributionDays { date contributionCount } } }
        }
      }
      openSource: user(login: "${ACCOUNTS.openSource}") {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar { weeks { contributionDays { date contributionCount } } }
        }
      }
    }
  `;

  const response = await fetchImpl(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lucio617-public-heatmap',
    },
    body: JSON.stringify({
      query,
      variables: {
        from: `${firstDate}T00:00:00Z`,
        to: `${lastDate}T23:59:59Z`,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL API returned HTTP ${response.status}; existing heatmap left untouched.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    const summary = payload.errors.map(({ message }) => message).join('; ');
    throw new Error(`GitHub GraphQL query failed: ${summary}`);
  }

  const calendar = (identity) =>
    payload.data?.[identity]?.contributionsCollection?.contributionCalendar?.weeks;

  if (!Array.isArray(calendar('personal')) || !Array.isArray(calendar('openSource'))) {
    throw new Error('GitHub returned incomplete public calendars; existing heatmap left untouched.');
  }

  return { personal: calendar('personal'), openSource: calendar('openSource') };
}

export function utcDates(count = DAY_COUNT, endDate = new Date()) {
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer');
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());

  return Array.from({ length: count }, (_, index) =>
    new Date(end - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10),
  );
}

function calendarCounts(weeks) {
  const counts = new Map();
  for (const week of weeks) {
    for (const { date, contributionCount } of week.contributionDays || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(contributionCount) || contributionCount < 0) {
        throw new Error('GitHub returned an invalid contribution-calendar entry');
      }
      counts.set(date, contributionCount);
    }
  }
  return counts;
}

export function aggregateCalendars(calendars, dates) {
  const personal = calendarCounts(calendars.personal);
  const openSource = calendarCounts(calendars.openSource);

  const days = dates.map((date) => {
    const personalCount = personal.get(date) ?? 0;
    const openSourceCount = openSource.get(date) ?? 0;
    return { date, personal: personalCount, openSource: openSourceCount, total: personalCount + openSourceCount };
  });

  return {
    days,
    personalTotal: days.reduce((sum, day) => sum + day.personal, 0),
    openSourceTotal: days.reduce((sum, day) => sum + day.openSource, 0),
    total: days.reduce((sum, day) => sum + day.total, 0),
    activeDays: days.filter((day) => day.total > 0).length,
  };
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function compactNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function squareColor(count) {
  if (count === 0) return '#253349';
  if (count <= 2) return '#145668';
  if (count <= 5) return '#087c91';
  if (count <= 10) return '#0aa8af';
  if (count <= 19) return '#27c9be';
  return '#8af5cd';
}

/** SVG intentionally contains only public activity and no script or remote assets. */
export function renderHeatmap(summary, generatedAt = new Date()) {
  const { days, personalTotal, openSourceTotal, total, activeDays } = summary;
  if (!Array.isArray(days) || days.length !== DAY_COUNT) {
    throw new Error(`The heatmap must contain exactly ${DAY_COUNT} days`);
  }

  const size = 12;
  const step = 16;
  const firstWeekday = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const xStart = 72;
  const yStart = 181;
  const months = [];
  let priorMonth = '';

  const squares = days.map((day, index) => {
    const date = new Date(`${day.date}T00:00:00Z`);
    const x = xStart + Math.floor((index + firstWeekday) / 7) * step;
    const y = yStart + ((index + firstWeekday) % 7) * step;
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    if (month !== priorMonth) {
      months.push(`<text x="${x}" y="164" fill="#91a6c6" font-size="11" font-family="Arial, sans-serif">${date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}</text>`);
      priorMonth = month;
    }

    const description = `${day.date}: ${day.total} contributions (${day.personal} personal, ${day.openSource} open-source)`;
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="3" fill="${squareColor(day.total)}"><title>${escapeXml(description)}</title></rect>`;
  }).join('\n    ');

  const stats = [
    { x: 36, label: 'COMBINED CONTRIBUTIONS', count: total, accent: '#67e8f9' },
    { x: 365, label: `PERSONAL · @${ACCOUNTS.personal}`, count: personalTotal, accent: '#c4b5fd' },
    { x: 694, label: `OPEN SOURCE · @${ACCOUNTS.openSource}`, count: openSourceTotal, accent: '#5eead4' },
  ].map(({ x, label, count, accent }) => `
    <rect x="${x}" y="91" width="309" height="52" rx="11" fill="#15243b" stroke="#26364f" />
    <text x="${x + 14}" y="109" fill="#9fb2cf" font-size="10" font-family="Arial, sans-serif" font-weight="700">${escapeXml(label)}</text>
    <text x="${x + 14}" y="132" fill="${accent}" font-size="20" font-family="Arial, sans-serif" font-weight="700">${compactNumber(count)}</text>`).join('');

  const dayLabel = (text, row) => `<text x="43" y="${yStart + row * step + 10}" fill="#7990af" font-size="10" font-family="Arial, sans-serif">${text}</text>`;
  const legend = [0, 1, 4, 8, 15, 25].map((n, index) =>
    `<rect x="${878 + index * 17}" y="300" width="12" height="12" rx="3" fill="${squareColor(n)}"/>`,
  ).join('');
  const updated = generatedAt.toISOString().slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(`Combined public GitHub contribution heatmap: ${total} contributions from two accounts in the past 365 days`)}" viewBox="0 0 1040 341">
  <title>GitHub activity across @${ACCOUNTS.personal} and @${ACCOUNTS.openSource}</title>
  <desc>Each day combines publicly visible GitHub contribution counts from both accounts. Gerrit-only and private activity are excluded.</desc>
  <defs>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#a78bfa"/>
      <stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <rect width="1040" height="341" rx="20" fill="#0d1526"/>
  <rect x="1" y="1" width="1038" height="339" rx="19" fill="none" stroke="#27374e"/>
  <rect x="36" y="27" width="5" height="43" rx="2" fill="url(#line)" />
  <text x="54" y="48" fill="#f3f8ff" font-size="26" font-family="Arial, sans-serif" font-weight="700">One developer. Two GitHub accounts.</text>
  <text x="55" y="70" fill="#a3b5d0" font-size="13" font-family="Arial, sans-serif">Public activity · last 365 days · ${activeDays} active days</text>${stats}
  ${months.join('\n  ')}
  ${dayLabel('Mon', 1)}
  ${dayLabel('Wed', 3)}
  ${dayLabel('Fri', 5)}
  ${squares}
  <text x="37" y="310" fill="#8fa4c1" font-size="11" font-family="Arial, sans-serif">Updated ${updated} UTC · GitHub-reported activity, not Gerrit-only changes</text>
  <text x="848" y="310" fill="#8fa4c1" font-size="10" font-family="Arial, sans-serif">Less</text>
  ${legend}
  <text x="990" y="327" fill="#8fa4c1" font-size="10" font-family="Arial, sans-serif">More</text>
</svg>\n`;
}

export async function main() {
  const dates = utcDates();
  const data = await fetchPublicCalendars(process.env.GITHUB_TOKEN, dates[0], dates.at(-1));
  const combined = aggregateCalendars(data, dates);
  const svg = renderHeatmap(combined);

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, svg, 'utf8');
  process.stdout.write(`Rendered ${combined.total} public contribution events (${combined.personalTotal} personal + ${combined.openSourceTotal} open-source) across ${combined.activeDays} active days.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
