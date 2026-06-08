# Prompts de sessão

## Prompt de início de projeto

Copie e cole no início de uma nova sessão de projeto.

```text
Leia AGENTS.md e PROJECT_BRIEF.md antes de fazer qualquer coisa.

Para cada campo do PROJECT_BRIEF.md que estiver vago, ausente ou que possa levar a interpretações diferentes, me faça uma pergunta de cada vez antes de prosseguir.

Em seguida:
1. Remova de docs/ qualquer arquivo que não se aplique à stack declarada:
   - Firmware/IoT é N/A → remova EMBEDDED_IOT_GUIDELINES.md
   - ML/Clássico e ML/Deep Learning são ambos N/A → remova DATA_ML_GUIDELINES.md
   - Frontend é N/A → remova STYLEGUIDE.md
2. Use a skill `product-requirements` para produzir:
   - Requisitos funcionais (se não estiverem completos no PROJECT_BRIEF.md)
   - Requisitos não-funcionais (se não estiverem completos)
   - Critérios de aceite para cada requisito
   - Plano de implementação incremental
   - Avaliação de riscos
   - Quais skills devem atuar em cada fase
3. NÃO implemente nada ainda. Entregue o plano primeiro para minha revisão.
```

## Prompt de revisão final

Copie e cole quando a implementação estiver completa e pronta para entrega.

```text
Execute a revisão final de entrega usando estas skills:
- `code-review`
- `qa-testing`
- `security-review`
- `documentation`
- `style-guardian` (somente se houver frontend)
- `devops-ci` (somente se houver pipeline de build/deploy)

Entregue três listas objetivas:
1. Problemas bloqueantes (devem ser corrigidos antes da entrega)
2. Problemas importantes (devem ser corrigidos em breve)
3. Melhorias opcionais

Mais: testes/checks executados, docs atualizados e riscos pendentes conhecidos.
```

## Prompt de auditoria visual

Copie e cole quando o frontend precisar de uma revisão visual dedicada.

```text
Use a skill `style-guardian` para revisar todas as telas, páginas e componentes.
Verifique: consistência visual, responsividade, elementos sobrepostos, overflow horizontal,
índices de contraste, estados de erro/carregamento/vazio e aderência ao docs/STYLEGUIDE.md.
Se possível, renderize as páginas e analise screenshots em 360 px, 768 px e 1280 px.
```

## Prompt de auditoria de segurança

Copie e cole para executar uma revisão de segurança dedicada.

```text
Use a skill `security-review` para auditar: autenticação, autorização, exposição de
segredos, uploads de arquivos, CORS, XSS, injeção, logs sensíveis, superfície de
ataque MQTT/IoT e dependências.
Classifique os achados como: crítico / importante / melhoria recomendada.
```
