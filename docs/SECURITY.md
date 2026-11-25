# Segurança

Status atual: **aprovado com ressalvas**, condicionado à rotação da senha Wi-Fi exposta no protótipo e ao preenchimento seguro do `.env`.

## Segredos

- `.env` e `ESP32/include/config.hpp` são ignorados pelo Git. O firmware não tem mais senha MQTT no `config.hpp`.
- Exemplos usam placeholders.
- Tokens do InfluxDB, chave do n8n, secret do Node-RED e os hashes bcrypt de login (`NODE_RED_ADMIN_PASSWORD_HASH`, `CADASTRO_ADMIN_PASSWORD_HASH`) não devem aparecer em flows, logs ou screenshots.
- `MQTT_ADMIN_PASSWORD` é o login do Node-RED no broker e administra todas as credenciais das placas. Trate como o segredo mais sensível do `.env`. O Mosquitto recusa subir com valor `TROQUE_*` ou com menos de 24 caracteres; gere com `openssl rand -base64 32`. Dentro do container, a senha fica em `/root/.config/mosquitto_pub` e `/root/.config/mosquitto_ctrl` (modo `0600`), para que o healthcheck não a passe na linha de comando, visível no `ps` do host.
- `pki/ca/ca.key` é a chave da CA, sem senha: quem a tem emite um certificado de servidor que as placas aceitam. Guarde uma cópia em cofre. `pki/mosquitto/server.key` é a chave do broker. `pki/` é ignorado pelo Git.
- `mqtt-seguranca/dynamic-security.json` guarda clientes, papéis e hashes das senhas, nunca a senha em claro. É ignorado pelo Git e entra no backup.
- `ESP32/include/ca_cert.hpp` contém só o certificado público da CA; não é segredo, mas é específico da instalação e fica fora do Git.
- O cadastro de dispositivos (`cadastro/dispositivos.json`) não contém segredo, mas é dado operacional: fica fora do Git e entra no backup.
- `node-red/flows_cred.json` versionado contém apenas os textos `${INFLUXDB_TOKEN}`, `${MQTT_ADMIN_USER}` e `${MQTT_ADMIN_PASSWORD}`; os valores reais vêm do ambiente e são cifrados com `NODE_RED_CREDENTIAL_SECRET` na primeira gravação.
- A senha Wi-Fi que existia no firmware inicial deve ser rotacionada antes do uso em produção.
- O `.env` deve ter modo `0600` no Oracle Linux e backup em cofre seguro.

## Superfície de rede

O host publica cinco portas TCP em `0.0.0.0`, portanto elas escutam em todas as
interfaces. Isso permite acesso pelo IP atual `10.32.8.115` e por DNS futuro,
mas torna obrigatória a restrição de origem no `firewalld`.

| Entrada | Controle |
|---|---|
| MQTT 8883 | somente TLS com a CA própria; usuário = `device_id` e senha própria por placa; papel `disp-<device_id>`; firewall limitado às redes das placas |
| MQTT 1884 | sem TLS e não publicado, somente rede Docker; login `MQTT_ADMIN_USER` obrigatório |
| MQTT 1883 | não existe mais; mantenha fechada no firewall |
| NTP 123/udp | chrony do host, serve hora às redes das placas (`allow` no `/etc/chrony.conf`) |
| Node-RED 1880 | editor com autenticação bcrypt; página `/admin/` e APIs `/api/cadastro` e `/api/credenciais` com login próprio (Basic, bcrypt); firewall de gestão |
| n8n 5678 | owner account, chave de criptografia e firewall de gestão; `N8N_SECURE_COOKIE=false` enquanto o acesso for HTTP interno |
| Grafana 3000 | senha administrativa, signup desativado e acesso NOC/gestão |
| InfluxDB 8086 | token e firewall de gestão |

O MQTT das placas usa TLS (porta 8883). As interfaces HTTP (1880, 3000, 5678, 8086) ainda não têm TLS: o controle compensatório é rede interna segmentada e firewall. Se esse tráfego cruzar rede não confiável, deve receber TLS por proxy reverso.

`0.0.0.0` é somente endereço de escuta. Ele não deve ser usado em URL pública,
registro DNS, configuração MQTT do ESP32 ou webhook do n8n.

## Credencial MQTT por dispositivo e TLS

Cada placa tem usuário (o `device_id`) e senha próprios, guardados no plugin dynamic security do Mosquitto. O papel `disp-<device_id>` só permite publicar em `fdctmon/<device_id>/data` e `/status` e ler `fdctmon/<device_id>/cmd`. As regras são literais, uma cópia por placa, porque o plugin do Mosquitto 2.0.22 não aceita `%u` nem `%c` nas ACLs. Publicação negada é descartada pelo broker sem derrubar a conexão, então um erro de configuração aparece como silêncio no tópico, não como erro no cliente. Uma placa também não consegue assinar `fdctmon/#` nem ler a telemetria das outras.

A senha é gerada no Node-RED (32 caracteres de `crypto.randomBytes`), entregue uma única vez à página `/admin/` e colada na serial da placa, que a grava na NVS. O broker guarda só o hash. O Node-RED não registra a senha em log nem a grava em disco.

O que isso resolve:

- Uma placa não publica no ramo de outra: a permissão vem do usuário autenticado, não do client-id. A senha de uma placa não serve para outra.
- Revogar ou trocar a senha de uma placa não afeta as demais. A troca derruba na hora a sessão aberta com a senha antiga.
- Não há senha MQTT no código nem no `config.hpp`; o mesmo binário serve a toda a frota.
- O TLS cifra a senha e a telemetria na rede das placas. A placa só aceita um broker com certificado assinado pela CA do DCMonitor e com o `MQTT_HOST` entre os nomes, o que impede um broker falso de colher senhas.

Limites:

- A senha fica na flash da placa, legível por quem tiver acesso físico: a flash encryption do ESP32 não está habilitada.
- A placa nunca verifica a validade (datas) do certificado do broker, nem com NTP: o mbedTLS do framework do ESP32 é compilado sem verificação de datas (`CONFIG_MBEDTLS_HAVE_TIME_DATE` desligado). Ela confere só a cadeia e o nome. Não há revogação de certificado (CRL). Um certificado de servidor vencido, ou com a chave vazada, continua aceito pelas placas até a troca da CA, que exige regravar todas elas. Se `pki/ca/ca.key` vazar, o mesmo vale.
- A página `/admin/` usa HTTP Basic sem TLS, e a senha gerada trafega em claro na resposta do `POST` e do `PUT` em `/api/credenciais/:id`. Por isso a porta 1880 deve ficar só na rede de gestão.
- Com `per_listener_settings false`, a autenticação é a mesma nas duas portas: o login `MQTT_ADMIN_USER` também é aceito na 8883, publicada no host. Por isso a senha forte exigida pelo `iniciar.sh` e o firewall limitando a 8883 às redes das placas.
- Conexões com client-id repetido derrubam a sessão anterior, mas só quem tem uma credencial válida chega a esse ponto.

Próximo passo previsto: certificado de cliente por placa, com `require_certificate` e `use_identity_as_username`, no lugar da senha.

Como defesa adicional, o Node-RED descarta medição cujo `device_id` do payload difere do tópico.

## Página de cadastro

- Login próprio, separado do editor: `CADASTRO_ADMIN_USER` e `CADASTRO_ADMIN_PASSWORD_HASH` protegem a página (`httpStaticAuth`) e as APIs de cadastro e de credenciais (`httpNodeAuth`). Quem cadastra placas não edita fluxos, mas gera, troca e revoga senhas MQTT. Sem o hash, o Node-RED não sobe.
- `httpNodeAuth` vale para todo nó `http in`: qualquer endpoint HTTP criado no futuro herda esse mesmo login.
- O login é HTTP Basic sem TLS nesta fase: a senha de login trafega apenas codificada, e a senha MQTT gerada trafega em claro na resposta. Vale o controle compensatório de rede de gestão e firewall.
- Força bruta e indisponibilidade: o Node-RED confere a senha com bcrypt síncrono e não limita tentativas. Uma rajada de logins errados a partir da rede trava o processo, e com ele a ingestão MQTT e o envio ao Zabbix. Mitigação: porta 1880 aberta só para a rede de gestão, usuário diferente do padrão `cadastro` e, quando houver HTTPS, proxy reverso com limite de requisições.
- XSS: a página compartilha a origem com o editor do Node-RED. Todo texto vindo do servidor (nomes, locais, `device_id`) entra no DOM por `textContent`/`value`, nunca por `innerHTML`. Como defesa em profundidade, a página e a API respondem com `Content-Security-Policy` (`script-src 'self'`, script em `admin/app.js`, sem script inline), `frame-ancestors 'none'` e `X-Frame-Options: DENY` contra clickjacking, e `X-Content-Type-Options: nosniff`.
- CSRF: o Node-RED não tem CORS configurado, e a gravação usa `PUT` com corpo JSON, que exige preflight em requisição de outra origem; sem resposta CORS, o navegador não envia o `PUT`. Formulários HTML não geram `PUT`. Outra origem também não lê a resposta do `GET`.
- Credenciais: todas as rotas de `/api/credenciais` exigem o cabeçalho `X-DCMonitor: 1` e respondem 403 sem ele. A página envia o cabeçalho; numa requisição de outra origem, um cabeçalho próprio exige preflight CORS, que o Node-RED não autoriza. Assim outro site não gera, troca nem revoga senhas com o login Basic guardado no navegador.
- A API de credenciais só aceita IDs no formato do firmware, `^esp32-[0-9A-F]{12}$` (400 caso contrário): o administrador e outros clientes internos, como um futuro cliente do n8n, não podem ser alterados por ela. Gerar (`POST`) não sobrescreve senha existente (409); trocar é um `PUT` explícito. Duas operações simultâneas para a mesma placa: a segunda recebe 409.
- Broker sem resposta em 5 s: 504, com aviso de que o estado é incerto. O comando pode ter sido aplicado; a página orienta recarregar e, se a placa aparecer com senha, usar "Trocar senha".
- O `PUT` valida tudo no servidor: códigos de local, `device_id`, tamanho dos nomes, caracteres de controle, locais referenciados e limites de 200 locais e 2000 dispositivos. Controle de revisão evita que uma janela sobrescreva outra (409), inclusive em gravações simultâneas: a revisão é conferida de novo no nó síncrono que grava.
- A gravação é atômica (arquivo `.tmp` renomeado), com a versão anterior em `dispositivos.json.bak`; uma queda no meio não deixa o cadastro truncado.
- A lista de placas vistas (`vistos`) aceita no máximo 1000 entradas e descarta a mais antiga. Com credencial por placa, só usuários criados na página publicam telemetria, cada um no próprio ramo.

## Validação

- O Node-RED aceita apenas `device_id` restrito e números em faixas explícitas, antes de gravar ou enviar ao Zabbix.
- O nó `influxdb out` monta o ponto e escapa tags e fields; o fluxo não concatena line protocol.
- O envio ao Zabbix usa o protocolo trapper por socket, sem shell e sem processo externo.
- ESP32 não recebe comandos MQTT nesta fase. O tópico `fdctmon/{device_id}/cmd` está reservado e o papel de cada placa já restringe sua leitura ao próprio dispositivo.

## Containers

- PostgreSQL e Flask não são expostos porque não existem na nova stack.
- Volumes persistem dados; `docker compose down -v` é proibido em produção.
- Imagens estão fixadas em versões/linhas menores e devem ser revisadas antes de atualização.
- A permissão `NODE_FUNCTION_ALLOW_BUILTIN=child_process` aumenta a capacidade do Code node n8n; somente administradores confiáveis podem editar workflows.

## Pendências antes de produção

1. Rotacionar a senha Wi-Fi antiga.
2. Limitar portas por sub-rede no firewalld.
3. Criar usuários/senhas fortes e únicas.
4. Confirmar que a porta 1884 não está publicada por `docker compose ps` e que a 1883 está fechada no firewall.
5. Guardar `pki/ca/ca.key` em cofre e incluir `mqtt-seguranca/` no backup.
6. Limitar a 8883 às redes das placas: o login `MQTT_ADMIN_USER` também é aceito nela.
7. Usar senhas diferentes para o editor do Node-RED e para a página de cadastro, e um `CADASTRO_ADMIN_USER` diferente do padrão.
8. Executar auditoria n8n e revisar imagens/dependências.
9. Reverter `N8N_SECURE_COOKIE` para `true` quando o n8n passar a ser servido por HTTPS.

Pendências registradas para decisão do responsável:

- TLS na porta 1880 (página `/admin/` e editor do Node-RED): a senha MQTT gerada trafega em claro na resposta HTTP. Até lá, a 1880 fica só na rede de gestão.
- Chave da CA sem senha no servidor: recomenda-se, depois de emitir o certificado, guardar `pki/ca/ca.key` fora do servidor. Antes de uma renovação, devolva a chave para `pki/ca/`: sem ela, `scripts/gerar_certificados.sh` cria uma CA nova, o que exige regravar todas as placas.
