#!/usr/bin/env python3
"""
Felani4F — switch the site to a new domain / repo path in one shot.

usage:
  python3 tools/set-domain.py --origin https://felani4f.github.io --repo felani4f/felani4f.github.io
  python3 tools/set-domain.py --origin https://felani4f.com --repo felani4f/felani4f.github.io
  python3 tools/set-domain.py --origin https://felani4f.is-a.dev --repo Drserver2350/felani4f --dry

what it rewrites:
  index.html      canonical / og:url / og:image / twitter:image / JSON-LD ids+urls /
                  google-site-verification placeholder / admin repo field
  credits.html    canonical
  sitemap.xml     <loc>
  robots.txt      Sitemap:
  assets/js/api.js  CFG.repo (GitHub publishing target)
  README.md, SEO.md  links
"""
import argparse, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OLD_ORIGIN = "https://drserver2350.github.io/felani4f"
OLD_REPO = "Drserver2350/felani4f"
TEXT_EXT = {".html", ".xml", ".txt", ".md", ".js", ".webmanifest", ".json"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--origin", required=True, help="new site origin, no trailing slash")
    ap.add_argument("--repo", required=True, help="new GitHub repo path owner/name")
    ap.add_argument("--old-origin", default=OLD_ORIGIN)
    ap.add_argument("--old-repo", default=OLD_REPO)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    origin = a.origin.rstrip("/")
    if not origin.startswith("https://"):
        print("origin must start with https://", file=sys.stderr)
        return 2
    if a.repo.count("/") != 1:
        print("repo must look like owner/name", file=sys.stderr)
        return 2

    changed, hits = [], 0
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in TEXT_EXT:
            continue
        if any(part in {".git", "node_modules", "build"} for part in p.parts):
            continue
        text = p.read_text(encoding="utf-8")
        new = text
        if a.old_origin != origin:
            new = re.sub(re.escape(a.old_origin), origin, new)
        if a.old_repo != a.repo:
            new = re.sub(re.escape(a.old_repo), a.repo, new, flags=re.I)
        if new != text:
            n = sum(1 for _ in re.finditer(re.escape(origin), new)) + sum(
                1 for _ in re.finditer(re.escape(a.repo), new, flags=re.I))
            hits += n
            changed.append((p.relative_to(ROOT), n))
            if not a.dry:
                p.write_text(new, encoding="utf-8")

    for path, n in changed:
        print(f"{'would update' if a.dry else 'updated'} {path} ({n})")
    print(f"\n{'DRY RUN — ' if a.dry else ''}{len(changed)} file(s), {hits} replacement(s)")
    print(f"origin → {origin}")
    print(f"repo   → {a.repo}")
    if not changed:
        print("nothing to do (already switched?)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
