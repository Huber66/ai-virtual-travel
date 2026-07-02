#!/bin/bash
# Restart ai_backgound backend service
# Kill existing uvicorn process on port 8010
PID=$(pgrep -f 'uvicorn.*8010\|ai_backgound.*main.*8010' 2>/dev/null || true)
if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null || true
    sleep 2
fi
# Restart using the project start script
cd /home/ai/ai_backgound
nohup /home/ai/ai_backgound/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --ssl-keyfile /home/ai/ai_backgound/certs/server.key --ssl-certfile /home/ai/ai_backgound/certs/server.crt > /home/ai/ai_backgound/logs/backend.log 2>&1 &
sleep 2
echo "Restarted. New PID:"
pgrep -f 'uvicorn.*8010' || echo "checking..."
ss -tlnp | grep 8010 || echo "port not listening yet"
