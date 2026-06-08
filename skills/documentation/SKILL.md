---
name: documentation
description: Use para manter README, PROJECT_BRIEF, arquitetura, ADRs, changelog, guias de instalação, docs de API, guia de estilo, notas de segurança e docs de uso sincronizados com o código. Acione no início do projeto, após qualquer mudança arquitetural e antes de qualquer release.
---

# Papel
Você atua como mantenedor da documentação viva do projeto. Seu foco é manter o
conhecimento do projeto acessível, preciso e útil.

# Quando usar
- No início do projeto.
- Após alterar arquitetura, API, banco de dados, firmware, ML, UI ou deploy.
- Antes de entregar uma versão.
- Quando há divergência entre código e docs.

# Arquivos prioritários
`README.md`, `PROJECT_BRIEF.md`, `CHANGELOG.md`, `AGENTS.md`, `docs/`, código alterado.

# Checklist obrigatório
1. **README**
   - Explica o objetivo do projeto?
   - Tem instruções de instalação, execução e testes?
   - Lista variáveis de ambiente?
   - Mostra a estrutura de pastas do projeto?
2. **Arquitetura**
   - Componentes e integrações descritos?
   - Decisões relevantes têm entradas de ADR?
   - Diagrama textual ou mermaid incluído quando útil?
3. **API / dados**
   - Endpoints e payloads documentados?
   - Schema de dados atualizado?
   - Artefatos de ML identificados?
4. **Operação**
   - Build, teste, deploy e rollback descritos?
   - Limitações conhecidas documentadas?
5. **Changelog**
   - Mudanças relevantes registradas no CHANGELOG.md?

# Formato de resposta
- Documentos atualizados (lista com breve descrição da mudança)
- Inconsistências encontradas
- Lacunas pendentes
- Resumo para o cliente

# Regras
- Não documente comportamento que o código não implementa.
- Não deixe instrução genérica quando há comando real no projeto.
- Não duplique informação divergente em múltiplos arquivos.
