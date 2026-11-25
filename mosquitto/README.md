# Mosquitto — broker MQTT

| Arquivo | Conteúdo |
|---|---|
| `mosquitto.conf` | listeners, autenticação, ACL, persistência e log |
| `acl` | regras de tópico da porta 1883 |

Os dois são montados somente leitura no container. Na partida, o Compose gera o arquivo de senhas a partir de `MQTT_USERNAME` e `MQTT_PASSWORD` e copia `acl` para `/tmp/mosquitto_acl`, com dono `mosquitto` e modo `0640`.

## Portas

| Porta | Quem usa | Controle |
|---|---|---|
| 1883 | ESP32, publicada no host | usuário/senha únicos para a frota + ACL por client-id |
| 1884 | Node-RED e n8n, só na rede Docker | anônima, sem ACL |

## ACL

`%c` é o client-id da conexão. O firmware usa o `device_id` como client-id.

```text
pattern write fdctmon/%c/data
pattern write fdctmon/%c/status
pattern read fdctmon/%c/cmd
```

- Publicação fora do próprio ramo é descartada sem aviso; a conexão continua. O sintoma é silêncio no tópico.
- Na 1883, nenhum cliente lê `fdctmon/#`. Para observar o tráfego, use a porta interna:

```bash
docker compose exec mosquitto mosquitto_sub -p 1884 -t 'fdctmon/#' -v
```

- Para publicar um teste na 1883, passe `-i` igual ao `device_id` do tópico: `mosquitto_pub -i teste-001 -t fdctmon/teste-001/data ...`.
- A credencial é compartilhada: a ACL evita mistura acidental entre placas, mas não impede um cliente com a senha de usar o client-id de outra. Veja `docs/SECURITY.md`.

Alterações em `acl` ou `mosquitto.conf` valem após `docker compose restart mosquitto`.
