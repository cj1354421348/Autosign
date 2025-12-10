# AutoSign / 自动签到系统

[English](README.md) | [中文](README_ZH.md)

AutoSign 是一个基于 FastAPI 和 Python 构建的自动化签到工具。

## 功能特性

- **Web 界面**：通过友好的仪表盘管理任务和账号。
- **任务调度**：使用 APScheduler 进行自动化调度。
- **多账号支持**：安全地管理多个账号。
- **可扩展**：模块化设计，易于扩展。

## 技术栈

- **后端**: FastAPI, SQLModel
- **任务队列**: APScheduler
- **HTTP 客户端**: HTTPX
- **模板**: Jinja2

## 快速开始

1.  **安装依赖**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **运行应用**:
    ```bash
    python run.py
    ```

3.  **访问仪表盘**:
    在浏览器中打开 `http://localhost:8000`。
