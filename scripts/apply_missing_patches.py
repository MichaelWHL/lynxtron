#!/usr/bin/env python3
# Copyright 2026 The Lynxtron Authors. All rights reserved.
# Licensed under the Apache License Version 2.0 that can be found in the
# LICENSE file in the root directory of this source tree.

"""Apply only the patches a checkout is missing.

src/script/apply_all_patches.py concatenates a whole patch directory into one
`git am` and raises on the first failure. That is correct for a pristine sync,
but the revisions `hab sync` pins already contain most of these patches, so a
full replay aborts on the first already-applied one and leaves a stuck `git am`
session behind.

This walks the same configs, classifies each patch, and applies just the ones
that are absent. It is idempotent: running it twice is a no-op.

    python3 scripts/apply_missing_patches.py            # apply what's missing
    python3 scripts/apply_missing_patches.py --dry-run  # just report
"""

import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIGS = ["src/patches/config.json", "src/patches/lynx/config.json"]

GREEN, YELLOW, RED, DIM, END = (
    "\033[92m", "\033[93m", "\033[91m", "\033[2m", "\033[0m")


def git(repo, *args, stdin=None):
    return subprocess.run(["git", "-C", repo, *args], input=stdin,
                          capture_output=True, text=True)


def classify(repo, patch_path):
    """-> 'applied' | 'missing' | 'conflict'

    A patch whose reverse applies cleanly is already in the tree. Otherwise, if
    it applies forward it is genuinely missing. If neither works the tree has
    drifted from what the patch expects.
    """
    with open(patch_path, "r", encoding="utf-8", errors="replace") as f:
        data = f.read()
    if git(repo, "apply", "--check", "--reverse", stdin=data).returncode == 0:
        return "applied"
    if git(repo, "apply", "--check", stdin=data).returncode == 0:
        return "missing"
    return "conflict"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would be applied, change nothing")
    args = ap.parse_args()

    os.chdir(ROOT)
    applied = missing = conflict = 0

    for cfg in CONFIGS:
        for target in json.load(open(cfg)):
            repo, patch_dir = target["repo"], target["patch_dir"]
            if not os.path.isdir(os.path.join(repo, ".git")):
                print(f"{DIM}  skip {repo} (not a git checkout){END}")
                continue
            if not os.path.isdir(patch_dir):
                continue
            # The .patches manifest is authoritative: it fixes apply order and
            # omits files that are present but deliberately not applied. Never
            # glob the directory — that would apply patches the manifest leaves
            # out (e.g. a macOS-only patch sitting in the lynx patch dir).
            manifest = os.path.join(patch_dir, ".patches")
            if not os.path.isfile(manifest):
                print(f"{YELLOW}  skip {patch_dir} (no .patches manifest){END}")
                continue
            with open(manifest, encoding="utf-8") as f:
                patches = [ln.strip() for ln in f if ln.strip()]
            if not patches:
                continue

            todo = []
            for name in patches:
                path = os.path.join(patch_dir, name)
                if not os.path.isfile(path):
                    print(f"{RED}  MISSING FILE {patch_dir}/{name} "
                          f"(listed in .patches){END}")
                    conflict += 1
                    continue
                state = classify(repo, path)
                if state == "applied":
                    applied += 1
                elif state == "missing":
                    missing += 1
                    todo.append((name, path))
                else:
                    conflict += 1
                    print(f"{RED}  CONFLICT {repo}: {name}{END}")

            for name, path in todo:
                if args.dry_run:
                    print(f"{YELLOW}  would apply {repo}: {name}{END}")
                    continue
                print(f"{GREEN}  applying {repo}: {name}{END}")
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    r = git(repo, "-c", "user.name=Lynxtron Scripts",
                            "-c", "user.email=scripts@lynxtron",
                            "-c", "commit.gpgsign=false",
                            "am", "--keep-cr", stdin=f.read())
                if r.returncode != 0:
                    print(f"{RED}  FAILED {repo}: {name}\n{r.stdout}{r.stderr}{END}")
                    git(repo, "am", "--abort")
                    return 1

    print()
    print(f"already applied: {applied}   "
          f"{'to apply' if args.dry_run else 'applied now'}: {missing}   "
          f"conflicts: {conflict}")
    if conflict:
        print(f"{RED}Conflicting patches need a look — the checkout has drifted "
              f"from what they expect.{END}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
