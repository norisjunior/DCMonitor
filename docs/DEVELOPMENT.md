# Processo de desenvolvimento

> Atualizado em 2026-11-25. Complementa o `AGENTS.md`, que vale para todo projeto; este arquivo registra como o DCMonitor aplica aquelas regras.

## Ciclo de uma mudança

1. **Plano e critérios de aceite.** Toda mudança não trivial começa com um plano curto e critérios de aceite derivados do `PROJECT_BRIEF.md`. O responsável aprova antes de qualquer código.
2. **Branch por funcionalidade.** Uma branch a partir do `master` (`feat/...`, `fix/...`, `docs/...`). Se a mudança depende de outra ainda em revisão, a branch parte dela e o PR aponta para ela; o GitHub redireciona para o `master` quando a dependência for mesclada.
3. **Um PR por entrega coerente.** Camadas que mudam de contrato juntas (firmware, Mosquitto, Node-RED, Grafana) vão no mesmo PR, em commits separados por propósito. Mesclar uma camada sem a outra deixaria o `master` quebrado.
4. **Commits por propósito.** `feat` → `test` → `docs` → `refactor` → `chore`, nunca `git add .`.
5. **Verificação automática.** `bash scripts/run_project_checks.sh` (documentação, JSON, Compose, testes das funções do Node-RED e compilação do ESP32). Mudanças de fluxo, Mosquitto ou Grafana também passam pelo teste da stack local em `docs/TESTING_LOCAL.md`.
6. **Revisão independente antes do PR.** Agentes revisores com contexto próprio, sem acesso ao raciocínio de quem implementou:
   - segurança (`skills/security-review`);
   - qualidade e bugs (`skills/code-review`);
   - testes e documentação (`skills/qa-testing`, `skills/documentation`);
   - aderência: o que foi entregue atende aos critérios de aceite aprovados no passo 1.

   O resultado vem em três listas (bloqueantes, importantes, opcionais), como pede o `AGENTS.md`. Bloqueantes são corrigidos antes de abrir o PR.
7. **Teste em hardware e merge.** O responsável testa na placa e no servidor e faz o merge.

## Orquestração com vários agentes

Implementação é sequencial e feita por um único autor: as camadas deste projeto dependem umas das outras e precisam de coerência. Orquestração com muitos agentes em paralelo (workflow) só é usada quando pedida explicitamente, para trabalho grande e independente, como revisar o repositório inteiro ou aplicar a mesma mudança em muitos arquivos sem relação entre si.

Se a organização habilitar o Claude Ship, o agente de Code Review pode comentar os PRs no GitHub como camada adicional; ele não substitui os critérios de aceite nem o teste em hardware.

## Onde cada coisa é registrada

| O quê | Onde |
|---|---|
| Escopo, requisitos e decisões confirmadas | `PROJECT_BRIEF.md` |
| Histórias e critérios de aceite | `docs/REQUIREMENTS.md` |
| Decisões de arquitetura com justificativa | `docs/decision-log.md` |
| Mudanças entregues | `CHANGELOG.md` |
| Processo de trabalho | este arquivo |
