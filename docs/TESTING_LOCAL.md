# Teste local da plataforma

## Checks sem subir containers

```bash
bash scripts/run_project_checks.sh
```

O script valida documentação, JSON, Compose e referências obsoletas, roda os testes das funções do fluxo Node-RED e compila o ESP32 quando `pio` está instalado.

Os testes das funções do fluxo também rodam sozinhos, com Node local ou com a imagem do Node-RED:

```bash
node scripts/test_node_red_functions.js
docker run --rm -v "$PWD:/w" -w /w --entrypoint node nodered/node-red:4.1.11 scripts/test_node_red_functions.js
```

## Integração Docker

```bash
cp .env.example .env
# preencha os placeholders, inclusive os dois hashes bcrypt
install -d -o 1000 -g 1000 ./cadastro
docker compose up -d --build
docker compose ps
```

No Windows/Docker Desktop, `mkdir cadastro` costuma bastar; o `install -o 1000` é para Linux.

Observe o MQTT pela porta interna 1884, de dentro do container. Na 1883, a ACL não dá leitura em `fdctmon/#` e o subscriber não recebe nada.

```bash
docker compose exec mosquitto mosquitto_sub -p 1884 -t 'fdctmon/#' -v
```

Publique ESP32 simulado. O `-i` (client-id) precisa ser igual ao `device_id` do tópico:

```bash
mosquitto_pub -h localhost -p 1883 -i teste-esp32 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t fdctmon/teste-esp32/data \
  -m '{"schema_version":1,"device_id":"teste-esp32","sensor":"DHT22","firmware_version":"test","temp":24.7,"umid":53.2,"ic":24.6}'
```

Publique um payload sem os campos opcionais:

```bash
mosquitto_pub -h localhost -p 1883 -i teste-minimo \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t fdctmon/teste-minimo/data \
  -m '{"device_id":"teste-minimo","temp":25.3,"umid":60.0}'
```

Confirme, nesta ordem:

1. `docker compose logs node-red` sem erro.
2. InfluxDB `http://localhost:8086` contém measurement `ambiente`, com `local=sem-local` e `nome` igual ao `device_id`.
3. Grafana `http://localhost:3000` mostra os dois dispositivos publicados acima e a tabela "Situação das placas".
4. Zabbix Latest Data atualiza `temp` e `umid` no host homônimo ao `device_id`.

## ACL do broker

Publique com client-id diferente do `device_id` do tópico:

```bash
mosquitto_pub -h localhost -p 1883 -i outro-id \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t fdctmon/teste-esp32/data \
  -m '{"device_id":"teste-esp32","temp":99,"umid":1}'
```

O comando termina sem erro, mas o subscriber da porta 1884 não mostra a mensagem e nada é gravado: o broker descarta a publicação negada sem derrubar a conexão. O mesmo vale para o tópico antigo `fdctmon/teste-esp32/attrs`, mesmo com o client-id certo.

Confira também que a 1883 não dá leitura:

```bash
mosquitto_sub -h localhost -p 1883 -i teste-esp32 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t 'fdctmon/#' -v
```

Nenhuma mensagem deve chegar, mesmo com publicações em andamento.

## Cadastro de dispositivos

1. Abra `http://localhost:1880/admin/`. O navegador pede usuário e senha: use `CADASTRO_ADMIN_USER` e a senha que gerou `CADASTRO_ADMIN_PASSWORD_HASH`. O login do editor não serve.
2. As placas publicadas acima aparecem como "novo", com situação e última leitura.
3. Crie um local (nome + código), dê nome a `teste-esp32`, escolha o local e salve. O arquivo `cadastro/dispositivos.json` passa a ter `revisao` 1.
4. Publique de novo para `teste-esp32`. No InfluxDB e no Grafana, a nova medição sai com o `local` e o `nome` escolhidos, sem reiniciar o Node-RED.
5. Abra a página em duas abas, salve em uma e depois tente salvar na outra: a segunda recebe a mensagem de que o cadastro foi alterado em outra janela (HTTP 409).
6. Tente remover um local que ainda tem placa: o botão fica desabilitado.
7. Confirme que a API exige login: `curl -i http://localhost:1880/api/cadastro` responde 401.
8. Pare o Node-RED, deixe `cadastro/dispositivos.json` com JSON inválido e suba de novo: a página mostra o motivo, não permite salvar e a telemetria continua gravando com `sem-local`. Restaure o arquivo e reinicie o Node-RED.

## Falhas

- Publique JSON inválido e confirme que nenhum ponto é gravado.
- Pare o Zabbix ou use endereço inválido; o erro aparece no debug `Erro de ingestão` e o InfluxDB deve continuar recebendo.
- Desligue o ESP32: com deep sleep o status retido continua `online` (o Last Will `offline` só sai se a queda ocorrer no meio de um ciclo); a ausência aparece no painel `Situação das placas`, laranja após 3 min e vermelho após 10 min.
- Reconecte o Wi-Fi e confirme no monitor serial a mensagem `Wi-Fi conectado. IP: ...` antes da reconexão MQTT.
- Reinicie a stack e confirme que os dados permanecem.

Para encerrar sem apagar volumes:

```bash
docker compose down
```

Não use `docker compose down -v` se quiser preservar dados.
