# create-lynxtron

Create a new Lynxtron app from the official template.

## Usage

```bash
npm create lynxtron [project-name] [options]
```

When a project name or option is provided, `create-lynxtron` runs in
non-interactive mode and uses defaults for missing options.

## Options

- `[project-name]`: The name or path of the project to create.
- `--web`: Include Web support (Symmetric Host). This is the default in non-interactive mode.
- `--no-web`: Disable Web support (Symmetric Host).
- `-f, --force`: Overwrite the target directory when it is not empty.
- `-y, --yes`: Use default answers for missing options.
- `-h, --help`: Show help.

## Examples

```bash
npm create lynxtron my-app
npm create lynxtron my-app -- --no-web
npm create lynxtron my-app -- --web --force
```

## Features

- **PC Support**: Native desktop application using Node.js and Lynx.
- **Web Support (Optional)**: Run the same UI code in the browser with a Symmetric Host paradigm.
- **Cross-platform Bridge**: Unified service adapter for Node.js and Web APIs.
