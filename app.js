(() => {
  "use strict";

  const APP_VERSION = "13.1.0-pwa";
  const STORAGE_KEYS = {
    banco: "showBiblicoIBC.banco",
    ranking: "showBiblicoIBC.ranking",
    config: "showBiblicoIBC.config"
  };

  let bancoBase = [];
  let bancoAtivo = [];
  let config = {
    qtdPerguntas: 10,
    tempoPergunta: 30,
    nivelFiltro: "todos",
    categoriaFiltro: "todas",
    embaralharAlternativas: true
  };

  let estadoJogo = {
    perguntas: [],
    indice: 0,
    acertos: 0,
    respostas: [],
    respondido: false,
    timerId: null,
    tempoRestante: 0
  };

  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    registrarServiceWorker();
    bindEventos();
    carregarConfig();
    await carregarBanco();
    atualizarResumoBanco();
    popularFiltros();
    mostrarTela("telaInicio");
  }

  function bindEventos() {
    $("btnComecar").addEventListener("click", iniciarJogo);
    $("btnConfiguracoes").addEventListener("click", () => mostrarTela("telaConfig"));
    $("btnBanco").addEventListener("click", () => { atualizarResumoBanco(); mostrarTela("telaBanco"); });
    $("btnRanking").addEventListener("click", () => { renderRanking(); mostrarTela("telaRanking"); });

    document.querySelectorAll(".btnVoltar").forEach(btn => {
      btn.addEventListener("click", () => mostrarTela("telaInicio"));
    });

    $("formConfig").addEventListener("submit", (e) => {
      e.preventDefault();
      salvarConfig();
      alert("Configurações salvas.");
      mostrarTela("telaInicio");
    });

    $("btnProxima").addEventListener("click", proximaPergunta);
    $("btnEncerrar").addEventListener("click", finalizarJogo);
    $("btnNovoJogo").addEventListener("click", iniciarJogo);
    $("btnIrInicio").addEventListener("click", () => mostrarTela("telaInicio"));
    $("inputBanco").addEventListener("change", importarBanco);
    $("btnExportarBanco").addEventListener("click", exportarBanco);
    $("btnLimparBancoLocal").addEventListener("click", limparBancoLocal);
    $("btnLimparRanking").addEventListener("click", limparRanking);
  }

  function registrarServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        // Falha de service worker não impede o jogo de rodar.
      });
    }
  }

  async function carregarBanco() {
    bancoBase = [];
    try {
      const resposta = await fetch("data/banco-perguntas.json", { cache: "no-store" });
      if (!resposta.ok) throw new Error("Banco padrão não encontrado.");
      const dados = await resposta.json();
      bancoBase = validarBanco(dados);
    } catch (erro) {
      bancoBase = validarBanco(bancoEmergencia());
    }

    const bancoLocal = localStorage.getItem(STORAGE_KEYS.banco);
    if (bancoLocal) {
      try {
        bancoAtivo = validarBanco(JSON.parse(bancoLocal));
      } catch {
        bancoAtivo = bancoBase;
      }
    } else {
      bancoAtivo = bancoBase;
    }
  }

  function validarBanco(lista) {
    if (!Array.isArray(lista)) return [];
    const limpo = [];
    for (const item of lista) {
      const pergunta = normalizarPergunta(item);
      if (pergunta) limpo.push(pergunta);
    }
    return limpo;
  }

  function normalizarPergunta(item) {
    if (!item) return null;
    const p = {
      pergunta: texto(item.pergunta),
      A: texto(item.A),
      B: texto(item.B),
      C: texto(item.C),
      D: texto(item.D),
      correta: texto(item.correta).toUpperCase(),
      categoria: texto(item.categoria || "Geral"),
      nivel: texto(item.nivel || "médio"),
      referencia: texto(item.referencia || ""),
      aprendizado: texto(item.aprendizado || "")
    };
    if (!p.pergunta || !p.A || !p.B || !p.C || !p.D) return null;
    if (!["A", "B", "C", "D"].includes(p.correta)) return null;
    return p;
  }

  function texto(valor) {
    return String(valor ?? "").trim();
  }

  function carregarConfig() {
    try {
      const salvo = JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || "{}");
      config = { ...config, ...salvo };
    } catch {}
    $("qtdPerguntas").value = config.qtdPerguntas;
    $("tempoPergunta").value = config.tempoPergunta;
    $("embaralharAlternativas").checked = !!config.embaralharAlternativas;
  }

  function salvarConfig() {
    config.qtdPerguntas = Math.max(1, Number($("qtdPerguntas").value || 10));
    config.tempoPergunta = Math.max(0, Number($("tempoPergunta").value || 0));
    config.nivelFiltro = $("nivelFiltro").value;
    config.categoriaFiltro = $("categoriaFiltro").value;
    config.embaralharAlternativas = $("embaralharAlternativas").checked;
    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
  }

  function popularFiltros() {
    const categorias = [...new Set(bancoAtivo.map(p => p.categoria).filter(Boolean))].sort();
    const niveis = [...new Set(bancoAtivo.map(p => p.nivel).filter(Boolean))].sort();

    popularSelect($("categoriaFiltro"), "todas", "Todas", categorias, config.categoriaFiltro);
    popularSelect($("nivelFiltro"), "todos", "Todos", niveis, config.nivelFiltro);
  }

  function popularSelect(select, valorTodos, textoTodos, itens, valorAtual) {
    select.innerHTML = "";
    const optTodos = document.createElement("option");
    optTodos.value = valorTodos;
    optTodos.textContent = textoTodos;
    select.appendChild(optTodos);

    for (const item of itens) {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    }
    select.value = valorAtual || valorTodos;
    if (!select.value) select.value = valorTodos;
  }

  function atualizarResumoBanco() {
    $("statusBanco").textContent = `${bancoAtivo.length} perguntas`;
    $("totalPerguntasBanco").textContent = bancoAtivo.length;
    const categorias = new Set(bancoAtivo.map(p => p.categoria));
    const niveis = new Set(bancoAtivo.map(p => p.nivel));
    $("resumoBanco").textContent = `${bancoAtivo.length} perguntas ativas, ${categorias.size} categorias e ${niveis.size} níveis. Versão ${APP_VERSION}.`;
  }

  function mostrarTela(id) {
    limparTimer();
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $(id).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function iniciarJogo() {
    salvarConfig();

    let pool = bancoAtivo.slice();
    if (config.nivelFiltro !== "todos") {
      pool = pool.filter(p => p.nivel === config.nivelFiltro);
    }
    if (config.categoriaFiltro !== "todas") {
      pool = pool.filter(p => p.categoria === config.categoriaFiltro);
    }

    if (!pool.length) {
      alert("Não há perguntas para os filtros selecionados. Ajuste as configurações ou importe outro banco.");
      return;
    }

    embaralhar(pool);
    const qtd = Math.min(config.qtdPerguntas, pool.length);

    estadoJogo = {
      perguntas: pool.slice(0, qtd),
      indice: 0,
      acertos: 0,
      respostas: [],
      respondido: false,
      timerId: null,
      tempoRestante: config.tempoPergunta
    };

    mostrarTela("telaJogo");
    renderPergunta();
  }

  function renderPergunta() {
    limparTimer();
    estadoJogo.respondido = false;
    $("btnProxima").disabled = true;
    $("feedback").textContent = "";

    const pergunta = estadoJogo.perguntas[estadoJogo.indice];
    $("contadorPergunta").textContent = `Pergunta ${estadoJogo.indice + 1}/${estadoJogo.perguntas.length}`;
    $("pontuacao").textContent = `${estadoJogo.acertos} acertos`;
    $("categoriaNivel").textContent = `${pergunta.categoria} · ${pergunta.nivel}`;
    $("textoPergunta").textContent = pergunta.pergunta;

    let alternativas = ["A", "B", "C", "D"].map(letra => ({
      letra,
      texto: pergunta[letra],
      correta: letra === pergunta.correta
    }));

    if (config.embaralharAlternativas) embaralhar(alternativas);

    const container = $("alternativas");
    container.innerHTML = "";
    alternativas.forEach((alt, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "answer";
      btn.dataset.letra = alt.letra;
      btn.dataset.correta = alt.correta ? "1" : "0";
      btn.textContent = `${String.fromCharCode(65 + idx)}. ${alt.texto}`;
      btn.addEventListener("click", () => responder(btn));
      container.appendChild(btn);
    });

    iniciarTimer();
  }

  function iniciarTimer() {
    estadoJogo.tempoRestante = Number(config.tempoPergunta || 0);
    if (!estadoJogo.tempoRestante) {
      $("timer").textContent = "Sem tempo";
      return;
    }

    $("timer").textContent = `${estadoJogo.tempoRestante}s`;
    estadoJogo.timerId = setInterval(() => {
      estadoJogo.tempoRestante -= 1;
      $("timer").textContent = `${estadoJogo.tempoRestante}s`;
      if (estadoJogo.tempoRestante <= 0) {
        limparTimer();
        responder(null);
      }
    }, 1000);
  }

  function limparTimer() {
    if (estadoJogo.timerId) {
      clearInterval(estadoJogo.timerId);
      estadoJogo.timerId = null;
    }
  }

  function responder(botao) {
    if (estadoJogo.respondido) return;
    estadoJogo.respondido = true;
    limparTimer();

    const pergunta = estadoJogo.perguntas[estadoJogo.indice];
    const selecionada = botao ? botao.dataset.letra : "";
    const acertou = selecionada === pergunta.correta;

    if (acertou) estadoJogo.acertos += 1;

    document.querySelectorAll(".answer").forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.letra === pergunta.correta) btn.classList.add("correct");
      if (botao && btn === botao && !acertou) btn.classList.add("wrong");
    });

    const respostaCorreta = pergunta[pergunta.correta];
    const msgBase = acertou ? "✅ Correto!" : botao ? "❌ Resposta incorreta." : "⏰ Tempo esgotado.";
    const ref = pergunta.referencia ? ` Referência: ${pergunta.referencia}.` : "";
    const aprendizado = pergunta.aprendizado ? ` ${pergunta.aprendizado}` : "";
    $("feedback").textContent = `${msgBase} Resposta certa: ${respostaCorreta}.${ref}${aprendizado}`;

    estadoJogo.respostas.push({
      pergunta: pergunta.pergunta,
      selecionada,
      correta: pergunta.correta,
      acertou,
      categoria: pergunta.categoria,
      nivel: pergunta.nivel
    });

    $("pontuacao").textContent = `${estadoJogo.acertos} acertos`;
    $("btnProxima").disabled = false;
    $("btnProxima").textContent = estadoJogo.indice === estadoJogo.perguntas.length - 1 ? "Ver Resultado" : "Próxima";
  }

  function proximaPergunta() {
    if (!estadoJogo.respondido) return;
    if (estadoJogo.indice >= estadoJogo.perguntas.length - 1) {
      finalizarJogo();
      return;
    }
    estadoJogo.indice += 1;
    renderPergunta();
  }

  function finalizarJogo() {
    limparTimer();

    const total = estadoJogo.perguntas.length || 1;
    const acertos = estadoJogo.acertos;
    const percentual = Math.round((acertos / total) * 100);

    $("resultadoResumo").textContent = `${acertos}/${total}`;
    $("resultadoDetalhes").innerHTML = `
      <p><strong>Aproveitamento:</strong> ${percentual}%</p>
      <p><strong>Diagnóstico:</strong> ${mensagemResultado(percentual)}</p>
      ${diagnosticoCategorias()}
    `;

    salvarRanking(acertos, total, percentual);
    mostrarTela("telaResultado");
  }

  function mensagemResultado(percentual) {
    if (percentual >= 90) return "Excelente domínio bíblico. Desempenho muito forte.";
    if (percentual >= 70) return "Bom desempenho. Revise as perguntas erradas para consolidar.";
    if (percentual >= 50) return "Resultado intermediário. Há boa base, mas precisa revisar referências.";
    return "Recomenda-se reforço no estudo antes de uma nova rodada.";
  }

  function diagnosticoCategorias() {
    const erros = estadoJogo.respostas.filter(r => !r.acertou);
    if (!erros.length) return "<p><strong>Ponto forte:</strong> Nenhum erro registrado.</p>";
    const mapa = {};
    erros.forEach(e => { mapa[e.categoria] = (mapa[e.categoria] || 0) + 1; });
    const pior = Object.entries(mapa).sort((a,b) => b[1]-a[1])[0];
    return `<p><strong>Maior concentração de erros:</strong> ${pior[0]} (${pior[1]} erro/s).</p>`;
  }

  function salvarRanking(acertos, total, percentual) {
    const ranking = obterRanking();
    ranking.push({
      data: new Date().toLocaleString("pt-BR"),
      acertos,
      total,
      percentual
    });
    ranking.sort((a,b) => b.percentual - a.percentual || b.acertos - a.acertos);
    localStorage.setItem(STORAGE_KEYS.ranking, JSON.stringify(ranking.slice(0, 10)));
  }

  function obterRanking() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.ranking) || "[]");
    } catch {
      return [];
    }
  }

  function renderRanking() {
    const ranking = obterRanking();
    const lista = $("listaRanking");
    lista.innerHTML = "";
    if (!ranking.length) {
      lista.innerHTML = "<li>Nenhuma partida registrada ainda.</li>";
      return;
    }
    ranking.forEach(item => {
      const li = document.createElement("li");
      li.textContent = `${item.percentual}% · ${item.acertos}/${item.total} · ${item.data}`;
      lista.appendChild(li);
    });
  }

  function limparRanking() {
    if (!confirm("Deseja apagar o ranking local deste aparelho?")) return;
    localStorage.removeItem(STORAGE_KEYS.ranking);
    renderRanking();
  }

  async function importarBanco(evento) {
    const arquivo = evento.target.files && evento.target.files[0];
    if (!arquivo) return;

    try {
      const conteudo = await arquivo.text();
      let dados;
      if (arquivo.name.toLowerCase().endsWith(".json")) {
        dados = JSON.parse(conteudo);
      } else {
        dados = csvParaObjetos(conteudo);
      }

      const validado = validarBanco(dados);
      if (!validado.length) {
        alert("Nenhuma pergunta válida encontrada. Confira as colunas e a alternativa correta.");
        return;
      }

      bancoAtivo = validado;
      localStorage.setItem(STORAGE_KEYS.banco, JSON.stringify(bancoAtivo));
      popularFiltros();
      atualizarResumoBanco();
      alert(`Banco importado com sucesso: ${bancoAtivo.length} perguntas.`);
    } catch (erro) {
      alert("Falha ao importar banco. Use JSON ou CSV no modelo indicado.");
    } finally {
      evento.target.value = "";
    }
  }

  function limparBancoLocal() {
    if (!confirm("Deseja apagar o banco importado e voltar ao banco padrão do jogo?")) return;
    localStorage.removeItem(STORAGE_KEYS.banco);
    bancoAtivo = bancoBase;
    popularFiltros();
    atualizarResumoBanco();
    alert("Banco importado apagado. O jogo voltou ao banco padrão.");
  }

  function exportarBanco() {
    const blob = new Blob([JSON.stringify(bancoAtivo, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "banco-perguntas-show-biblico-ibc.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function csvParaObjetos(textoCsv) {
    const linhas = parseCSV(textoCsv.trim());
    if (linhas.length < 2) return [];
    const headers = linhas[0].map(h => h.trim());
    return linhas.slice(1).map(linha => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = linha[i] ?? "");
      return obj;
    });
  }

  function parseCSV(textoCsv) {
    const sep = detectarSeparador(textoCsv);
    const linhas = [];
    let linha = [];
    let campo = "";
    let aspas = false;

    for (let i = 0; i < textoCsv.length; i++) {
      const c = textoCsv[i];
      const prox = textoCsv[i + 1];

      if (c === '"' && aspas && prox === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        aspas = !aspas;
      } else if (c === sep && !aspas) {
        linha.push(campo);
        campo = "";
      } else if ((c === "\n" || c === "\r") && !aspas) {
        if (c === "\r" && prox === "\n") i++;
        linha.push(campo);
        if (linha.some(v => v.trim() !== "")) linhas.push(linha);
        linha = [];
        campo = "";
      } else {
        campo += c;
      }
    }
    linha.push(campo);
    if (linha.some(v => v.trim() !== "")) linhas.push(linha);
    return linhas;
  }

  function detectarSeparador(textoCsv) {
    const primeira = textoCsv.split(/\r?\n/)[0] || "";
    const cont = {
      ",": (primeira.match(/,/g) || []).length,
      ";": (primeira.match(/;/g) || []).length,
      "\t": (primeira.match(/\t/g) || []).length
    };
    return Object.entries(cont).sort((a,b) => b[1] - a[1])[0][0] || ",";
  }

  function embaralhar(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function bancoEmergencia() {
    return [
      {
        pergunta: "Quem construiu a arca?",
        A: "Moisés",
        B: "Noé",
        C: "Abraão",
        D: "Jacó",
        correta: "B",
        categoria: "Pentateuco",
        nivel: "fácil",
        referencia: "Gênesis 6",
        aprendizado: "Noé obedeceu a Deus mesmo antes de ver a chuva."
      }
    ];
  }
})();
