# Scripts

Execute a partir da raiz do repositório.

## `run_project_checks.sh`

Valida documentos obrigatórios, arquivos JSON, renderização do Compose e referências obsoletas/segredos conhecidos. Roda `test_node_red_functions.js` com o Node local ou, sem ele, com a imagem do Node-RED. Compila o firmware quando PlatformIO está disponível; para isso cria `config.hpp` e `ca_cert.hpp` a partir dos exemplos, se faltarem, e os apaga ao final.

```bash
bash scripts/run_project_checks.sh
```

## `test_node_red_functions.js`

Testa as funções do fluxo Node-RED fora do Node-RED. Cada nó `function` é extraído de `node-red/flows.json` e executado com `msg`, `node`, `global` e `env` simulados. São 43 testes: validação da telemetria (inclusive `device_id` diferente do tópico e o tópico antigo `.../attrs`), tags `local` e `nome`, validação, revisão, gravação e leitura do cadastro de dispositivos, o filtro do segundo Zabbix (`ZABBIX_SERVER_2`) e a API de credenciais MQTT (geração, troca, revogação, cabeçalho obrigatório, formato do ID, respostas do broker e expiração). O nó `Montar itens do Zabbix` ainda não é coberto.

```bash
node scripts/test_node_red_functions.js
```

Sem Node instalado:

```bash
docker run --rm -v "$PWD:/w" -w /w --entrypoint node nodered/node-red:4.1.11 scripts/test_node_red_functions.js
```

No Git Bash do Windows, prefixe o `docker run` com `MSYS_NO_PATHCONV=1`.

## `gerar_certificados.sh`

Cria a CA própria do DCMonitor (só na primeira vez) e emite o certificado TLS do Mosquitto. Rode como root no servidor, na raiz do repositório:

```bash
sudo bash scripts/gerar_certificados.sh
```

| Saída | Conteúdo |
|---|---|
| `pki/ca/ca.key`, `pki/ca/ca.crt` | CA, 10 anos; a chave é o segredo mais sensível da instalação |
| `pki/mosquitto/` | `ca.crt`, `server.crt` e `server.key` (dono UID 1883), montados no Mosquitto |
| `pki/node-red/` | `ca.crt`, `server.crt` e `server.key` (dono UID 1000), HTTPS da porta 1880 |
| `ESP32/include/ca_cert.hpp` | certificado público da CA para o firmware, igual para toda a frota |

O certificado do servidor vale 825 dias. Nomes e IPs vêm de `MQTT_TLS_NOMES` (padrão `vplviot.ctn.fundacentro.intra`) e `MQTT_TLS_IPS` (padrão `10.32.8.115`), separados por espaço; `mosquitto`, `localhost` e `127.0.0.1` entram sempre. Cada IP entra também como DNS, porque o mbedTLS do ESP32 só compara o host com entradas DNS.

Rodar de novo, com `pki/ca/ca.key` presente, renova só os certificados de servidor (broker e Node-RED), sem regravar placas. Se `pki/ca/ca.crt` existe e a chave não, o script se recusa a rodar; para criar uma CA nova de propósito, apague `pki/ca/` (todas as placas precisam ser regravadas e a CA nova instalada nos navegadores). `pki/` é ignorado pelo Git. Detalhes em `docs/DEPLOY_PROD.md`.

## `check_docs_sync.py`

Confirma que os documentos críticos e READMEs dos componentes existem e não estão vazios.

Os backups agora são feitos por volume Docker conforme `docs/DEPLOY_PROD.md`; o script PostgreSQL trimestral foi removido junto com a plataforma antiga.
