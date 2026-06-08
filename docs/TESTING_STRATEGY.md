# TESTING_STRATEGY.md

> Mantido por: `qa-testing`. Remova as seções que não se aplicam à stack do projeto.

## Níveis de teste

| Nível | Escopo | Ferramenta (exemplo) | Quando executar |
|---|---|---|---|
| Unitário | Funções e classes individuais | pytest, Jest, Unity | A cada commit |
| Integração | Endpoints de API + banco de dados | pytest + TestClient, Supertest | A cada commit |
| E2E | Fluxos críticos do usuário | Playwright, Cypress | Antes do release |
| Visual | Consistência de UI | Manual ou screenshots Playwright | Antes de entregar frontend |
| Firmware | Comportamento de hardware | Simulação Wokwi ou placa real | A cada mudança de firmware |

## Metas de cobertura

| Camada | Cobertura mínima |
|---|---|
| Regras de negócio do backend | 70% de cobertura de linha |
| Endpoints críticos de API | 100% caminho feliz + principais casos de erro |
| Componentes de frontend | Caminho feliz + estado de erro |
| Pipeline de ML | Determinismo de pré-processamento + inferência |

## Convenções de teste

- Testes ficam junto ao código que testam, ou em um diretório `tests/` espelhando o fonte.
- Nomes de teste descrevem comportamento: `test_retorna_404_quando_usuario_nao_encontrado`.
- Fixtures e factories para dados de teste — sem IDs ou emails hardcoded.
- Serviços externos (e-mail, pagamento, broker IoT) são mockados na fronteira.

## Gates de CI

Os itens a seguir devem passar antes do merge:

- [ ] Verificação de lint e formatação
- [ ] Verificação de tipos (se linguagem tipada)
- [ ] Testes unitários
- [ ] Testes de integração

## Comandos

```bash
# Preencha por projeto
# Backend
cd backend && pytest

# Frontend
cd web && npm run test

# Firmware
cd firmware && pio test
```
