# ==============================================================================
# APEX PULSE Backend — Production Dockerfile
# ==============================================================================
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    HOST=0.0.0.0

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code, datasets, and pre-trained models
COPY . .

# Expose dynamic application port
EXPOSE 8000

# Start production server with dynamic port binding
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
