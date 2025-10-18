FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    libgit2-dev \
    pkg-config \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . ./backend/

ENV PYTHONPATH=/app/backend/src

WORKDIR /app/backend/src

EXPOSE 8000

CMD ["python", "main.py"]
