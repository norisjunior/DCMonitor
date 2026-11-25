const fs = require("fs");

// HTTPS na porta 1880 (editor, página /admin/ e APIs), com certificado emitido
// pela CA do DCMonitor (scripts/gerar_certificados.sh, montado em /data/tls).
// A senha MQTT gerada na página trafega nessa resposta, então HTTP puro não é
// aceito: sem os arquivos, o Node-RED não sobe.
const TLS_DIR = "/data/tls";
function certificadoHttps() {
  try {
    return {
      key: fs.readFileSync(`${TLS_DIR}/server.key`),
      cert: fs.readFileSync(`${TLS_DIR}/server.crt`),
    };
  } catch (e) {
    if (e.code === "EACCES") {
      throw new Error(`Sem permissão para ler o certificado HTTPS em ${TLS_DIR}: server.key precisa ter dono UID 1000 (rode scripts/gerar_certificados.sh como root)`);
    }
    throw new Error(`Certificado HTTPS ausente em ${TLS_DIR} (${e.code}); rode scripts/gerar_certificados.sh`);
  }
}

// Login da página de cadastro (/admin/) e das APIs que ela usa (/api/cadastro
// e /api/credenciais).
// É separado do editor: quem cadastra dispositivos não precisa editar fluxos.
// Sem o hash, o Node-RED não sobe; endpoints HTTP abertos não são aceitáveis.
const cadastroUser = process.env.CADASTRO_ADMIN_USER || "cadastro";
const cadastroHash = process.env.CADASTRO_ADMIN_PASSWORD_HASH;
if (!cadastroHash) {
  throw new Error("CADASTRO_ADMIN_PASSWORD_HASH não definido; veja .env.example");
}
const cadastroAuth = { user: cadastroUser, pass: cadastroHash };

// Cabeçalhos da página e da API de cadastro. A página divide a origem com o
// editor: a CSP impede script de terceiros e o frame-ancestors, o clickjacking.
function cabecalhosSeguros(req, res, next) {
  res.set({
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; " +
      "frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  next();
}

module.exports = {
  flowFile: "flows.json",
  uiHost: process.env.NODE_RED_LISTEN_ADDRESS || "0.0.0.0",
  // Lido de novo a cada 12 h: um certificado renovado vale sem reiniciar.
  https: () => certificadoHttps(),
  httpsRefreshInterval: 12,
  credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET,
  editorTheme: {
    projects: { enabled: false },
  },
  adminAuth: {
    type: "credentials",
    users: [
      {
        username: process.env.NODE_RED_ADMIN_USER || "admin",
        password: process.env.NODE_RED_ADMIN_PASSWORD_HASH,
        permissions: "*",
      },
    ],
  },
  // Página de cadastro, copiada para a imagem pelo Dockerfile.
  httpStatic: [
    { path: "/opt/dcmonitor/admin", root: "/admin/", middleware: cabecalhosSeguros },
  ],
  httpStaticAuth: cadastroAuth,
  httpNodeAuth: cadastroAuth,
  httpNodeMiddleware: cabecalhosSeguros,
  // O nó "Gravar e aplicar" usa o módulo fs (gravação atômica do cadastro).
  functionExternalModules: true,
  logging: {
    console: {
      level: "info",
      metrics: false,
      audit: true,
    },
  },
};
