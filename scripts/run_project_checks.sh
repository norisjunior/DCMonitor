#!/usr/bin/env bash
# Runs all available project checks. Edit the sections that apply to this project.
set -e

echo "=== Project checks ==="

# --- Backend ---
if [ -d "backend" ]; then
  echo "[backend] running tests..."
  cd backend && pytest -q && cd ..
  echo "[backend] running lint..."
  cd backend && ruff check . && cd ..
fi

# --- Frontend ---
if [ -d "web" ]; then
  echo "[frontend] running lint..."
  cd web && npm run lint --silent && cd ..
  echo "[frontend] running tests..."
  cd web && npm run test --silent && cd ..
fi

# --- Firmware ---
if [ -d "firmware" ]; then
  echo "[firmware] compiling..."
  cd firmware && pio run -s && cd ..
fi

# --- Docs sync ---
echo "[docs] checking sync..."
python scripts/check_docs_sync.py

echo "=== All checks passed ==="
