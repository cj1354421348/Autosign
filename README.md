# AutoSign

[English](README.md) | [中文](README_ZH.md)

AutoSign is an automated signing tool built with FastAPI and Python.

## Features

- **Web Interface**: Manage tasks and accounts via a user-friendly dashboard.
- **Task Scheduling**: Automated scheduling using APScheduler.
- **Multi-Account Support**: Manage multiple accounts securely.
- **Extensible**: Built with modularity in mind.

## Tech Stack

- **Backend**: FastAPI, SQLModel
- **Task Queue**: APScheduler
- **HTTP Client**: HTTPX
- **Templates**: Jinja2

## Getting Started

1.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Run the application**:
    ```bash
    python run.py
    ```

3.  **Access the dashboard**:
    Open `http://localhost:8000` in your browser.
