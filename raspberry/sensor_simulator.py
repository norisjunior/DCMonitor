"""
Simulador do Raspberry Pi para testes em homologação.
Gera valores aleatórios dentro de faixas realistas e publica no mesmo
tópico e formato JSON que o sensor_publisher.py real.
Não requer GPIO, Adafruit_DHT nem hardware — roda em qualquer Linux/WSL.
"""

import os
import time
import json
import datetime
import random
import logging
from collections import deque

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

BROKER_HOST = os.environ["MQTT_BROKER_HOST"]
BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
DEVICE_ID   = os.getenv("SIMULATOR_DEVICE_ID", "simulator_001")
TOPIC       = f"fdctmon/{DEVICE_ID}/attrs"

SENSOR_SAMPLE_INTERVAL_S = 2
PUBLISH_INTERVAL_S = 10
TEMP_INTERVAL_S = 30
FUMACA_HYSTERESIS_SAMPLES = 3

PRESENCE_THRESHOLD_CM   = 200
PRESENCE_ALERT_HOUR_START = 22
PRESENCE_ALERT_HOUR_END   = 6


def gera_distancia():
    # Alterna entre "porta fechada" (~250 cm) e "alguém perto" (~80 cm)
    # 20% de chance de simular presença
    if random.random() < 0.20:
        return round(random.uniform(30, 180), 1)
    return round(random.uniform(210, 350), 1)


def gera_fumaca():
    # 5% de chance de simular fumaça
    return 1 if random.random() < 0.05 else 0


def gera_temperatura():
    return round(random.uniform(18.0, 32.0), 1)


def gera_umidade():
    return round(random.uniform(35.0, 75.0), 1)


def calcula_presenca_notificavel(distancia):
    if distancia >= PRESENCE_THRESHOLD_CM:
        return 0
    hora_atual = datetime.datetime.now().hour
    em_horario_alerta = (
        hora_atual >= PRESENCE_ALERT_HOUR_START
        or hora_atual < PRESENCE_ALERT_HOUR_END
    )
    return 1 if em_horario_alerta else 0


def calcula_fumaca_confirmada(estado_atual, leituras_recentes):
    if len(leituras_recentes) < FUMACA_HYSTERESIS_SAMPLES:
        return estado_atual

    janela = list(leituras_recentes)[-FUMACA_HYSTERESIS_SAMPLES:]
    if all(valor == 1 for valor in janela):
        return 1
    if all(valor == 0 for valor in janela):
        return 0
    return estado_atual


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        log.info("MQTT conectado ao broker %s:%d", BROKER_HOST, BROKER_PORT)
    else:
        log.error("MQTT falha na conexão: rc=%d", rc)


def on_disconnect(client, userdata, rc):
    if rc != 0:
        log.warning("MQTT desconectado (rc=%d); reconectando...", rc)


def publica(client, payload: dict):
    msg = json.dumps(payload)
    result = client.publish(TOPIC, msg, qos=1)
    if result.rc != mqtt.MQTT_ERR_SUCCESS:
        log.error("MQTT falha ao publicar: rc=%d", result.rc)
    else:
        log.info("→ %s: %s", TOPIC, msg)


def main():
    client = mqtt.Client(client_id=f"sim_{DEVICE_ID}")
    client.on_connect    = on_connect
    client.on_disconnect = on_disconnect
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    if MQTT_USERNAME and MQTT_PASSWORD:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    log.info("Simulador iniciando — device_id=%s", DEVICE_ID)
    log.info("Conectando ao broker %s:%d ...", BROKER_HOST, BROKER_PORT)
    client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
    client.loop_start()

    temp_cache  = None
    umid_cache  = None
    tempo_ultima_temp = 0
    tempo_ultima_publicacao = 0
    fumaca_confirmada = 0
    historico_fumaca = deque(maxlen=FUMACA_HYSTERESIS_SAMPLES)

    try:
        while True:
            agora = time.time()

            if agora - tempo_ultima_temp >= TEMP_INTERVAL_S:
                temp_cache = gera_temperatura()
                umid_cache = gera_umidade()
                tempo_ultima_temp = agora

            distancia            = gera_distancia()
            fumaca_raw           = gera_fumaca()
            historico_fumaca.append(fumaca_raw)
            fumaca_confirmada    = calcula_fumaca_confirmada(
                fumaca_confirmada,
                historico_fumaca,
            )
            presenca_notificavel = calcula_presenca_notificavel(distancia)

            log.info(
                "MQ-2 simulado: raw=%d historico=%s confirmado=%d",
                fumaca_raw,
                list(historico_fumaca),
                fumaca_confirmada,
            )

            if agora - tempo_ultima_publicacao >= PUBLISH_INTERVAL_S:
                payload = {
                    "device_id":            DEVICE_ID,
                    "temp":                 temp_cache,
                    "umid":                 umid_cache,
                    "fumaca":               fumaca_confirmada,
                    "presenca_notificavel": presenca_notificavel,
                    "distancia":            distancia,
                }

                publica(client, payload)
                tempo_ultima_publicacao = agora

            time.sleep(SENSOR_SAMPLE_INTERVAL_S)

    except KeyboardInterrupt:
        log.info("Simulador encerrado.")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
