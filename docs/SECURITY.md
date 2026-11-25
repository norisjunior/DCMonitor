# Segurança

Status atual: **aprovado com ressalvas**, condicionado à rotação da senha Wi-Fi exposta no protótipo e ao preenchimento seguro do `.env`.

## Segredos

- `.env` e `ESP32/include/config.hpp` são ignorados pelo Git.
- Exemplos usam placeholders.
- Tokens do InfluxDB, chave do n8n, secret do Node-RED e os hashes bcrypt de login (`NODE_RED_ADMIN_PASSWORD_HASH`, `CADASTRO_ADMIN_PASSWORD_HASH`) não devem aparecer em flows, logs ou screenshots.
- O cadastro de dispositivos (`cadastro/dispositivos.json`) não contém segredo, mas é dado operacional: fica fora do Git e entra no backup.
- `node-red/flows_cred.json` versionado contém apenas o texto `${INFLUXDB_TOKEN}`; o valor real vem do ambiente e é cifrado com `NODE_RED_CREDENTIAL_SECRET` na primeira gravação.
- A senha Wi-Fi que existia no firmware inicial deve ser rotacionada antes do uso em produção.
- O `.env` deve ter modo `0600` no Oracle Linux e backup em cofre seguro.

## Superfície de rede

O host publica as cinco portas em `0.0.0.0`, portanto elas escutam em todas as
interfaces. Isso permite acesso pelo IP atual `10.32.8.115` e por DNS futuro,
mas torna obrigatória a restrição de origem no `firewalld`.

| Entrada | Controle |
|---|---|
| MQTT 1883 | usuário/senha obrigatórios; ACL por client-id; firewall limitado à rede IoT |
| MQTT 1884 | anônimo, sem ACL, mas não publicado; somente rede Docker |
| Node-RED 1880 | editor com autenticação bcrypt; página `/admin/` e API `/api/cadastro` com login próprio (Basic, bcrypt); firewall de gestão |
| n8n 5678 | owner account, chave de criptografia e firewall de gestão; `N8N_SECURE_COOKIE=false` enquanto o acesso for HTTP interno |
| Grafana 3000 | senha administrativa, signup desativado e acesso NOC/gestão |
| InfluxDB 8086 | token e firewall de gestão |

TLS não está habilitado nesta fase. O controle compensatório é rede interna segmentada e firewall. Se qualquer tráfego cruzar rede não confiável, MQTT/HTTP devem receber TLS por proxy/certificados.

`0.0.0.0` é somente endereço de escuta. Ele não deve ser usado em URL pública,
registro DNS, configuração MQTT do ESP32 ou webhook do n8n.

## ACL do MQTT

Na porta 1883, `mosquitto/acl` usa o client-id da conexão (`%c`): cada cliente só escreve em `fdctmon/%c/data` e `fdctmon/%c/status` e só lê `fdctmon/%c/cmd`. O firmware usa o `device_id` como client-id. Publicação negada é descartada pelo broker sem derrubar a conexão, então um erro de configuração aparece como silêncio no tópico, não como erro no cliente. Um cliente na 1883 também não consegue assinar `fdctmon/#` nem ler a telemetria das outras placas.

Limite: a credencial MQTT é única para a frota. Quem tem a senha pode se conectar com o client-id de outra placa e publicar no ramo dela; a ACL impede erro e mistura acidental entre placas, não falsificação deliberada. Conexões com client-id repetido também derrubam a sessão anterior. Fechar esse ponto exige credencial ou certificado por dispositivo (`use_identity_as_username` com TLS), fora do escopo desta fase. Como defesa adicional, o Node-RED descarta medição cujo `device_id` do payload difere do tópico.

## Página de cadastro

- Login próprio, separado do editor: `CADASTRO_ADMIN_USER` e `CADASTRO_ADMIN_PASSWORD_HASH` protegem a página (`httpStaticAuth`) e a API (`httpNodeAuth`). Quem cadastra placas não edita fluxos. Sem o hash, o Node-RED não sobe.
- `httpNodeAuth` vale para todo nó `http in`: qualquer endpoint HTTP criado no futuro herda esse mesmo login.
- O login é HTTP Basic sem TLS nesta fase: a senha trafega apenas codificada. Vale o controle compensatório de rede de gestão e firewall.
- Força bruta e indisponibilidade: o Node-RED confere a senha com bcrypt síncrono e não limita tentativas. Uma rajada de logins errados a partir da rede trava o processo, e com ele a ingestão MQTT e o envio ao Zabbix. Mitigação: porta 1880 aberta só para a rede de gestão, usuário diferente do padrão `cadastro` e, quando houver HTTPS, proxy reverso com limite de requisições.
- XSS: a página compartilha a origem com o editor do Node-RED. Todo texto vindo do servidor (nomes, locais, `device_id`) entra no DOM por `textContent`/`value`, nunca por `innerHTML`. Como defesa em profundidade, a página e a API respondem com `Content-Security-Policy` (`script-src 'self'`, script em `admin/app.js`, sem script inline), `frame-ancestors 'none'` e `X-Frame-Options: DENY` contra clickjacking, e `X-Content-Type-Options: nosniff`.
- CSRF: o Node-RED não tem CORS configurado, e a gravação usa `PUT` com corpo JSON, que exige preflight em requisição de outra origem; sem resposta CORS, o navegador não envia o `PUT`. Formulários HTML não geram `PUT`. Outra origem também não lê a resposta do `GET`.
- O `PUT` valida tudo no servidor: códigos de local, `device_id`, tamanho dos nomes, caracteres de controle, locais referenciados e limites de 200 locais e 2000 dispositivos. Controle de revisão evita que uma janela sobrescreva outra (409), inclusive em gravações simultâneas: a revisão é conferida de novo no nó síncrono que grava.
- A gravação é atômica (arquivo `.tmp` renomeado), com a versão anterior em `dispositivos.json.bak`; uma queda no meio não deixa o cadastro truncado.
- A lista de placas vistas (`vistos`) aceita no máximo 1000 entradas e descarta a mais antiga: client-ids arbitrários de quem tem a credencial da frota não esgotam a memória. Esses client-ids ainda criam séries no InfluxDB, limite herdado da credencial compartilhada.

## Validação

- O Node-RED aceita apenas `device_id` restrito e números em faixas explícitas, antes de gravar ou enviar ao Zabbix.
- O nó `influxdb out` monta o ponto e escapa tags e fields; o fluxo não concatena line protocol.
- O envio ao Zabbix usa o protocolo trapper por socket, sem shell e sem processo externo.
- ESP32 não recebe comandos MQTT nesta fase. O tópico `fdctmon/{device_id}/cmd` está reservado e a ACL já restringe sua leitura ao próprio dispositivo.

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
5. Usar senhas diferentes para o editor do Node-RED e para a página de cadastro, e um `CADASTRO_ADMIN_USER` diferente do padrão.
6. Executar auditoria n8n e revisar imagens/dependências.
7. Reverter `N8N_SECURE_COOKIE` para `true` quando o n8n passar a ser servido por HTTPS.
