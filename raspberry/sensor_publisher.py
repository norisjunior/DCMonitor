################################################################################
# FdctMonSys — Raspberry Pi Sensor Publisher
# Coleta sensores DHT11, MQ-2 e HC-SR04 e publica JSON via MQTT.
# Sem armazenamento local. Sem chamadas ao Zabbix (responsabilidade do servidor).
################################################################################

import os
import time
import json
import datetime
import uuid
import logging

import RPi.GPIO as GPIO
import Adafruit_DHT
import paho.mqtt.client as mqtt
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ── Configuração (via .env ou variáveis de ambiente) ──────────────────────────
BROKER_HOST = os.environ["MQTT_BROKER_HOST"]
BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
DEVICE_ID   = hex(uuid.getnode())[2:]
TOPIC       = f"fdctmon/{DEVICE_ID}/attrs"

# ── Pinos GPIO ────────────────────────────────────────────────────────────────
DHT_SENSOR     = Adafruit_DHT.DHT11
DHT_PIN        = 26
MQ2_DO_PIN     = 4
HCSR04_TRIG    = 17
HCSR04_ECHO    = 27

PRESENCE_THRESHOLD_CM   = 200   # distância abaixo disso = presença detectada
PRESENCE_ALERT_HOUR_START = 22  # início do período de alerta (22h)
PRESENCE_ALERT_HOUR_END   = 6   # fim do período de alerta (6h)

LOOP_INTERVAL_S = 2    # intervalo da coleta de presença/fumaça
TEMP_INTERVAL_S = 30   # intervalo da coleta de temperatura/umidade

# ── Setup GPIO ────────────────────────────────────────────────────────────────
GPIO.setmode(GPIO.BCM)
GPIO.setup(MQ2_DO_PIN,  GPIO.IN)
GPIO.setup(HCSR04_TRIG, GPIO.OUT)
GPIO.setup(HCSR04_ECHO, GPIO.IN)


# ── Leituras de sensores ──────────────────────────────────────────────────────

def le_distancia():
    GPIO.output(HCSR04_TRIG, True)
    time.sleep(0.00001)
    GPIO.output(HCSR04_TRIG, False)

    t_inicio = time.time()
    t_fim    = time.time()
    while GPIO.input(HCSR04_ECHO) == 0:
        t_inicio = time.time()
    while GPIO.input(HCSR04_ECHO) == 1:
        t_fim = time.time()

    distancia = ((t_fim - t_inicio) * 34300) / 2
    log.info("HC-SR04: %.1f cm", distancia)
    return round(distancia, 1)


def le_fumaca():
    fumaca = 1 if GPIO.input(MQ2_DO_PIN) == GPIO.LOW else 0
    log.info("MQ-2: fumaca=%d", fumaca)
    return fumaca


def le_temperatura_umidade():
    umidade, temperatura = Adafruit_DHT.read_retry(DHT_SENSOR, DHT_PIN)
    if temperatura is None or umidade is None:
        log.warning("DHT11: leitura inválida, retornando None")
        return None, None
    log.info("DHT11: temp=%.1f°C umid=%.1f%%", temperatura, umidade)
    return round(temperatura, 1), round(umidade, 1)


def calcula_presenca_notificavel(distancia):
    """Retorna 1 somente se há presença (< threshold) E o horário é de alerta."""
    if distancia >= PRESENCE_THRESHOLD_CM:
        return 0
    hora_atual = datetime.datetime.now().hour
    em_horario_alerta = (
        hora_atual >= PRESENCE_ALERT_HOUR_START
        or hora_atual < PRESENCE_ALERT_HOUR_END
    )
    return 1 if em_horario_alerta else 0


# ── MQTT ──────────────────────────────────────────────────────────────────────

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        log.info("MQTT conectado ao broker %s:%d", BROKER_HOST, BROKER_PORT)
    else:
        log.error("MQTT falha na conexão: rc=%d", rc)


def on_disconnect(client, userdata, rc):
    if rc != 0:
        log.warning("MQTT desconectado inesperadamente (rc=%d); reconectando...", rc)


def publica(client, payload: dict):
    msg = json.dumps(payload)
    result = client.publish(TOPIC, msg, qos=1)
    if result.rc != mqtt.MQTT_ERR_SUCCESS:
        log.error("MQTT falha ao publicar: rc=%d", result.rc)
    else:
        log.info("MQTT publicado → %s: %s", TOPIC, msg)


# ── Loop principal ────────────────────────────────────────────────────────────

def main():
    client = mqtt.Client(client_id=f"pi_{DEVICE_ID}")
    client.on_connect    = on_connect
    client.on_disconnect = on_disconnect
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    log.info("Conectando ao broker %s:%d ...", BROKER_HOST, BROKER_PORT)
    client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
    client.loop_start()

    # Cache de temperatura/umidade: atualizado a cada TEMP_INTERVAL_S
    temp_cache  = None
    umid_cache  = None
    tempo_ultima_temp = 0

    try:
        while True:
            agora = time.time()

            # Atualiza cache de temperatura a cada 30 s
            if agora - tempo_ultima_temp >= TEMP_INTERVAL_S:
                temp_cache, umid_cache = le_temperatura_umidade()
                tempo_ultima_temp = agora

            distancia            = le_distancia()
            fumaca               = le_fumaca()
            presenca_notificavel = calcula_presenca_notificavel(distancia)

            payload = {
                "device_id":            DEVICE_ID,
                "temp":                 temp_cache,
                "umid":                 umid_cache,
                "fumaca":               fumaca,
                "presenca_notificavel": presenca_notificavel,
                "distancia":            distancia,
            }

            publica(client, payload)
            time.sleep(LOOP_INTERVAL_S)

    except KeyboardInterrupt:
        log.info("Encerrado pelo usuário.")
    finally:
        client.loop_stop()
        client.disconnect()
        GPIO.cleanup()
        log.info("GPIO limpo. Saindo.")


if __name__ == "__main__":
    main()
