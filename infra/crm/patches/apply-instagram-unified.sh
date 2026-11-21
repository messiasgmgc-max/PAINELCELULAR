#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# PhoneCenterCRM — Instalador Idempotente do Instagram Unified Login na VPS
# Uso: bash apply-instagram-unified.sh <INSTAGRAM_CONFIG_ID> [CRM_DIR]
# Não altera Coolify, Traefik, Evolution API, Postgres ou app.phonecenter.tech.
# =============================================================================

CRM_DIR="${2:-/opt/phonecenter-crm}"
ENV_FILE="$CRM_DIR/.env"
COMPOSE_FILE="$CRM_DIR/docker-compose.yml"
PATCH_FILE="$CRM_DIR/patches/instagram_unified_login.rb"

CONFIG_ID="${1:-}"
if [ -z "$CONFIG_ID" ] && [ -f "$ENV_FILE" ]; then
  CONFIG_ID="$(grep -E '^INSTAGRAM_CONFIG_ID=' "$ENV_FILE" | tail -n 1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]' || true)"
fi

if [ -z "$CONFIG_ID" ]; then
  if [ -t 0 ]; then
    read -r -p "Informe o INSTAGRAM_CONFIG_ID gerado na Meta (API setup with Unified login): " CONFIG_ID
  fi
fi

CONFIG_ID="$(echo "${CONFIG_ID:-}" | tr -d '[:space:]')"
if [ -z "$CONFIG_ID" ]; then
  echo "[ERRO] INSTAGRAM_CONFIG_ID é obrigatório."
  echo "Uso: bash apply-instagram-unified.sh <INSTAGRAM_CONFIG_ID>"
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "[ERRO] Compose não encontrado em $COMPOSE_FILE"
  exit 1
fi

if [ ! -f "$PATCH_FILE" ]; then
  echo "[ERRO] Patch não encontrado em $PATCH_FILE"
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
cp "$COMPOSE_FILE" "$COMPOSE_FILE.bak.$TS"
echo "[OK] Backup criado em $COMPOSE_FILE.bak.$TS"

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

python3 - "$ENV_FILE" "$CONFIG_ID" "$COMPOSE_FILE" << 'PYEOF'
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
config_id = sys.argv[2].strip()
compose_path = Path(sys.argv[3])

# 1. Atualiza apenas variaveis do Unified Login no .env sem mexer nos outros segredos
env_lines = env_path.read_text(encoding='utf-8').splitlines() if env_path.exists() else []
updates = {
    'INSTAGRAM_CONFIG_ID': config_id,
}
defaults = {
    'INSTAGRAM_UNIFIED_APP_ID': '',
    'INSTAGRAM_UNIFIED_APP_SECRET': '',
    'INSTAGRAM_UNIFIED_API_VERSION': 'v25.0',
}

seen = set()
new_env_lines = []
for line in env_lines:
    stripped = line.strip()
    if stripped and not stripped.startswith('#') and '=' in line:
        k = line.split('=', 1)[0].strip()
        if k in updates:
            new_env_lines.append(f"{k}={updates[k]}")
            seen.add(k)
            continue
        seen.add(k)
    new_env_lines.append(line)

for k, v in updates.items():
    if k not in seen:
        new_env_lines.append(f"{k}={v}")
for k, v in defaults.items():
    if k not in seen:
        new_env_lines.append(f"{k}={v}")

env_path.write_text("\n".join(new_env_lines).rstrip() + "\n", encoding='utf-8')
print(f"[OK] .env atualizado com INSTAGRAM_CONFIG_ID={config_id}")

# 2. Atualiza evocrm_crm e evocrm_crm_sidekiq no docker-compose.yml (mount + envs)
compose_text = compose_path.read_text(encoding='utf-8')
mount_line = "- ./patches/instagram_unified_login.rb:/app/config/initializers/instagram_unified_login.rb:ro"
env_entries = [
    ("INSTAGRAM_CONFIG_ID", "${INSTAGRAM_CONFIG_ID:-}"),
    ("INSTAGRAM_UNIFIED_APP_ID", "${INSTAGRAM_UNIFIED_APP_ID:-}"),
    ("INSTAGRAM_UNIFIED_APP_SECRET", "${INSTAGRAM_UNIFIED_APP_SECRET:-}"),
    ("INSTAGRAM_UNIFIED_API_VERSION", "${INSTAGRAM_UNIFIED_API_VERSION:-v25.0}"),
]

lines = compose_text.splitlines()

def patch_service(all_lines, service_name):
    start_idx = None
    for idx, ln in enumerate(all_lines):
        if ln.strip() == f"{service_name}:" and ln.startswith("  "):
            start_idx = idx
            break
    if start_idx is None:
        raise RuntimeError(f"Serviço {service_name} não encontrado no {compose_path}")

    end_idx = len(all_lines)
    for idx in range(start_idx + 1, len(all_lines)):
        ln = all_lines[idx]
        if ln.strip() and not ln.startswith("    ") and not ln.strip().startswith("#"):
            end_idx = idx
            break

    block = all_lines[start_idx:end_idx]

    # Garante volume do initializer dentro de volumes:
    block_str = "\n".join(block)
    if mount_line not in block_str:
        inserted = False
        for i, b in enumerate(block):
            if b.strip() == "volumes:":
                block.insert(i + 1, f"      {mount_line}")
                inserted = True
                break
        if not inserted:
            raise RuntimeError(f"Bloco volumes: não encontrado em {service_name}")

    # Garante envs do Unified Login dentro de environment:
    block_str = "\n".join(block)
    env_pos = None
    for i, b in enumerate(block):
        if b.strip() == "environment:":
            env_pos = i
            break
    if env_pos is None:
        raise RuntimeError(f"Bloco environment: não encontrado em {service_name}")

    insert_at = env_pos + 1
    for j in range(env_pos + 1, len(block)):
        if block[j].startswith("      "):
            insert_at = j + 1
        elif block[j].strip():
            break

    for key, val in env_entries:
        if f"{key}:" not in block_str:
            block.insert(insert_at, f'      {key}: "{val}"')
            insert_at += 1

    return all_lines[:start_idx] + block + all_lines[end_idx:]

lines = patch_service(lines, "evocrm_crm")
lines = patch_service(lines, "evocrm_crm_sidekiq")
compose_path.write_text("\n".join(lines).rstrip() + "\n", encoding='utf-8')
print("[OK] docker-compose.yml atualizado para evocrm_crm e evocrm_crm_sidekiq")
PYEOF

cd "$CRM_DIR"
echo "[INFO] Reiniciando apenas evocrm_crm e evocrm_crm_sidekiq..."
docker compose up -d evocrm_crm evocrm_crm_sidekiq

echo "[INFO] Aguardando evocrm_crm ficar pronto (até 90s)..."
for i in $(seq 1 18); do
  if docker exec evocrm_crm sh -c "curl -sf http://127.0.0.1:3000/health/live >/dev/null 2>&1 || wget -qO- http://127.0.0.1:3000/health/live >/dev/null 2>&1"; then
    echo "[OK] evocrm_crm saudável!"
    break
  fi
  sleep 5
  if [ "$i" -eq 18 ]; then
    echo "[AVISO] Health check demorou mais que 90s; checando patch mesmo assim..."
  fi
done

echo "[INFO] Executando smoke-check Rails do PhoneCenter::InstagramUnified..."
docker exec evocrm_crm bundle exec rails runner '
  puts "enabled=#{PhoneCenter::InstagramUnified.enabled?}"
  puts "channel_unified_method=#{Channel::Instagram.instance_methods.include?(:unified_login?)}"
  puts "client_id_present=#{PhoneCenter::InstagramUnified.client_id.present?}"
  puts "client_secret_present=#{PhoneCenter::InstagramUnified.client_secret.present?}"
  puts "api_version=#{PhoneCenter::InstagramUnified.api_version}"
'

echo "[CONCLUÍDO] Instagram Unified Login ativo no EvoCRM!"
