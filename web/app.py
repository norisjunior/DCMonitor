import os
import logging
from datetime import datetime, timezone, timedelta

import psycopg2
import psycopg2.extras
from flask import Flask, jsonify, render_template

app = Flask(__name__)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

POSTGRES_HOST     = os.environ["POSTGRES_HOST"]
POSTGRES_PORT     = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB       = os.environ["POSTGRES_DB"]
POSTGRES_USER     = os.environ["POSTGRES_USER"]
POSTGRES_PASSWORD = os.environ["POSTGRES_PASSWORD"]
OFFLINE_THRESHOLD = int(os.getenv("DEVICE_OFFLINE_THRESHOLD_MINUTES", "2"))


def conectar_banco():
    return psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
    )


def ultima_medicao():
    conn = conectar_banco()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM medicoes ORDER BY timestamp DESC LIMIT 1")
            return cur.fetchone()
    finally:
        conn.close()


@app.route("/api/status")
def api_status():
    try:
        registro = ultima_medicao()
        log.info("api_status: consulta ao banco OK")
    except Exception as e:
        log.error("api_status: falha ao consultar banco: %s", e)
        return jsonify({"error": "Falha ao consultar banco de dados"}), 503

    if registro is None:
        log.warning("api_status: nenhum registro encontrado no banco")
        return jsonify({"online": False, "registro": None})

    agora = datetime.now(timezone.utc)
    ts = registro["timestamp"]
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)

    online = (agora - ts) < timedelta(minutes=OFFLINE_THRESHOLD)
    log.info("api_status: último registro %s, online=%s", ts.isoformat(), online)

    return jsonify({
        "online": online,
        "registro": {
            "timestamp":            ts.isoformat(),
            "device_id":            registro["device_id"],
            "temperatura":          registro["temperatura"],
            "umidade":              registro["umidade"],
            "fumaca":               registro["fumaca"],
            "presenca_notificavel": registro["presenca_notificavel"],
            "distancia":            registro["distancia"],
        },
    })


@app.route("/")
def index():
    return render_template("index.html", offline_threshold=OFFLINE_THRESHOLD)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
