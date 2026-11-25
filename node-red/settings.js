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
