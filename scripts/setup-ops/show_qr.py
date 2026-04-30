#!/usr/bin/env python3
import subprocess, json, sys

result = subprocess.run(
    ['curl', '-s', '-H', 'apikey: HC8WnTpG+xQiBYqSzac3SfrTWEfBdNMIJHx45dTMJ8I=',
     'http://localhost:8080/instance/connect/clinica-1'],
    capture_output=True, text=True
)

try:
    d = json.loads(result.stdout)
    for k, v in d.items():
        if k == 'base64':
            print(f"base64: [present, length={len(v)}]")
        else:
            print(f"{k}: {str(v)[:200]}")
except Exception as e:
    print("RAW:", result.stdout[:500])
    print("ERR:", e)
