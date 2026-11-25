#!/usr/bin/env bash
# Gera a CA do DCMonitor (uma vez) e emite o certificado TLS do Mosquitto.
#
# Uso, na raiz do repositório no servidor:
#   bash scripts/gerar_certificados.sh
#
# Variáveis opcionais (separe vários valores por espaço):
#   MQTT_TLS_NOMES  nomes DNS do servidor  (padrão: vplviot.ctn.fundacentro.intra)
#   MQTT_TLS_IPS    IPs do servidor        (padrão: 10.32.8.115)
#
# Saídas:
#   pki/ca/ca.key, pki/ca/ca.crt   CA; a chave é o segredo mais sensível da
#                                  instalação: guarde uma cópia em cofre
#   pki/mosquitto/                 ca.crt, server.crt e server.key, montados
#                                  no container do Mosquitto
#   ESP32/include/ca_cert.hpp      certificado público da CA para o firmware
#
# Rodar de novo renova só o certificado do servidor, com a mesma CA: as placas
# não precisam ser regravadas. Uma CA nova (apagar pki/ca) exige gerar o
# ca_cert.hpp de novo e regravar todas as placas.

set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

NOMES="${MQTT_TLS_NOMES:-vplviot.ctn.fundacentro.intra}"
IPS="${MQTT_TLS_IPS:-10.32.8.115}"
DIAS_CA=3650
DIAS_SERVIDOR=825
UID_MOSQUITTO=1883

CA_DIR=pki/ca
SRV_DIR=pki/mosquitto
HPP=ESP32/include/ca_cert.hpp

command -v openssl >/dev/null || { echo "openssl não encontrado." >&2; exit 1; }
mkdir -p "$CA_DIR/emitidos" "$SRV_DIR"

if [ -f "$CA_DIR/ca.crt" ] && [ ! -f "$CA_DIR/ca.key" ]; then
  # A chave pode ter sido guardada fora do servidor. Criar outra CA aqui
  # obrigaria a regravar todas as placas, então o script para.
  echo "[ca] $CA_DIR/ca.crt existe, mas $CA_DIR/ca.key não. Devolva a chave da CA" >&2
  echo "     para renovar o certificado do servidor. Para criar uma CA nova de" >&2
  echo "     propósito (todas as placas serão regravadas), apague $CA_DIR antes." >&2
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
# certificado, então cada IP entra também como DNS. Os nomes internos
# mosquitto e localhost servem a conexões de dentro do servidor.
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
trap 'rm -f "$cfg" "$SRV_DIR/server.csr"' EXIT
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

echo "[servidor] emitindo certificado do Mosquitto (validade de $DIAS_SERVIDOR dias)"
openssl req -newkey rsa:2048 -nodes -sha256 \
  -keyout "$SRV_DIR/server.key" -out "$SRV_DIR/server.csr" \
  -subj "/O=DCMonitor/CN=$(echo "$NOMES" | awk '{print $1}')" 2>/dev/null
openssl ca -batch -config "$cfg" -extensions servidor \
  -days "$DIAS_SERVIDOR" \
  -in "$SRV_DIR/server.csr" -out "$SRV_DIR/server.crt" -notext 2>/dev/null
cp "$CA_DIR/ca.crt" "$SRV_DIR/ca.crt"

# O Mosquitto roda como o usuário mosquitto (UID 1883) dentro do container.
chmod 644 "$SRV_DIR/ca.crt" "$SRV_DIR/server.crt"
chmod 640 "$SRV_DIR/server.key"
if [ "$(id -u)" = "0" ]; then
  chown "$UID_MOSQUITTO:$UID_MOSQUITTO" "$SRV_DIR/server.key"
else
  echo "[aviso] rode como root, ou ajuste o dono de $SRV_DIR/server.key para o UID $UID_MOSQUITTO" >&2
fi
chmod 755 pki "$SRV_DIR"

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
openssl x509 -in "$SRV_DIR/server.crt" -noout -subject -startdate -enddate -ext subjectAltName
echo
echo "Pronto. Próximos passos:"
echo "  1. docker compose restart mosquitto"
echo "  2. Recompile e grave o firmware se $HPP mudou (CA nova)."
echo "  3. Guarde uma cópia de $CA_DIR/ca.key em local seguro."
