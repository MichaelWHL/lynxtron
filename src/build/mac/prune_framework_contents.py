#!/usr/bin/env python3

# Copyright 2026 The Lynxtron Authors. All rights reserved.
# Licensed under the Apache License Version 2.0 that can be found in the
# LICENSE file in the root directory of this source tree.

import argparse
import os
import shutil


def _remove(path):
  if os.path.isdir(path) and not os.path.islink(path):
    shutil.rmtree(path)
  else:
    os.remove(path)


def _prune(directory, declared_contents):
  if not os.path.isdir(directory):
    return

  for entry in os.listdir(directory):
    if entry not in declared_contents:
      _remove(os.path.join(directory, entry))


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--framework', required=True)
  parser.add_argument('--version', required=True)
  parser.add_argument('--contents', nargs='+', required=True)
  args = parser.parse_args()

  declared_contents = set(args.contents)
  _prune(os.path.join(args.framework, 'Versions', args.version),
         declared_contents)
  _prune(args.framework, declared_contents | {'Versions'})


if __name__ == '__main__':
  main()
