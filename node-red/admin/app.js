"use strict";
// Página de cadastro do DCMonitor. Todo texto vindo do servidor entra no DOM
// por textContent/value: nada de innerHTML, porque esta página compartilha a
// origem com o editor do Node-RED.

const API = "../api/cadastro";
const API_CRED = "../api/credenciais";
const DEVICE = /^esp32-[0-9A-F]{12}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const ATUALIZAR_MS = 30000;

let servidor = null;        // último cadastro salvo { revisao, locais, dispositivos }
let rascunho = null;        // cópia editável
let vistos = {};            // { device_id: { ultimo, temp, umid, rssi, firmware } }
let desvioRelogio = 0;      // agora do servidor - agora do navegador
let credenciais = {};       // { device_id: { ativo, descricao } }, do broker MQTT
let credenciaisErro = null;

const $ = (id) => document.getElementById(id);

function el(tag, props, filhos) {
  const n = document.createElement(tag);
  if (props) Object.assign(n, props);
  for (const f of filhos || []) n.append(f);
  return n;
}

function copiar(c) {
  return { revisao: c.revisao, locais: { ...c.locais }, dispositivos: JSON.parse(JSON.stringify(c.dispositivos)) };
}

function normalizado(c) {
  // Remove registros vazios: placa sem nome e sem local volta a ser "novo".
  const dispositivos = {};
  for (const [id, d] of Object.entries(c.dispositivos)) {
    const r = {};
    if (d.nome && d.nome.trim()) r.nome = d.nome.trim();
    if (d.local) r.local = d.local;
    if (r.nome || r.local) dispositivos[id] = r;
  }
  const locais = {};
  for (const [id, nome] of Object.entries(c.locais)) locais[id] = nome.trim();
  return { revisao: c.revisao, locais, dispositivos };
}

function canonico(v) {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canonico(v[k]);
    return o;
  }
  return v;
}

function alterado() {
  if (!servidor || !rascunho) return false;
  return JSON.stringify(canonico(normalizado(rascunho))) !== JSON.stringify(canonico(normalizado(servidor)));
}

function temProprio(obj, chave) {
  return Object.prototype.hasOwnProperty.call(obj, chave);
}

function mostrarErro(texto) {
  $("erro").textContent = texto || "";
  $("erro").hidden = !texto;
}

function mostrarAviso(texto) {
  $("aviso").textContent = texto || "";
  $("aviso").hidden = !texto;
}

function idade(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

function situacao(id) {
  const v = temProprio(vistos, id) ? vistos[id] : null;
  if (!v) return { classe: "s-none", texto: "sem leitura" };
  const ms = Date.now() + desvioRelogio - v.ultimo;
  // Ciclo de ~60 s: até 3 ciclos é normal; até 10, atrasado.
  if (ms <= 180000) return { classe: "s-ok", texto: idade(ms) };
  if (ms <= 600000) return { classe: "s-warn", texto: idade(ms) };
  return { classe: "s-bad", texto: idade(ms) };
}

function leitura(id) {
  const v = temProprio(vistos, id) ? vistos[id] : null;
  if (!v) return "—";
  const partes = [`${Number(v.temp).toFixed(1)} °C`, `${Number(v.umid).toFixed(1)} %`];
  if (v.rssi !== null && v.rssi !== undefined) partes.push(`${v.rssi} dBm`);
  return partes.join(" · ");
}

function contarPorLocal(local) {
  return Object.values(rascunho.dispositivos).filter((d) => d.local === local).length;
}

function renderDispositivos() {
  const corpo = $("tabela-dispositivos");
  corpo.replaceChildren();
  const ids = new Set([
    ...Object.keys(rascunho.dispositivos), ...Object.keys(vistos), ...Object.keys(credenciais),
  ]);
  const ordenados = [...ids].sort((a, b) => {
    const na = (temProprio(rascunho.dispositivos, a) && rascunho.dispositivos[a].nome) || a;
    const nb = (temProprio(rascunho.dispositivos, b) && rascunho.dispositivos[b].nome) || b;
    return na.localeCompare(nb, "pt-BR");
  });
  $("sem-dispositivos").hidden = ordenados.length > 0;

  let novos = 0;
  for (const id of ordenados) {
    const reg = temProprio(rascunho.dispositivos, id) ? rascunho.dispositivos[id] : {};
    const cadastradoNoServidor = temProprio(servidor.dispositivos, id);
    if (!cadastradoNoServidor) novos++;

    const s = situacao(id);
    const tdSituacao = el("td", {}, [el("span", { className: `situacao ${s.classe}`, textContent: s.texto })]);
    tdSituacao.dataset.device = id;

    const blocoId = el("div", {}, [el("span", { className: "mono", textContent: id })]);
    if (!cadastradoNoServidor) blocoId.append(" ", el("span", { className: "tag", textContent: "novo" }));
    const fw = temProprio(vistos, id) && vistos[id].firmware;
    const tdId = el("td", {}, [blocoId]);
    if (fw) tdId.append(el("div", { className: "muted", textContent: `firmware ${fw}` }));

    const inputNome = el("input", { type: "text", maxLength: 64, value: reg.nome || "", placeholder: id, id: `nome-${id}` });
    inputNome.setAttribute("aria-label", `Nome amigável de ${id}`);
    inputNome.addEventListener("input", () => {
      garantir(id).nome = inputNome.value;
      atualizarBarra();
    });

    const select = el("select", { id: `local-${id}` });
    select.setAttribute("aria-label", `Local de ${id}`);
    select.append(el("option", { value: "", textContent: "— sem local —" }));
    for (const [codigo, nome] of Object.entries(rascunho.locais).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))) {
      select.append(el("option", { value: codigo, textContent: nome }));
    }
    select.value = reg.local || "";
    select.addEventListener("change", () => {
      garantir(id).local = select.value;
      atualizarBarra();
      renderLocais();
    });

    const limpar = el("button", { type: "button", textContent: "Limpar" });
    limpar.title = "Remove nome e local; a placa volta a aparecer como nova";
    limpar.disabled = !reg.nome && !reg.local;
    limpar.addEventListener("click", () => {
      delete rascunho.dispositivos[id];
      render();
    });

    const tdLeitura = el("td", { className: "num", textContent: leitura(id) });
    tdLeitura.dataset.leitura = id;

    corpo.append(el("tr", {}, [
      tdSituacao, tdId, el("td", {}, [inputNome]), el("td", {}, [select]), tdLeitura,
      celulaCredencial(id), el("td", {}, [limpar]),
    ]));
  }
  const total = ordenados.length;
  $("resumo-dispositivos").textContent = total
    ? `${total} no total${novos ? `, ${novos} sem cadastro` : ""}`
    : "";
}

// ------------------------------------------------------------ credenciais
function geradaEm(descricao) {
  const m = /(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(descricao || "");
  if (!m) return "";
  const d = new Date(m[1]);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Ação destrutiva em dois cliques: o primeiro só arma o botão por 5 s.
function botaoConfirmado(rotulo, rotuloConfirmar, titulo, acao) {
  const b = el("button", { type: "button", textContent: rotulo, title: titulo });
  let armado = null;
  b.addEventListener("click", () => {
    if (!armado) {
      b.textContent = rotuloConfirmar;
      armado = setTimeout(() => { armado = null; b.textContent = rotulo; }, 5000);
      return;
    }
    clearTimeout(armado);
    armado = null;
    b.textContent = rotulo;
    acao(b);
  });
  return b;
}

function celulaCredencial(id) {
  const td = el("td");
  if (credenciaisErro) {
    td.append(el("span", { className: "muted", textContent: "indisponível" }));
    return td;
  }
  const c = temProprio(credenciais, id) ? credenciais[id] : null;
  if (!c) {
    td.append(el("div", { className: "muted", textContent: "sem senha" }));
    const gerar = el("button", { type: "button", textContent: "Gerar senha" });
    gerar.addEventListener("click", () => gerarCredencial(id, gerar));
    td.append(gerar);
    return td;
  }
  const quando = geradaEm(c.descricao);
  td.append(el("div", {
    className: c.ativo ? "credencial-ok" : "s-warn",
    textContent: c.ativo ? `ativa${quando ? ` desde ${quando}` : ""}` : "desativada",
  }));
  td.append(el("div", { className: "acoes" }, [
    botaoConfirmado("Trocar senha", "Confirmar troca",
      "A senha atual deixa de valer na hora; a placa precisa ser regravada com a nova",
      (b) => gerarCredencial(id, b, true)),
    botaoConfirmado("Revogar", "Confirmar revogação",
      "A placa perde o acesso ao broker imediatamente",
      (b) => revogarCredencial(id, b)),
  ]));
  return td;
}

// O servidor exige este cabeçalho nas rotas de credenciais (proteção contra CSRF).
const CABECALHO_CRED = { "X-DCMonitor": "1" };

async function buscarCredenciais() {
  try {
    const r = await fetch(API_CRED, { cache: "no-store", credentials: "same-origin", headers: CABECALHO_CRED });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || `O servidor respondeu ${r.status} ao listar as credenciais.`);
    credenciais = d.clientes || {};
    credenciaisErro = null;
  } catch (e) {
    credenciaisErro = e.message;
  }
}

function mostrarSenha(resposta) {
  $("senha-device").textContent = resposta.device_id;
  $("senha-linha").textContent = resposta.linha_serial;
  $("painel-senha").hidden = false;
  $("painel-senha").scrollIntoView({ behavior: "smooth", block: "start" });
}

function fecharSenha() {
  $("senha-linha").textContent = "";
  $("senha-device").textContent = "";
  $("painel-senha").hidden = true;
}

// Gerar (POST) nunca sobrescreve uma senha existente; trocar (PUT) sim.
async function gerarCredencial(id, botao, trocar = false) {
  if (botao) botao.disabled = true;
  try {
    const r = await fetch(`${API_CRED}/${encodeURIComponent(id)}`, {
      method: trocar ? "PUT" : "POST", credentials: "same-origin", cache: "no-store",
      headers: CABECALHO_CRED,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || `O servidor respondeu ${r.status} ao gerar a senha.`);
    mostrarErro("");
    mostrarSenha(d);
  } catch (e) {
    mostrarErro(e.message);
  } finally {
    await buscarCredenciais();
    renderDispositivos();
  }
}

async function revogarCredencial(id, botao) {
  if (botao) botao.disabled = true;
  try {
    const r = await fetch(`${API_CRED}/${encodeURIComponent(id)}`, {
      method: "DELETE", credentials: "same-origin", cache: "no-store",
      headers: CABECALHO_CRED,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || `O servidor respondeu ${r.status} ao revogar.`);
    mostrarErro("");
    mostrarAviso(`Credencial de ${id} revogada. A placa não conecta mais ao broker.`);
  } catch (e) {
    mostrarErro(e.message);
  } finally {
    await buscarCredenciais();
    renderDispositivos();
  }
}

function garantir(id) {
  if (!temProprio(rascunho.dispositivos, id)) rascunho.dispositivos[id] = {};
  return rascunho.dispositivos[id];
}

function renderLocais() {
  const corpo = $("tabela-locais");
  corpo.replaceChildren();
  const entradas = Object.entries(rascunho.locais).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  $("sem-locais").hidden = entradas.length > 0;
  for (const [codigo, nome] of entradas) {
    const input = el("input", { type: "text", maxLength: 48, value: nome, id: `local-nome-${codigo}` });
    input.setAttribute("aria-label", `Nome do local ${codigo}`);
    input.addEventListener("input", () => {
      rascunho.locais[codigo] = input.value;
      atualizarBarra();
    });
    input.addEventListener("change", () => renderDispositivos());

    const qtd = contarPorLocal(codigo);
    const remover = el("button", { type: "button", textContent: "Remover" });
    remover.disabled = qtd > 0;
    remover.title = qtd > 0 ? "Mova os dispositivos deste local antes de removê-lo" : "Remove o local";
    remover.addEventListener("click", () => {
      delete rascunho.locais[codigo];
      render();
    });

    corpo.append(el("tr", {}, [
      el("td", {}, [el("span", { className: "mono", textContent: codigo })]),
      el("td", {}, [input]),
      el("td", { className: "num", textContent: String(qtd) }),
      el("td", {}, [remover]),
    ]));
  }
}

function atualizarBarra() {
  const sujo = alterado();
  $("botao-salvar").disabled = !sujo;
  $("botao-descartar").disabled = !sujo;
  $("estado-salvo").textContent = sujo
    ? "Alterações não salvas"
    : `Salvo · revisão ${servidor.revisao}`;
}

function render() {
  renderDispositivos();
  renderLocais();
  atualizarBarra();
}

function atualizarSituacoes() {
  for (const td of document.querySelectorAll("td[data-device]")) {
    const s = situacao(td.dataset.device);
    const span = td.firstElementChild;
    span.className = `situacao ${s.classe}`;
    span.textContent = s.texto;
  }
  for (const td of document.querySelectorAll("td[data-leitura]")) {
    td.textContent = leitura(td.dataset.leitura);
  }
}

async function buscar() {
  const r = await fetch(API, { cache: "no-store", credentials: "same-origin" });
  if (!r.ok) throw new Error(`O servidor respondeu ${r.status} ao carregar o cadastro.`);
  return r.json();
}

async function carregar() {
  try {
    const dados = await buscar();
    vistos = dados.vistos || {};
    desvioRelogio = (dados.agora || Date.now()) - Date.now();
    if (!dados.cadastro) {
      mostrarErro(dados.erro || "O cadastro não está disponível.");
      $("estado-salvo").textContent = "Cadastro indisponível";
      return;
    }
    mostrarErro(dados.erro);
    servidor = copiar(dados.cadastro);
    rascunho = copiar(dados.cadastro);
    await buscarCredenciais();
    if (credenciaisErro) mostrarAviso(`Credenciais MQTT indisponíveis: ${credenciaisErro}`);
    render();
  } catch (e) {
    mostrarErro(e.message);
  }
}

async function atualizarPeriodicamente() {
  if (document.hidden) return;
  if (!servidor) return carregar();
  try {
    const dados = await buscar();
    const idsAntes = new Set(Object.keys(vistos));
    vistos = dados.vistos || {};
    desvioRelogio = (dados.agora || Date.now()) - Date.now();
    if (!alterado() && dados.cadastro && dados.cadastro.revisao !== servidor.revisao) {
      servidor = copiar(dados.cadastro);
      rascunho = copiar(dados.cadastro);
      render();
      return;
    }
    if (alterado() && dados.cadastro && dados.cadastro.revisao !== servidor.revisao) {
      mostrarAviso(`Outra janela salvou o cadastro (revisão ${dados.cadastro.revisao}). Descarte suas alterações para ver a versão atual; salvar agora será recusado.`);
    }
    const surgiuNovo = Object.keys(vistos).some((id) => !idsAntes.has(id));
    const editando = document.activeElement && ["INPUT", "SELECT"].includes(document.activeElement.tagName);
    if (surgiuNovo && !editando) renderDispositivos();
    else atualizarSituacoes();
  } catch (e) {
    // Falha passageira: mantém a tela e tenta de novo no próximo ciclo.
  }
}

async function salvar() {
  const corpo = normalizado(rascunho);
  for (const [codigo, nome] of Object.entries(corpo.locais)) {
    if (!nome) {
      mostrarErro(`O local “${codigo}” está sem nome.`);
      return;
    }
  }
  $("botao-salvar").disabled = true;
  $("estado-salvo").textContent = "Salvando…";
  try {
    const r = await fetch(API, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const resposta = await r.json().catch(() => ({}));
    if (!r.ok) {
      mostrarErro(resposta.erro || `O servidor respondeu ${r.status} ao salvar.`);
      atualizarBarra();
      return;
    }
    mostrarErro("");
    mostrarAviso(`Cadastro salvo (revisão ${resposta.revisao}). As próximas medições já saem com os novos nomes e locais.`);
    await carregar();
  } catch (e) {
    mostrarErro(`Não foi possível salvar: ${e.message}`);
    atualizarBarra();
  }
}

$("botao-salvar").addEventListener("click", salvar);
$("botao-fechar-senha").addEventListener("click", fecharSenha);
$("botao-copiar-linha").addEventListener("click", async () => {
  const texto = $("senha-linha").textContent;
  try {
    await navigator.clipboard.writeText(texto);
    $("botao-copiar-linha").textContent = "Copiada";
    setTimeout(() => { $("botao-copiar-linha").textContent = "Copiar linha"; }, 2000);
  } catch (e) {
    // Sem permissão de área de transferência: seleciona para Ctrl+C.
    const faixa = document.createRange();
    faixa.selectNodeContents($("senha-linha"));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(faixa);
  }
});
$("form-dispositivo").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const id = $("novo-dispositivo-id").value.trim();
  if (credenciaisErro) {
    mostrarErro(`As credenciais não puderam ser consultadas (${credenciaisErro}). Recarregue a página antes de gerar uma senha.`);
    return;
  }
  if (!DEVICE.test(id)) {
    mostrarErro("ID inválido: copie o ID exatamente como a placa mostra na serial, por exemplo esp32-E0477D077000.");
    return;
  }
  if (temProprio(credenciais, id)) {
    mostrarErro(`${id} já tem senha. Para trocar, use “Trocar senha” na tabela.`);
    return;
  }
  $("novo-dispositivo-id").value = "";
  gerarCredencial(id, null);
});
$("botao-descartar").addEventListener("click", () => {
  mostrarErro("");
  mostrarAviso("");
  carregar();
});

function sugerirCodigo(nome) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/, "");
}

let codigoEditado = false;
$("novo-local-codigo").addEventListener("input", () => { codigoEditado = true; });
$("novo-local-nome").addEventListener("input", () => {
  if (!codigoEditado) $("novo-local-codigo").value = sugerirCodigo($("novo-local-nome").value);
});

$("form-local").addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (!rascunho) return;
  const nome = $("novo-local-nome").value.trim();
  const codigo = $("novo-local-codigo").value.trim();
  if (!nome) return mostrarErro("Informe o nome do local.");
  if (!SLUG.test(codigo) || codigo === "sem-local") {
    return mostrarErro("Código inválido: use letras minúsculas, números e hífen, até 32 caracteres.");
  }
  if (temProprio(rascunho.locais, codigo)) {
    return mostrarErro(`Já existe um local com o código “${codigo}”.`);
  }
  rascunho.locais[codigo] = nome;
  $("novo-local-nome").value = "";
  $("novo-local-codigo").value = "";
  codigoEditado = false;
  mostrarErro("");
  render();
});

window.addEventListener("beforeunload", (ev) => {
  if (alterado()) {
    ev.preventDefault();
    ev.returnValue = "";
  }
});

carregar();
setInterval(atualizarPeriodicamente, ATUALIZAR_MS);
