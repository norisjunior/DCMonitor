#!/usr/bin/env node
// Testes das funções do fluxo Node-RED, executadas fora do Node-RED.
//
// Cada nó function é extraído de node-red/flows.json e rodado com msg, node e
// global simulados, do mesmo jeito que o runtime chama o corpo da função.
// Uso: node scripts/test_node_red_functions.js

"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");

const flows = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "node-red", "flows.json"), "utf8")
);

function carregar(id) {
  const n = flows.find((x) => x.id === id);
  if (!n) throw new Error(`nó ${id} não encontrado em flows.json`);
  // Módulos declarados no "Setup" do nó (libs) viram parâmetros, como no runtime.
  const libs = (n.libs || []).map((l) => l.var);
  // eslint-disable-next-line no-new-func
  const corpo = new Function("msg", "node", "global", "env", "Buffer", ...libs, n.func);
  return (msg, globalInicial = {}, modulos = {}, ambiente = {}) => {
    const store = { ...globalInicial };
    const node = {
      erros: [],
      avisos: [],
      ultimoStatus: null,
      error(m) { this.erros.push(String(m)); },
      warn(m) { this.avisos.push(String(m)); },
      status(s) { this.ultimoStatus = s; },
      log(m) { this.avisos.push(String(m)); },
    };
    const global = {
      get: (k) => store[k],
      set: (k, v) => { store[k] = v; },
    };
    const env = { get: (k) => ambiente[k] };
    const saida = corpo(msg, node, global, env, Buffer, ...libs.map((v) => modulos[v]));
    return { saida, node, store };
  };
}

let falhas = 0;
let total = 0;
function teste(nome, fn) {
  total++;
  try {
    fn();
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHOU  ${nome}\n        ${e.message}`);
  }
}

const ID = "esp32-E0477D077000";
const leituraValida = () => ({
  topic: `fdctmon/${ID}/data`,
  payload: {
    schema_version: 1, device_id: ID, sensor: "DHT22", firmware_version: "1.5.0",
    temp: 24.5, umid: 55.1, ic: 24.6, rssi: -61,
  },
});
const cadastroBase = () => ({
  schema_version: 1, revisao: 3,
  locais: { biblioteca: "Biblioteca", datacenter: "Datacenter" },
  dispositivos: { [ID]: { nome: "Sala de leitura", local: "biblioteca" } },
});

// ------------------------------------------------------------- telemetria
console.log("Validar telemetria");
const validarTelemetria = carregar("validate-telemetry");

teste("placa sem cadastro grava com local sem-local e nome = device_id", () => {
  const { saida, store } = validarTelemetria(leituraValida());
  const [fields, tags] = saida[0].payload;
  assert.deepEqual(fields, { temperatura: 24.5, umidade: 55.1, indice_calor: 24.6, rssi: -61 });
  assert.deepEqual(tags, { device_id: ID, sensor: "DHT22", local: "sem-local", nome: ID });
  assert.equal(saida[1].payload.device_id, ID);
  assert.equal(store.vistos[ID].firmware, "1.5.0");
  assert.equal(typeof store.vistos[ID].ultimo, "number");
});

teste("placa cadastrada recebe local e nome do cadastro", () => {
  const { saida } = validarTelemetria(leituraValida(), { cadastro: cadastroBase() });
  const tags = saida[0].payload[1];
  assert.equal(tags.local, "biblioteca");
  assert.equal(tags.nome, "Sala de leitura");
});

teste("cadastro só com nome mantém local sem-local", () => {
  const c = cadastroBase();
  c.dispositivos[ID] = { nome: "Bancada" };
  const tags = validarTelemetria(leituraValida(), { cadastro: c }).saida[0].payload[1];
  assert.equal(tags.local, "sem-local");
  assert.equal(tags.nome, "Bancada");
});

teste("device_id do payload diferente do tópico é rejeitado", () => {
  const m = leituraValida();
  m.topic = "fdctmon/esp32-OUTRA/data";
  const { saida, node } = validarTelemetria(m);
  assert.equal(saida, null);
  assert.match(node.erros[0], /difere do tópico/);
});

teste("tópico antigo .../attrs ou com níveis extras é rejeitado", () => {
  const m = leituraValida();
  m.topic = `fdctmon/biblioteca/${ID}/data`;
  assert.equal(validarTelemetria(m).saida, null);
});

teste("temperatura fora da faixa é rejeitada", () => {
  const m = leituraValida();
  m.payload.temp = 120;
  assert.equal(validarTelemetria(m).saida, null);
});

teste("campos opcionais ausentes não impedem a gravação", () => {
  const m = leituraValida();
  delete m.payload.ic;
  delete m.payload.rssi;
  delete m.payload.sensor;
  const [fields, tags] = validarTelemetria(m).saida[0].payload;
  assert.deepEqual(fields, { temperatura: 24.5, umidade: 55.1 });
  assert.equal(tags.sensor, "desconhecido");
});

teste("device_id 'constructor' não herda nada do protótipo do cadastro", () => {
  const m = leituraValida();
  m.topic = "fdctmon/constructor/data";
  m.payload.device_id = "constructor";
  const tags = validarTelemetria(m, { cadastro: { dispositivos: {} } }).saida[0].payload[1];
  assert.equal(tags.local, "sem-local");
  assert.equal(tags.nome, "constructor");
});

teste("lista de placas vistas tem teto e descarta a mais antiga", () => {
  const vistos = Object.create(null);
  for (let i = 0; i < 1000; i++) vistos[`placa-${i}`] = { ultimo: 1000 + i };
  const { store } = validarTelemetria(leituraValida(), { vistos });
  assert.equal(Object.keys(store.vistos).length, 1000);
  assert.ok(!("placa-0" in store.vistos));
  assert.ok(ID in store.vistos);
});

// --------------------------------------------------------------- cadastro
console.log("Validar cadastro");
const validarCadastro = carregar("cadastro-validar");

teste("arquivo válido passa e é normalizado", () => {
  const c = cadastroBase();
  c.locais.biblioteca = "  Biblioteca  ";
  const { saida } = validarCadastro({ origem: "arquivo", payload: JSON.stringify(c) });
  assert.equal(saida[1], null);
  assert.equal(saida[0].cadastro.revisao, 3);
  assert.equal(saida[0].cadastro.locais.biblioteca, "Biblioteca");
});

teste("arquivo com JSON inválido não carrega e registra o motivo", () => {
  const { saida, store, node } = validarCadastro({ origem: "arquivo", payload: "{ quebrado" });
  assert.equal(saida, null);
  assert.match(store.cadastroErro, /JSON inválido/);
  assert.equal(node.erros.length, 1);
});

teste("salvar pela página incrementa a revisão", () => {
  const { saida } = validarCadastro(
    { origem: "api", payload: cadastroBase() },
    { cadastro: cadastroBase() }
  );
  assert.equal(saida[0].cadastro.revisao, 4);
});

teste("revisão desatualizada responde 409", () => {
  const antigo = cadastroBase();
  antigo.revisao = 2;
  const { saida } = validarCadastro({ origem: "api", payload: antigo }, { cadastro: cadastroBase() });
  assert.equal(saida[0], null);
  assert.equal(saida[1].statusCode, 409);
});

teste("cadastro não carregado responde 503", () => {
  const { saida } = validarCadastro({ origem: "api", payload: cadastroBase() });
  assert.equal(saida[1].statusCode, 503);
});

teste("código de local inválido responde 400", () => {
  for (const codigo of ["Biblioteca", "lab epi", "-x", "sem-local", "a".repeat(33)]) {
    const c = cadastroBase();
    c.locais[codigo] = "Qualquer";
    const { saida } = validarCadastro({ origem: "api", payload: c }, { cadastro: cadastroBase() });
    assert.equal(saida[1].statusCode, 400, `código "${codigo}" deveria ser rejeitado`);
  }
});

teste("dispositivo apontando para local inexistente responde 400", () => {
  const c = cadastroBase();
  c.dispositivos[ID].local = "lab-epi";
  const { saida } = validarCadastro({ origem: "api", payload: c }, { cadastro: cadastroBase() });
  assert.equal(saida[1].statusCode, 400);
  assert.match(saida[1].payload.erro, /lab-epi/);
});

teste("nome com caractere de controle ou longo demais responde 400", () => {
  for (const nome of ["linha\nquebrada", "x".repeat(65)]) {
    const c = cadastroBase();
    c.dispositivos[ID].nome = nome;
    const { saida } = validarCadastro({ origem: "api", payload: c }, { cadastro: cadastroBase() });
    assert.equal(saida[1].statusCode, 400);
  }
});

teste("chave __proto__ não altera protótipos", () => {
  const texto = `{"revisao":3,"locais":{},"dispositivos":{"__proto__":{"nome":"x"}}}`;
  const { saida } = validarCadastro({ origem: "api", payload: JSON.parse(texto) }, { cadastro: cadastroBase() });
  assert.equal(({}).nome, undefined);
  assert.equal(saida[0].cadastro.dispositivos["__proto__"].nome, "x");
});

teste("payload que não é objeto responde 400", () => {
  for (const p of [[], 42, "null"]) {
    const { saida } = validarCadastro({ origem: "api", payload: p }, { cadastro: cadastroBase() });
    assert.equal(saida[1].statusCode, 400);
  }
});

console.log("Gravação e aplicação");
const inicial = carregar("cadastro-inicial");
const gravarAplicar = carregar("cadastro-gravar-aplicar");
const responder = carregar("cadastro-responder");

function fsFalso({ falharEm } = {}) {
  const arquivos = { "/data/cadastro/dispositivos.json": "antigo" };
  const ops = [];
  return {
    arquivos, ops,
    writeFileSync(caminho, conteudo) {
      ops.push(["write", caminho]);
      if (falharEm === "write") throw new Error("EACCES: permission denied");
      arquivos[caminho] = conteudo;
    },
    existsSync: (caminho) => caminho in arquivos,
    copyFileSync(de, para) { ops.push(["copy", de, para]); arquivos[para] = arquivos[de]; },
    renameSync(de, para) {
      ops.push(["rename", de, para]);
      arquivos[para] = arquivos[de];
      delete arquivos[de];
    },
  };
}
const ARQ = "/data/cadastro/dispositivos.json";
const proxima = () => ({ ...cadastroBase(), revisao: 4 });

teste("arquivo ausente gera cadastro inicial vazio", () => {
  const { saida } = inicial({ error: { message: "ENOENT: no such file or directory" } });
  assert.equal(saida.origem, "inicial");
  assert.deepEqual(saida.payload.dispositivos, {});
});

teste("erro de permissão na leitura não cria cadastro", () => {
  const { saida, store } = inicial({ error: { message: "EACCES: permission denied" } });
  assert.equal(saida, null);
  assert.match(store.cadastroErro, /EACCES/);
});

teste("cadastro lido do disco é aplicado sem regravar", () => {
  const fs = fsFalso();
  const { saida, store } = gravarAplicar({ origem: "arquivo", cadastro: cadastroBase() }, {}, { fs });
  assert.equal(saida, null);
  assert.equal(fs.ops.length, 0);
  assert.equal(store.cadastro.revisao, 3);
});

teste("salvar grava em .tmp, guarda .bak e renomeia (atômico)", () => {
  const fs = fsFalso();
  const { saida, store } = gravarAplicar(
    { origem: "api", cadastro: proxima() }, { cadastro: cadastroBase(), cadastroErro: "x" }, { fs }
  );
  assert.equal(saida.statusCode, 200);
  assert.deepEqual(fs.ops.map((o) => o[0]), ["write", "copy", "rename"]);
  assert.equal(fs.ops[0][1], `${ARQ}.tmp`);
  assert.equal(fs.arquivos[`${ARQ}.bak`], "antigo");
  assert.equal(JSON.parse(fs.arquivos[ARQ]).revisao, 4);
  assert.equal(store.cadastro.revisao, 4);
  assert.equal(store.cadastroErro, null);
});

teste("segunda gravação com a mesma revisão é recusada (409)", () => {
  const fs = fsFalso();
  // A primeira já aplicou a revisão 4; a segunda chega validada contra a 3.
  const { saida } = gravarAplicar({ origem: "api", cadastro: proxima() }, { cadastro: proxima() }, { fs });
  assert.equal(saida.statusCode, 409);
  assert.equal(fs.ops.length, 0);
});

teste("falha ao gravar responde 500 e mantém memória e arquivo", () => {
  const fs = fsFalso({ falharEm: "write" });
  const atual = cadastroBase();
  const { saida, store } = gravarAplicar({ origem: "api", cadastro: proxima() }, { cadastro: atual }, { fs });
  assert.equal(saida.statusCode, 500);
  assert.equal(store.cadastro, atual);
  assert.equal(fs.arquivos[ARQ], "antigo");
});

teste("cadastro inicial é gravado sem resposta HTTP", () => {
  const fs = fsFalso();
  delete fs.arquivos[ARQ];
  const c = { schema_version: 1, revisao: 0, locais: {}, dispositivos: {} };
  const { saida, store } = gravarAplicar({ origem: "inicial", cadastro: c }, {}, { fs });
  assert.equal(saida, null);
  assert.deepEqual(fs.ops.map((o) => o[0]), ["write", "rename"]);
  assert.equal(store.cadastro.revisao, 0);
});

teste("GET devolve cadastro, erro e leituras", () => {
  const { saida } = responder({}, { cadastro: cadastroBase(), vistos: { [ID]: { ultimo: 1 } } });
  assert.equal(saida.payload.cadastro.revisao, 3);
  assert.equal(saida.payload.erro, null);
  assert.equal(saida.payload.vistos[ID].ultimo, 1);
});

// ------------------------------------------------------- segundo Zabbix
console.log("Segundo Zabbix");
const zabbix2 = carregar("zabbix2-ativo");

teste("sem ZABBIX_SERVER_2 os itens não seguem", () => {
  assert.equal(zabbix2({ payload: [] }, {}, {}, {}).saida, null);
});

teste("com ZABBIX_SERVER_2 os itens seguem", () => {
  const m = { payload: [["h", "temp", "1"]] };
  assert.equal(zabbix2(m, {}, {}, { ZABBIX_SERVER_2: "10.32.8.69" }).saida, m);
});

// --------------------------------------------------- credenciais MQTT
console.log("Credenciais MQTT");
const cryptoReal = require("crypto");
const gerarCred = carregar("cred-gerar");
const trocarCred = carregar("cred-trocar");
const revogarCred = carregar("cred-revogar");
const listarCred = carregar("cred-listar");
const responderCred = carregar("cred-responder");
const expirarCred = carregar("cred-expirar");
const AMB = { MQTT_ADMIN_USER: "node-red" };
const rota = (id, headers = { "x-dcmonitor": "1" }) => ({ req: { params: { id }, headers }, res: {} });

teste("gerar senha monta papel restrito ao device_id e cliente com senha", () => {
  const { saida, store } = gerarCred(rota(ID), {}, { crypto: cryptoReal }, AMB);
  assert.equal(saida[1], null);
  assert.equal(saida[0].topic, "$CONTROL/dynamic-security/v1");
  const cmds = JSON.parse(saida[0].payload).commands;
  assert.deepEqual(cmds.map((c) => c.command), ["createRole", "createClient"]);
  const acls = cmds[0].acls.map((a) => `${a.acltype} ${a.topic}`);
  assert.deepEqual(acls, [
    `publishClientSend fdctmon/${ID}/data`,
    `publishClientSend fdctmon/${ID}/status`,
    `subscribeLiteral fdctmon/${ID}/cmd`,
    `publishClientReceive fdctmon/${ID}/cmd`,
  ]);
  assert.equal(cmds[1].username, ID);
  assert.match(cmds[1].password, /^[A-Za-z0-9_-]{32}$/);
  const corr = cmds[0].correlationData;
  assert.ok(cmds.every((c) => c.correlationData === corr));
  assert.equal(store.pendentesDynsec[corr].extra.senha, cmds[1].password);
});

teste("trocar senha apaga e recria cliente e papel", () => {
  const { saida } = trocarCred(rota(ID), {}, { crypto: cryptoReal }, AMB);
  const cmds = JSON.parse(saida[0].payload).commands;
  assert.deepEqual(cmds.map((c) => c.command), ["deleteClient", "deleteRole", "createRole", "createClient"]);
});

teste("sem o cabeçalho da página a requisição é recusada (CSRF, 403)", () => {
  for (const f of [gerarCred, trocarCred, revogarCred, listarCred]) {
    const { saida } = f(rota(ID, {}), {}, { crypto: cryptoReal }, AMB);
    assert.equal(saida[0], null);
    assert.equal(saida[1].statusCode, 403);
  }
});

teste("segunda operação para a mesma placa em andamento responde 409", () => {
  const { store } = gerarCred(rota(ID), {}, { crypto: cryptoReal }, AMB);
  const { saida } = trocarCred(rota(ID), store, { crypto: cryptoReal }, AMB);
  assert.equal(saida[1].statusCode, 409);
});

teste("gerar senha para o usuário administrador é recusado (400)", () => {
  const { saida } = gerarCred(rota("node-red"), {}, { crypto: cryptoReal }, AMB);
  assert.equal(saida[0], null);
  assert.equal(saida[1].statusCode, 400);
});

teste("ID inválido na rota é recusado (400)", () => {
  for (const id of ["", "a/b", "#", "teste-001", "esp32-e0477d077000", "esp32-E0477D07700", "x".repeat(65)]) {
    const { saida } = revogarCred(rota(id), {}, { crypto: cryptoReal }, AMB);
    assert.equal(saida[1].statusCode, 400, `"${id}"`);
  }
});

function ciclo(funcao, msg, respostasDoBroker) {
  const { saida, store } = funcao(msg, {}, { crypto: cryptoReal }, AMB);
  const corr = JSON.parse(saida[0].payload).commands[0].correlationData;
  const responses = respostasDoBroker.map((r) => ({ ...r, correlationData: corr }));
  return responderCred({ payload: { responses } }, store, {}, AMB);
}

teste("resposta de sucesso devolve a senha e a linha da serial", () => {
  const { saida, store } = ciclo(gerarCred, rota(ID), [
    { command: "createRole" },
    { command: "createClient" },
  ]);
  const r = saida[0][0];
  assert.equal(r.statusCode, 200);
  assert.match(r.payload.linha_serial, new RegExp(`^credencial ${ID} [A-Za-z0-9_-]{32}$`));
  assert.deepEqual(store.pendentesDynsec, {});
});

teste("erro do broker ao criar o cliente responde 502 sem expor senha", () => {
  const { saida } = ciclo(trocarCred, rota(ID), [
    { command: "deleteClient" }, { command: "deleteRole" }, { command: "createRole" },
    { command: "createClient", error: "Internal error" },
  ]);
  assert.equal(saida[0][0].statusCode, 502);
  assert.equal(saida[0][0].payload.senha, undefined);
});

teste("gerar para placa que já tem senha responde 409 e não troca nada", () => {
  const { saida } = ciclo(gerarCred, rota(ID), [
    { command: "createRole", error: "Role already exists" },
    { command: "createClient", error: "Client already exists" },
  ]);
  assert.equal(saida[0][0].statusCode, 409);
  assert.equal(saida[0][0].payload.senha, undefined);
});

teste("gerar com papel remanescente e cliente novo dá certo", () => {
  const { saida } = ciclo(gerarCred, rota(ID), [
    { command: "createRole", error: "Role already exists" },
    { command: "createClient" },
  ]);
  assert.equal(saida[0][0].statusCode, 200);
});

teste("revogar placa sem credencial é idempotente", () => {
  const { saida } = ciclo(revogarCred, rota(ID), [
    { command: "deleteClient", error: "Client not found" }, { command: "deleteRole", error: "Role not found" },
  ]);
  assert.equal(saida[0][0].statusCode, 200);
  assert.equal(saida[0][0].payload.revogada, false);
});

teste("listar mostra só placas (sem administrador nem n8n) e ativo/desativado", () => {
  const OUTRA = "esp32-0000000000A2";
  const { saida } = ciclo(listarCred, { req: { headers: { "x-dcmonitor": "1" } }, res: {} }, [{
    command: "listClients",
    data: { clients: [
      { username: "node-red" },
      { username: "n8n" },
      { username: ID, textdescription: "Senha gerada em 2026-11-25T18:00:00.000Z" },
      { username: OUTRA, disabled: true },
    ] },
  }]);
  const { clientes } = saida[0][0].payload;
  assert.deepEqual(Object.keys(clientes).sort(), [ID, OUTRA].sort());
  assert.equal(clientes[ID].ativo, true);
  assert.equal(clientes[OUTRA].ativo, false);
});

teste("resposta com correlação desconhecida é ignorada", () => {
  const { saida } = responderCred(
    { payload: { responses: [{ command: "listClients", correlationData: "x" }] } }, {}, {}, AMB
  );
  assert.deepEqual(saida, [[]]);
});

teste("pendência sem resposta em 5 s vira 504", () => {
  const pendentes = {
    velho: { msg: { res: {} }, tipo: "listar", criado: Date.now() - 6000 },
    troca: { msg: { res: {} }, tipo: "trocar", extra: { id: ID }, criado: Date.now() - 6000 },
    novo: { msg: { res: {} }, tipo: "listar", criado: Date.now() },
  };
  const { saida, store } = expirarCred({}, { pendentesDynsec: pendentes });
  assert.equal(saida[0].length, 2);
  assert.ok(saida[0].every((m) => m.statusCode === 504));
  assert.match(saida[0][1].payload.erro, /incerto/);
  assert.deepEqual(Object.keys(store.pendentesDynsec), ["novo"]);
});

console.log(`\n${total - falhas}/${total} testes aprovados.`);
process.exit(falhas ? 1 : 0);
