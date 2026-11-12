import base64, json, os, subprocess, sys, time

REPO = os.environ["REPO"]; BRANCH = os.environ.get("BRANCH", "main")
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 0
EMPTY = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
SKIP = {".git", "node_modules", ".temp", "target", "dist", "_payload.json"}

def gh(args, payload=None, retries=3):
    for i in range(retries):
        cmd = ["gh", "api", *args]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                           input=None if payload is None else json.dumps(payload))
        if r.returncode == 0:
            return json.loads(r.stdout) if r.stdout.strip() else {}
        if "secondary rate limit" in r.stderr or "HTTP 403" in r.stderr:
            time.sleep(2 ** i + 1); continue
        raise SystemExit(f"gh api failed: {args[1] if len(args) > 1 else args[0]}\n{r.stderr[:500]}")
    raise SystemExit("retries exhausted")

def blob(full):
    data = open(full, "rb").read()
    if not data:
        return EMPTY
    try:
        body = {"content": data.decode("utf-8"), "encoding": "utf-8"}
    except UnicodeDecodeError:
        body = {"content": base64.b64encode(data).decode("ascii"), "encoding": "base64"}
    out = gh(["--method", "POST", f"repos/{REPO}/git/blobs", "--input", "-"], body)
    sha = (out or {}).get("sha") or ""
    if len(sha) != 40:
        raise SystemExit(f"blob sha invalid for {full}: {sha!r}")
    return sha

def collect():
    seen, out = set(), []
    for root, dirs, files in os.walk("."):
        dirs[:] = sorted(d for d in dirs if d not in SKIP)
        for name in sorted(files):
            full = os.path.join(root, name)
            rel = os.path.relpath(full, ".").replace(os.sep, "/")
            if name in SKIP or rel in seen:
                continue
            if "\\" in rel or len(rel) > 4000:
                raise SystemExit(f"bad path: {rel!r}")
            seen.add(rel); out.append((rel, full))
    return out[:LIMIT] if LIMIT else out

def head_tree():
    try:
        c = gh([f"repos/{REPO}/git/ref/heads/{BRANCH}"])["object"]["sha"]
    except SystemExit:
        return None, None
    return c, gh([f"repos/{REPO}/git/commits/{c}"])["tree"]["sha"]

def main():
    pairs = collect()
    entries = [{"path": p, "mode": "100644", "type": "blob", "sha": blob(f)} for p, f in pairs]
    parent, base = head_tree()
    body = {"tree": entries} | ({"base_tree": base} if base else {})
    tree = gh(["--method", "POST", f"repos/{REPO}/git/trees", "--input", "-"], body)["sha"]
    msg = f"chore: push {len(entries)} files via git tree api"
    commit = gh(["--method", "POST", f"repos/{REPO}/git/commits", "--input", "-"],
                {"message": msg, "tree": tree, "parents": [parent] if parent else []})["sha"]
    if parent:
        gh(["--method", "PATCH", f"repos/{REPO}/git/refs/heads/{BRANCH}", "--input", "-"],
           {"sha": commit, "force": False})
    else:
        gh(["--method", "POST", f"repos/{REPO}/git/refs", "--input", "-"],
           {"ref": f"refs/heads/{BRANCH}", "sha": commit})
    print(json.dumps({"files": len(entries), "base_tree": base, "tree": tree, "commit": commit}))

main()