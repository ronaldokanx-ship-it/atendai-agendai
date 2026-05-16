#!/usr/bin/env python3
import subprocess, json

result = subprocess.run(
    ['curl', '-s', '-H', 'apikey: HC8WnTpG+xQiBYqSzac3SfrTWEfBdNMIJHx45dTMJ8I=',
     'http://localhost:8080/instance/connect/clinica-1'],
    capture_output=True, text=True
)

d = json.loads(result.stdout)
b64 = d.get('base64', '')

html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>WhatsApp QR Code - ClinicAI</title>
<style>body{{font-family:Arial;text-align:center;padding:40px;background:#f0f0f0}}
img{{border:10px solid #25D366;border-radius:10px;max-width:400px}}
h1{{color:#128C7E}}p{{color:#666}}</style></head>
<body>
<h1>WhatsApp QR Code</h1>
<p>Escaneie com o WhatsApp Business (instancia: clinica-1)</p>
<img src="{b64}" alt="QR Code"/>
<p><small>Gerado em: $(date)</small></p>
</body></html>"""

with open('/tmp/qr_whatsapp.html', 'w') as f:
    f.write(html)
print("HTML salvo em /tmp/qr_whatsapp.html")
print(f"base64 length: {len(b64)}")
