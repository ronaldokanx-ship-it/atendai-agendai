#Requires -Version 5.1
param(
    [string]$InstanceName = "clinicai-api",
    [string]$OutputSuffix = ""   # ex: "-vm2" para salvar oracle-instance-vm2.txt
)

$OCI_EXE = "$env:USERPROFILE\AppData\Local\Programs\Python\Python313\Scripts\oci.exe"
if (-not (Test-Path $OCI_EXE)) {
    $found = Get-Command oci -ErrorAction SilentlyContinue
    if ($found) { $OCI_EXE = $found.Source }
    else { Write-Host "[ERRO] oci.exe nao encontrado." -ForegroundColor Red; exit 1 }
}

$REGIONS          = @("sa-saopaulo-1")
$REGION           = $REGIONS[0]   # regiao ativa no momento
$INSTANCE_NAME    = $InstanceName
# x86 AMD Always Free (sem shape_config — OCPU/RAM são fixos: 1 OCPU / 1 GB)
$SHAPE            = "VM.Standard.E2.1.Micro"
$OCPUS            = 1          # ignorado para E2.1.Micro (fixo), mas passado ao script
$MEMORY_GB        = 1          # ignorado para E2.1.Micro (fixo)
$BOOT_VOLUME_GB   = 50
$OS_IMAGE_NAME    = "Canonical Ubuntu"
$OS_IMAGE_VERSION = "22.04"
$LOG_FILE         = "$PSScriptRoot\oracle-retry$OutputSuffix.log"
$MAX_HOURS        = 24
$RETRY_INTERVAL_S = 60
$SSH_KEY_PATH     = "$env:USERPROFILE\.ssh\clinicai_oracle.pub"

$ErrorActionPreference = "Continue"
$startTime = Get-Date
$deadline  = $startTime.AddHours($MAX_HOURS)

function Write-Log {
    param([string]$Msg, [string]$Color = "White")
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$ts] $Msg"
    Write-Host $line -ForegroundColor $Color
    Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8
}

function ConvertFrom-OciOutput {
    param([string[]]$Output)
    $combined = ($Output -join "`n")
    $start = $combined.IndexOf('{')
    if ($start -lt 0) { return $null }
    return ($combined.Substring($start)) | ConvertFrom-Json
}

function Initialize-OciConfig {
    $configPath = "$env:USERPROFILE\.oci\config"
    if (-not (Test-Path $configPath)) {
        Write-Log "Config OCI nao encontrada. Iniciando setup..." Yellow
        & $OCI_EXE setup config
        if ($LASTEXITCODE -ne 0) { Write-Log "Falha no setup OCI." Red; exit 1 }
    } else {
        Write-Log "Config OCI: $configPath" Green
    }
}

function Initialize-SshKey {
    if (-not (Test-Path $SSH_KEY_PATH)) {
        $priv = $SSH_KEY_PATH -replace "\.pub$", ""
        Write-Log "Gerando chave SSH em $priv ..." Yellow
        New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.ssh" | Out-Null
        ssh-keygen -t rsa -b 4096 -f $priv -N '""' -q
        Write-Log "Chave gerada: $SSH_KEY_PATH" Green
    } else {
        Write-Log "Chave SSH: $SSH_KEY_PATH" Green
    }
    return (Get-Content $SSH_KEY_PATH -Raw).Trim()
}

function Get-TenancyOcid {
    $configPath = "$env:USERPROFILE\.oci\config"
    $line = Get-Content $configPath | Where-Object { $_ -match "^tenancy\s*=" } | Select-Object -First 1
    if (-not $line) { Write-Log "ERRO: tenancy OCID nao encontrado na config." Red; exit 1 }
    $ocid = ($line -split "=", 2)[1].Trim()
    Write-Log "Tenancy: $ocid" Green
    return $ocid
}

function Get-OrCreateSubnetOcid {
    param([string]$CompartmentId)

    Write-Log "Buscando subnets..." Cyan
    $raw = & $OCI_EXE network subnet list --compartment-id $CompartmentId --region $REGION --all 2>&1
    try {
        $data = (ConvertFrom-OciOutput $raw).data
        $s = $data | Where-Object { $_.'lifecycle-state' -eq 'AVAILABLE' } | Select-Object -First 1
        if ($s) { Write-Log "Subnet existente: $($s.'display-name')" Green; return $s.id }
    } catch {}

    Write-Log "Nenhuma subnet. Buscando VCNs..." Yellow
    $raw = & $OCI_EXE network vcn list --compartment-id $CompartmentId --region $REGION --all 2>&1
    $vcnId = $null
    try {
        $data = (ConvertFrom-OciOutput $raw).data
        $v = $data | Where-Object { $_.'lifecycle-state' -eq 'AVAILABLE' } | Select-Object -First 1
        if ($v) { $vcnId = $v.id; Write-Log "VCN existente: $($v.'display-name')" Green }
    } catch {}

    if (-not $vcnId) {
        Write-Log "Criando VCN clinicai-vcn..." Cyan
        $raw = & $OCI_EXE network vcn create `
            --compartment-id $CompartmentId `
            --cidr-block "10.0.0.0/16" `
            --display-name "clinicai-vcn" `
            --region $REGION 2>&1
        try {
            $vcnId = (ConvertFrom-OciOutput $raw).data.id
            Write-Log "VCN criada: $vcnId" Green
        } catch {
            Write-Log "ERRO ao criar VCN: $raw" Red; exit 1
        }

        Write-Log "Criando Internet Gateway..." Cyan
        $raw = & $OCI_EXE network internet-gateway create `
            --compartment-id $CompartmentId `
            --vcn-id $vcnId `
            --is-enabled true `
            --display-name "clinicai-igw" `
            --region $REGION 2>&1
        $igwId = $null
        try { $igwId = (ConvertFrom-OciOutput $raw).data.id; Write-Log "IGW: $igwId" Green } catch {
            Write-Log "AVISO: falha ao criar IGW." Yellow
        }

        if ($igwId) {
            Write-Log "Atualizando route table..." Cyan
            $raw = & $OCI_EXE network route-table list `
                --compartment-id $CompartmentId `
                --vcn-id $vcnId --region $REGION --all 2>&1
            try {
                $rt = (ConvertFrom-OciOutput $raw).data | Select-Object -First 1
                if ($rt) {
                    $rules = @(@{ destination = "0.0.0.0/0"; destinationType = "CIDR_BLOCK"; networkEntityId = $igwId }) | ConvertTo-Json -Compress -AsArray
                    & $OCI_EXE network route-table update `
                        --rt-id $rt.id --route-rules $rules `
                        --region $REGION --force 2>&1 | Out-Null
                    Write-Log "Route table atualizada." Green
                }
            } catch {}
        }
    }

    Write-Log "Criando subnet clinicai-subnet..." Cyan
    $raw = & $OCI_EXE network subnet create `
        --compartment-id $CompartmentId `
        --vcn-id $vcnId `
        --cidr-block "10.0.0.0/24" `
        --display-name "clinicai-subnet" `
        --region $REGION 2>&1
    try {
        $subId = (ConvertFrom-OciOutput $raw).data.id
        Write-Log "Subnet criada: $subId" Green
        return $subId
    } catch {
        Write-Log "ERRO ao criar subnet: $raw" Red; exit 1
    }
}

function Get-ImageOcid {
    param([string]$CompartmentId)
    Write-Log "Buscando imagem $OS_IMAGE_NAME $OS_IMAGE_VERSION x86_64 (AMD)..." Cyan
    $raw = & $OCI_EXE compute image list `
        --compartment-id $CompartmentId `
        --region $REGION `
        --operating-system $OS_IMAGE_NAME `
        --operating-system-version $OS_IMAGE_VERSION `
        --sort-by TIMECREATED `
        --sort-order DESC 2>&1
    try {
        $all = (ConvertFrom-OciOutput $raw).data
        # Para x86 E2.1.Micro: prefer imagens sem "aarch64" (i.e., x86_64)
        $img = $all | Where-Object { $_.'display-name' -notmatch 'aarch64' } | Select-Object -First 1
        if (-not $img) { $img = $all | Select-Object -First 1 }
        if ($img) { Write-Log "Imagem: $($img.'display-name')" Green; return $img.id }
    } catch {}
    Write-Log "ERRO: Imagem nao encontrada! Output: $raw" Red
    exit 1
}

function Get-AvailabilityDomainList {
    param([string]$CompartmentId)
    Write-Log "Buscando Availability Domains..." Cyan
    $raw = & $OCI_EXE iam availability-domain list --compartment-id $CompartmentId --region $REGION 2>&1
    try {
        $names = (ConvertFrom-OciOutput $raw).data | ForEach-Object { $_.name }
        Write-Log "ADs: $($names -join ', ')" Green
        return $names
    } catch {
        Write-Log "ERRO ao buscar ADs: $raw" Red; exit 1
    }
}

function Invoke-CreateInstance {
    param(
        [string]$CompartmentId,
        [string]$SubnetId,
        [string]$ImageId,
        [string]$AvailabilityDomain
    )
    Write-Log "  AD: $AvailabilityDomain ..." Yellow

    $pyExe    = "$env:USERPROFILE\AppData\Local\Programs\Python\Python313\python.exe"
    $pyScript = "$PSScriptRoot\oracle-launch.py"

    $raw      = & $pyExe $pyScript $CompartmentId $SubnetId $ImageId $AvailabilityDomain $SSH_KEY_PATH $SHAPE $OCPUS $MEMORY_GB $BOOT_VOLUME_GB $script:REGION 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        $id = ($raw | Where-Object { $_ -match '^ocid1\.' } | Select-Object -First 1)
        if ($id) { return $id.Trim() }
        Write-Log "  Instancia possivelmente criada - verifique o Console." Yellow
        return "CREATED_CHECK_CONSOLE"
    }

    $err = ($raw -join " ")
    if ($exitCode -eq 2) {
        Write-Log "  Sem capacidade em $AvailabilityDomain." DarkGray
    } elseif ($exitCode -eq 3) {
        Write-Log "  LIMITE: todas as OCPUs A1 em uso. Delete instancias existentes." Red
        exit 1
    } else {
        Write-Log "  Erro ($exitCode): $($err.Substring(0, [Math]::Min(300, $err.Length)))" Red
    }
    return $null
}

# ---- MAIN ----

Clear-Host
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Oracle Cloud x86 AMD - Retry Script (24h)          " -ForegroundColor Cyan
Write-Host "  Regioes: $($REGIONS -join ', ')  Shape: $SHAPE     " -ForegroundColor Cyan
Write-Host "  Deadline: $($deadline.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

Initialize-OciConfig
Initialize-SshKey | Out-Null
$compartmentId = Get-TenancyOcid

# Pre-carrega infra para cada regiao
$regionConfigs = @{}
foreach ($rgn in $REGIONS) {
    $script:REGION = $rgn
    Write-Host ""
    Write-Host "--- Preparando regiao: $rgn ---" -ForegroundColor Cyan
    try {
        $s = Get-OrCreateSubnetOcid -CompartmentId $compartmentId
        $i = Get-ImageOcid          -CompartmentId $compartmentId
        $a = Get-AvailabilityDomainList -CompartmentId $compartmentId
        $regionConfigs[$rgn] = @{ subnet = $s; image = $i; ads = $a }
        Write-Log "Regiao $rgn pronta. ADs: $($a -join ', ')" Green
    } catch {
        Write-Log "AVISO: falha ao preparar $rgn - $_" Yellow
    }
}

if ($regionConfigs.Count -eq 0) {
    Write-Log "Nenhuma regiao disponivel. Abortando." Red; exit 1
}

Write-Host ""
Write-Log "Loop iniciado. Regioes: $($regionConfigs.Keys -join ', '). Intervalo: ${RETRY_INTERVAL_S}s. Ctrl+C para parar." Cyan
Write-Host ""

$attempt = 0
$created = $false

while ((Get-Date) -lt $deadline) {
    $attempt++
    $elapsed   = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
    $remaining = [math]::Round(($deadline - (Get-Date)).TotalHours, 1)
    Write-Log "--- Tentativa #$attempt | ${elapsed}min decorridos | ${remaining}h restantes ---" Cyan

    foreach ($rgn in $REGIONS) {
        if (-not $regionConfigs.ContainsKey($rgn)) { continue }
        $script:REGION = $rgn
        $cfg = $regionConfigs[$rgn]

        foreach ($ad in $cfg.ads) {
            $id = Invoke-CreateInstance `
                -CompartmentId      $compartmentId `
                -SubnetId           $cfg.subnet `
                -ImageId            $cfg.image `
                -AvailabilityDomain $ad

            if ($id) {
                Write-Host ""
                Write-Host "======================================================" -ForegroundColor Green
                Write-Host "  SUCESSO! Instancia criada!                          " -ForegroundColor Green
                Write-Host "======================================================" -ForegroundColor Green
                Write-Log "  OCID:      $id" Green
                Write-Log "  Regiao:    $rgn" Green
                Write-Log "  AD:        $ad" Green
                Write-Log "  Tentativas: $attempt  |  Tempo: ${elapsed}min" Green

                "INSTANCE_OCID=$id`nAVAILABILITY_DOMAIN=$ad`nREGION=$rgn`nCREATED_AT=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`nATTEMPTS=$attempt`nINSTANCE_NAME=$INSTANCE_NAME" |
                    Out-File "$PSScriptRoot\oracle-instance$OutputSuffix.txt" -Encoding UTF8

                Write-Host ""
                Write-Log "Arquivo salvo: $PSScriptRoot\oracle-instance.txt" Green
                Write-Log "PROXIMO PASSO: Oracle Console -> Compute -> Instances -> anote o IP" Yellow
                $created = $true
                break
            }
        }
        if ($created) { break }
    }
    if ($created) { break }

    Write-Log "Sem capacidade em todas as regioes. Aguardando ${RETRY_INTERVAL_S}s..." DarkGray
    Start-Sleep -Seconds $RETRY_INTERVAL_S
}

if (-not $created) {
    Write-Log "Timeout 24h atingido sem sucesso." Red
    Write-Log "Opcoes: 1) Execute de novo (madrugada tem mais capacidade)" Yellow
    Write-Log "        2) Tente 1 OCPU + 6 GB no oracle-retry.ps1 (\$OCPUS=1, \$MEMORY_GB=6)" Yellow
}