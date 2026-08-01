# Star Keywords

A personal keyword discovery and research tool. A Python crawler expands
Google Autocomplete suggestions breadth-first into `data/keywords.csv`;
a static dashboard (no build step, no backend) lets you browse, search,
star, and take notes on every keyword it finds.

```
keyword-research-tool/
│
├── index.html          # Dashboard markup
├── style.css            # Dashboard styles
├── app.js                # Dashboard logic (CSV load, virtual list, shortcuts)
│
├── data/
│   └── keywords.csv      # Crawler output — the dashboard's only data source
│
└── crawler/
    ├── main.py            # BFS Google Autocomplete crawler
    └── requirements.txt
```

A small sample `data/keywords.csv` (Nigerian-market seed keywords: airtel,
mtn, jamb, waec, gtbank, jumia, etc.) is included so the dashboard works
out of the box — replace it by running the crawler.

## 1. Run the crawler

```bash
cd crawler
pip install -r requirements.txt

# start fresh from one or more seed letters/words
python main.py a e i o u

# expand from specific seeds
python main.py jamb waec nysc

# continue an interrupted or previous crawl (re-expands existing keywords)
python main.py --resume

# cap a run so it doesn't run forever
python main.py a --max 2000
```

The crawler writes straight to `../data/keywords.csv` after every request
(not just at the end), so it's safe to stop with Ctrl+C at any time and
resume later. It waits a randomized delay between requests and retries
failed lookups automatically.

## 1b. Or let it run automatically (GitHub Actions)

`.github/workflows/crawl.yml` is included — once this repo is pushed to
GitHub, it will:

- run once a day at 03:00 UTC (edit the `cron` line in the workflow to
  change the schedule),
- expand every keyword already in `data/keywords.csv` (`--resume`),
  capped at 2000 new keywords per run,
- commit and push the updated CSV automatically if anything new was found.

You can also trigger it on demand from the repo's **Actions** tab → select
"Crawl keywords" → **Run workflow**, where you can optionally type seed
words and a different cap for that one run. No local Python needed for
this path — it all runs on GitHub's servers.

## 2. Browse the dashboard

Any static file server works, since the dashboard fetches `data/keywords.csv`
via `fetch()`, which most browsers block from a raw `file://` path:

```bash
# from the project root
python -m http.server 8000
# then open http://localhost:8000
```

## 3. Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. Repo → Settings → Pages → set the source to your default branch, root folder.
3. Whenever you run the crawler locally, commit and push the updated
   `data/keywords.csv` — Pages will pick it up automatically.

## Dashboard features

- **Two-panel layout** — virtualized keyword list on the left (handles
  many thousands of rows smoothly), lineage + notes on the right.
- **Lineage trail** — the detail panel traces exactly how the crawler
  reached the selected keyword, root to leaf, since that ancestry is
  part of what makes a keyword worth evaluating.
- **Instant search** across every loaded keyword.
- **Filters** — All / Starred / Unreviewed / Reviewed.
- **Star, review checkbox, and per-keyword notes** — all stored in
  `localStorage`, nothing leaves the browser.
- **Keyboard-first workflow** — `↑`/`↓` or `j`/`k` to move, `g` or
  `Enter` to open Google, `c` to copy, `s` to star, `x` to toggle
  reviewed, `/` to jump to search.

## Notes on the crawler

- Uses Google's public Autocomplete endpoint
  (`suggestqueries.google.com/complete/search`), the same one the search
  box itself calls — no API key required.
- Duplicate suggestions are dropped automatically (a keyword is only
  ever written to the CSV once).
- If Google starts returning errors, slow it down with `--min-delay`
  and `--max-delay`, or run it less frequently — it's a public,
  unauthenticated endpoint and can rate-limit aggressive use.
