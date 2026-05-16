#!/bin/bash
python3 -c "content=open('/opt/clinicai/docker-compose.vm2.yml').read();content=content.replace('LOG_BAILEYS: "warn"','LOG_BAILEYS: "debug"');open('/opt/clinicai/docker-compose.vm2.yml','w').write(content)"
grep LOG_BAILEYS /opt/clinicai/docker-compose.vm2.yml
docker compose -f /opt/clinicai/docker-compose.vm2.yml up -d evolution
