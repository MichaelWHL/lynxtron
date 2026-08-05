# Patches

Lynxtron builds against several upstream checkouts — `base`, `build`, `v8`,
`third_party/node`, `third_party/skia`, `third_party/perfetto`, `url`, `tools`,
`third_party/protobuf`, `third_party/libxml`, and `lynx`. `hab sync` puts each
of them on a **detached HEAD** at a pinned revision, and we have no fork to push
to. Any change we need in them therefore lives here as a patch and is replayed
onto the checkout after every sync.

## Layout

| Config | Repos covered |
|---|---|
| `src/patches/config.json` | the chromium-side deps: `base`, `build`, `v8`, `third_party/{node,skia,protobuf,perfetto,libxml}`, `url`, `tools` |
| `src/patches/lynx/config.json` | `lynx` and its own vendored deps (`quickjs`, `perfetto`, `zlib`) |

Each entry maps a directory of patches to the repo they apply to. Patches within
a directory are applied in filename order, so keep the numeric prefixes where
they exist.

## Applying

`lynxtron_tools/prepare_build_env.py` runs both configs, in this order, at the
end of a sync. To replay them by hand — after a fresh `hab sync`, or on a build
machine that predates this being wired up:

```bash
python3 src/script/apply_all_patches.py src/patches/config.json
python3 src/script/apply_all_patches.py src/patches/lynx/config.json
```

The top-level config must go first: it carries the build-system changes the lynx
patches are layered on top of.

Patches are applied with `git am`, so each becomes a real commit (authored
"Lynxtron Scripts") on the detached HEAD. That means **applying twice fails** —
re-sync the repo (`hab sync`) before replaying, or `git am --abort` and reset.

### Symptom of skipping this step

The build still succeeds. A shared library links fine with undefined symbols and
only fails at load time, so what you get is a `dlopen` failure on device:

```
dlopen liblynxtron.so FAILED: Error relocating .../liblynxtron.so:
_ZN2v84base2OS22AdjustSchedulingParamsEv: symbol not found
```

That symbol is `v8::base::OS::AdjustSchedulingParams()`, defined in
`v8/src/base/platform/platform-linux.cc`, which `v8/BUILD.gn` only compiles when
`is_linux || is_chromeos || is_harmony` — and the `|| is_harmony` arm comes from
`v8/wire-platform-linux-harmony.patch`. If a device build dies in `dlopen` with a
missing symbol, check that the patches were applied before debugging anything
else.

## Adding a patch

Make the change in the checkout, then export just the files you touched:

```bash
cd v8   # or whichever repo
git diff -- path/to/file.cc > ../src/patches/v8/my-change.patch
```

Prepend a `git am` header so the patch carries its rationale — copy the shape of
an existing one (`From`/`From:`/`Date:`/`Subject:`, a prose body explaining *why*,
then `---`, the diffstat, the diff, and a `--`/version trailer). The body is the
only place that reasoning survives; these repos have no PR to point at.

For a repo not yet covered, add an entry to the appropriate `config.json`.

### Verify before committing

Confirm the patch applies to a pristine checkout without disturbing your working
tree, using a throwaway worktree:

```bash
git -C v8 worktree add --detach /tmp/v8_check HEAD
git -C /tmp/v8_check am < src/patches/v8/my-change.patch
diff /tmp/v8_check/path/to/file.cc v8/path/to/file.cc   # expect no output
git -C v8 worktree remove --force /tmp/v8_check
```

## Keeping patches honest

A patch drifts silently: the checkout keeps whatever you edited by hand, so a
stale or half-exported patch is invisible until someone builds from a clean
sync. When you change one of these repos, export the patch in the same sitting,
and prefer editing the checkout + re-exporting over hand-editing a `.patch`.
