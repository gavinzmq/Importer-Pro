# Environment — Container

本文件描述容器运行时的准备方式。Windows 上无需 Docker Desktop。

## Windows：WSL Containers（推荐）

确保 WSL 已安装，在管理员 PowerShell 中运行 `wsl --install`。更新到 WSL 预览版以获取 wslc 工具，运行 `wsl --update --pre-release`。验证 wslc 可用，运行 `wslc version`。在 VS Code 设置中搜索 `dev.containers.dockerPath`，将其值改为 `wslc`。安装 Dev Containers 扩展，版本需为 0.462.0-pre-release 或更高。

WSL Containers 需要 WSL 版本 2.9.3 或更高。

## Windows：Podman（备选）

确保 WSL 2 已启用。在 WSL 2 内安装 Podman 并初始化 Podman 机器，运行 `podman machine init -m 16384 --now`。在 VS Code 设置中将 `dev.containers.dockerPath` 改为 `podman`。安装 Dev Containers 扩展。

## Mac / Linux

安装 Docker Engine 或 Podman，确保 `docker` 或 `podman` 命令在终端中可用。Dev Containers 扩展会自动检测。

## 常见问题

WSL Containers 不可用时，确认 WSL 版本为 2.9.3 或更高，运行 `wsl --update --pre-release` 更新。确认 Dev Containers 扩展版本为 0.462.0-pre-release 或更高。

DevContainer 提示找不到配置时，检查 `.vscode/settings.json` 中 `dev.containers.path` 是否指向 `.specify/.devcontainer/devcontainer.json`。如果不存在，手动在命令面板执行 `Dev Containers: Reopen in Container`。

Windows 上文件监听不工作时，如果项目克隆在 Windows 文件系统而非 WSL 2 文件系统内，`esbuild --watch` 可能无法检测文件变化。将项目移至 WSL 2 文件系统内解决。