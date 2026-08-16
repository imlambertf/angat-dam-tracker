Use this link: https://imlambertf.github.io/angat-dam-tracker/

# Angat Dam Water Level Tracker
A small static site that shows Angat Dam's reservoir water level, sourced
from PAGASA's public [Dam Water Level Update](https://pagasa.dost.gov.ph/flood).
A scheduled GitHub Action re-scrapes the page and commits the latest
reading, so the site updates itself without a server.

**Important caveat:** PAGASA does not run a live sensor feed to the public
— their bulletin itself only updates once or twice a day (usually a
6:00–8:00 AM reading, sometimes another later in the day). This site polls
PAGASA hourly and picks up a new reading as soon as one is posted, but it
can't be more "real-time" than PAGASA's own source.

## How it works

- `index.html` / `style.css` / `app.js` — the site itself. Pure HTML/CSS/JS,
  no build step, no framework. `app.js` fetches `data/angat.json` and draws
  the gauge and trend chart.
- `data/angat.json` — the current reading plus a rolling history. This is
  the file that gets overwritten on every successful scrape.
- `scripts/scrape.py` — fetches PAGASA's flood page and parses the Angat
  Dam row out of the rendered table. Pure standard library (`urllib`,
  `re`, `json`) — no extra dependencies to install.
- `.github/workflows/update-data.yml` — runs `scrape.py` every hour and
  pushes `data/angat.json` if it changed. Also runnable manually from the
  Actions tab (`workflow_dispatch`).

## Deploying to GitHub Pages

1. Push this folder to a new GitHub repo.
2. In the repo, go to **Settings → Pages** and set **Source** to
   "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Go to **Settings → Actions → General → Workflow permissions** and
   select **"Read and write permissions"** — the update workflow needs
   this to push `data/angat.json` back to the repo.
4. Optionally trigger the workflow once by hand: **Actions → Update Angat
   Dam data → Run workflow**, so you're not waiting for the next hourly
   run.
5. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

## Running the scraper locally

```bash
python3 scripts/scrape.py
```

This overwrites `data/angat.json` in place if it successfully finds a
reading; if PAGASA's page didn't parse, it exits with an error and leaves
the existing file untouched.

## If PAGASA changes their page layout

The scraper works by pattern-matching the visible text of the dam table
(there's no public JSON API for this data). If PAGASA redesigns
`pagasa.dost.gov.ph/flood`, the `ROW_PATTERN` regex in `scripts/scrape.py`
may need updating — the script is written to fail loudly (non-zero exit,
no file write) rather than silently write bad numbers, so a broken scrape
just means the site keeps showing the last good reading until it's fixed.

## Customizing

- `CRITICAL_LEVEL` and `LOWEST_ON_RECORD` in `app.js` control the fixed
  reference lines/scale on the gauge — NHWL and the rule curve come
  straight from the scraped data instead, since PAGASA's rule curve
  target shifts through the year.
- `MAX_HISTORY` in `scrape.py` caps how many readings are kept
  (default 500).
