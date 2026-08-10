#!/usr/bin/env python3
# Copyright 2025 The Lynxtron Authors. All rights reserved.
# Licensed under the Apache License Version 2.0 that can be found in the
# LICENSE file in the root directory of this source tree.

import argparse
import json
import os
import subprocess
import warnings

from lib import git
from lib.patches import read_patch

THREEWAY = "ELECTRON_USE_THREE_WAY_MERGE_FOR_PATCHES" in os.environ
COLORED_GREEN_MSG = '\033[92m'
COLORED_PRINT_END = '\033[0m'

def apply_patches(target):
  repo = target.get('repo')
  if not os.path.exists(repo):
    warnings.warn(f'repo not found: {repo}')
    return
  patch_dir = target.get('patch_dir')
  directory = target.get('directory')
  print(f'{COLORED_GREEN_MSG}applying patches from {patch_dir} to {repo}{COLORED_PRINT_END}')
  with open(os.path.join(patch_dir, ".patches"), encoding="utf-8") as patches:
    patch_names = [line.strip() for line in patches if line.strip()]
  for patch_name in patch_names:
    patch_data = read_patch(patch_dir, patch_name)
    already_applied = subprocess.run(
        ["git", "-C", repo, "apply", "--reverse", "--check"],
        input=patch_data,
        text=True,
        capture_output=True,
        check=False,
    ).returncode == 0
    if already_applied:
      print(f"skipping already-applied patch: {patch_name}")
      continue
    git.import_patches(
      committer_email="scripts@lynxtron",
      committer_name="Lynxtron Scripts",
      patch_data=patch_data,
      repo=repo,
      threeway=THREEWAY,
      directory=directory,
    )

def apply_config(config):
  for target in config:
    apply_patches(target)

def parse_args():
  parser = argparse.ArgumentParser(description='Apply Lynxtron patches')
  parser.add_argument('config', nargs='+',
                      type=argparse.FileType('r'),
                      help='patches\' config(s) in the JSON format')
  return parser.parse_args()


def main():
  for config_json in parse_args().config:
    apply_config(json.load(config_json))


if __name__ == '__main__':
  main()
