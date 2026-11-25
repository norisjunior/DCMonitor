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
criados à mão. O cadastro de dispositivos não está em volume: fica em
`./cadastro/dispositivos.json` no host e só sai se for apagado à mão.

Quem vem de uma versão anterior ao cadastro de dispositivos precisa recriar ao
menos `dcmonitor_node_red_data`: o `settings.js` e o `flows.json` novos só são
copiados para o volume quando ele é criado. Recriar também o InfluxDB é o
caminho mais simples, porque os dados antigos não têm as tags `local` e `nome`
e não aparecem nos filtros do Grafana. Havendo algo a preservar, faça antes o backup descrito em
[docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md).

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

## 2. Validar o `.env`

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

> `MQTT_USERNAME` e `MQTT_PASSWORD` precisam ser os mesmos de
> `ESP32/include/config.hpp` das placas já gravadas. Trocar a senha MQTT sem
> regravar o firmware deixa os dispositivos fora do broker, tentando reconectar
> a cada 5 s, sem nenhum erro no servidor — apenas silêncio nos tópicos.

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

## 3. Preparar o diretório do cadastro

O cadastro de dispositivos (local e nome amigável de cada placa) é o arquivo
`dispositivos.json`, num diretório do host montado no Node-RED. O diretório
precisa existir e pertencer ao UID 1000, o usuário do container:

```bash
sudo install -d -o 1000 -g 1000 ./cadastro
```

Use o caminho de `CADASTRO_DIR` se tiver mudado o padrão `./cadastro`. O rótulo
SELinux é ajustado pelo `:Z` do Compose. Se o arquivo não existir, o Node-RED
cria um cadastro vazio na primeira subida.

## 4. Subir a plataforma

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

## 5. Liberar o firewall para o primeiro teste

Confira se o `firewalld` está ativo:

```bash
sudo firewall-cmd --state
```

Se estiver ativo, esta liberação é simples para homologação em uma rede interna
confiável:

```bash
sudo firewall-cmd --permanent --add-port={1883,1880,3000,5678,8086}/tcp
sudo firewall-cmd --reload
```

Em produção, restrinja `1880`, `3000`, `5678` e `8086` à rede de gestão e `1883`
à rede dos dispositivos. A página de cadastro usa a mesma porta `1880`. Não exponha essas portas diretamente à Internet.

## 6. Abrir as interfaces

| Serviço | Endereço |
|---|---|
| Grafana | `http://10.32.8.115:3000` |
| Node-RED | `http://10.32.8.115:1880` |
| Cadastro de dispositivos | `http://10.32.8.115:1880/admin/` |
| n8n | `http://10.32.8.115:5678` |
| InfluxDB | `http://10.32.8.115:8086` |
| MQTT | `10.32.8.115:1883` |

Credenciais de primeiro acesso:

- Grafana: `GRAFANA_ADMIN_USER` e `GRAFANA_ADMIN_PASSWORD` do `.env`.
- Node-RED: `NODE_RED_ADMIN_USER` e a senha original usada para gerar o hash.
- Cadastro de dispositivos: `CADASTRO_ADMIN_USER` (padrão `cadastro`) e a senha
  original usada para gerar `CADASTRO_ADMIN_PASSWORD_HASH`.
- InfluxDB: `INFLUXDB_ADMIN_USER` e `INFLUXDB_ADMIN_PASSWORD` do `.env`.
- n8n: crie o usuário proprietário solicitado no primeiro acesso.

Os hashes bcrypt armazenados no `.env` não são as senhas de login.

## 7. Conferir o Zabbix

Com os volumes recriados do zero, o fluxo e a credencial do InfluxDB são
aplicados pela imagem: não é preciso importar `flows.json` nem digitar o token
na UI. Confirme na UI do Node-RED que os nós aparecem com status verde.

O Node-RED, o InfluxDB e o Grafana são provisionados automaticamente, incluindo
o envio ao Zabbix. O que não é provisionado está do lado do Zabbix: cada
dispositivo precisa de um host com o nome igual ao seu `device_id` — por
exemplo `esp32-18B4C0D8CBB0` — e, nele, os itens trapper `temp`, `umid`,
`headindex` e `rssi` antes do teste. Veja os detalhes em
[node-red/README.md](node-red/README.md).

O n8n sobe sem workflow ativo e não precisa de configuração nesta etapa.

## 8. Testar o MQTT como se fosse um dispositivo

Na porta 1883, a ACL do broker só deixa cada cliente publicar em
`fdctmon/{client-id}/data` e `/status` e ler `fdctmon/{client-id}/cmd`. Um
subscriber em `fdctmon/#` na 1883 não recebe nada. Para observar o tráfego,
assine pela porta interna 1884, de dentro do container do broker.

Em um primeiro terminal, deixe o subscriber aberto:

```bash
docker compose exec mosquitto mosquitto_sub -p 1884 -t 'fdctmon/#' -v
```

O publicador abaixo é um cliente Mosquitto descartável, separado do container do
broker. No Oracle Linux, `--network host` permite que ele acesse a porta externa
do broker em `127.0.0.1:1883`; `--rm` remove o cliente ao encerrar. O `-i
teste-001` define o client-id e precisa ser igual ao `device_id` do tópico: com
outro client-id, o broker descarta a mensagem sem erro.

Em um segundo terminal, informe as credenciais MQTT e publique uma medição:

```bash
export MQTT_USERNAME=fdctmon_iot
read -rsp "Senha MQTT: " MQTT_PASSWORD && echo
export MQTT_PASSWORD

docker run --rm --network host \
  -e MQTT_USERNAME -e MQTT_PASSWORD \
  eclipse-mosquitto:2.0.22 \
  sh -c 'exec mosquitto_pub -h 127.0.0.1 -p 1883 -i teste-001 \
    -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
    -t fdctmon/teste-001/data \
    -m "{\"schema_version\":1,\"device_id\":\"teste-001\",\"sensor\":\"DHT22\",\"temp\":24.7,\"umid\":53.2,\"ic\":24.6}"'

unset MQTT_PASSWORD
```

O primeiro terminal deve mostrar a mensagem recebida no tópico
`fdctmon/teste-001/data`. Encerre o subscriber com `Ctrl+C`.

Depois, confirme:

1. Node-RED sem erro no log e nós com status verde na UI.
2. Dashboard `DCMonitor - Ambiente` atualizado no Grafana, com a placa
   `teste-001` no local `sem-local`.
3. Valores atualizados em **Latest Data** no Zabbix, se houver o host `teste-001`.

## 9. Cadastrar a placa

Abra `http://10.32.8.115:1880/admin/` e entre com o login do cadastro. A placa
`teste-001` aparece como "novo". Crie um local, dê um nome à placa, escolha o
local e salve. Repita a publicação do passo 8: a nova medição chega ao Grafana
com o local e o nome escolhidos, sem reiniciar nada. Confira o arquivo gravado:

```bash
cat ./cadastro/dispositivos.json
```

## Se algo não subir

```bash
docker compose ps
docker compose logs --tail=100 mosquitto influxdb node-red n8n grafana
```

Para acompanhar um serviço específico:

```bash
docker compose logs -f node-red
```

Não execute `docker compose down -v`: a opção `-v` remove os volumes e apaga os
dados persistidos. Para firewall definitivo, backup, atualização e rollback,
consulte [docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md).
