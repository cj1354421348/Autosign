# 使用官方 Python 轻量级镜像
# Use official Python lightweight image
FROM python:3.10-slim

# 设置工作目录
# Set working directory
WORKDIR /app

# 设置环境变量，防止 Python 生成 .pyc 文件和缓冲输出
# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 默认管理员账号设置 (如果在首次启动时数据库为空)
# Default admin credentials (if database is empty on first run)
# ENV ADMIN_USERNAME=admin
# ENV ADMIN_PASSWORD=admin

# 安装系统依赖（如果需要）
# Install system dependencies (if needed)
# RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
# Copy requirements file
COPY requirements.txt .

# 安装依赖
# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目文件
# Copy project files
COPY . .

# 确保 data 目录存在
# Ensure data directory exists
RUN mkdir -p data

# 暴露端口
# Expose port
EXPOSE 8000

# 启动命令
# Start command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
