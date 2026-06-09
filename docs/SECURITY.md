# SECURITY.md

> Mantido por: `security-review`.

## Superfície de ataque

| Ponto de entrada | Risco | Controle |
|---|---|---|
| Broker MQTT | Publish não autorizado de medições falsas | `allow_anonymous false`; usuário/senha em `.env`; healthcheck autenticado |
| n8n | Acesso indevido à UI e credenciais | Basic Auth ativo; `N8N_ENCRYPTION_KEY` obrigatório no `.env` |
| Flask dashboard | Exposição da última medição na rede interna | Sem autenticação por decisão de escopo; restringir acesso por rede/firewall |
| PostgreSQL | Acesso indevido ao banco | Porta não publicada no host; credenciais via `.env`; acesso por rede Docker interna |
| Zabbix sender | Injeção de comando por payload MQTT | Payload sanitizado no n8n antes do envio ao Zabbix |
| Dependências | CVEs conhecidos | Revisar imagens e pacotes antes de release |

## Gestão de segredos

- Todos os segredos em variáveis de ambiente. Nunca em código ou histórico git.
- `.env.example` contém apenas chaves com valores de placeholder.
- Segredos de CI/CD armazenados no gerenciador de segredos da plataforma (GitHub Secrets, etc.).

## Autenticação e autorização

- MQTT: autenticação por usuário/senha (`MQTT_USERNAME`, `MQTT_PASSWORD`) no Mosquitto.
- n8n: Basic Auth (`N8N_USER`, `N8N_PASSWORD`).
- Flask: sem autenticação por escopo; deve ficar restrito à rede interna do NOC.
- PostgreSQL: acessível apenas na rede Docker, sem porta publicada no host.

## Validação de entrada

- MQTT: fluxo n8n parseia JSON, exige campos obrigatórios, sanitiza `device_id` e converte números.
- Flask: não recebe entrada de usuário além de `GET /` e `GET /api/status`.
- Uploads: não existem no projeto.

## Segurança MQTT / IoT

- Endereço do broker e credenciais ficam somente em `.env` / variáveis de ambiente.
- Mosquitto gera `/tmp/mosquitto_passwd` em runtime; senha/hash não são versionados.
- Tópico esperado: `fdctmon/{device_id}/attrs`; n8n assina `fdctmon/#`.
- Pi e simulador usam `client.username_pw_set()` quando `MQTT_USERNAME` e `MQTT_PASSWORD` estão definidos.
- TLS ainda não foi habilitado; controle compensatório esperado: rede interna/firewall.

## Auditoria de dependências

Execute antes de cada release:

```bash
# Python
pip-audit
```

## Resposta a incidentes

Se um segredo vazar: rotacione imediatamente, invalide todas as sessões ativas, audite os logs.
