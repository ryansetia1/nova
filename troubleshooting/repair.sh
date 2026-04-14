#!/bin/bash

# NOVA Quick Repair Script
# Use this to clear common process locks or hanging servers

echo "🪐 Starting NOVA repair sequence..."

# 1. Kill any hanging node server on port 3000
echo "Checking for hanging server on port 3000..."
PID=$(lsof -t -i:3000)
if [ ! -z "$PID" ]; then
  echo "Found process $PID. Killing it..."
  kill -9 $PID
else
  echo "Port 3000 is clear."
fi

# 2. Kill any orphaned agent processes (Claude/Ollama)
echo "Cleaning up orphaned agent processes..."
pkill -f "ollama launch claude"
pkill -f "claude -p"

# 3. Handle potential LevelDB locks
# Note: This is a common cause for IndexedDB failures in Electron
LOCKFILE="$HOME/Library/Application Support/nova/IndexedDB/https_localhost_3000.indexeddb.leveldb/LOCK"
if [ -f "$LOCKFILE" ]; then
  echo "Found LevelDB lock. Removing..."
  rm "$LOCKFILE"
fi

echo "✨ Repair complete. Try running 'npm run electron:dev' now."
