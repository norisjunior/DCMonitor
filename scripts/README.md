# Scripts

Execute a partir da raiz do repositório.

## `run_project_checks.sh`

Valida documentos obrigatórios, arquivos JSON, renderização do Compose e referências obsoletas/segredos conhecidos. Roda `test_node_red_functions.js` com o Node local ou, sem ele, com a imagem do Node-RED. Compila o firmware quando PlatformIO está disponível.

```bash
bash scripts/run_project_checks.sh
```

## `test_node_red_functions.js`

Testa as funções do fluxo Node-RED fora do Node-RED. Cada nó `function` é extraído de `node-red/flows.json` e executado com `msg`, `node` e `global` simulados: validação da telemetria (inclusive `device_id` diferente do tópico e o tópico antigo `.../attrs`), tags `local` e `nome`, e validação, revisão, gravação e leitura do cadastro de dispositivos. O nó `Montar itens do Zabbix` ainda não é coberto.

```bash
node scripts/test_node_red_functions.js
```

Sem Node instalado:

```bash
docker run --rm -v "$PWD:/w" -w /w --entrypoint node nodered/node-red:4.1.11 scripts/test_node_red_functions.js
```

No Git Bash do Windows, prefixe o `docker run` com `MSYS_NO_PATHCONV=1`.

## `check_docs_sync.py`

Confirma que os documentos críticos e READMEs dos componentes existem e não estão vazios.

Os backups agora são feitos por volume Docker conforme `docs/DEPLOY_PROD.md`; o script PostgreSQL trimestral foi removido junto com a plataforma antiga.
