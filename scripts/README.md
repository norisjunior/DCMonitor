# Scripts

Execute a partir da raiz do repositório.

## `run_project_checks.sh`

Valida documentos obrigatórios, arquivos JSON, renderização do Compose, referências obsoletas/segredos conhecidos e regressão do Raspberry. Compila o firmware quando PlatformIO está disponível.

```bash
bash scripts/run_project_checks.sh
```

## `check_docs_sync.py`

Confirma que os documentos críticos e READMEs dos componentes existem e não estão vazios.

Os backups agora são feitos por volume Docker conforme `docs/DEPLOY_PROD.md`; o script PostgreSQL trimestral foi removido junto com a plataforma antiga.
