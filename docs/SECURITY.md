# Segurança

Status atual: **aprovado com ressalvas**, condicionado à rotação da senha Wi-Fi exposta no protótipo e ao preenchimento seguro do `.env`.

## Segredos

- `.env` e `ESP32/include/config.hpp` são ignorados pelo Git.
- Exemplos usam placeholders.
- Tokens do InfluxDB, chave do n8n e secret do Node-RED não devem aparecer em flows, logs ou screenshots.
- A senha Wi-Fi que existia no firmware inicial deve ser rotacionada antes do uso em produção.
- O `.env` deve ter modo `0600` no Oracle Linux e backup em cofre seguro.

## Superfície de rede

O host publica as cinco portas em `0.0.0.0`, portanto elas escutam em todas as
interfaces. Isso permite acesso pelo IP atual `10.32.8.115` e por DNS futuro,
mas torna obrigatória a restrição de origem no `firewalld`.

| Entrada | Controle |
|---|---|
| MQTT 1883 | usuário/senha obrigatórios; firewall limitado à rede IoT |
| MQTT 1884 | anônimo, mas não publicado; somente rede Docker |
| Node-RED 1880 | autenticação bcrypt e firewall de gestão |
| n8n 5678 | owner account, chave de criptografia e firewall de gestão; `N8N_SECURE_COOKIE=false` enquanto o acesso for HTTP interno |
| Grafana 3000 | senha administrativa, signup desativado e acesso NOC/gestão |
| InfluxDB 8086 | token e firewall de gestão |

TLS não está habilitado nesta fase. O controle compensatório é rede interna segmentada e firewall. Se qualquer tráfego cruzar rede não confiável, MQTT/HTTP devem receber TLS por proxy/certificados.

`0.0.0.0` é somente endereço de escuta. Ele não deve ser usado em URL pública,
registro DNS, configuração MQTT do ESP32 ou webhook do n8n.

## Validação

- Node-RED e n8n aceitam apenas `device_id` restrito e números em faixas explícitas.
- InfluxDB line protocol escapa tags.
- n8n chama `zabbix_sender` via `execFileSync` e argumentos separados, sem interpolar payload em shell.
- ESP32 não recebe comandos MQTT nesta fase.

## Containers

- PostgreSQL e Flask não são expostos porque não existem na nova stack.
- Volumes persistem dados; `docker compose down -v` é proibido em produção.
- Imagens estão fixadas em versões/linhas menores e devem ser revisadas antes de atualização.
- A permissão `NODE_FUNCTION_ALLOW_BUILTIN=child_process` aumenta a capacidade do Code node n8n; somente administradores confiáveis podem editar workflows.

## Pendências antes de produção

1. Rotacionar a senha Wi-Fi antiga.
2. Limitar portas por sub-rede no firewalld.
3. Criar usuários/senhas fortes e únicas.
4. Confirmar que a porta 1884 não está publicada por `docker compose ps`.
5. Executar auditoria n8n e revisar imagens/dependências.
6. Reverter `N8N_SECURE_COOKIE` para `true` quando o n8n passar a ser servido por HTTPS.
