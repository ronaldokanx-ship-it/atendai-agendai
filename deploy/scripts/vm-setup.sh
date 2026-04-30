#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  deploy/scripts/vm-setup.sh
#  Setup inicial de uma VM Oracle Cloud Ubuntu 22.04 (x86 AMD)
#
#  Execute APÓS provisionar a VM:
#    ssh -i ~/.ssh/clinicai_oracle ubuntu@<VM_IP> "bash -s" < deploy/scripts/vm-setup.sh
#
#  O que faz:
#    1. Atualiza pacotes Ubuntu
#    2. Instala Docker CE + Docker Compose v2
#    3. Habilita firewall (portas 22, 80, 443)
#    4. Clona o repositório em /opt/clinicai
#    5. Configura renovação automática de SSL
# ─────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $1"; }

GITHUB_REPO="${GITHUB_REPO:-https://github.com/ronaldokanx-ship-it/atendai-agendai.git}"
DEPLOY_DIR="/opt/clinicai"
UBUNTU_USER="ubuntu"

info "=== Iniciando setup VM Oracle Cloud ==="

# ── 1. Atualiza sistema ───────────────────────────────────────
info "Atualizando pacotes..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    curl wget git htop unzip \
    ca-certificates gnupg lsb-release

# ── 2. Instala Docker CE ──────────────────────────────────────
info "Instalando Docker CE..."
if ! command -v docker &>/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list

    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
    usermod -aG docker "$UBUNTU_USER"
    info "Docker $(docker --version) instalado."
else
    info "Docker já instalado: $(docker --version)"
fi

# ── 3. Firewall via iptables (Oracle Cloud usa iptables, não ufw) ─
info "Configurando firewall..."
# Oracle Cloud requer regras no nível da VCN também (security list).
# Aqui configuramos o firewall do SO como segunda camada.
iptables -I INPUT -p tcp --dport 22 -j ACCEPT  2>/dev/null || true
iptables -I INPUT -p tcp --dport 80 -j ACCEPT  2>/dev/null || true
iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
# Salva regras para persistência
apt-get install -y -qq iptables-persistent || true
netfilter-persistent save 2>/dev/null || true

# ── 4. Clona repositório ──────────────────────────────────────
info "Clonando repositório em $DEPLOY_DIR..."
mkdir -p "$(dirname $DEPLOY_DIR)"
if [[ -d "$DEPLOY_DIR/.git" ]]; then
    info "Repositório já existe. Atualizando..."
    cd "$DEPLOY_DIR" && git pull origin main
else
    git clone "$GITHUB_REPO" "$DEPLOY_DIR"
fi
chown -R "$UBUNTU_USER:$UBUNTU_USER" "$DEPLOY_DIR"

# ── 5. Configura swap (necessário com 1 GB RAM) ───────────────
info "Configurando swap (1 GB)..."
if ! swapon --show | grep -q "/swapfile"; then
    fallocate -l 1G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
    sysctl vm.swappiness=10
    echo "vm.swappiness=10" >> /etc/sysctl.conf
    info "Swap de 1 GB configurado."
fi

# ── 6. Instala fail2ban (proteção SSH) ───────────────────────
info "Instalando fail2ban..."
apt-get install -y -qq fail2ban
systemctl enable --now fail2ban

# ── 7. Configurações finais ───────────────────────────────────
info "Desabilitando serviços desnecessários..."
systemctl disable --now snapd.service 2>/dev/null || true
systemctl disable --now snapd.socket  2>/dev/null || true

echo ""
info "=== Setup concluído! ==="
info ""
info "Próximos passos:"
info "1. Copie seu .env.prod para $DEPLOY_DIR/.env.prod"
info "   scp .env.prod ubuntu@<IP>:$DEPLOY_DIR/.env.prod"
info ""
info "2. Emita certificado SSL (substitua SEU_DOMINIO):"
info "   cd $DEPLOY_DIR && bash deploy/scripts/deploy-vm1.sh --ssl"
info "   # OU para VM2:"
info "   cd $DEPLOY_DIR && bash deploy/scripts/deploy-vm2.sh --ssl"
info ""
info "3. Inicie os serviços:"
info "   cd $DEPLOY_DIR && bash deploy/scripts/deploy-vm1.sh --build"
info "   # OU para VM2:"
info "   cd $DEPLOY_DIR && bash deploy/scripts/deploy-vm2.sh"
warn ""
warn "LEMBRETE: Configure as Security Lists no Oracle Console para liberar"
warn "as portas 80 e 443 na VCN (Networking > Virtual Cloud Networks > Security Lists)"
