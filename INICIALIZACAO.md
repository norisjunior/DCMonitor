# Inicialização do DCMonitor no Oracle Linux 9

Este é o roteiro curto para a primeira inicialização após clonar o repositório e
preencher o arquivo `.env`.

Servidor atual: `10.32.8.115`. Pasta de instalação: `/IoTPlatform`.

## 0. Confirmar que a instalação anterior saiu por inteiro

Containers e imagens são a parte visível. O que sobrevive a uma limpeza
apressada são os volumes — e um `dcmonitor_node_red_data` antigo faz o Node-RED
ignorar o fluxo provisionado pela imagem, porque `/data` já existe. O sintoma é
subir a stack e encontrar o fluxo anterior na UI.

```bash
docker volume ls | grep dcmonitor
```

Se listar algo e a intenção for mesmo recomeçar:

```bash
docker volume rm dcmonitor_mosquitto_data dcmonitor_influxdb_data \
  dcmonitor_influxdb_config dcmonitor_node_red_data dcmonitor_n8n_data \
  dcmonitor_grafana_data
```

Isso apaga o histórico do InfluxDB, os fluxos editados na UI e os painéis
criados à mão. O cadastro de dispositivos, as credenciais MQTT das placas e os
certificados não estão em volume: ficam no host, em `./cadastro/`,
`./mqtt-seguranca/` e `./pki/`, e só saem se forem apagados à mão. Apagar
`./mqtt-seguranca/` tira todas as placas do broker; apagar `./pki/ca/` obriga a
regravar todas elas.

Quem vem de uma versão anterior às credenciais MQTT por placa precisa recriar ao
menos `dcmonitor_node_red_data`: o `settings.js`, o `flows.json` e o
`flows_cred.json` novos só são copiados para o volume quando ele é criado. As
placas com firmware anterior ao 1.6.0 usam a porta 1883, que não existe mais, e
precisam ser regravadas (passo 11).

Vindo de antes do cadastro de dispositivos, recriar também o InfluxDB é o
caminho mais simples, porque os dados antigos não têm as tags `local` e `nome`
e não aparecem nos filtros do Grafana. Havendo algo a preservar, faça antes o
backup descrito em [docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md).

O nome do projeto é fixo no Compose (`name: dcmonitor`), então os volumes se
chamam `dcmonitor_*` mesmo que a pasta de instalação tenha outro nome.

## 1. Obter o repositório e conferir o ambiente

```bash
git clone https://github.com/norisjunior/DCMonitor.git /IoTPlatform
cd /IoTPlatform
git checkout dcmon2026

docker --version
docker compose version
sudo systemctl enable --now docker
```

O `git checkout` não é opcional: o branch padrão do repositório é `master`, que
contém o projeto FIWARE antigo (`FdctMonSys-*`) e não esta plataforma. Confirme
com `git branch --show-current` antes de seguir.

Se a pasta já existir com o repositório dentro, use `git pull` no lugar do
`clone`. Qualquer outro caminho serve como pasta de instalação.

## 2. Gerar os certificados TLS

As placas conectam no broker só pela porta 8883, com TLS. O script cria a CA
própria do DCMonitor (só na primeira vez), emite o certificado do Mosquitto e
gera o `ESP32/include/ca_cert.hpp` usado no firmware. Rode como root, na raiz do
repositório:

```bash
sudo bash scripts/gerar_certificados.sh
```

O script emite dois certificados, um para o Mosquitto (8883) e outro para o
Node-RED (HTTPS na 1880), com o nome `vplviot.ctn.fundacentro.intra` e o IP
`10.32.8.115`. Para outros valores, use `MQTT_TLS_NOMES` e `MQTT_TLS_IPS` (veja
[docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md)). Ao terminar a instalação, tire
`pki/ca/ca.key` do servidor seguindo "Chave da CA" no mesmo documento: é o
segredo mais sensível da instalação.

## 3. Preparar os diretórios do host

O cadastro de dispositivos (local e nome amigável de cada placa) é o arquivo
`dispositivos.json`, num diretório montado no Node-RED, com dono UID 1000. As
credenciais MQTT das placas (só hashes) ficam em `dynamic-security.json`, num
diretório montado no Mosquitto, com dono UID 1883:

```bash
sudo install -d -o 1000 -g 1000 ./cadastro
sudo install -d -o 1883 -g 1883 ./mqtt-seguranca
```

Use os caminhos de `CADASTRO_DIR` e `MQTT_SEGURANCA_DIR` se tiver mudado os
padrões. O rótulo SELinux é ajustado pelo `:Z` do Compose. Se os arquivos não
existirem, o Node-RED cria um cadastro vazio e o Mosquitto cria as credenciais
base na primeira subida.

## 4. Validar o `.env`

Copie o exemplo e preencha:

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Gere os valores aleatórios com `openssl rand -hex 32` e os hashes com:

```bash
docker run --rm -it --entrypoint node-red nodered/node-red:4.1.11 admin hash-pw
```

Rode o comando duas vezes, com senhas diferentes: uma para o editor do Node-RED
(`NODE_RED_ADMIN_PASSWORD_HASH`) e outra para a página de cadastro de
dispositivos (`CADASTRO_ADMIN_PASSWORD_HASH`). Os dois são obrigatórios; sem eles
o Node-RED não sobe. O hash contém `$`; envolva cada um em aspas simples no
`.env`.

`MQTT_ADMIN_USER` (padrão `node-red`) e `MQTT_ADMIN_PASSWORD` são o login do
Node-RED no broker; o mesmo cliente gera as senhas das placas e também é aceito
na porta 8883. Gere a senha com `openssl rand -base64 32`: o Mosquitto recusa
subir com `TROQUE_*` ou com menos de 24 caracteres.

> A senha de `MQTT_ADMIN_PASSWORD` é gravada no broker na primeira subida. Se
> ela mudar no `.env` depois disso, o Node-RED e o healthcheck do Mosquitto
> deixam de conectar até que a senha seja trocada também no broker (veja
> [mosquitto/README.md](mosquitto/README.md)).

`ZABBIX_SERVER_2` envia os mesmos itens a um segundo servidor Zabbix (padrão
`10.32.8.69`). Se não houver, defina a variável vazia: `ZABBIX_SERVER_2=`.

Depois, valide:

```bash
test -f .env || { echo "ERRO: arquivo .env ausente"; exit 1; }

if grep -n 'TROQUE_' .env; then
  echo "ERRO: ainda existem valores TROQUE_* no .env"
  exit 1
fi

docker compose config -q
```

O último comando não deve apresentar erro. Mantenha:

```env
BIND_ADDRESS=0.0.0.0
```

`0.0.0.0` é somente o endereço de escuta. Para acessar a plataforma, use
`10.32.8.115`.

## 5. Subir a plataforma

```bash
docker compose up -d --build
docker compose ps
```

Na primeira execução, o download e a construção das imagens podem demorar. Rode
`docker compose ps` novamente após um ou dois minutos. Os cinco serviços devem
aparecer como `Up` e, após a inicialização, `healthy`:

- `mosquitto`
- `influxdb`
- `node-red`
- `n8n`
- `grafana`

Na primeira subida, o log do Mosquitto mostra `[iniciar] credenciais base
criadas`:

```bash
docker compose logs mosquitto | grep iniciar
```

## 6. Liberar o firewall e o NTP

Confira se o `firewalld` está ativo:

```bash
sudo firewall-cmd --state
```

Se estiver ativo, esta liberação é simples para homologação em uma rede interna
confiável:

```bash
sudo firewall-cmd --permanent --add-port={8883,1880,3000,5678,8086}/tcp
sudo firewall-cmd --permanent --add-service=ntp
sudo firewall-cmd --reload
```

A porta 1883 não é mais usada; se foi liberada antes, feche-a com
`sudo firewall-cmd --permanent --remove-port=1883/tcp`. Em produção, restrinja
`1880`, `3000`, `5678` e `8086` à rede de gestão e `8883` e o NTP às redes das
placas. A página de cadastro usa a mesma porta `1880`, em HTTPS, e mostra as
senhas MQTT geradas. Não exponha essas portas diretamente à Internet.

As placas pegam a hora do próprio servidor. Em `/etc/chrony.conf`, acrescente:

```text
allow 10.32.8.0/24
allow 172.16.40.0/24
allow 172.16.200.0/23
local stratum 10
```

```bash
sudo systemctl restart chronyd
chronyc sources
```

Com a rede apartada da internet, troque a linha `pool` por um NTP interno ou
remova-a. Detalhes em [docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md).

## 7. Abrir as interfaces

| Serviço | Endereço |
|---|---|
| Grafana | `http://10.32.8.115:3000` |
| Node-RED | `https://10.32.8.115:1880` |
| Cadastro de dispositivos e credenciais MQTT | `https://10.32.8.115:1880/admin/` |
| n8n | `http://10.32.8.115:5678` |
| InfluxDB | `http://10.32.8.115:8086` |
| MQTT das placas (TLS) | `10.32.8.115:8883` |

O Node-RED só responde em HTTPS. Para o navegador não mostrar aviso, instale
`pki/ca/ca.crt` (o certificado público da CA) no computador que acessa a página,
conforme "Confiar na CA nos navegadores" em
[docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md).

Credenciais de primeiro acesso:

- Grafana: `GRAFANA_ADMIN_USER` e `GRAFANA_ADMIN_PASSWORD` do `.env`.
- Node-RED: `NODE_RED_ADMIN_USER` e a senha original usada para gerar o hash.
- Cadastro de dispositivos: `CADASTRO_ADMIN_USER` (padrão `cadastro`) e a senha
  original usada para gerar `CADASTRO_ADMIN_PASSWORD_HASH`.
- InfluxDB: `INFLUXDB_ADMIN_USER` e `INFLUXDB_ADMIN_PASSWORD` do `.env`.
- n8n: crie o usuário proprietário solicitado no primeiro acesso.

Os hashes bcrypt armazenados no `.env` não são as senhas de login.

## 8. Conferir o Zabbix

Com os volumes recriados do zero, o fluxo e as credenciais do InfluxDB e do
broker são aplicados pela imagem: não é preciso importar `flows.json` nem
digitar token ou senha na UI. Confirme na UI do Node-RED que os nós aparecem com
status verde.

O Node-RED, o InfluxDB e o Grafana são provisionados automaticamente, incluindo
o envio ao Zabbix. O que não é provisionado está do lado do Zabbix: cada
dispositivo precisa de um host com o nome igual ao seu `device_id` — por
exemplo `esp32-18B4C0D8CBB0` — e, nele, os itens trapper `temp`, `umid`,
`headindex` e `rssi` antes do teste. Com `ZABBIX_SERVER_2`, repita no segundo
servidor. Veja os detalhes em [node-red/README.md](node-red/README.md).

O n8n sobe sem workflow ativo e não precisa de configuração nesta etapa.

## 9. Testar o MQTT como se fosse um dispositivo

Cada placa só publica no próprio ramo, `fdctmon/{device_id}/...`, com usuário
igual ao `device_id` e senha própria. Para observar o tráfego, assine pela porta
interna 1884, de dentro do container do broker, com o login do Node-RED.

Em um primeiro terminal, deixe o subscriber aberto:

```bash
docker compose exec mosquitto sh -c \
  'mosquitto_sub -p 1884 -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" -t "fdctmon/#" -v'
```

Crie uma credencial de teste: abra `https://10.32.8.115:1880/admin/`, entre com
o login do cadastro, digite o ID fictício `esp32-0000000000A1` em "Placa nova:
ID mostrado na serial" e clique em "Gerar senha". A página só aceita IDs no
formato do firmware, `esp32-` seguido de 12 dígitos hexadecimais maiúsculos. A página mostra uma vez a linha
`credencial esp32-0000000000A1 <senha>`; a senha é o terceiro campo.

Em um segundo terminal, publique uma medição pela porta 8883, com TLS, de
dentro do container do broker (`localhost` está no certificado):

```bash
read -rsp "Senha MQTT de esp32-0000000000A1: " SENHA && echo

docker compose exec mosquitto mosquitto_pub \
  --cafile /mosquitto/certs/ca.crt -h localhost -p 8883 \
  -u esp32-0000000000A1 -P "$SENHA" \
  -t fdctmon/esp32-0000000000A1/data \
  -m '{"schema_version":1,"device_id":"esp32-0000000000A1","sensor":"DHT22","temp":24.7,"umid":53.2,"ic":24.6}'

unset SENHA
```

O primeiro terminal deve mostrar a mensagem recebida no tópico
`fdctmon/esp32-0000000000A1/data`. Encerre o subscriber com `Ctrl+C`.

Depois, confirme:

1. Node-RED sem erro no log e nós com status verde na UI.
2. Dashboard `DCMonitor - Ambiente` atualizado no Grafana, com a placa
   `esp32-0000000000A1` no local `sem-local`.
3. Valores atualizados em **Latest Data** no Zabbix, se houver o host `esp32-0000000000A1`.

## 10. Cadastrar a placa

Na página `/admin/`, a placa `esp32-0000000000A1` aparece como "novo", com a credencial
ativa. Crie um local, dê um nome à placa, escolha o local e salve. Repita a
publicação do passo 9: a nova medição chega ao Grafana com o local e o nome
escolhidos, sem reiniciar nada. Confira o arquivo gravado:

```bash
cat ./cadastro/dispositivos.json
```

Ao terminar, clique em "Revogar" na linha de `esp32-0000000000A1` e confirme.

## 11. Gravar as placas

Cada placa precisa do firmware 1.6.0 e da própria senha MQTT. O roteiro completo
está em [ESP32/README.md](ESP32/README.md); em resumo:

1. Copie `ESP32/include/ca_cert.hpp`, gerado no passo 2, para a máquina que
   compila o firmware. No `config.hpp`, use `MQTT_HOST` igual a um nome ou IP do
   certificado (por exemplo `10.32.8.115`), `MQTT_PORT` `8883` e `NTP_SERVIDOR`
   igual ao IP do servidor.
2. Grave com `pio run -t upload` e abra o monitor serial
   (`pio device monitor`). A placa mostra `Sem credencial` no display e imprime
   o próprio ID.
3. Em `/admin/`, digite esse ID em "Placa nova: ID mostrado na serial", clique em
   "Gerar senha" e depois em "Copiar linha".
4. Cole a linha no monitor serial e tecle Enter. A placa grava a senha, reinicia
   e passa a publicar.

## Se algo não subir

```bash
docker compose ps
docker compose logs --tail=100 mosquitto influxdb node-red n8n grafana
```

Para acompanhar um serviço específico:

```bash
docker compose logs -f node-red
```

Se o Mosquitto não ficar `healthy`, confira no log se ele recusou
`MQTT_ADMIN_PASSWORD` (valor `TROQUE_*` ou menos de 24 caracteres), se
`./mqtt-seguranca` pertence ao UID 1883 e se `pki/mosquitto/server.key` existe
com dono UID 1883.

Não execute `docker compose down -v`: a opção `-v` remove os volumes e apaga os
dados persistidos. Para firewall definitivo, backup, atualização e rollback,
consulte [docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md).
