#!/usr/bin/env python3
"""
Felani4F — move the site from Drserver2350/felani4f to felani4f.github.io
(organization route).

Run this ONLY after the GitHub organization `felani4f` exists and you are its owner.

  python3 tools/migrate-to-org.py            # do the migration
  python3 tools/migrate-to-org.py --check    # only report what would happen

The script is idempotent: it checks where the repo already is, and only performs
the steps that are still missing.
"""
import argparse, base64, json, pathlib, re, subprocess, sys, time, urllib.error, urllib.request

ORG = "felani4f"
OLD = "Drserver2350/felani4f"
MID = f"{ORG}/felani4f"
NEW = f"{ORG}/felani4f.github.io"
NEW_ORIGIN = "https://felani4f.github.io"
ROOT = pathlib.Path(__file__).resolve().parent.parent
TOKEN = pathlib.Path("/tmp/ghtoken").read_text().strip() if pathlib.Path("/tmp/ghtoken").exists() else ""


def api(method, path, body=None, token=None):
    token = token or TOKEN
    req = urllib.request.Request(
        "https://api.github.com" + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="replace")}


def step(msg):
    print(f"\n▸ {msg}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    if not TOKEN:
        print("missing /tmp/ghtoken"); return 2

    # 0) organization must exist
    step("organization")
    st, org = api("GET", f"/orgs/{ORG}")
    if st != 200:
        print(f"  ✗ '{ORG}' is not an organization yet (HTTP {st}). Create it first:")
        print("    https://github.com/account/organizations/new?plan=free")
        return 2
    print(f"  ✓ org {org.get('login')} (plan: {org.get('plan', {}).get('name')})")

    # 1) where is the repo now?
    step("repository location")
    st_new, _ = api("GET", f"/repos/{NEW}")
    if st_new == 200:
        print(f"  ✓ already at {NEW}")
        repo = NEW
    else:
        st_mid, _ = api("GET", f"/repos/{MID}")
        if st_mid == 200:
            print(f"  → at {MID}, renaming to {NEW.split('/')[1]}")
            if not a.check:
                st, r = api("PATCH", f"/repos/{MID}", {"name": NEW.split("/")[1]})
                if st != 200:
                    print("  ✗ rename failed:", r.get("message")); return 1
            repo = NEW
        else:
            st_old, _ = api("GET", f"/repos/{OLD}")
            if st_old != 200:
                print("  ✗ cannot find the repo anywhere (neither old nor new location)"); return 1
            print(f"  → transferring {OLD} → {ORG}")
            if not a.check:
                st, r = api("POST", f"/repos/{OLD}/transfer", {"new_owner": ORG})
                if st not in (202, 200):
                    print("  ✗ transfer failed:", r.get("message")); return 1
                for _ in range(30):
                    time.sleep(3)
                    if api("GET", f"/repos/{MID}")[0] == 200:
                        break
                print(f"  ✓ transferred, renaming to {NEW.split('/')[1]}")
                st, r = api("PATCH", f"/repos/{MID}", {"name": NEW.split("/")[1]})
                if st != 200:
                    print("  ✗ rename failed:", r.get("message")); return 1
            repo = NEW
    print(f"  repo = {repo}")

    # 2) Pages
    step("GitHub Pages")
    st, pg = api("GET", f"/repos/{repo}/pages")
    if st == 404:
        print("  → enabling Pages (main /)")
        if not a.check:
            st, r = api("POST", f"/repos/{repo}/pages", {"source": {"branch": "main", "path": "/"}})
            if st not in (201, 204):
                print("  ✗ could not enable Pages:", r.get("message")); return 1
    else:
        src = (pg.get("source") or {})
        print(f"  ✓ Pages exists — source {src.get('branch')} {src.get('path')} — url {pg.get('html_url')}")

    # 3) rewrite the site URLs
    step("site URLs → " + NEW_ORIGIN)
    if not a.check:
        rc = subprocess.run([sys.executable, str(ROOT / "tools/set-domain.py"),
                             "--origin", NEW_ORIGIN, "--repo", repo], capture_output=True, text=True)
        print(rc.stdout.strip() or rc.stderr.strip())

    print("\nnext:")
    print("  • commit + push (or let the caller do it)")
    print("  • check the build:   /repos/%s/pages/builds/latest" % repo)
    print("  • the admin panel needs a token that can write to %s" % repo)


if __name__ == "__main__":
    raise SystemExit(main())
