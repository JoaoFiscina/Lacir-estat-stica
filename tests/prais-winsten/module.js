function parseDataset(text, utils, stats) {
  const parsed = utils.parseDelimitedText(text, 2);
  const headers = parsed.headers || ['Tempo', 'Indicador'];
  const time = [];
  const values = [];
  const rows = [];
  for (const row of parsed.rows) {
    const t = stats.parseNumber(row[0]);
    const v = stats.parseNumber(row[1]);
    if (t !== null && v !== null) {
      time.push(t);
      values.push(v);
      rows.push([String(row[0]), String(row[1])]);
    }
  }
  return { headers, rows, time, values };
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats } = ctx;

  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header">
        <div class="chip chip-primary">Tendência temporal</div>
        <h3>${utils.escapeHtml(config.title)}</h3>
        <p>${utils.escapeHtml(config.description)}</p>
      </section>

      <section class="callout-grid">
        <article class="help-card">
          <h4>Quando usar</h4>
          <ul>${config.inputGuide.map(item => `<li>${utils.escapeHtml(item)}</li>`).join('')}</ul>
        </article>
        <article class="help-card">
          <h4>Exemplo de estrutura</h4>
          <div class="code-block">${utils.escapeHtml(config.exampleText)}</div>
        </article>
      </section>

      <section class="surface-card">
        <h4>Dados de entrada</h4>
        <div class="form-grid three">
          <div>
            <label for="p-context">Pergunta do estudo</label>
            <input id="p-context" type="text" value="O indicador apresentou tendência temporal?" />
          </div>
          <div>
            <label for="p-time-label">Nome da coluna do tempo</label>
            <input id="p-time-label" type="text" value="Ano" />
          </div>
          <div>
            <label for="p-value-label">Nome do indicador</label>
            <input id="p-value-label" type="text" value="Taxa" />
          </div>
        </div>
        <div style="margin-top:14px;">
          <label for="p-paste">Cole duas colunas da planilha</label>
          <textarea id="p-paste" placeholder="Ano\tTaxa\n2015\t6,7\n2016\t7,0\n..."></textarea>
          <div class="small-note">Aceita colagem do Excel, CSV, TSV ou texto com duas colunas. O indicador deve ser positivo.</div>
        </div>
        <div class="actions-row" style="margin-top:14px;">
          <button class="btn-secondary" id="p-example">Carregar exemplo</button>
          <button class="btn-ghost" id="p-template">Baixar modelo CSV</button>
          <label class="btn-ghost" style="display:inline-flex;align-items:center;gap:8px;">Importar arquivo<input id="p-file" type="file" accept=".csv,.tsv,.txt" style="display:none"></label>
          <button class="btn" id="p-run">Rodar Prais-Winsten</button>
        </div>
      </section>

      <section class="surface-card">
        <h4>Pré-visualização dos dados</h4>
        <div id="p-preview" class="small-note">Nenhum dado carregado ainda.</div>
      </section>

      <section class="surface-card">
        <h4>Resultados</h4>
        <div id="p-status" class="status-bar">Aguardando dados para cálculo.</div>
        <div id="p-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        <div id="p-results" class="result-grid" style="margin-top:14px;"></div>
      </section>
    </div>
  `;

  const pasteEl = root.querySelector('#p-paste');
  const fileEl = root.querySelector('#p-file');
  const previewEl = root.querySelector('#p-preview');
  const statusEl = root.querySelector('#p-status');
  const metricsEl = root.querySelector('#p-metrics');
  const resultsEl = root.querySelector('#p-results');
  const contextEl = root.querySelector('#p-context');
  const timeLabelEl = root.querySelector('#p-time-label');
  const valueLabelEl = root.querySelector('#p-value-label');

  function refreshPreview() {
    const parsed = parseDataset(pasteEl.value, utils, stats);
    if (!parsed.rows.length) {
      previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
      return;
    }
    previewEl.innerHTML = utils.renderPreviewTable(parsed.headers, parsed.rows);
  }

  root.querySelector('#p-example').addEventListener('click', () => {
    pasteEl.value = config.exampleText;
    refreshPreview();
  });
  root.querySelector('#p-template').addEventListener('click', () => {
    utils.downloadText('modelo_prais_winsten.csv', 'Ano;Taxa\n2015;6,7\n2016;7,0\n2017;7,4\n2018;7,9\n2019;8,3\n', 'text/csv;charset=utf-8');
  });
  fileEl.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    pasteEl.value = await utils.readFileText(file);
    refreshPreview();
  });
  pasteEl.addEventListener('input', refreshPreview);

  root.querySelector('#p-run').addEventListener('click', () => {
    const parsed = parseDataset(pasteEl.value, utils, stats);
    refreshPreview();

    if (parsed.time.length < 5) {
      statusEl.className = 'error-box';
      statusEl.textContent = 'Use pelo menos 5 pontos temporais para uma interpretação minimamente estável.';
      metricsEl.innerHTML = '';
      resultsEl.innerHTML = '';
      return;
    }
    if (parsed.values.some(v => v <= 0)) {
      statusEl.className = 'error-box';
      statusEl.textContent = 'Todos os valores do indicador devem ser positivos para o logaritmo do modelo.';
      metricsEl.innerHTML = '';
      resultsEl.innerHTML = '';
      return;
    }

    const result = stats.praisWinsten(parsed.time, parsed.values);
    const significance = result.p < 0.05 ? 'há evidência estatística de tendência' : 'não houve evidência estatística suficiente de tendência';

    statusEl.className = 'success-box';
    statusEl.textContent = `Modelo ajustado com ${result.n} pontos temporais válidos.`;

    metricsEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">Classificação</div><div class="metric-value">${utils.escapeHtml(result.classification)}</div><div class="metric-mini">interpretação da APC</div></div>
      <div class="metric-card"><div class="metric-label">APC (%)</div><div class="metric-value">${utils.fmtSigned(result.apc, 2)}</div><div class="metric-mini">IC95%: ${utils.fmtNumber(result.ciApc[0], 2)} a ${utils.fmtNumber(result.ciApc[1], 2)}</div></div>
      <div class="metric-card"><div class="metric-label">β</div><div class="metric-value">${utils.fmtSigned(result.beta, 4)}</div><div class="metric-mini">coeficiente da tendência</div></div>
      <div class="metric-card"><div class="metric-label">p-valor</div><div class="metric-value">${utils.fmtP(result.p)}</div><div class="metric-mini">gl = ${utils.fmtNumber(result.df, 0)} · t = ${utils.fmtNumber(result.t, 3)}</div></div>
      <div class="metric-card"><div class="metric-label">Autocorrelação (ρ)</div><div class="metric-value">${utils.fmtSigned(result.rho, 3)}</div><div class="metric-mini">estimativa de primeira ordem</div></div>
      <div class="metric-card"><div class="metric-label">Pontos válidos</div><div class="metric-value">${result.n}</div><div class="metric-mini">${utils.escapeHtml(timeLabelEl.value || 'Tempo')} × ${utils.escapeHtml(valueLabelEl.value || 'Indicador')}</div></div>
    `;

    resultsEl.innerHTML = `
      ${utils.buildInterpretationCard(
        'Interpretação automática',
        `O modelo indicou tendência ${result.classification}; ${significance}.`,
        [
          `Pergunta analisada: ${contextEl.value || 'tendência temporal do indicador'}.`,
          `APC = ${utils.fmtSigned(result.apc, 2)}% ao período de ${timeLabelEl.value || 'tempo'}; p ${result.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(result.p)}.`,
          `Use esta saída para relatar crescimento, queda ou estabilidade do indicador ao longo do tempo.`
        ]
      )}
      <div class="result-card">
        <h4>Resumo para discussão</h4>
        <p>Você pode relatar assim: “A análise de Prais-Winsten da série temporal de ${utils.escapeHtml(valueLabelEl.value || 'indicador')} mostrou tendência ${utils.escapeHtml(result.classification)}, com APC de ${utils.fmtSigned(result.apc, 2)}% (IC95% ${utils.fmtNumber(result.ciApc[0], 2)} a ${utils.fmtNumber(result.ciApc[1], 2)}; p ${result.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(result.p)}).”</p>
      </div>
    `;
  });
}
