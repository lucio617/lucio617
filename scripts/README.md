# Combined GitHub contribution heatmap

This profile displays **one custom heatmap** based on the public contribution calendars for:

- [`lucio617`](https://github.com/lucio617) — personal GitHub
- [`tiwari-nishant`](https://github.com/tiwari-nishant) — open-source GitHub

The heatmap is an SVG committed to [`assets/combined-heatmap.svg`](../assets/combined-heatmap.svg).

## How it works

1. GitHub Actions runs daily (or manually through **Actions → Update combined contribution heatmap → Run workflow**).
2. [`generate-heatmap.mjs`](./generate-heatmap.mjs) requests each account's **public** GitHub contribution calendar through the GitHub GraphQL API.
3. It aligns the two calendars by UTC date, sums each day's contributions, renders a polished SVG, and updates it only when the content changes.
4. The GitHub profile's `README.md` embeds the SVG using a relative image path.

GitHub's automatically provided `GITHUB_TOKEN` is used solely by the workflow; you do **not** need to add a personal access token or put credentials in the repository. You can keep your IBM email and the two identities completely separate.

### Important interpretation

The displayed total is the **sum of GitHub-reported contributions** for two public accounts over the last 365 UTC dates. This is not necessarily a count of unique commits, and it is not the native GitHub contributions graph. Gerrit-only changes (including reviews that GitHub did not count), private activity, and contributions excluded by GitHub's counting rules will not appear. Direct links to the source accounts and OpenBMC Gerrit remain on the profile so recruiters can verify the work.

### Local execution

With Node.js 20 or later:

```bash
GITHUB_TOKEN=YOUR_TEMPORARY_TOKEN node scripts/generate-heatmap.mjs
```

For GitHub Actions, **no token setup is necessary**: the default workflow token is provided automatically. Do not commit any token.

### Tests

```bash
node --test tests/heatmap.test.mjs
```

The initial SVG is an explicitly labeled placeholder until the first successful workflow run. If the workflow cannot read the public contribution calendars, it exits with an error and does not overwrite the most recently generated SVG.
