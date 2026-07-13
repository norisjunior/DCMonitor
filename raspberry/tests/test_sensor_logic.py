"""Regressão das regras do Raspberry legado durante a migração."""

import os
import sys
from unittest.mock import MagicMock

import pytest

sys.modules["RPi"] = MagicMock()
sys.modules["RPi.GPIO"] = MagicMock()
sys.modules["Adafruit_DHT"] = MagicMock()
sys.modules["paho"] = MagicMock()
sys.modules["paho.mqtt"] = MagicMock()
sys.modules["paho.mqtt.client"] = MagicMock()
sys.modules["dotenv"] = MagicMock()

os.environ.setdefault("MQTT_BROKER_HOST", "localhost")
os.environ.setdefault("MQTT_BROKER_PORT", "1883")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sensor_publisher import (  # noqa: E402
    calcula_fumaca_confirmada,
    calcula_presenca_notificavel,
)


def test_sem_presenca_distancia_maior_que_threshold():
    assert calcula_presenca_notificavel(200.0) == 0
    assert calcula_presenca_notificavel(350.0) == 0


@pytest.mark.parametrize(
    ("hour", "expected"),
    [(0, 1), (5, 1), (6, 0), (14, 0), (22, 1), (23, 1)],
)
def test_horario_de_presenca(monkeypatch, hour, expected):
    import datetime

    fixed = datetime.datetime(2024, 1, 15, hour, 0, 0)
    monkeypatch.setattr(
        "sensor_publisher.datetime.datetime", _DatetimeMock(fixed)
    )
    assert calcula_presenca_notificavel(100.0) == expected


@pytest.mark.parametrize(
    ("current", "readings", "expected"),
    [
        (0, [0, 1, 0], 0),
        (0, [1, 1, 1], 1),
        (1, [1, 0, 1], 1),
        (1, [0, 0, 0], 0),
    ],
)
def test_histerese_fumaca(current, readings, expected):
    assert calcula_fumaca_confirmada(current, readings) == expected


class _DatetimeMock:
    def __init__(self, fixed):
        self._fixed = fixed

    def now(self, *args, **kwargs):
        return self._fixed
