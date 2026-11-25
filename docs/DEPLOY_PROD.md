# Deploy no Oracle Linux 9

## 1. Preparar

```bash
git clone <URL_DO_REPOSITORIO> dcmonitor
cd dcmonitor
cp .env.example .env
chmod 600 .env
nano .env
```

Substitua todos os placeholders. Gere valores aleatórios com `openssl rand -hex 32`. Para os hashes do Node-RED:

```bash
docker run --rm -it --entrypoint node-red nodered/node-red:4.1.11 admin hash-pw
```

Gere dois hashes, com senhas diferentes:

| Variável | Uso |
|---|---|
| `NODE_RED_ADMIN_PASSWORD_HASH` | login do editor do Node-RED (`NODE_RED_ADMIN_USER`) |
| `CADASTRO_ADMIN_PASSWORD_HASH` | login da página de cadastro `/admin/` (`CADASTRO_ADMIN_USER`, padrão `cadastro`) |

Os dois são obrigatórios: sem eles o Compose recusa a configuração e o Node-RED não sobe. No `.env`, coloque cada hash entre aspas simples para preservar `$`.

`CADASTRO_DIR` (padrão `./cadastro`) é o diretório do host com `dispositivos.json`. Crie-o antes de subir, gravável pelo UID 1000 do container do Node-RED:

```bash
sudo install -d -o 1000 -g 1000 ./cadastro
```

Se o arquivo não existir, o Node-RED cria um cadastro vazio na primeira subida. Se o diretório faltar ou tiver outro dono, o cadastro não carrega e a página mostra o motivo; a telemetria continua gravando.

Mantenha `BIND_ADDRESS=0.0.0.0`: esse valor faz o Docker aceitar conexões por
todas as interfaces do servidor. Acesse as interfaces pelo IP atual
`10.32.8.115`, nunca por `0.0.0.0`.

## 2. Subir

```bash
docker compose config
docker compose up -d --build
docker compose ps
```

O primeiro startup inicializa organização, bucket e token do InfluxDB. Alterar as variáveis `DOCKER_INFLUXDB_INIT_*` depois que o volume existe não recria essas estruturas.

Após subir, valide o bind publicado:

```bash
docker compose ps
sudo ss -lntp | grep -E ':(1883|1880|3000|5678|8086)\b'
```

Para usar DNS futuramente, crie um registro apontando o nome para
`10.32.8.115` e preserve `BIND_ADDRESS=0.0.0.0`. O nome público e o HTTPS devem
ser definidos nas aplicações somente junto com o proxy reverso e o certificado.

## 3. Firewall e SELinux

Os bind mounts usam o sufixo `:Z`, adequado ao SELinux. Libere portas somente para as redes necessárias:

| Porta | Origem recomendada | Uso |
|---:|---|---|
| 1883 | rede dos dispositivos | MQTT autenticado, com ACL por client-id |
| 1880 | rede de gestão | Node-RED: editor e página de cadastro `/admin/` |
| 3000 | NOC/rede de gestão | Grafana |
| 5678 | rede de gestão | n8n |
| 8086 | rede de gestão | InfluxDB UI/API |

Exemplo aberto para homologação:

```bash
sudo firewall-cmd --permanent --add-port={1883,1880,3000,5678,8086}/tcp
sudo firewall-cmd --reload
```

Em produção, prefira rich rules por sub-rede em vez de exposição ampla. A página de cadastro usa a mesma porta `1880` do editor; quem precisa cadastrar placas precisa estar na rede de gestão.

## 4. Preparar o Zabbix

O Node-RED e o Grafana são provisionados automaticamente, inclusive o envio ao Zabbix. Crie antes, para cada dispositivo, um host no Zabbix com o nome igual ao `device_id` e os itens trapper `temp`, `umid`, `headindex` e `rssi`, conforme `node-red/README.md`. O n8n sobe sem workflow ativo.

## 5. Verificar

```bash
docker compose ps
docker compose logs --tail=100 mosquitto node-red influxdb grafana n8n
docker compose exec mosquitto mosquitto_sub -p 1884 -t 'fdctmon/#' -v
```

A assinatura é feita pela porta interna 1884, de dentro do container: na 1883, a ACL não dá leitura em `fdctmon/#`.

Publique o payload de teste do README (com `-i` igual ao `device_id` do tópico) e confirme:

1. Node-RED sem erro de ingestão.
2. InfluxDB Data Explorer com measurement `ambiente` e tags `local` e `nome`.
3. Grafana `DCMonitor - Ambiente` atualizado.
4. Latest Data do Zabbix atualizado.
5. Página `http://10.32.8.115:1880/admin/` abre com o login do cadastro e lista a placa de teste como "novo".

## Backup

Antes de atualizar:

```bash
mkdir -p backups
docker compose stop
docker run --rm -v dcmonitor_influxdb_data:/data -v "$PWD/backups:/backup:Z" alpine \
  tar czf /backup/influxdb-data.tgz -C /data .
docker run --rm -v dcmonitor_n8n_data:/data -v "$PWD/backups:/backup:Z" alpine \
  tar czf /backup/n8n-data.tgz -C /data .
docker run --rm -v dcmonitor_grafana_data:/data -v "$PWD/backups:/backup:Z" alpine \
  tar czf /backup/grafana-data.tgz -C /data .
docker compose start
cp cadastro/dispositivos.json backups/dispositivos-$(date +%F).json
```

O cadastro de dispositivos é um arquivo comum do host: basta copiá-lo, inclusive com a stack no ar. Para restaurar, copie o arquivo de volta para `CADASTRO_DIR`, mantendo o dono UID 1000, e reinicie o Node-RED (`docker compose restart node-red`).

Guarde `.env` separadamente em cofre seguro. Os diretórios `backups/` e `cadastro/` são ignorados pelo Git.

## Atualização e rollback

```bash
docker compose pull
docker compose build --pull
docker compose up -d
```

O `settings.js` e o `flows.json` são copiados para o volume `dcmonitor_node_red_data` só quando ele é criado. Uma atualização que muda esses arquivos — como a que introduziu o cadastro de dispositivos — exige recriar o volume:

```bash
docker compose stop node-red
docker compose rm -f node-red
docker volume rm dcmonitor_node_red_data
docker compose up -d --build node-red
```

Na passagem para o cadastro de dispositivos, recriar também o bucket do InfluxDB é aceitável: os dados antigos não têm as tags `local` e `nome` e não aparecem nos filtros do Grafana. Atualize o firmware das placas para 1.5.0 antes ou junto: a versão anterior publica em `fdctmon/{device_id}/attrs`, que a ACL nega e o fluxo não assina.

Para rollback, restaure a revisão anterior do Git e as imagens/volumes do backup. Nunca execute `docker compose down -v` em produção: `-v` apaga os dados persistidos.
