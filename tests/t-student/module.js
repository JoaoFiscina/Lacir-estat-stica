function parseDataset(text, utils, stats) {
  const parsed = utils.parseDelimitedText(text, 2);
  const headers = parsed.headers || ['Grupo 1', 'Grupo 2'];
  const g1 = [];
  const g2 = [];
  for (const row of parsed.rows) {
    const a = stats.parseNumber(row[0]);
    const b = stats.parseNumber(row[1]);
    if (a !== null) g1.push(a);
    if (b !== null) g2.push(b);
  }
  return { headers, rows: parsed.rows, g1, g2 };
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats } = ctx;

  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header">
        <div class="chip chip-primary">Comparação de médias</div>
        <h3>${utils.escapeHtml(config.title)}</h3>
        <p>${utils.escapeHtml(config.description)}</p>
      </section>

      <section class="callout-grid">
        <article class="help-card">
          <h4>Quando usar</h4>
          <ul>${config.inputGuide.map(item => `<li>${utils.escapeHtml(item)}</li>`).join('')}</ul>
        </article>
        <article class="help-card">
          <h4>Exemplo de pergunta</h4>
          <p class="muted">A média de permanência hospitalar foi diferente entre pacientes de duas categorias clínicas?</p>
          <div class="code-block">${utils.escapeHtml(config.exampleText)}</div>
        </article>
      </section>

      <section class="surface-card">
        <h4>Dados de entrada</h4>
        <div class="form-grid two">
          <div>
            <label for="t-context">Pergunta do estudo</label>
            <input id="t-context" type="text" value="Comparação entre duas médias independentes" />
          </div>
          <div>
            <label for="t-unit">Cada linha representa</label>
            <input id="t-unit" type="text" value="1 observação por grupo" />
          </div>
        </div>
        <div style="margin-top:14px;">
          <label for="t-paste">Cole duas colunas da planilha</label>
          <textarea id="t-paste" placeholder="Grupo 1\tGrupo 2\n10\t15\n12\t17\n..."></textarea>
          <div class="small-note">Aceita colagem do Excel, CSV, TSV ou texto com duas colunas.</div>
        </div>
        <div class="actions-row" style="margin-top:14px;">
          <button class="btn-secondary" id="t-example">Carregar exemplo</button>
          <button class="btn-ghost" id="t-template">Baixar modelo CSV</button>
          <label class="btn-ghost" style="display:inline-flex;align-items:center;gap:8px;">Importar arquivo<input id="t-file" type="file" accept=".csv,.tsv,.txt" style="display:none"></label>
          <button class="btn" id="t-run">Rodar teste</button>
        </div>
      </section>

      <section class="surface-card">
        <h4>Pré-visualização dos dados</h4>
        <div id="t-preview" class="small-note">Nenhum dado carregado ainda.</div>
      </section>

      <section class="surface-card">
        <h4>Resultados</h4>
        <div id="t-status" class="status-bar">Aguardando dados para cálculo.</div>
        <div id="t-metrics" class="metrics-grid" style="margin-top:14px;"></div>
        <div id="t-results" class="result-grid" style="margin-top:14px;"></div>
      </section>
    </div>
  `;

  const pasteEl = root.querySelector('#t-paste');
  const fileEl = root.querySelector('#t-file');
  const previewEl = root.querySelector('#t-preview');
  const statusEl = root.querySelector('#t-status');
  const metricsEl = root.querySelector('#t-metrics');
  const resultsEl = root.querySelector('#t-results');
  const contextEl = root.querySelector('#t-context');

  function refreshPreview() {
    const parsed = parseDataset(pasteEl.value, utils, stats);
    if (!parsed.rows.length) {
      previewEl.innerHTML = '<div class="small-note">Nenhum dado carregado ainda.</div>';
      return;
    }
    previewEl.innerHTML = utils.renderPreviewTable(parsed.headers, parsed.rows);
  }

  root.querySelector('#t-example').addEventListener('click', () => {
    pasteEl.value = config.exampleText;
    refreshPreview();
  });

  root.querySelector('#t-template').addEventListener('click', () => {
    utils.downloadText('modelo_t_student.csv', 'Grupo 1;Grupo 2\n10;12\n11;13\n12;14\n', 'text/csv;charset=utf-8');
  });

  fileEl.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    pasteEl.value = await utils.readFileText(file);
    refreshPreview();
  });

  pasteEl.addEventListener('input', refreshPreview);

  root.querySelector('#t-run').addEventListener('click', () => {
    const parsed = parseDataset(pasteEl.value, utils, stats);
    refreshPreview();

    if (parsed.g1.length < 2 || parsed.g2.length < 2) {
      statusEl.className = 'error-box';
      statusEl.textContent = 'Cada grupo precisa ter pelo menos 2 valores numéricos válidos.';
      metricsEl.innerHTML = '';
      resultsEl.innerHTML = '';
      return;
    }

    const result = stats.welchT(parsed.g1, parsed.g2);
    const group1Label = parsed.headers[0] || 'Grupo 1';
    const group2Label = parsed.headers[1] || 'Grupo 2';
    const direction = result.diff > 0 ? `${group1Label} apresentou média maior` : `${group2Label} apresentou média maior`;
    const significance = result.p < 0.05 ? 'há evidência de diferença estatística entre as médias' : 'não houve evidência estatística suficiente de diferença entre as médias';

    statusEl.className = 'success-box';
    statusEl.textContent = `Teste concluído para: ${contextEl.value || 'comparação entre duas médias'}.`;

    metricsEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">n do ${utils.escapeHtml(group1Label)}</div><div class="metric-value">${result.n1}</div><div class="metric-mini">média = ${utils.fmtNumber(result.m1, 2)} · DP = ${utils.fmtNumber(result.s1, 2)}</div></div>
      <div class="metric-card"><div class="metric-label">n do ${utils.escapeHtml(group2Label)}</div><div class="metric-value">${result.n2}</div><div class="metric-mini">média = ${utils.fmtNumber(result.m2, 2)} · DP = ${utils.fmtNumber(result.s2, 2)}</div></div>
      <div class="metric-card"><div class="metric-label">t de Welch</div><div class="metric-value">${utils.fmtNumber(result.t, 3)}</div><div class="metric-mini">gl = ${utils.fmtNumber(result.df, 2)}</div></div>
      <div class="metric-card"><div class="metric-label">p-valor</div><div class="metric-value">${utils.fmtP(result.p)}</div><div class="metric-mini">IC95% da diferença: ${utils.fmtNumber(result.ci[0], 2)} a ${utils.fmtNumber(result.ci[1], 2)}</div></div>
      <div class="metric-card"><div class="metric-label">Diferença das médias</div><div class="metric-value">${utils.fmtSigned(result.diff, 2)}</div><div class="metric-mini">${utils.escapeHtml(group1Label)} − ${utils.escapeHtml(group2Label)}</div></div>
      <div class="metric-card"><div class="metric-label">Tamanho de efeito</div><div class="metric-value">${utils.fmtSigned(result.d, 2)}</div><div class="metric-mini">Cohen d aproximado</div></div>
    `;

    const interpretation = `${significance}; ${direction}.`;

    resultsEl.innerHTML = `
      ${utils.buildInterpretationCard(
        'Interpretação automática',
        interpretation,
        [
          `Pergunta analisada: ${contextEl.value || 'comparação entre duas médias'}.`,
          `Média de ${group1Label}: ${utils.fmtNumber(result.m1, 2)}; média de ${group2Label}: ${utils.fmtNumber(result.m2, 2)}.`,
          `Se o seu desenho tem grupos independentes e variável contínua, esta é a leitura principal do teste.`
        ]
      )}
      <div class="result-card">
        <h4>Resumo para discussão</h4>
        <p>Você pode relatar assim: “Comparando ${utils.escapeHtml(group1Label)} e ${utils.escapeHtml(group2Label)}, observou-se ${utils.escapeHtml(significance)} (t = ${utils.fmtNumber(result.t, 3)}; gl = ${utils.fmtNumber(result.df, 2)}; p ${result.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(result.p)}). A diferença média foi de ${utils.fmtNumber(result.diff, 2)} unidades.”</p>
      </div>
    `;
  });
}
