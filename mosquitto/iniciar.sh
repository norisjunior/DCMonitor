#!/bin/sh
# Inicia o Mosquitto. Na primeira subida (sem dynamic-security.json), cria o
# cliente administrador e o papel de ingestão antes de abrir as portas.
#
# Papéis criados aqui:
#   admin     (do plugin) administra credenciais por $CONTROL/dynamic-security
#   ingestao  lê fdctmon/# e poderá publicar comandos em fdctmon/+/cmd
# O cliente MQTT_ADMIN_USER (Node-RED) recebe os dois.
#
# Os papéis de cada placa (disp-<device_id>) são criados pelo Node-RED ao gerar
# a credencial na página /admin/.

set -eu

ARQUIVO=/mosquitto/seguranca/dynamic-security.json
: "${MQTT_ADMIN_USER:?MQTT_ADMIN_USER obrigatório}"
: "${MQTT_ADMIN_PASSWORD:?MQTT_ADMIN_PASSWORD obrigatório}"

# O administrador também autentica na porta 8883, exposta às redes das placas:
# senha de exemplo ou curta é recusada.
case "$MQTT_ADMIN_PASSWORD" in
  TROQUE_*) echo "[iniciar] defina MQTT_ADMIN_PASSWORD no .env (openssl rand -base64 32)" >&2; exit 1 ;;
esac
if [ "${#MQTT_ADMIN_PASSWORD}" -lt 24 ]; then
  echo "[iniciar] MQTT_ADMIN_PASSWORD precisa de ao menos 24 caracteres (openssl rand -base64 32)" >&2
  exit 1
fi

# Credenciais dos clientes de linha de comando em arquivo, não em argumentos:
# argumentos de processos do container aparecem no ps do host. Usadas pelo
# healthcheck do Compose e pelos comandos abaixo.
mkdir -p /root/.config
umask 077
printf -- '-u %s\n-P %s\n' "$MQTT_ADMIN_USER" "$MQTT_ADMIN_PASSWORD" > /root/.config/mosquitto_pub
printf -- '-u %s\n-P %s\n' "$MQTT_ADMIN_USER" "$MQTT_ADMIN_PASSWORD" > /root/.config/mosquitto_sub
printf -- '-u %s\n-P %s\n-h 127.0.0.1\n-p 1885\n' "$MQTT_ADMIN_USER" "$MQTT_ADMIN_PASSWORD" > /root/.config/mosquitto_ctrl
umask 022

if [ ! -f "$ARQUIVO" ]; then
  # Tudo é preparado num arquivo temporário e só vira o definitivo no fim:
  # uma interrupção no meio é refeita por inteiro na próxima subida.
  TEMP="$ARQUIVO.inicial"
  rm -f "$TEMP"
  echo "[iniciar] criando $ARQUIVO"
  mosquitto_ctrl dynsec init "$TEMP" "$MQTT_ADMIN_USER" "$MQTT_ADMIN_PASSWORD" >/dev/null
  chown mosquitto:mosquitto "$TEMP"
  chmod 0600 "$TEMP"

  # Broker temporário, só em 127.0.0.1, para aplicar os papéis base.
  cat > /tmp/inicial.conf <<EOF
per_listener_settings false
allow_anonymous false
plugin /usr/lib/mosquitto_dynamic_security.so
plugin_opt_config_file $TEMP
listener 1885 127.0.0.1
EOF
  mosquitto -c /tmp/inicial.conf &
  pid=$!

  ctrl() {
    saida=$(mosquitto_ctrl dynsec "$@" 2>&1) || { echo "[iniciar] falhou: $* -> $saida" >&2; kill "$pid"; exit 1; }
    case "$saida" in
      *rror*) echo "[iniciar] falhou: $* -> $saida" >&2; kill "$pid"; exit 1 ;;
    esac
  }

  tentativas=0
  until mosquitto_ctrl dynsec listRoles >/dev/null 2>&1; do
    tentativas=$((tentativas + 1))
    [ "$tentativas" -gt 50 ] && { echo "[iniciar] broker temporário não respondeu" >&2; kill "$pid"; exit 1; }
    sleep 0.2
  done

  ctrl createRole ingestao
  ctrl addRoleACL ingestao subscribePattern 'fdctmon/#' allow
  ctrl addRoleACL ingestao publishClientSend 'fdctmon/+/cmd' allow
  ctrl addClientRole "$MQTT_ADMIN_USER" ingestao

  kill "$pid"
  wait "$pid" 2>/dev/null || true
  mv "$TEMP" "$ARQUIVO"
  echo "[iniciar] credenciais base criadas"
fi

exec mosquitto -c /mosquitto/config/mosquitto.conf
