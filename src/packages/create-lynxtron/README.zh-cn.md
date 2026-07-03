# create-lynxtron

从官方模板创建一个新的 Lynxtron 应用。

## 使用方法

```bash
npm create lynxtron [project-name] [options]
```

当提供项目名称或任意选项时，`create-lynxtron` 会进入非交互模式，并使用默认值补齐缺省选项。

## 选项

- `[project-name]`: 要创建的项目名称或路径。
- `--web`: 包含 Web 支持 (Symmetric Host)，非交互模式下默认开启。
- `--no-web`: 禁用 Web 支持 (Symmetric Host)。
- `-f, --force`: 目标目录非空时覆盖目录。
- `-y, --yes`: 对缺省选项使用默认答案。
- `-h, --help`: 显示帮助信息。

## 示例

```bash
npm create lynxtron my-app
npm create lynxtron my-app -- --no-web
npm create lynxtron my-app -- --web --force
```

## 特性

- **PC 支持**: 使用 Node.js 和 Lynx 构建的原生桌面应用。
- **Web 支持 (可选)**: 使用相同的 UI 代码，通过 Symmetric Host 范式在浏览器中运行。
- **跨平台 Bridge**: 为 Node.js 和 Web API 提供统一的服务适配器。
