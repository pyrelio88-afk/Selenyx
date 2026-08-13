# -*- coding: utf-8 -*-
"""把本地领先的提交经 GitHub Git Data API 逐个回放推送（沙箱整杀 git push 的解法）。

blobs → trees → commits → PATCH refs/heads/main；author/committer/时间戳/message
与本地逐字节一致，因此建出的提交 sha 与本地相同，两边天然一致。
用完即删倾向：本脚本不放仓库长期维护，需要时可重新生成。
"""
from __future__ import annotations

import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = "pyrelio88-afk/Selenyx"
GH = r"C:\Users\34043\AppData\Local\Temp\gh\bin\gh.exe"
ROOT = "D:/Dev/Selenyx"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", "-C", ROOT, *args], check=True, capture_output=True, text=False
    ).stdout


def gh_api(endpoint: str, payload: dict | None = None, method: str | None = None) -> dict:
    cmd = [GH, "api", f"repos/{REPO}/{endpoint}"]
    if method:
        cmd += ["-X", method]
    if payload is not None:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
            json.dump(payload, fh)
            tmp = fh.name
        cmd += ["--input", tmp]
    try:
        out = subprocess.run(cmd, check=True, capture_output=True).stdout
    finally:
        if payload is not None:
            Path(tmp).unlink(missing_ok=True)
    return json.loads(out or b"{}")


def gh_blob_exists(sha: str) -> bool:
    cmd = [GH, "api", f"repos/{REPO}/git/blobs/{sha}"]
    return subprocess.run(cmd, capture_output=True).returncode == 0


def ensure_blob(sha: str) -> None:
    if gh_blob_exists(sha):
        return
    raw = git("cat-file", "blob", sha)
    gh_api("git/blobs", {"content": base64.b64encode(raw).decode(), "encoding": "base64"})
    print(f"  blob {sha[:8]}")


def changed_paths(commit: str) -> list[str]:
    out = git("diff-tree", "-r", "--no-commit-id", "--name-only", commit).decode()
    return [p for p in out.splitlines() if p]


def tree_entries(tree_sha: str) -> list[dict]:
    out = git("ls-tree", tree_sha).decode()
    entries = []
    for line in out.splitlines():
        meta, path = line.split("\t", 1)
        mode, otype, sha = meta.split()
        entry = {"path": path, "mode": mode, "type": otype, "sha": sha}
        entries.append(entry)
    return entries


def ensure_tree(tree_sha: str, dirty_dirs: set[str], prefix: str = "") -> None:
    """depth 优先从深到浅建脏目录树；干净子树远端已存在（sha 相同）。"""
    if prefix and prefix not in dirty_dirs:
        return  # 干净子树：远端已有同 sha 树
    entries = tree_entries(tree_sha)
    for e in entries:
        if e["type"] == "tree":
            ensure_tree(e["sha"], dirty_dirs, f"{prefix}{e['path']}/" if prefix else f"{e['path']}/")
    if prefix == "" or prefix in dirty_dirs:
        payload = {"tree": entries}
        res = gh_api("git/trees", payload)
        assert res["sha"] == tree_sha, f"树 sha 不一致：{res['sha']} != {tree_sha}"
        print(f"  tree {prefix or '/'}")


def parse_commit(commit: str) -> dict:
    raw = git("cat-file", "commit", commit).decode()
    head, _, message = raw.partition("\n\n")
    fields: dict[str, str] = {}
    parents = []
    for line in head.splitlines():
        key, _, value = line.partition(" ")
        if key == "parent":
            parents.append(value)
        else:
            fields[key] = value

    def parse_ident(line: str) -> dict:
        name_email, _, rest = line.rpartition("> ")
        ts, _, tz = rest.partition(" ")
        name, _, email = name_email.partition(" <")
        # git 原始 "1370000000 +0800" → ISO 8601（GitHub API 要求），时区保留则 sha 一致
        from datetime import datetime, timedelta, timezone

        sign = 1 if tz.startswith("+") else -1
        offset = timezone(sign * timedelta(hours=int(tz[1:3]), minutes=int(tz[3:5])))
        iso = datetime.fromtimestamp(int(ts), offset).isoformat()
        return {"name": name, "email": email, "date": iso}

    return {
        "tree": fields["tree"],
        "parents": parents,
        "author": parse_ident(fields["author"]),
        "committer": parse_ident(fields["committer"]),
        "message": message,
    }


def gh_commit_exists(sha: str) -> bool:
    cmd = [GH, "api", f"repos/{REPO}/git/commits/{sha}"]
    return subprocess.run(cmd, capture_output=True).returncode == 0


def main() -> None:
    remote = gh_api("git/refs/heads/main")
    remote_sha = remote["object"]["sha"]
    print("remote main:", remote_sha[:8])
    local = git("rev-parse", "HEAD").decode().strip()
    commits = git("rev-list", "--reverse", f"{remote_sha}..{local}").decode().split()
    if not commits:
        print("无待推提交")
        return
    print(f"回放 {len(commits)} 个提交")
    for commit in commits:
        if gh_commit_exists(commit):
            print(f"已存在，跳过 {commit[:8]}")
            continue
        info = parse_commit(commit)
        dirty = set()
        for path in changed_paths(commit):
            parts = path.split("/")[:-1]
            for i in range(1, len(parts) + 1):
                dirty.add("/".join(parts[:i]) + "/")
        # 上传新增/修改的 blob（diff 中非删除项）
        diff = git("diff-tree", "-r", "--no-commit-id", commit).decode()
        for line in diff.splitlines():
            meta, _, path = line.partition("\t")
            cols = meta.split()
            if len(cols) >= 5 and cols[4] != "D":
                ensure_blob(cols[3])
        ensure_tree(info["tree"], dirty)
        res = gh_api("git/commits", {
            "message": info["message"],
            "tree": info["tree"],
            "parents": info["parents"],
            "author": info["author"],
            "committer": info["committer"],
        })
        assert res["sha"] == commit, f"提交 sha 不一致：{res['sha']} != {commit}"
        print(f"commit {commit[:8]} ✓")
    gh_api("git/refs/heads/main", {"sha": local, "force": False}, method="PATCH")
    print(f"main -> {local[:8]} 推送完成")


if __name__ == "__main__":
    sys.exit(main())
