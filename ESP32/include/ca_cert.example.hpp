#pragma once

// Certificado da CA do DCMonitor, usado pela placa para confirmar que fala com
// o broker verdadeiro (TLS na porta 8883). Não é segredo: só a chave da CA é.
//
// Este arquivo é só um modelo para compilar. O ca_cert.hpp real é gerado no
// servidor por scripts/gerar_certificados.sh e é ignorado pelo Git, porque é
// específico de cada instalação. O mesmo ca_cert.hpp serve a toda a frota.

namespace Certificados {

constexpr char CA_MQTT[] = R"PEM(-----BEGIN CERTIFICATE-----
GERE_COM_scripts/gerar_certificados.sh
-----END CERTIFICATE-----
)PEM";

}  // namespace Certificados
