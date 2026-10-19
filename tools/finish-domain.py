#!/usr/bin/env python3
"""
Felani4F — finish the domain migration once the repo lives in the `felani4f` org.

  python3 tools/finish-domain.py --token-file /tmp/ghtoken_org            # do it
  python3 tools/finish-domain.py --token-file /tmp/ghtoken_org --check    # report only

Steps (each one skipped if already done):
  1. find the repo: felani4f/felani4f.github.io  →  felani4f/felani4f  →  Drserver2350/felani4f
  2. rename it to felani4f.github.io (so Pages serves the root domain)
  3. make sure GitHub Pages is enabled on main /
  4. rewrite every URL in the site (canonical, og, JSON-LD, sitemap, robots, api.js)
  5. commit + push
  6. wait for the Pages build and smoke-test the live URL
"""
import argparse, json, pathlib, re, subprocess, sys, time, urllib.error, urllib.request

ORG = "felani4f"
TARGET = f"{ORG}/{ORG}.github.io"
CANDIDATES = [TARGET, f"{ORG}/felani4f", "Drserver2350/felani4f"]
ORIGIN = f"https://{ORG}.github.io"
ROOT = pathlib.Path(__file__).resolve().parent.parent


class Gh:
    def __init__(self, token):
        self.token = token

    def __call__(self, method, path, body=None):
        req = urllib.request.Request(
            "https://api.github.com" + path,
            data=json.dumps(body).encode() if body is not None else None,
            method=method,
            headers={"Authorization": "Bearer " + self.token,
                     "Accept": "application/vnd.github+json",
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


def sh(*args, **kw):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, **kw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token-file", default="/tmp/ghtoken_org")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--skip-push", action="store_true")
    a = ap.parse_args()
    token = pathlib.Path(a.token_file).read_text().strip()
    gh = Gh(token)

    print("▸ locating the repository")
    repo = None
    for cand in CANDIDATES:
        st, d = gh("GET", f"/repos/{cand}")
        print(f"   {cand:<32} {st}")
        if st == 200 and repo is None:
            repo = cand
            info = d
    if not repo:
        print("\n✗ repository not found — transfer it to the organization first.")
        print("  https://github.com/Drserver2350/felani4f/settings → Danger Zone → Transfer ownership")
        return 2

    if repo != TARGET:
        print(f"\n▸ renaming {repo} → {TARGET.split('/')[1]}")
        if not a.check:
            st, d = gh("PATCH", f"/repos/{repo}", {"name": TARGET.split('/')[1]})
            if st != 200:
                print("   ✗ rename failed:", d.get("message"))
                print("   → do it in the UI: repo Settings → Repository name → felani4f.github.io")
                return 1
            repo = TARGET
            time.sleep(3)
    print(f"   repo = {repo}")

    print("\n▸ GitHub Pages")
    st, pg = gh("GET", f"/repos/{repo}/pages")
    if st == 404:
        print("   · not enabled, enabling (main /)")
        if not a.check:
            st, d = gh("POST", f"/repos/{repo}/pages", {"source": {"branch": "main", "path": "/"}})
            if st not in (201, 204):
                print("   ✗ could not enable Pages:", d.get("message"))
                return 1
    else:
        src = pg.get("source") or {}
        print(f"   · enabled: {src.get('branch')} {src.get('path')} → {pg.get('html_url')}")

    print(f"\n▸ site URLs → {ORIGIN}")
    if not a.check:
        rc = sh(sys.executable, str(ROOT / "tools/set-domain.py"), "--origin", ORIGIN, "--repo", repo)
        print("\n".join("   " + ln for ln in (rc.stdout or rc.stderr).splitlines() if ln.strip()))

    if not a.check and not a.skip_push:
        print("\n▸ commit + push")
        sh("git", "config", "user.name", "Felani4F")
        sh("git", "config", "user.email", "hello@felani4f.com")
        sh("git", "add", "-A")
        diff = sh("git", "diff", "--cached", "--stat")
        if diff.stdout.strip():
            sh("git", "commit", "-m", "domain: move to felani4f.github.io")
            print("   · committed")
        sh("git", "remote", "remove", "origin")
        sh("git", "remote", "add", "origin", f"https://x-access-token:{token}@github.com/{repo}.git")
        sh("git", "fetch", "origin", "main")
        sh("git", "rebase", "origin/main")
        push = sh("git", "push", "origin", "main")
        print("   ·", (push.stdout + push.stderr).strip()[:400] or "nothing to push")
        sh("git", "remote", "set-url", "origin", f"https://github.com/{repo}.git")

    print("\n▸ waiting for the Pages build")
    if not a.check:
        for _ in range(40):
            st, b = gh("GET", f"/repos/{repo}/pages/builds/latest")
            status = b.get("status") if isinstance(b, dict) else None
            print("   ", status)
            if status == "built":
                break
            if status == "errored":
                print("   ✗ build errored:", b.get("error"))
                return 1
            time.sleep(6)
        for path in ["", "assets/js/api.js", "assets/css/style.css", "assets/js/overrides.js"]:
            req = urllib.request.Request(f"{ORIGIN}/{path}", method="HEAD")
            try:
                with urllib.request.urlopen(req, timeout=20) as r:
                    print(f"   {path or '/':<28} {r.status}")
            except Exception as e:
                print(f"   {path or '/':<28} {e}")

    print(f"\n✓ done — {ORIGIN}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
