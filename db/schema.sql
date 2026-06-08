-- FdctMonSys — Schema PostgreSQL
-- Executado automaticamente na primeira inicialização do container postgres

CREATE TABLE IF NOT EXISTS medicoes (
    id               BIGSERIAL PRIMARY KEY,
    timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id        TEXT        NOT NULL,
    temperatura      NUMERIC(5,2),           -- °C; NULL se cache ainda não preenchido após reboot
    umidade          NUMERIC(5,2),           -- %; NULL nas mesmas condições
    fumaca           SMALLINT    NOT NULL,   -- 0 = sem fumaça, 1 = fumaça detectada
    presenca_notificavel SMALLINT NOT NULL,  -- 0 = sem alerta, 1 = presença fora do horário (22h–6h)
    distancia        NUMERIC(7,2)            -- distância em cm medida pelo HC-SR04
);

-- Índice principal: consultas ordenadas por tempo (dashboard, retenção)
CREATE INDEX IF NOT EXISTS idx_medicoes_timestamp
    ON medicoes (timestamp DESC);

-- Índice secundário: filtrar por dispositivo quando houver mais de um
CREATE INDEX IF NOT EXISTS idx_medicoes_device_id
    ON medicoes (device_id);
