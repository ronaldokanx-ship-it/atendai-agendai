#!/usr/bin/env bash
# vm1-setup-remote.sh — executado como root na VM1
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "=== [VM1] Iniciando setup ==="

# Atualiza sistema
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git htop ca-certificates gnupg lsb-release netfilter-persistent iptables-persistent

# Instala Docker CE
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu jammy stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  usermod -aG docker ubuntu
  echo "Docker instalado: $(docker --version)"
else
  echo "Docker ja instalado: $(docker --version)"
fi

# Swap 1GB (essencial com 1 GB RAM)
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  echo "Swap de 1GB configurado"
fi

# Firewall — Oracle Cloud exige iptables (nao ufw)
iptables -I INPUT -p tcp --dport 22  -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 80  -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
echo "Firewall: portas 22, 80, 443 abertas"

# Clona repositório
if [ ! -d /opt/clinicai/.git ]; then
  git clone https://github.com/ronaldokanx-ship-it/atendai-agendai.git /opt/clinicai
  echo "Repositorio clonado"
else
  cd /opt/clinicai && git pull origin main
  echo "Repositorio atualizado"
fi
chown -R ubuntu:ubuntu /opt/clinicai

# Copia .env.prod
cp /tmp/.env.prod /opt/clinicai/.env.prod
chown ubuntu:ubuntu /opt/clinicai/.env.prod
chmod 600 /opt/clinicai/.env.prod
echo ".env.prod copiado"

echo "=== [VM1] Setup concluido! ==="
