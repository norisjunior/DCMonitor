# Arquitetura — DCMonitor

> Última atualização: 2026-11-25.

## Fluxo de dados

```text
                                                             ┌─► InfluxDB ─► Grafana
ESP32 + DHT22 ── MQTT/TLS :8883 ──► Mosquitto ─┬─► Node-RED ─┤
  usuário = device_id               :1884      │             └─► Zabbix (1 e, opcional, 2)
  senha própria                     interno    └─► n8n (Telegram, fase futura)
       │
       └── NTP :123/udp ──► chrony do servidor

Navegador (rede de gestão) ── :1880/admin/ ──► Node-RED ─┬─► cadastro/dispositivos.json (host)
                                                         └─► $CONTROL/dynamic-security ──► Mosquitto
```

Todos os serviços de servidor executam no mesmo Docker Compose no Oracle Linux 9. O Node-RED grava no InfluxDB e envia ao Zabbix em duas ramificações independentes do mesmo fluxo: falha no Zabbix não bloqueia o InfluxDB. Com `ZABBIX_SERVER_2`, os mesmos itens vão também a um segundo servidor Zabbix. O n8n não tem workflow ativo; se voltar a assinar a porta interna, precisa de credencial própria no broker. O chrony do Oracle Linux, fora do Compose, serve hora às placas.

As portas publicadas fazem bind em `0.0.0.0`. Clientes acessam o servidor pelo
IP atual `10.32.8.115` ou por um nome DNS que aponte para esse IP; o endereço de
escuta não é usado como hostname público.

## Componentes e responsabilidades

| Componente | Responsabilidade |
|---|---|
| ESP32 | Ler DHT22, calcular índice de calor, reportar RSSI, exibir medições, horário e `device_id` no OLED, publicar a cada ~60 s com deep sleep entre ciclos e anunciar status MQTT |
| Mosquitto | Terminar o TLS, autenticar cada dispositivo pela própria senha, restringir cada um ao próprio ramo de tópicos (plugin dynamic security) e distribuir mensagens aos consumidores internos |
| Node-RED | Validar o contrato mínimo, enriquecer a medição com local e nome do cadastro, gravar no InfluxDB, alimentar os itens trapper do Zabbix, servir a página de cadastro e administrar as credenciais MQTT das placas |
| chrony (host) | Servir NTP às redes das placas, para o horário do display |
| InfluxDB | Armazenar séries temporais por 90 dias |
| Grafana | Consultar InfluxDB e exibir dashboard do NOC, filtrável por local e dispositivo |
| n8n | Reservado para as automações de notificação (Telegram); sem workflow ativo |
| Zabbix | Receber valores em itens trapper e aplicar alertas operacionais |

## Organização do firmware ESP32

```text
ESP32DC.ino          struct + ciclo em setup() + Wi-Fi/MQTT/NTP + JSON + deep sleep
                     + espera da credencial pela serial
DC_Ambiente.hpp      DHT22 + validação + índice de calor
DC_Comunicacao.hpp   cliente TLS/MQTT + senha carregada + identidade/tópicos
DC_Credencial.hpp    senha MQTT na NVS (Preferences)
DC_Display.hpp       OLED SSD1306 + cabeçalho com horário + layout das caixas
config.hpp           configuração local não versionada
ca_cert.hpp          certificado público da CA, gerado no servidor, não versionado
```

O `.ino` concentra o fluxo executável para leitura didática. O header de comunicação não inicializa, reconecta ou publica; fornece somente os objetos compartilhados e a identidade MQTT. O módulo do sensor permanece separado porque encapsula uma biblioteca e regras específicas do DHT22. O módulo de display segue o mesmo critério: todo o cálculo de layout fica nele, e o `.ino` apenas entrega os valores já lidos.

Desde o firmware 1.4.0 o dispositivo trabalha em ciclos com deep sleep: acorda, lê o sensor, conecta, publica, desconecta de forma limpa, atualiza o display e dorme 60 s. Cada espera de rede tem limite e um watchdog encerra ciclos travados. O display é atualizado mesmo sem rede e mantém a imagem durante o sono, com o horário da medição no cabeçalho. A disponibilidade da placa passa a ser inferida pela chegada da telemetria, não pelo tópico de status.

Desde o firmware 1.6.0 a placa conecta só por TLS na porta 8883, com usuário igual ao `device_id` e senha própria gravada na NVS. Sem senha, ela não entra no ciclo: espera pela serial a linha `credencial <device_id> <senha>` gerada na página `/admin/`, grava e reinicia. O TLS da placa confere cadeia e nome do certificado, não as datas (o mbedTLS do framework é compilado sem verificação de datas), então funciona sem NTP; o NTP serve só ao horário do display.

## Identidade na frota

O `device_id` derivado de `ESP.getEfuseMac()` é a única chave de dispositivo do sistema e atravessa todas as camadas sem tradução:

```text
ESP.getEfuseMac()
  └─► device_id  esp32-18B4C0D8CBB0
        ├─► tópicos MQTT   fdctmon/esp32-18B4C0D8CBB0/{data,status,cmd}
        ├─► usuário e client-id MQTT esp32-18B4C0D8CBB0
        ├─► papel no broker disp-esp32-18B4C0D8CBB0
        ├─► hostname DHCP  esp32-18B4C0D8CBB0
        ├─► cabeçalho OLED esp32-18B4C0D8CBB0
        ├─► tag InfluxDB   device_id
        ├─► chave do cadastro dispositivos.json
        └─► host Zabbix    esp32-18B4C0D8CBB0
```

O Node-RED assina `fdctmon/+/data`, então uma placa nova entra na ingestão sem alterar o fluxo. Nomes legíveis ficam fora do firmware, no cadastro de dispositivos descrito abaixo; no Zabbix, o nome visível do host continua sendo o lugar para o rótulo local.

## Tópicos MQTT

| Tópico | Sentido | Uso |
|---|---|---|
| `fdctmon/{device_id}/data` | placa → servidor | telemetria, QoS 0, não retida |
| `fdctmon/{device_id}/status` | placa → servidor | `online` retido ao conectar; Last Will `offline` |
| `fdctmon/{device_id}/cmd` | servidor → placa | reservado para comandos futuros; o firmware ainda não assina |

Como a placa passa a maior parte do tempo em deep sleep, um comando futuro precisará ser publicado como mensagem retida em `/cmd` e lido pela placa ao acordar.

O Mosquitto usa o plugin dynamic security. Cada placa é um cliente com usuário igual ao `device_id` e o papel `disp-<device_id>`, que só permite publicar em `fdctmon/<device_id>/data` e `/status` e ler `fdctmon/<device_id>/cmd`. As permissões são literais, uma cópia por placa: o plugin do Mosquitto 2.0.22 não aceita `%u` nem `%c`. Publicação negada é descartada pelo broker sem derrubar a conexão. O Node-RED entra na porta interna 1884 com `MQTT_ADMIN_USER`, que tem o papel `ingestao` (lê `fdctmon/#`, pode publicar em `fdctmon/+/cmd`) e o papel de administração do plugin. O Node-RED ainda confere se o `device_id` do payload é igual ao do tópico e descarta a medição quando não é.

## Credenciais MQTT

```text
/admin/ ── POST/PUT /api/credenciais/:id ─► Node-RED ── $CONTROL/dynamic-security/v1 ──► Mosquitto
        ◄── linha "credencial <id> <senha>" ── (resposta em .../v1/response) ◄──
técnico ── cola a linha no monitor serial ──► ESP32 grava na NVS e reinicia
```

- A aba "Credenciais MQTT" do Node-RED expõe `GET /api/credenciais`, `POST /api/credenciais/:id` (cria; 409 se a placa já tem senha), `PUT /api/credenciais/:id` (troca) e `DELETE /api/credenciais/:id` (revoga), com o login da página de cadastro e o cabeçalho obrigatório `X-DCMonitor: 1` (403 sem ele, contra CSRF).
- Só IDs no formato do firmware (`^esp32-[0-9A-F]{12}$`) são aceitos; o administrador e outros clientes internos ficam fora do alcance da API. Uma operação por placa de cada vez (409).
- Trocar apaga e recria cliente e papel da placa; a sessão aberta com a senha antiga cai. Revogar apaga os dois e é idempotente.
- A senha tem 32 caracteres `[A-Za-z0-9_-]` e volta uma única vez na resposta. O broker guarda só o hash em `dynamic-security.json`, num diretório do host (`MQTT_SEGURANCA_DIR`).
- A requisição HTTP fica pendente até a resposta do broker; sem resposta em 5 s, responde 504 e avisa que o estado da credencial é incerto.
- O cliente e o papel `ingestao` do Node-RED são criados por `mosquitto/iniciar.sh` na primeira subida do broker.

## TLS

`scripts/gerar_certificados.sh` cria uma CA própria (10 anos) e emite o certificado do servidor (825 dias), com os nomes e IPs pelos quais as placas chegam ao broker. O certificado público da CA vai para o firmware em `ca_cert.hpp`, igual para toda a frota. Renovar o certificado do servidor não exige regravar placas; trocar a CA exige.

## Cadastro de dispositivos

O local e o nome amigável de cada placa ficam em `dispositivos.json`, num diretório do host (`CADASTRO_DIR`, padrão `./cadastro`) montado no Node-RED em `/data/cadastro`. O firmware não muda: o cadastro é indexado pelo `device_id`.

```json
{
  "schema_version": 1,
  "revisao": 3,
  "locais": { "biblioteca": "Biblioteca" },
  "dispositivos": {
    "esp32-18B4C0D8CBB0": { "nome": "Rack 2", "local": "biblioteca" }
  }
}
```

- Locais têm código (slug imutável, minúsculas, números e hífen, até 32 caracteres) e nome (até 48 caracteres). O código `sem-local` é reservado.
- Nome do dispositivo: até 64 caracteres. Nome e local são opcionais.
- O Node-RED lê o arquivo ao iniciar e mantém o cadastro em memória. Sem o arquivo, cria um cadastro vazio. Com JSON inválido ou erro de leitura, o cadastro não carrega, a página mostra o motivo e a telemetria continua gravando sem local e nome.
- A página `http://SERVIDOR:1880/admin/` é servida pelo próprio Node-RED (`httpStatic`) e usa `GET /api/cadastro` e `PUT /api/cadastro`. O login é próprio, separado do editor. O `PUT` exige a revisão atual (409 se outra janela salvou antes), grava o arquivo e só então aplica o cadastro em memória: vale para as próximas medições, sem reiniciar.
- A página lista as placas vistas desde o último reinício do Node-RED, com situação e última leitura, as cadastradas e as que têm credencial MQTT. Placa vista sem cadastro aparece como "novo".

A medição gravada no InfluxDB recebe as tags `local` (código do local, ou `sem-local`) e `nome` (nome amigável, ou o próprio `device_id`). O Zabbix não muda: host igual ao `device_id`, mesmas chaves.

## Fronteiras de segurança

- `8883/tcp`: todas as interfaces do host → Mosquitto, somente TLS, com usuário e senha por placa; usado pelos ESP32. A 1883 não existe mais.
- `1884/tcp`: somente rede Docker, sem TLS, com login `MQTT_ADMIN_USER`; não publicado no host. A credencial do Node-RED vem do ambiente, via `flows_cred.json`, e não aparece no fluxo versionado.
- `123/udp`: chrony do host, para as redes das placas.
- `1880`, `3000`, `5678`, `8086`: interfaces administrativas; firewall deve limitar à rede de gestão. A página de cadastro usa a mesma porta `1880` do editor, com login separado. A senha MQTT gerada trafega nessa porta, sem TLS.
- InfluxDB não recebe escrita direta dos dispositivos.
- Node-RED lê o token InfluxDB do ambiente; ele não aparece no fluxo versionado e só trafega na rede interna do Compose.
- O envio ao Zabbix usa o protocolo trapper por socket, sem executar processo externo nem compor linha de comando.

## Modelo InfluxDB

```text
measurement: ambiente
tags:        device_id, sensor, local, nome
fields:      temperatura (float), umidade (float), indice_calor (float opcional),
             rssi (float opcional)
timestamp:   atribuído pelo servidor
```

`device_id`, `sensor`, `local` e `nome` são tags porque filtram séries. Valores de medição são fields para evitar cardinalidade desnecessária. Renomear uma placa ou trocá-la de local cria uma série nova dali em diante; o trecho anterior continua com as tags antigas. Dados gravados antes do cadastro não têm `local` nem `nome` e ficam fora dos filtros do Grafana.

## Contratos

O contrato MQTT completo está em `docs/REQUIREMENTS.md`. O mínimo exigido pela validação é `device_id`, `temp` e `umid`; o ESP32 versão 1 também envia `ic`, `rssi`, `sensor`, `schema_version` e `firmware_version`. Os campos aditivos continuam opcionais na validação para que uma versão de firmware sem eles não deixe de gravar.

O `rssi` é diagnóstico de enlace, não medição ambiental. Por ser opcional e aditivo, foi incluído sem alterar `schema_version`: consumidores que o ignoram continuam válidos.

## Evolução prevista

1. Ampliar a frota de ESP32, um host homônimo no Zabbix por dispositivo.
2. Adicionar sensores ao ESP32 somente após novos requisitos e versão de payload.
3. Definir as regras de notificação e ativar o n8n.

## Riscos

- A porta MQTT interna não tem TLS e depende do isolamento da rede Docker.
- A senha de cada placa fica na flash sem cifragem; sem revogação de certificado (CRL), vazamento da chave da CA exige CA nova e regravar a frota. Veja `docs/SECURITY.md`.
- O login `MQTT_ADMIN_USER` também é aceito na porta 8883, porque a autenticação é global (`per_listener_settings false`).
- A placa não verifica as datas do certificado do broker: um certificado vencido ou com chave vazada continua aceito até a troca da CA. Renove o certificado do servidor (825 dias) mesmo assim, para os demais clientes.
- A contingência n8n ainda não tem credencial no broker.
- Placas vistas pela página de cadastro ficam só em memória e somem a cada reinício do Node-RED até a próxima medição.
- O nó `zabbix-sender` só reporta erro de transporte: item trapper inexistente é recusado pelo servidor sem aparecer no log do Node-RED.
- Dashboard provisionado assume o bucket `fdctmon`; alterar o nome exige atualizar suas consultas.
- InfluxDB OSS em nó único não oferece alta disponibilidade.
