#!/usr/bin/env bash
# Gera a CA do DCMonitor (uma vez) e emite os certificados TLS do Mosquitto
# (MQTT, porta 8883) e do Node-RED (editor e página /admin/, porta 1880).
#
# Uso, na raiz do repositório no servidor, como root:
#   bash scripts/gerar_certificados.sh
#
# Variáveis opcionais (separe vários valores por espaço):
#   MQTT_TLS_NOMES  nomes DNS do servidor  (padrão: vplviot.ctn.fundacentro.intra)
#   MQTT_TLS_IPS    IPs do servidor        (padrão: 10.32.8.115)
#
# Saídas:
#   pki/ca/ca.key, pki/ca/ca.crt   CA; a chave é o segredo mais sensível da
#                                  instalação: guarde-a fora do servidor
#                                  (docs/DEPLOY_PROD.md, "Chave da CA")
#   pki/mosquitto/                 ca.crt, server.crt e server.key do broker
#   pki/node-red/                  ca.crt, server.crt e server.key do Node-RED
#   ESP32/include/ca_cert.hpp      certificado público da CA para o firmware
#
# Rodar de novo renova só os certificados de servidor, com a mesma CA: as
# placas não precisam ser regravadas e os navegadores continuam confiando.
# Uma CA nova (apagar pki/ca) exige gerar o ca_cert.hpp de novo, regravar
# todas as placas e instalar a CA nova nos navegadores.

set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

NOMES="${MQTT_TLS_NOMES:-vplviot.ctn.fundacentro.intra}"
IPS="${MQTT_TLS_IPS:-10.32.8.115}"
DIAS_CA=3650
DIAS_SERVIDOR=825
UID_MOSQUITTO=1883
UID_NODE_RED=1000

CA_DIR=pki/ca
HPP=ESP32/include/ca_cert.hpp

command -v openssl >/dev/null || { echo "openssl não encontrado." >&2; exit 1; }
mkdir -p "$CA_DIR/emitidos"

if [ -f "$CA_DIR/ca.crt" ] && [ ! -f "$CA_DIR/ca.key" ]; then
  # A chave pode ter sido guardada fora do servidor. Criar outra CA aqui
  # obrigaria a regravar todas as placas, então o script para.
  echo "[ca] $CA_DIR/ca.crt existe, mas $CA_DIR/ca.key não. Devolva a chave da CA" >&2
  echo "     para renovar os certificados (docs/DEPLOY_PROD.md, \"Chave da CA\")." >&2
  echo "     Para criar uma CA nova de propósito (todas as placas serão" >&2
  echo "     regravadas), apague $CA_DIR antes." >&2
  exit 1
fi

if [ ! -f "$CA_DIR/ca.key" ]; then
  echo "[ca] criando a CA do DCMonitor (validade de $DIAS_CA dias)"
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days "$DIAS_CA" \
    -keyout "$CA_DIR/ca.key" -out "$CA_DIR/ca.crt" \
    -subj "/O=DCMonitor/CN=DCMonitor CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  : > "$CA_DIR/index.txt"
  openssl rand -hex 16 > "$CA_DIR/serial"
else
  echo "[ca] usando a CA existente em $CA_DIR"
fi

# O mbedTLS do ESP32 (2.28) compara o host apenas com entradas DNS do
# certificado, então cada IP entra também como DNS. mosquitto e localhost
# servem a conexões de dentro do servidor (Node-RED, healthchecks).
san=""
n=0
for nome in $NOMES mosquitto localhost $IPS; do
  n=$((n + 1)); san="${san}DNS.$n = $nome"$'\n'
done
n=0
for ip in $IPS 127.0.0.1; do
  n=$((n + 1)); san="${san}IP.$n = $ip"$'\n'
done

cfg=$(mktemp)
csr=$(mktemp)
trap 'rm -f "$cfg" "$csr"' EXIT
cat > "$cfg" <<EOF
[ ca ]
default_ca = dcmonitor

[ dcmonitor ]
dir           = $CA_DIR
database      = \$dir/index.txt
serial        = \$dir/serial
new_certs_dir = \$dir/emitidos
certificate   = \$dir/ca.crt
private_key   = \$dir/ca.key
default_md    = sha256
policy        = politica
unique_subject = no
copy_extensions = none

[ politica ]
commonName = supplied

[ servidor ]
basicConstraints = critical,CA:FALSE
keyUsage         = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName   = @nomes

[ nomes ]
$san
EOF

# emitir <diretório> <UID dono da chave> <descrição>
# Cada serviço tem chave própria, legível só pelo usuário do seu container.
emitir() {
  local dir="$1" uid="$2" descricao="$3"
  mkdir -p "$dir"
  echo "[servidor] emitindo certificado do $descricao (validade de $DIAS_SERVIDOR dias)"
  openssl req -newkey rsa:2048 -nodes -sha256 \
    -keyout "$dir/server.key" -out "$csr" \
    -subj "/O=DCMonitor/CN=$(echo "$NOMES" | awk '{print $1}')" 2>/dev/null
  openssl ca -batch -config "$cfg" -extensions servidor \
    -days "$DIAS_SERVIDOR" \
    -in "$csr" -out "$dir/server.crt" -notext 2>/dev/null
  cp "$CA_DIR/ca.crt" "$dir/ca.crt"
  chmod 644 "$dir/ca.crt" "$dir/server.crt"
  chmod 640 "$dir/server.key"
  if [ "$(id -u)" = "0" ]; then
    chown "$uid:$uid" "$dir/server.key"
  else
    echo "[aviso] rode como root, ou ajuste o dono de $dir/server.key para o UID $uid" >&2
  fi
  chmod 755 "$dir"
}

emitir pki/mosquitto "$UID_MOSQUITTO" "Mosquitto"
emitir pki/node-red "$UID_NODE_RED" "Node-RED"
chmod 755 pki

{
  echo '#pragma once'
  echo
  echo '// Certificado público da CA do DCMonitor, gerado por'
  echo '// scripts/gerar_certificados.sh. Não é segredo; é específico desta'
  echo '// instalação e serve a todas as placas. Ignorado pelo Git.'
  echo
  echo 'namespace Certificados {'
  echo
  echo 'constexpr char CA_MQTT[] = R"PEM('"$(cat "$CA_DIR/ca.crt")"
  echo ')PEM";'
  echo
  echo '}  // namespace Certificados'
} > "$HPP"
chmod 644 "$HPP"

echo
openssl x509 -in pki/mosquitto/server.crt -noout -subject -startdate -enddate -ext subjectAltName
echo
echo "Pronto. Próximos passos:"
echo "  1. docker compose restart mosquitto   (o Node-RED recarrega o certificado sozinho)"
echo "  2. Recompile e grave o firmware se $HPP mudou (CA nova)."
echo "  3. Leve $CA_DIR/ca.key para fora do servidor (docs/DEPLOY_PROD.md, \"Chave da CA\")."
