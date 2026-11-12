import json, os, subprocess, sys

REPO = os.environ.get("REPO", "dsh-tauri/deepseek-harness-desktop")
BRANCH = os.environ.get("BRANCH", "main")
DRY = "--dry-run" in sys.argv

def gh(args, payload=None):
    cmd = ["gh", "api", *args]
    if payload is not None:
        with open("_payload.json", "w", encoding="utf-8") as f:
            json.dump(payload, f)
        cmd += ["--input", "_payload.json"]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        print("FAIL", " ".join(args[:6]), r.stderr.strip()[:300], file=sys.stderr)
    return r.returncode, r.stdout, r.stderr

def put_blob(path):
    data = open(path, "rb").read()
    rc, out, err = gh(["--method", "POST", f"repos/{REPO}/git/blobs",
                       "-f", "content=" + data.decode("utf-8", "replace"),
                       "-f", "encoding=utf-8"])
    return json.loads(out).get("sha") if rc == 0 and out.strip() else None

def main():
    entries = []
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", ".temp", "target", "dist")]
        for name in files:
            full = os.path.join(root, name)
            if full.endswith("_payload.json"):
                continue
            entries.append({"path": os.path.relpath(full, "."), "mode": "100644",
                            "type": "blob", "sha": put_blob(full)})
    base = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    if DRY:
        print("entries", len(entries), "null_sha", sum(1 for e in entries if not e["sha"]))
        return
    gh(["--method", "POST", f"repos/{REPO}/git/trees"], {"tree": entries, "base_tree": base})

main()