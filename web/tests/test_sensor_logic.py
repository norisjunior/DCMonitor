"""
Testes unitários para a lógica de presença notificável do sensor_publisher.
Importa apenas a função pura — sem GPIO, sem MQTT, sem RPi.
"""

import sys
import os
import pytest
from unittest.mock import MagicMock

# Mocka os módulos de hardware antes de qualquer import do script do Pi
sys.modules["RPi"] = MagicMock()
sys.modules["RPi.GPIO"] = MagicMock()
sys.modules["Adafruit_DHT"] = MagicMock()
sys.modules["paho"] = MagicMock()
sys.modules["paho.mqtt"] = MagicMock()
sys.modules["paho.mqtt.client"] = MagicMock()
sys.modules["dotenv"] = MagicMock()

# Ajusta path para o diretório do Pi
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "raspberry"))

from sensor_publisher import calcula_presenca_notificavel  # noqa: E402


# ── Presença fora do threshold de distância ───────────────────────────────────

def test_sem_presenca_distancia_maior_que_threshold():
    """Distância >= 200 cm → sem presença → notificável = 0 sempre."""
    assert calcula_presenca_notificavel(200.0) == 0
    assert calcula_presenca_notificavel(350.0) == 0


# ── Presença dentro do threshold, horário comercial ──────────────────────────

def test_presenca_durante_horario_comercial_nao_notifica(monkeypatch):
    """Presença detectada mas horário é 14h → não notifica."""
    import datetime
    hora_comercial = datetime.datetime(2024, 1, 15, 14, 30, 0)
    monkeypatch.setattr("sensor_publisher.datetime.datetime",
                        _DatetimeMock(hora_comercial))
    assert calcula_presenca_notificavel(150.0) == 0


# ── Presença dentro do threshold, horário de alerta (22h–6h) ─────────────────

def test_presenca_a_meia_noite_notifica(monkeypatch):
    """Presença detectada às 00h → notifica."""
    import datetime
    meia_noite = datetime.datetime(2024, 1, 15, 0, 0, 0)
    monkeypatch.setattr("sensor_publisher.datetime.datetime",
                        _DatetimeMock(meia_noite))
    assert calcula_presenca_notificavel(50.0) == 1


def test_presenca_as_22h_notifica(monkeypatch):
    """Presença detectada às 22h → notifica (início do período)."""
    import datetime
    hora = datetime.datetime(2024, 1, 15, 22, 0, 0)
    monkeypatch.setattr("sensor_publisher.datetime.datetime",
                        _DatetimeMock(hora))
    assert calcula_presenca_notificavel(100.0) == 1


def test_presenca_as_5h59_notifica(monkeypatch):
    """Presença detectada às 5h59 → ainda no período de alerta."""
    import datetime
    hora = datetime.datetime(2024, 1, 15, 5, 59, 0)
    monkeypatch.setattr("sensor_publisher.datetime.datetime",
                        _DatetimeMock(hora))
    assert calcula_presenca_notificavel(10.0) == 1


def test_presenca_as_6h_nao_notifica(monkeypatch):
    """Presença detectada às 6h → fim do período de alerta."""
    import datetime
    hora = datetime.datetime(2024, 1, 15, 6, 0, 0)
    monkeypatch.setattr("sensor_publisher.datetime.datetime",
                        _DatetimeMock(hora))
    assert calcula_presenca_notificavel(10.0) == 0


# ── Helper ────────────────────────────────────────────────────────────────────

class _DatetimeMock:
    """Substitui datetime.datetime.now() por um valor fixo."""
    def __init__(self, fixed):
        self._fixed = fixed

    def now(self, *args, **kwargs):
        return self._fixed
