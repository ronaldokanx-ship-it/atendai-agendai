#!/usr/bin/env python3
import subprocess, json

payload = {
    "instanceName": "clinica-1",
    "qrcode": True,
    "integration": "WHATSAPP-BAILEYS",
    "webhook": {
        "url": "https://api.kanxitsolutions.com.br/api/whatsapp/evolution",
        "enabled": True,
        "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
    }
}

result = subprocess.run([
    'curl', '-s', '-X', 'POST',
    'http://localhost:8080/instance/create',
    '-H', 'Content-Type: application/json',
    '-H', 'apikey: HC8WnTpG+xQiBYqSzac3SfrTWEfBdNMIJHx45dTMJ8I=',
    '-d', json.dumps(payload)
], capture_output=True, text=True)

print(result.stdout)
print(result.stderr)
