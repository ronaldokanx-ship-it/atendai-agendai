import subprocess

# Read the file
with open('/opt/clinicai/docker-compose.vm2.yml', 'r') as f:
    content = f.read()

# Replace
old = 'LOG_BAILEYS: "warn"'
new = 'LOG_BAILEYS: "debug"'
content = content.replace(old, new)

# Write back
with open('/opt/clinicai/docker-compose.vm2.yml', 'w') as f:
    f.write(content)

print('Done:', content.count('LOG_BAILEYS'))
