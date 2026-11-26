# Teste local da plataforma

## Checks sem subir containers

```bash
bash scripts/run_project_checks.sh
```

O script valida documentação, JSON, Compose e referências obsoletas, roda os testes das funções do fluxo Node-RED e compila o ESP32 quando `pio` está instalado. Para compilar sem o certificado real, ele cria `ESP32/include/ca_cert.hpp` a partir de `ca_cert.example.hpp` e o apaga ao final.

Os testes das funções do fluxo também rodam sozinhos, com Node local ou com a imagem do Node-RED:

```bash
node scripts/test_node_red_functions.js
docker run --rm -v "$PWD:/w" -w /w --entrypoint node nodered/node-red:4.1.11 scripts/test_node_red_functions.js
```

## Integração Docker

```bash
cp .env.example .env
# preencha os placeholders, inclusive os dois hashes bcrypt e MQTT_ADMIN_PASSWORD
sudo bash scripts/gerar_certificados.sh
install -d -o 1000 -g 1000 ./cadastro
install -d -o 1883 -g 1883 ./mqtt-seguranca
docker compose up -d --build
docker compose ps
```

No Windows/Docker Desktop, `mkdir cadastro mqtt-seguranca` costuma bastar; o `install -o` é para Linux. O script de certificados precisa de `bash` e `openssl`.

Observe o MQTT pela porta interna 1884, de dentro do container, com o login do Node-RED. As variáveis `MQTT_ADMIN_*` já estão no ambiente do container:

```bash
docker compose exec mosquitto sh -c \
  'mosquitto_sub -p 1884 -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" -t "fdctmon/#" -v'
```

Gere as credenciais de duas placas simuladas, `esp32-0000000000A1` e `esp32-0000000000A2`, pela página `https://localhost:1880/admin/` (formulário "Placa nova: ID mostrado na serial") ou pela API:

```bash
curl -s --cacert pki/ca/ca.crt -u cadastro -H 'X-DCMonitor: 1' -X POST https://localhost:1880/api/credenciais/esp32-0000000000A1
curl -s --cacert pki/ca/ca.crt -u cadastro -H 'X-DCMonitor: 1' -X POST https://localhost:1880/api/credenciais/esp32-0000000000A2
```

O `curl` pede a senha do login do cadastro; troque `cadastro` pelo seu `CADASTRO_ADMIN_USER`, se for outro. O cabeçalho `X-DCMonitor: 1` é obrigatório (403 sem ele), e só IDs no formato do firmware (`esp32-` + 12 dígitos hexadecimais maiúsculos) são aceitos. A resposta traz `senha` e `linha_serial`; guarde as duas senhas para os passos seguintes.

Publique ESP32 simulado pela porta 8883, com TLS, de dentro do container do broker (`localhost` está no certificado):

```bash
read -rsp "Senha de esp32-0000000000A1: " SENHA && echo
docker compose exec mosquitto mosquitto_pub \
  --cafile /mosquitto/certs/ca.crt -h localhost -p 8883 \
  -u esp32-0000000000A1 -P "$SENHA" \
  -t fdctmon/esp32-0000000000A1/data \
  -m '{"schema_version":1,"device_id":"esp32-0000000000A1","sensor":"DHT22","firmware_version":"test","temp":24.7,"umid":53.2,"ic":24.6}'
```

Publique um payload sem os campos opcionais:

```bash
read -rsp "Senha de esp32-0000000000A2: " SENHA2 && echo
docker compose exec mosquitto mosquitto_pub \
  --cafile /mosquitto/certs/ca.crt -h localhost -p 8883 \
  -u esp32-0000000000A2 -P "$SENHA2" \
  -t fdctmon/esp32-0000000000A2/data \
  -m '{"device_id":"esp32-0000000000A2","temp":25.3,"umid":60.0}'
```

Confirme, nesta ordem:

1. `docker compose logs node-red` sem erro.
2. InfluxDB `http://localhost:8086` contém measurement `ambiente`, com `local=sem-local` e `nome` igual ao `device_id`.
3. Grafana `http://localhost:3000` mostra os dois dispositivos publicados acima e a tabela "Situação das placas".
4. Zabbix Latest Data atualiza `temp` e `umid` no host homônimo ao `device_id`.

## Permissões e credenciais no broker

Publique com a credencial de `esp32-0000000000A2` no ramo de `esp32-0000000000A1`:

```bash
docker compose exec mosquitto mosquitto_pub \
  --cafile /mosquitto/certs/ca.crt -h localhost -p 8883 \
  -u esp32-0000000000A2 -P "$SENHA2" \
  -t fdctmon/esp32-0000000000A1/data \
  -m '{"device_id":"esp32-0000000000A1","temp":99,"umid":1}'
```

O comando termina sem erro, mas o subscriber da porta 1884 não mostra a mensagem e nada é gravado: o broker descarta a publicação negada sem derrubar a conexão. O mesmo vale para o tópico antigo `fdctmon/esp32-0000000000A1/attrs`, mesmo com a credencial certa.

Confira também que uma placa não lê o tráfego das outras:

```bash
docker compose exec mosquitto mosquitto_sub \
  --cafile /mosquitto/certs/ca.crt -h localhost -p 8883 \
  -u esp32-0000000000A1 -P "$SENHA" -t 'fdctmon/#' -v
```

Nenhuma mensagem deve chegar, mesmo com publicações em andamento.

Outras verificações:

1. Senha errada na 8883: `mosquitto_pub` termina com `Connection Refused: not authorised`.
2. Sem TLS: `mosquitto_pub -h localhost -p 8883` sem `--cafile` não conecta.
3. Porta 1883: `docker compose ps` não a lista e `ss -lntp` no host não mostra nada escutando nela.
4. Anônimo na 1884: `docker compose exec mosquitto env HOME=/tmp mosquitto_pub -p 1884 -t x -m y` é recusado. O `HOME=/tmp` evita que o `mosquitto_pub` leia o login do administrador em `/root/.config/mosquitto_pub`.
5. Gerar de novo: o mesmo `POST` para `esp32-0000000000A1` responde 409 e a senha atual continua valendo.
6. Troca de senha: "Trocar senha" na página, ou `curl -s --cacert pki/ca/ca.crt -u cadastro -H 'X-DCMonitor: 1' -X PUT https://localhost:1880/api/credenciais/esp32-0000000000A1`. A senha antiga passa a ser recusada; a nova funciona.
7. Revogação: `curl -s --cacert pki/ca/ca.crt -u cadastro -H 'X-DCMonitor: 1' -X DELETE https://localhost:1880/api/credenciais/esp32-0000000000A2`. A senha de `esp32-0000000000A2` passa a ser recusada. Repetir o `DELETE` responde 200 com `"revogada": false`.
8. Sem o cabeçalho: os mesmos comandos sem `-H 'X-DCMonitor: 1'` respondem 403.
9. ID fora do formato: `POST /api/credenciais/node-red` (o administrador) ou `/api/credenciais/teste-001` responde 400.
10. Broker parado: com `docker compose stop mosquitto`, `GET /api/credenciais` responde 504 em cerca de 5 a 7 s e a página mostra "Credenciais MQTT indisponíveis". Suba o broker de novo.
11. Senha fraca: com `MQTT_ADMIN_PASSWORD` curta ou `TROQUE_*`, o Mosquitto não sobe e o log mostra o motivo.

Ao terminar, revogue as credenciais de teste e apague as variáveis `SENHA` e `SENHA2` (`unset SENHA SENHA2`).

## Placa física

Para o teste completo numa máquina com WSL antes do servidor (certificados com `localhost` e o IP da máquina, portas normais dos serviços, CA no Windows, placa real), siga a lista em [GUIA_TESTE_WSL.html](GUIA_TESTE_WSL.html). Abra o arquivo no navegador: as marcações ficam salvas nele.

1. Copie `ESP32/include/ca_cert.hpp` gerado pelo script, ajuste `MQTT_HOST` para um nome ou IP do certificado e `NTP_SERVIDOR` para o servidor, e grave o firmware.
2. Sem senha, a placa mostra `Sem credencial` e imprime o ID no monitor serial. Gere a senha em `/admin/` e cole a linha `credencial <device_id> <senha>`. A placa grava, reinicia e publica.
3. Cole uma linha de outro ID: a placa responde que a linha é de outro dispositivo e continua esperando.
4. Revogue a credencial na página: no ciclo seguinte, o serial mostra `O broker recusou a credencial desta placa`.
5. Bloqueie o NTP (ou aponte `NTP_SERVIDOR` para um endereço sem serviço) e reenergize a placa: o serial mostra `NTP sem resposta`, a publicação por TLS continua e o display mostra `--:--`.
6. Abra o monitor serial depois do boot de uma placa sem senha e tecle Enter numa linha vazia: a placa repete o ID e as instruções.

## Cadastro de dispositivos

1. Abra `https://localhost:1880/admin/`. O navegador pede usuário e senha: use `CADASTRO_ADMIN_USER` e a senha que gerou `CADASTRO_ADMIN_PASSWORD_HASH`. O login do editor não serve.
2. As placas publicadas acima aparecem como "novo", com situação e última leitura.
3. Crie um local (nome + código), dê nome a `esp32-0000000000A1`, escolha o local e salve. O arquivo `cadastro/dispositivos.json` passa a ter `revisao` 1.
4. Publique de novo para `esp32-0000000000A1`. No InfluxDB e no Grafana, a nova medição sai com o `local` e o `nome` escolhidos, sem reiniciar o Node-RED.
5. Abra a página em duas abas, salve em uma e depois tente salvar na outra: a segunda recebe a mensagem de que o cadastro foi alterado em outra janela (HTTP 409).
6. Tente remover um local que ainda tem placa: o botão fica desabilitado.
7. Confirme que a API exige login: `curl -i --cacert pki/ca/ca.crt https://localhost:1880/api/cadastro` responde 401.
8. Pare o Node-RED, deixe `cadastro/dispositivos.json` com JSON inválido e suba de novo: a página mostra o motivo, não permite salvar e a telemetria continua gravando com `sem-local`. Restaure o arquivo e reinicie o Node-RED.

## Falhas

- Publique JSON inválido e confirme que nenhum ponto é gravado.
- Pare o Zabbix ou use endereço inválido; o erro aparece no debug `Erro de ingestão` e o InfluxDB deve continuar recebendo.
- Com `ZABBIX_SERVER_2=` (vazia) no `.env`, nada é enviado ao segundo Zabbix; sem a linha, vale o padrão `10.32.8.69` do Compose e os mesmos itens chegam aos dois servidores. Ative o debug `MSG ZABBIX` para ver os itens montados.
- Desligue o ESP32: com deep sleep o status retido continua `online` (o Last Will `offline` só sai se a queda ocorrer no meio de um ciclo); a ausência aparece no painel `Situação das placas`, laranja após 3 min e vermelho após 10 min.
- Reconecte o Wi-Fi e confirme no monitor serial a mensagem `Wi-Fi conectado. IP: ...` antes da reconexão MQTT.
- Reinicie a stack e confirme que os dados permanecem.

Para encerrar sem apagar volumes:

```bash
docker compose down
```

Não use `docker compose down -v` se quiser preservar dados.
