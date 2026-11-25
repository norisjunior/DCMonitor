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
  const corpo = new Function("msg", "node", "global", "Buffer", ...libs, n.func);
  return (msg, globalInicial = {}, modulos = {}) => {
    const store = { ...globalInicial };
    const node = {
      erros: [],
      avisos: [],
      ultimoStatus: null,
      error(m) { this.erros.push(String(m)); },
      warn(m) { this.avisos.push(String(m)); },
      status(s) { this.ultimoStatus = s; },
    };
    const global = {
      get: (k) => store[k],
      set: (k, v) => { store[k] = v; },
    };
    const saida = corpo(msg, node, global, Buffer, ...libs.map((v) => modulos[v]));
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

console.log(`\n${total - falhas}/${total} testes aprovados.`);
process.exit(falhas ? 1 : 0);
