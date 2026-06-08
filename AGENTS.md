# AGENTS.md — Contrato do Projeto

> Leia este arquivo antes de qualquer ação neste repositório.
> Os dados específicos do projeto estão em PROJECT_BRIEF.md.

## Missão

Antes de iniciar qualquer tarefa, leia `PROJECT_BRIEF.md`.
Se algum campo crítico estiver vago, ausente ou ambíguo, pergunte ao usuário — não assuma.

## Convenções sempre-ativas

1. **Plano antes de código.** Para qualquer tarefa não trivial, produza um plano curto
   + critérios de aceite derivados do PROJECT_BRIEF.md antes de editar arquivos.
2. **Decisões arquiteturais → log de decisões.** Toda decisão de arquitetura/biblioteca/
   trade-off ganha uma entrada em `docs/decision-log.md`
   (título + decisão + justificativa + consequências).
3. **Sem segredos no repositório.** Use variáveis de ambiente / `.env`
   (com `.env.example`). Nunca logue dados sensíveis.
4. **Commits com propósito.** Nunca use `git add .`. Agrupe por propósito
   (feat → test → docs → refactor → chore). Mensagens curtas e revisáveis.
5. **Fechamento de tarefa:** execute testes e lint, atualize `CHANGELOG.md` e os
   `docs/*` afetados, e rode os scripts relevantes de `scripts/`.
   Ao adicionar, remover ou renomear arquivos em uma subpasta, verifique se ela
   tem `README.md` próprio e atualize-o na mesma sessão.
6. **Nunca quebre o que funciona.** Mudanças em código compartilhado exigem
   checagem de regressão.

## Estrutura de diretórios

```text
AGENTS.md               este contrato — nunca edite por projeto
PROJECT_BRIEF.md        o que o projeto entrega — preencha por projeto
PROMPT_INICIAL.md       prompts de início de sessão — use como está
CHANGELOG.md            mantido pelo agente
skills/                 especialistas sob demanda (carregados quando acionados)
docs/                   documentação viva — remova arquivos não usados na primeira sessão
  REQUIREMENTS.md       produzido pela skill product-requirements; histórias de usuário,
                        critérios de aceite, RNFs, riscos e plano incremental
  decision-log.md       decisões arquiteturais — mantido pelo agente
  adr/                  Architecture Decision Records individuais (opcional)
scripts/                verificações determinísticas
<código do projeto>     firmware/ backend/ web/ ml/ db/ ...
```

Nem todo projeto usará todas as pastas. Não crie pasta vazia sem necessidade.

## Mapa de skills

As skills ficam em `skills/`. Acione a skill certa para cada tarefa.

| Skill | Acionar quando |
|---|---|
| `product-requirements` | início do projeto, requisitos ambíguos, nova funcionalidade maior |
| `software-architect` | decisão estrutural, feature cross-módulo, escolha de tecnologia |
| `system-integrator` | integração ponta a ponta entre duas ou mais camadas |
| `backend-api` | endpoints de API, regras de negócio, validação, autenticação |
| `frontend-web` | páginas, componentes, formulários, dashboards, estados de UI |
| `style-guardian` | consistência visual, responsividade, overflow, contraste |
| `database` | schema, migrations, índices, integridade, performance de query |
| `embedded-iot` | ESP32, sensores, GPIO/I2C/SPI/UART, MQTT, energia, watchdog |
| `ml-engineering` | ML clássico, EDA, split treino/teste, leakage, métricas, baseline |
| `deep-learning-cv` | DL, YOLO, CNN, datasets, augmentation, ONNX/TFLite, inferência edge |
| `mlops-dataops` | versionamento de dados/modelos, pipeline de treino, drift, rastreabilidade |
| `qa-testing` | testes unit/integração/e2e/API/UI/hardware simulado |
| `security-review` | auth, segredos, injeção, XSS/CSRF/CORS, MQTT, dependências |
| `code-review` | qualidade, bugs, duplicação, complexidade, refatoração segura |
| `documentation` | README, docs/, ADRs, changelog sincronizados com o código |
| `devops-ci` | Docker, env, CI/CD, lint, build, deploy, healthcheck |

## Revisão padrão de entrega

Antes de qualquer entrega, execute: `qa-testing`, `security-review`, `code-review`, `documentation`.
Entregue três listas:
- **Bloqueantes** — devem ser corrigidos antes da entrega
- **Importantes** — devem ser corrigidos em breve
- **Opcionais** — melhorias desejáveis
