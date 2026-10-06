import json
import sys

request = json.loads(sys.stdin.readline())
if request.get("action") == "crash":
    raise SystemExit(3)
print(json.dumps({
    "protocolVersion": "1",
    "correlationId": request.get("correlationId"),
    "status": "completed",
    "output": {"echo": request.get("input")},
}), flush=True)
