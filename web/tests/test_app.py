"""
Testes unitários para web/app.py.
Cobrem: rotas /, /api/status, lógica online/offline.
Banco não é instanciado — função ultima_medicao() é mockada.
"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Variáveis de ambiente obrigatórias antes de importar app
os.environ.setdefault("POSTGRES_HOST",     "localhost")
os.environ.setdefault("POSTGRES_DB",       "fdctmon")
os.environ.setdefault("POSTGRES_USER",     "fdctmon")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("DEVICE_OFFLINE_THRESHOLD_MINUTES", "2")

from app import app, ultima_medicao  # noqa: E402


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


# ── Rota / ────────────────────────────────────────────────────────────────────

def test_index_retorna_200(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"NOC" in resp.data


def test_index_contem_threshold(client):
    resp = client.get("/")
    assert b"2" in resp.data  # offline_threshold = 2


# ── /api/status — dispositivo online ─────────────────────────────────────────

def registro_fake(delta_segundos=10):
    """Retorna um dict simulando um registro recente do banco."""
    ts = datetime.now(timezone.utc) - timedelta(seconds=delta_segundos)
    return {
        "timestamp":            ts,
        "device_id":            "b827eb00f6d0",
        "temperatura":          25.3,
        "umidade":              60.0,
        "fumaca":               0,
        "presenca_notificavel": 0,
        "distancia":            185.5,
    }


def test_api_status_online(client):
    with patch("app.ultima_medicao", return_value=registro_fake(10)):
        resp = client.get("/api/status")
    assert resp.status_code == 200
    dados = resp.get_json()
    assert dados["online"] is True
    assert dados["registro"]["device_id"] == "b827eb00f6d0"
    assert dados["registro"]["temperatura"] == 25.3


def test_api_status_retorna_todos_campos(client):
    with patch("app.ultima_medicao", return_value=registro_fake(5)):
        resp = client.get("/api/status")
    dados = resp.get_json()["registro"]
    for campo in ["timestamp", "device_id", "temperatura", "umidade",
                  "fumaca", "presenca_notificavel", "distancia"]:
        assert campo in dados, f"Campo ausente: {campo}"


# ── /api/status — dispositivo offline ────────────────────────────────────────

def test_api_status_offline_por_tempo(client):
    """Registro com 3 min de atraso → offline (threshold = 2 min)."""
    with patch("app.ultima_medicao", return_value=registro_fake(180)):
        resp = client.get("/api/status")
    assert resp.get_json()["online"] is False


def test_api_status_offline_sem_registros(client):
    """Banco vazio → offline."""
    with patch("app.ultima_medicao", return_value=None):
        resp = client.get("/api/status")
    dados = resp.get_json()
    assert dados["online"] is False
    assert dados["registro"] is None


def test_api_status_offline_no_limite(client):
    """Exatamente no threshold (120 s) → offline (não incluso)."""
    with patch("app.ultima_medicao", return_value=registro_fake(120)):
        resp = client.get("/api/status")
    assert resp.get_json()["online"] is False


def test_api_status_online_antes_do_limite(client):
    """1 segundo antes do threshold → online."""
    with patch("app.ultima_medicao", return_value=registro_fake(119)):
        resp = client.get("/api/status")
    assert resp.get_json()["online"] is True


# ── /api/status — falha de banco ─────────────────────────────────────────────

def test_api_status_erro_banco_retorna_503(client):
    with patch("app.ultima_medicao", side_effect=Exception("connection refused")):
        resp = client.get("/api/status")
    assert resp.status_code == 503
    assert "error" in resp.get_json()


# ── Valores nulos (cache de temperatura vazio após reboot) ────────────────────

def test_api_status_temperatura_nula(client):
    """temp=None é aceito e retornado como null no JSON."""
    registro = registro_fake(5)
    registro["temperatura"] = None
    registro["umidade"]     = None
    with patch("app.ultima_medicao", return_value=registro):
        resp = client.get("/api/status")
    dados = resp.get_json()
    assert dados["online"] is True
    assert dados["registro"]["temperatura"] is None
