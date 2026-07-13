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
  logging: {
    console: {
      level: "info",
      metrics: false,
      audit: true,
    },
  },
};
