#!/usr/bin/env python3
# Copyright 2025 The Lynxtron Authors. All rights reserved.
# Licensed under the Apache License Version 2.0 that can be found in the
# LICENSE file in the root directory of this source tree.

import os
import shutil
import subprocess
import sys

current_dir = os.path.dirname(os.path.realpath(__file__))

npm_command = ['npm', 'run', 'build']
subprocess.check_call(
        " ".join(npm_command),
        cwd=current_dir,
        shell=True,
    )

# rspeedy builds to dist/default_app.bundle, but GN declares the output at a
# different path in the gen dir. Copy the built bundle to the expected output
# path so downstream GN targets can find it.
built_bundle = os.path.join(current_dir, 'dist', 'default_app.bundle')
output_bundle = sys.argv[1]
os.makedirs(os.path.dirname(output_bundle), exist_ok=True)
shutil.copy2(built_bundle, output_bundle)