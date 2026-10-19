#!/usr/bin/env python3
"""
Felani4F — Google Search Console verification.

Two ways, both supported:

  A) meta tag method (recommended)
     Search Console gives you:
        <meta name="google-site-verification" content="AbC123...">
     run:
        python3 tools/verify-google.py --meta AbC123...

  B) HTML file method
     Search Console gives you a file named  googleAbC123.html
     run:
        python3 tools/verify-google.py --file googleAbC123.html --file-body "google-site-verification: googleAbC123.html"

After running, the change is committed and pushed to felani4f/felani4f.github.io,
then this script waits for GitHub Pages to rebuild and prints the live check.
"""
import argparse, base64, json, pathlib, re, subprocess, sys, time, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = "felani4f/felani4f.github.io"
ORIGIN = "https://felani4f.github.io"
TOKEN_FILES = ["/tmp/ghtoken_org2", "/tmp/ghtoken_org", "/tmp/ghtoken"]


def token():
    for f in TOKEN_FILES:
        p = pathlib.Path(f)
        if p.exists() and p.read_text().strip():
            return p.read_text().strip()
    raise SystemExit("no GitHub token found (looked in " + ", ".join(TOKEN_FILES) + ")")


def api(tok, method, path, body=None):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json",
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


def put(tok, path, data: bytes, message):
    st, cur = api(tok, "GET", f"/repos/{REPO}/contents/{path}?ref=main")
    body = {"message": message, "content": base64.b64encode(data).decode(), "branch": "main"}
    if st == 200:
        body["sha"] = cur["sha"]
    st, r = api(tok, "PUT", f"/repos/{REPO}/contents/{path}", body)
    if st not in (200, 201):
        raise SystemExit(f"✗ push failed for {path}: {r.get('message')}")
    return r["commit"]["sha"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta", help="content value of google-site-verification")
    ap.add_argument("--file", help="googleXXXX.html filename as given by Search Console")
    ap.add_argument("--file-body", default="", help="exact body of the verification file")
    a = ap.parse_args()
    if not a.meta and not a.file:
        ap.print_help()
        return 2

    tok = token()
    commits = []

    if a.meta:
        tokval = a.meta.strip()
        st, cur = api(tok, "GET", f"/repos/{REPO}/contents/index.html?ref=main")
        html = base64.b64decode(cur["content"]).decode()
        if "google-site-verification" in html:
            html = re.sub(r'<meta name="google-site-verification" content="[^"]*">\s*',
                          f'<meta name="google-site-verification" content="{tokval}">\n', html)
        else:
            html = html.replace("<meta charset=\"utf-8\">",
                                "<meta charset=\"utf-8\">\n<meta name=\"google-site-verification\" content=\"" + tokval + "\">", 1)
        commits.append(put(tok, "index.html", html.encode(), "seo: google site verification (meta)"))
        print("✓ meta tag installed")

    if a.file:
        name = a.file.strip()
        if not re.fullmatch(r"google[0-9a-zA-Z_-]+\.html", name):
            raise SystemExit("✗ file name must look like googleXXXXXXXX.html")
        body = (a.file_body or f"google-site-verification: {name}")
        commits.append(put(tok, name, body.encode(), "seo: google site verification (file)"))
        print(f"✓ {name} added")

    print("\n· waiting for GitHub Pages")
    for _ in range(40):
        st, b = api(tok, "GET", f"/repos/{REPO}/pages/builds/latest")
        s = b.get("status") if isinstance(b, dict) else None
        if s == "built":
            break
        if s == "errored":
            raise SystemExit("✗ Pages build errored")
        time.sleep(6)
    for path in ["", *(x for x in [a.file] if x)]:
        try:
            with urllib.request.urlopen(f"{ORIGIN}/{path}", timeout=20) as r:
                body = r.read(400).decode(errors="replace")
                hit = a.meta and f'content="{a.meta}"' in body or (a.file and "google-site-verification" in body)
                print(f"  {path or '/':<28} {r.status} {'✓ verified string is live' if hit else ''}")
        except Exception as e:
            print(f"  {path or '/':<28} {e}")
    print("\nthen in Search Console press «Verify», add sitemap:", f"{ORIGIN}/sitemap.xml")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
