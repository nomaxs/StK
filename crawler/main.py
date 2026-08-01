"""
Star Keywords Crawler
----------------------
Recursively expands Google Autocomplete suggestions using a breadth-first
search (BFS) queue, and writes the results to data/keywords.csv.

Usage:
    python main.py "a"
    python main.py "a" "e" "i" "o" "u"
    python main.py --resume            # continue from the existing CSV
    python main.py "jamb" --max 5000   # stop after 5000 new keywords

The dashboard (index.html / app.js) never talks to Google directly -- it
only ever reads the CSV this script produces.
"""

import argparse
import csv
import os
import random
import sys
import time
from collections import deque
from urllib.parse import urlencode

import requests

AUTOCOMPLETE_URL = "https://suggestqueries.google.com/complete/search"
DEFAULT_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "keywords.csv")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}


def fetch_suggestions(query, retries=3, timeout=8):
    """Ask Google Autocomplete for suggestions for `query`. Returns a list of strings."""
    params = {"client": "firefox", "q": query}
    url = f"{AUTOCOMPLETE_URL}?{urlencode(params)}"

    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
            # firefox client format: [query, [suggestion1, suggestion2, ...]]
            suggestions = data[1] if len(data) > 1 else []
            return [s.strip().lower() for s in suggestions if s and s.strip()]
        except (requests.RequestException, ValueError, IndexError) as exc:
            wait = attempt * 2 + random.uniform(0, 1.5)
            print(f"  [retry {attempt}/{retries}] {query!r} -> {exc} (waiting {wait:.1f}s)")
            time.sleep(wait)

    print(f"  [skip] giving up on {query!r} after {retries} retries")
    return []


def load_existing(csv_path):
    """Load an existing CSV so a crawl can resume without duplicate work."""
    seen = set()
    rows = []
    queue = deque()

    if not os.path.exists(csv_path):
        return seen, rows, queue

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if len(row) != 2:
                continue
            parent, keyword = row
            rows.append((parent, keyword))
            seen.add(keyword)
            queue.append(keyword)  # re-expand every known keyword on resume

    return seen, rows, queue


def crawl(seeds, csv_path=DEFAULT_CSV, max_new=None, min_delay=0.6, max_delay=1.8):
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)

    seen, rows, queue = load_existing(csv_path)
    new_count = 0

    # Write header if the file is new
    write_header = not os.path.exists(csv_path)

    for seed in seeds:
        seed = seed.strip().lower()
        if seed and seed not in seen:
            seen.add(seed)
            rows.append(("", seed))
            queue.append(seed)

    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(["Parent", "Keyword"])
            for parent, kw in rows:
                writer.writerow([parent, kw])
                f.flush()

        print(f"Starting crawl. Queue size: {len(queue)}. Known keywords: {len(seen)}.")

        while queue:
            if max_new is not None and new_count >= max_new:
                print(f"Reached max_new={max_new}. Stopping.")
                break

            parent = queue.popleft()
            print(f"Expanding: {parent!r}")

            suggestions = fetch_suggestions(parent)
            for suggestion in suggestions:
                if suggestion in seen:
                    continue
                seen.add(suggestion)
                queue.append(suggestion)
                writer.writerow([parent, suggestion])
                f.flush()
                new_count += 1
                print(f"  + {suggestion}")

                if max_new is not None and new_count >= max_new:
                    break

            time.sleep(random.uniform(min_delay, max_delay))

    print(f"Done. {new_count} new keywords added. Total known: {len(seen)}.")


def main():
    parser = argparse.ArgumentParser(description="Star Keywords crawler")
    parser.add_argument("seeds", nargs="*", help="Seed letters/words to start expanding from")
    parser.add_argument("--resume", action="store_true", help="Re-expand every keyword already in the CSV")
    parser.add_argument("--max", type=int, default=None, help="Stop after this many new keywords")
    parser.add_argument("--csv", default=DEFAULT_CSV, help="Path to the output CSV")
    parser.add_argument("--min-delay", type=float, default=0.6)
    parser.add_argument("--max-delay", type=float, default=1.8)
    args = parser.parse_args()

    if not args.seeds and not args.resume:
        print("Provide at least one seed keyword, or pass --resume to continue an existing crawl.")
        sys.exit(1)

    crawl(
        seeds=args.seeds,
        csv_path=args.csv,
        max_new=args.max,
        min_delay=args.min_delay,
        max_delay=args.max_delay,
    )


if __name__ == "__main__":
    main()
