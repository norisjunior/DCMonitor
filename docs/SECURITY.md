# SECURITY.md

> Mantido por: `security-review`. Remova as seções que não se aplicam ao projeto.

## Superfície de ataque

| Ponto de entrada | Risco | Controle |
|---|---|---|
| API REST | Injeção, bypass de auth | Validação de entrada, middleware de auth |
| Upload de arquivos | Malware, path traversal | Verificação de tipo, limite de tamanho, armazenamento isolado |
| Broker MQTT | Publish/subscribe não autorizado | Credenciais, ACL, TLS |
| Frontend | XSS, CSRF | Headers CSP, cookies same-site |
| Banco de dados | SQL injection | Queries parametrizadas, ORM |
| Dependências | CVEs conhecidos | Auditoria automatizada de dependências |

## Gestão de segredos

- Todos os segredos em variáveis de ambiente. Nunca em código ou histórico git.
- `.env.example` contém apenas chaves com valores de placeholder.
- Segredos de CI/CD armazenados no gerenciador de segredos da plataforma (GitHub Secrets, etc.).

## Autenticação e autorização

- `<descreva o mecanismo de auth: JWT, sessão, API key, OAuth>`
- Tokens expiram após: `<duração>`
- Autorização: `<baseada em papel, baseada em recurso, ou N/A>`

## Validação de entrada

- Todas as entradas externas validadas na fronteira da API (schema, tipo, intervalo).
- Uploads: tamanho máximo `<N MB>`, tipos permitidos `<lista>`, armazenados em `<local>`.

## Segurança MQTT / IoT

- Endereço do broker e credenciais: somente variáveis de ambiente.
- Tópicos seguem o padrão `<padrão>` — sem assinaturas wildcard de dispositivos.
- Payloads validados antes de executar comandos no dispositivo.

## Auditoria de dependências

Execute antes de cada release:

```bash
# Python
pip-audit

# Node
npm audit

# Firmware
pio pkg list  # revisar manualmente
```

## Resposta a incidentes

Se um segredo vazar: rotacione imediatamente, invalide todas as sessões ativas, audite os logs.
