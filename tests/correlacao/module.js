function parseDataset(text, utils, stats) {
  const parsed = utils.parseDelimitedText(text, 3);
  let rows = parsed.rows;
  let headers = parsed.headers;
  let offset = 0;
  if (!headers && rows.length && stats.parseNumber(rows[0][0]) === null) {
    offset = 1;
  }
  if (offset) rows = rows.map(r => [r[1], r[2]]);
  else rows = rows.map(r => [r[0], r[1]]);
  const labels = headers && headers.length >= 3 ? [headers[1], headers[2]] : headers && headers.length >= 2 ? headers : ['Variável X', 'Variável Y'];

  const x = [];
  const y = [];
  const cleanRows = [];
  for (const row of rows) {
    const a = stats.parseNumber(row[0]);
    const b = stats.parseNumber(row[1]);
    if (a !== null && b !== null) {
      x.push(a);
      y.push(b);
      cleanRows.push([String(row[0]), String(row[1])]);
    }
  }
  return { headers: labels, rows: cleanRows, x, y };
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats } = ctx;

  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header">
        <div class="chip chip-info">Associação entre variáveis</div>
        <h3>${utils.escapeHtml(config.title)}</h3>
        <p>${utils.escapeHtml(config.description)}</p>
      </section>

      <section class="callout-grid">
        <article class="help-card">
          <h4>Como escolher o método</h4>
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
            <label for="c-method">Método</label>
            <select id="c-method">
              <option value="pearson">Pearson</option>
              <option value="spearman">Spearman</option>
            </select>
          </div>
          <div>
            <label for="c-context">Pergunta do estudo</label>
            <input id="c-context" type="text" value="Existe relação entre duas variáveis?" />
          </div>
          <div>
            <label for="c-unit">Cada linha representa</label>
            <input id="c-unit" type="text" value="1 unidade de análise" />
          </div>
        </div>
        <div style="margin-top:14px;">
          <label for="c-paste">Cole duas ou três colunas da planilha</label>
          <textarea id="c-paste" placeholder="Variável X\tVariável Y\n10\t12\n11\t13\n..."></textarea>
          <div class="small-note">Você pode colar apenas X e Y ou uma coluna identificadora + X + Y.</div>
        </div>
        <div class="actions-row" style="margin-top:14px;">
          <button class="btn-secondary" id="c-example">Carregar exemplo</button>
          <button class="btn-ghost" id="c-template">Baixar modelo CSV</button>
          <label class="btn-ghost" style="display:inline-flex;align-items:center;gap:8px;">Importar arquivo<input id="c-file" type="file" accept=".csv,.tsv,.txt" style="display:none"></label>
          <button class="btn" id="c-run">Rodar correlação</button>
        </div>
      </section>

      <section class="surface-card">
        <h4>Pré-visualização dos dados</h4>
        <div id="c-preview" class="small-note">Nenhum dado carregado ainda.</div>
      </section>

      <section class="surface-card">
        <h4>Resultados</h4>
        <div id="c-status" class="status-bar">Aguardando dados para cálculo.</div>
        <div id="c-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        <div id="c-results" class="result-grid" style="margin-top:14px;"></div>
      </section>
    </div>
  `;

  const pasteEl = root.querySelector('#c-paste');
  const fileEl = root.querySelector('#c-file');
  const previewEl = root.querySelector('#c-preview');
  const statusEl = root.querySelector('#c-status');
  const metricsEl = root.querySelector('#c-metrics');
  const resultsEl = root.querySelector('#c-results');
  const methodEl = root.querySelector('#c-method');
  const contextEl = root.querySelector('#c-context');

  function refreshPreview() {
    const parsed = parseDataset(pasteEl.value, utils, stats);
    if (!parsed.rows.length) {
      previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
      return;
    }
    previewEl.innerHTML = utils.renderPreviewTable(parsed.headers, parsed.rows);
  }

  root.querySelector('#c-example').addEventListener('click', () => {
    pasteEl.value = config.exampleText;
    refreshPreview();
  });
  root.querySelector('#c-template').addEventListener('click', () => {
    utils.downloadText('modelo_correlacao.csv', 'Variavel X;Variavel Y\n10;12\n11;13\n12;13\n13;16\n', 'text/csv;charset=utf-8');
  });
  fileEl.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    pasteEl.value = await utils.readFileText(file);
    refreshPreview();
  });
  pasteEl.addEventListener('input', refreshPreview);

  root.querySelector('#c-run').addEventListener('click', () => {
    const parsed = parseDataset(pasteEl.value, utils, stats);
    refreshPreview();
    if (parsed.x.length < 3) {
      statusEl.className = 'error-box';
      statusEl.textContent = 'É preciso ter pelo menos 3 pares válidos para calcular a correlação.';
      metricsEl.innerHTML = '';
      resultsEl.innerHTML = '';
      return;
    }

    const method = methodEl.value;
    const result = method === 'spearman' ? stats.spearman(parsed.x, parsed.y) : stats.pearson(parsed.x, parsed.y);
    const coefName = method === 'spearman' ? 'ρ de Spearman' : 'r de Pearson';
    const direction = result.coef > 0 ? 'positiva' : result.coef < 0 ? 'negativa' : 'nula';
    const abs = Math.abs(result.coef);
    const strength = abs < 0.3 ? 'fraca' : abs < 0.6 ? 'moderada' : abs < 0.8 ? 'forte' : 'muito forte';
    const significance = result.p < 0.05 ? 'há evidência estatística de associação' : 'não houve evidência estatística suficiente de associação';

    statusEl.className = 'success-box';
    statusEl.textContent = `Correlação calculada com ${parsed.x.length} pares válidos.`;

    metricsEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">${coefName}</div><div class="metric-value">${utils.fmtSigned(result.coef, 3)}</div><div class="metric-mini">associação ${direction}</div></div>
      <div class="metric-card"><div class="metric-label">p-valor</div><div class="metric-value">${utils.fmtP(result.p)}</div><div class="metric-mini">teste bicaudal</div></div>
      <div class="metric-card"><div class="metric-label">IC95% do coeficiente</div><div class="metric-value">${Number.isFinite(result.ci[0]) ? `${utils.fmtNumber(result.ci[0], 3)} a ${utils.fmtNumber(result.ci[1], 3)}` : '—'}</div><div class="metric-mini">estimado por transformação de Fisher</div></div>
      <div class="metric-card"><div class="metric-label">R²</div><div class="metric-value">${utils.fmtNumber(result.r2, 3)}</div><div class="metric-mini">proporção explicada da relação linear</div></div>
      <div class="metric-card"><div class="metric-label">Inclinação</div><div class="metric-value">${utils.fmtSigned(result.slope, 3)}</div><div class="metric-mini">para reta Y = a + bX</div></div>
      <div class="metric-card"><div class="metric-label">Intercepto</div><div class="metric-value">${utils.fmtSigned(result.intercept, 3)}</div><div class="metric-mini">modelo linear simples</div></div>
    `;

    resultsEl.innerHTML = `
      ${utils.buildInterpretationCard(
        'Interpretação automática',
        `A análise pelo método ${method === 'spearman' ? 'de Spearman' : 'de Pearson'} mostrou correlação ${direction} de intensidade ${strength}; ${significance}.`,
        [
          `Pergunta analisada: ${contextEl.value || 'relação entre duas variáveis'}.`,
          `${coefName} = ${utils.fmtSigned(result.coef, 3)} e p ${result.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(result.p)}.`,
          `Lembre-se: correlação não demonstra causalidade.`
        ]
      )}
      <div class="result-card">
        <h4>Resumo para discussão</h4>
        <p>Você pode relatar assim: “Observou-se correlação ${utils.escapeHtml(direction)} entre ${utils.escapeHtml(parsed.headers[0])} e ${utils.escapeHtml(parsed.headers[1])}, com intensidade ${utils.escapeHtml(strength)} (${utils.escapeHtml(coefName)} = ${utils.fmtSigned(result.coef, 3)}; p ${result.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(result.p)}).”</p>
      </div>
    `;
  });
}
