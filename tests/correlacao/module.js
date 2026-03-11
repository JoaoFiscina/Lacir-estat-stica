function parseDataset(text, utils, stats) {
  const parsed = utils.parseDelimitedText(text, 3);
  const headers = parsed.headers || [];
  const rows = parsed.rows || [];
  if (!rows.length) return { headers: ['Variável X', 'Variável Y'], rows: [], labels: [], x: [], y: [] };

  const firstRow = rows[0] || [];
  const hasThirdCol = rows.some(r => String(r[2] ?? '').trim() !== '') || Boolean(headers[2]);
  const firstColLooksLikeLabel = stats.parseNumber(firstRow[0]) === null && stats.parseNumber(firstRow[1]) !== null;

  let labelIndex = null;
  let xIndex = 0;
  let yIndex = 1;

  if (hasThirdCol || firstColLooksLikeLabel) {
    labelIndex = 0;
    xIndex = 1;
    yIndex = 2;
  }

  const out = { headers: ['Variável X', 'Variável Y'], rows: [], labels: [], x: [], y: [] };
  out.headers = headers.length ? [headers[xIndex] || 'Variável X', headers[yIndex] || 'Variável Y'] : ['Variável X', 'Variável Y'];

  rows.forEach((row, idx) => {
    const rawX = row[xIndex];
    const rawY = row[yIndex];
    const x = stats.parseNumber(rawX);
    const y = stats.parseNumber(rawY);
    if (x === null || y === null) return;
    const label = labelIndex !== null ? String(row[labelIndex] || `Linha ${idx + 1}`) : `Linha ${idx + 1}`;
    out.labels.push(label);
    out.x.push(x);
    out.y.push(y);
    out.rows.push([label, String(rawX), String(rawY)]);
  });

  return out;
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

function outlierMask(values) {
  const s = [...values].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  return values.map(v => v < low || v > high);
}

function summarizeInput(dataset, stats) {
  return {
    n: dataset.x.length,
    xMin: stats.min(dataset.x),
    xMax: stats.max(dataset.x),
    yMin: stats.min(dataset.y),
    yMax: stats.max(dataset.y),
    xMean: stats.mean(dataset.x),
    yMean: stats.mean(dataset.y),
    xSd: stats.sd(dataset.x),
    ySd: stats.sd(dataset.y)
  };
}

function buildScatterSvg(dataset, pearsonResult, utils) {
  const width = 840;
  const height = 440;
  const margin = { top: 26, right: 24, bottom: 60, left: 78 };
  const xMin = Math.min(...dataset.x);
  const xMax = Math.max(...dataset.x);
  const yMin = Math.min(...dataset.y);
  const yMax = Math.max(...dataset.y);

  const xPad = xMin === xMax ? 1 : (xMax - xMin) * 0.08;
  const yPad = yMin === yMax ? 1 : (yMax - yMin) * 0.08;

  const minX = xMin - xPad;
  const maxX = xMax + xPad;
  const minY = yMin - yPad;
  const maxY = yMax + yPad;

  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const xToPx = x => margin.left + ((x - minX) / (maxX - minX || 1)) * innerW;
  const yToPx = y => height - margin.bottom - ((y - minY) / (maxY - minY || 1)) * innerH;

  const xTicks = Array.from({ length: 5 }, (_, i) => minX + ((maxX - minX) * i) / 4);
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + ((maxY - minY) * i) / 4);

  const xOut = outlierMask(dataset.x);
  const yOut = outlierMask(dataset.y);

  const lineX1 = minX;
  const lineX2 = maxX;
  const lineY1 = pearsonResult.intercept + pearsonResult.slope * lineX1;
  const lineY2 = pearsonResult.intercept + pearsonResult.slope * lineX2;

  const points = dataset.x.map((x, i) => {
    const px = xToPx(x);
    const py = yToPx(dataset.y[i]);
    const flagged = xOut[i] || yOut[i];
    const fill = flagged ? '#f97316' : '#2563eb';
    return `<g>
      <circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="6.2" fill="${fill}" fill-opacity="0.92" stroke="#ffffff" stroke-width="2">
        <title>${utils.escapeHtml(dataset.labels[i])} | ${utils.escapeHtml(dataset.headers[0])}: ${utils.fmtNumber(x, 2)} | ${utils.escapeHtml(dataset.headers[1])}: ${utils.fmtNumber(dataset.y[i], 2)}</title>
      </circle>
    </g>`;
  }).join('');

  const xGrid = xTicks.map(t => {
    const px = xToPx(t);
    return `<g>
      <line x1="${px.toFixed(2)}" y1="${margin.top}" x2="${px.toFixed(2)}" y2="${height - margin.bottom}" stroke="#dbe5f2" stroke-dasharray="4 6" />
      <text x="${px.toFixed(2)}" y="${height - margin.bottom + 24}" text-anchor="middle" fill="#5b6b84" font-size="12">${utils.fmtNumber(t, 1)}</text>
    </g>`;
  }).join('');

  const yGrid = yTicks.map(t => {
    const py = yToPx(t);
    return `<g>
      <line x1="${margin.left}" y1="${py.toFixed(2)}" x2="${width - margin.right}" y2="${py.toFixed(2)}" stroke="#dbe5f2" stroke-dasharray="4 6" />
      <text x="${margin.left - 14}" y="${(py + 4).toFixed(2)}" text-anchor="end" fill="#5b6b84" font-size="12">${utils.fmtNumber(t, 1)}</text>
    </g>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="scatter-svg" role="img" aria-label="Gráfico de dispersão com reta de tendência">
      <rect x="0" y="0" width="${width}" height="${height}" rx="22" fill="#ffffff" />
      ${xGrid}
      ${yGrid}
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#8da1bc" stroke-width="1.5" />
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#8da1bc" stroke-width="1.5" />
      <line x1="${xToPx(lineX1).toFixed(2)}" y1="${yToPx(lineY1).toFixed(2)}" x2="${xToPx(lineX2).toFixed(2)}" y2="${yToPx(lineY2).toFixed(2)}" stroke="#0f766e" stroke-width="3.2" stroke-linecap="round" />
      ${points}
      <text x="${width / 2}" y="${height - 16}" text-anchor="middle" fill="#334155" font-size="13" font-weight="700">${utils.escapeHtml(dataset.headers[0])}</text>
      <text x="22" y="${height / 2}" text-anchor="middle" fill="#334155" font-size="13" font-weight="700" transform="rotate(-90, 22, ${height / 2})">${utils.escapeHtml(dataset.headers[1])}</text>
    </svg>
  `;
}

function compareMessage(pearsonResult, spearmanResult, outlierCount) {
  const gap = Math.abs(Math.abs(pearsonResult.coef) - Math.abs(spearmanResult.coef));
  if (outlierCount > 0 && gap > 0.12) {
    return 'Há pontos extremos e diferença relevante entre Pearson e Spearman; vale revisar a influência de outliers antes de relatar apenas o Pearson.';
  }
  if (gap > 0.18) {
    return 'Pearson e Spearman divergem de forma perceptível; isso pode sugerir não linearidade, efeito de postos ou influência de alguns pontos sobre a reta.';
  }
  return 'Pearson e Spearman estão próximos; isso sugere que a direção geral da associação está estável entre a métrica linear e a métrica por postos.';
}

function coefficientStrength(coef) {
  const abs = Math.abs(coef);
  if (abs < 0.10) return 'praticamente ausente';
  if (abs < 0.30) return 'fraca';
  if (abs < 0.50) return 'leve a moderada';
  if (abs < 0.70) return 'moderada';
  if (abs < 0.90) return 'forte';
  return 'muito forte';
}

function directionText(coef) {
  if (coef > 0) return 'positiva';
  if (coef < 0) return 'negativa';
  return 'nula';
}

function buildBulletList(items) {
  return items.length ? `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>` : '';
}

export async function renderTestModule(ctx) {
  const { root, config, utils, stats } = ctx;
  const examples = config.examples || [];

  root.innerHTML = `
    <div class="module-grid">
      <section class="module-header">
        <div class="chip chip-info">Correlação com gráfico de dispersão</div>
        <h3>${utils.escapeHtml(config.title)}</h3>
        <p>${utils.escapeHtml(config.description)}</p>
      </section>

      <section class="callout-grid">
        <article class="help-card">
          <h4>Quando usar</h4>
          <ul>${(config.inputGuide || []).map(item => `<li>${utils.escapeHtml(item)}</li>`).join('')}</ul>
        </article>
        <article class="help-card">
          <h4>Fluxo recomendado</h4>
          <ul>
            <li>Carregue um exemplo ou cole duas colunas da sua planilha.</li>
            <li>Confira a pré-visualização para ver se X e Y foram lidos corretamente.</li>
            <li>Rode o Pearson como análise principal e compare com o Spearman.</li>
            <li>Use o gráfico para ver linearidade, concentração de pontos e possíveis outliers.</li>
          </ul>
        </article>
      </section>

      <section class="surface-card">
        <h4>Dados de entrada</h4>
        <div class="form-grid three">
          <div>
            <label for="c-method">Método principal</label>
            <select id="c-method">
              <option value="pearson">Pearson</option>
              <option value="spearman">Spearman</option>
            </select>
          </div>
          <div>
            <label for="c-example-select">Exemplo rápido</label>
            <select id="c-example-select">
              ${examples.map((ex, idx) => `<option value="${utils.escapeHtml(ex.id)}" ${idx === 0 ? 'selected' : ''}>${utils.escapeHtml(ex.label)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label for="c-context">Pergunta do estudo</label>
            <input id="c-context" type="text" value="Existe associação entre as duas variáveis do estudo?" />
          </div>
        </div>
        <div style="margin-top:14px;">
          <label for="c-paste">Cole 2 ou 3 colunas da planilha</label>
          <textarea id="c-paste" placeholder="UF\tVariável X\tVariável Y\nBA\t52\t3,1\nSP\t58\t4,7"></textarea>
          <div class="small-note">Aceita colunas separadas por TAB, ponto e vírgula, vírgula ou espaços. Você pode colar apenas X e Y ou uma coluna identificadora + X + Y.</div>
        </div>
        <div class="actions-row" style="margin-top:14px;">
          <button class="btn-secondary" id="c-load-example">Carregar exemplo</button>
          <button class="btn-ghost" id="c-template">Baixar modelo CSV</button>
          <label class="btn-ghost file-button">Importar arquivo<input id="c-file" type="file" accept=".csv,.tsv,.txt" style="display:none"></label>
          <button class="btn" id="c-run">Rodar análise</button>
        </div>
        <div id="c-example-note" class="small-note" style="margin-top:10px;"></div>
      </section>

      <section class="surface-card">
        <h4>Pré-visualização dos dados</h4>
        <div id="c-preview" class="small-note">Nenhum dado carregado ainda.</div>
      </section>

      <section class="surface-card">
        <h4>Resultado principal</h4>
        <div id="c-status" class="status-bar">Carregue um exemplo ou cole seus dados para calcular.</div>
        <div id="c-metrics" class="metrics-grid" style="margin-top:14px;"></div>
      </section>

      <section class="chart-grid">
        <article class="surface-card chart-card">
          <div class="chart-card-head">
            <div>
              <h4>Gráfico de dispersão</h4>
              <div class="small-note">Pontos em laranja sinalizam possíveis outliers pelo critério de 1,5 IQR.</div>
            </div>
            <div class="legend-row">
              <span class="legend-item"><span class="legend-dot dot-blue"></span>Pontos</span>
              <span class="legend-item"><span class="legend-dot dot-green"></span>Reta linear</span>
              <span class="legend-item"><span class="legend-dot dot-orange"></span>Outlier</span>
            </div>
          </div>
          <div id="c-chart" class="chart-wrap empty-chart">O gráfico aparecerá aqui.</div>
        </article>

        <article class="surface-card diagnostics-card">
          <h4>Leitura rápida</h4>
          <div id="c-diagnostics" class="diagnostics-stack">
            <div class="small-note">Sem diagnóstico ainda.</div>
          </div>
        </article>
      </section>

      <section class="surface-card">
        <h4>Interpretação e texto pronto</h4>
        <div id="c-results" class="result-grid"></div>
      </section>
    </div>
  `;

  const pasteEl = root.querySelector('#c-paste');
  const fileEl = root.querySelector('#c-file');
  const previewEl = root.querySelector('#c-preview');
  const statusEl = root.querySelector('#c-status');
  const metricsEl = root.querySelector('#c-metrics');
  const resultsEl = root.querySelector('#c-results');
  const chartEl = root.querySelector('#c-chart');
  const diagnosticsEl = root.querySelector('#c-diagnostics');
  const methodEl = root.querySelector('#c-method');
  const exampleEl = root.querySelector('#c-example-select');
  const exampleNoteEl = root.querySelector('#c-example-note');
  const contextEl = root.querySelector('#c-context');

  function refreshPreview() {
    const parsed = parseDataset(pasteEl.value, utils, stats);
    if (!parsed.rows.length) {
      previewEl.innerHTML = '<div class="small-note">Nenhum dado válido carregado ainda.</div>';
      return parsed;
    }
    previewEl.innerHTML = utils.renderPreviewTable(['ID', parsed.headers[0], parsed.headers[1]], parsed.rows);
    return parsed;
  }

  function loadExampleById(exampleId) {
    const current = examples.find(ex => ex.id === exampleId) || examples[0];
    if (!current) return;
    pasteEl.value = current.text;
    exampleNoteEl.textContent = current.description || '';
    refreshPreview();
  }

  function renderOutput() {
    const dataset = refreshPreview();
    if (dataset.x.length < 3) {
      statusEl.className = 'error-box';
      statusEl.textContent = 'É preciso ter pelo menos 3 pares válidos para calcular a correlação.';
      metricsEl.innerHTML = '';
      chartEl.className = 'chart-wrap empty-chart';
      chartEl.innerHTML = 'O gráfico aparecerá aqui.';
      diagnosticsEl.innerHTML = '<div class="small-note">Sem diagnóstico ainda.</div>';
      resultsEl.innerHTML = '';
      return;
    }

    const xUnique = new Set(dataset.x.map(v => v.toFixed(12))).size;
    const yUnique = new Set(dataset.y.map(v => v.toFixed(12))).size;
    if (xUnique < 2 || yUnique < 2) {
      statusEl.className = 'error-box';
      statusEl.textContent = 'Uma das variáveis está constante. A correlação não pode ser calculada com variância zero.';
      metricsEl.innerHTML = '';
      chartEl.className = 'chart-wrap empty-chart';
      chartEl.innerHTML = 'Não foi possível gerar o gráfico.';
      diagnosticsEl.innerHTML = '<div class="small-note">Revise os dados colados.</div>';
      resultsEl.innerHTML = '';
      return;
    }

    const pearsonResult = stats.pearson(dataset.x, dataset.y);
    const spearmanResult = stats.spearman(dataset.x, dataset.y);
    const activeMethod = methodEl.value;
    const activeResult = activeMethod === 'spearman' ? spearmanResult : pearsonResult;
    const coefName = activeMethod === 'spearman' ? 'ρ de Spearman' : 'r de Pearson';
    const direction = directionText(activeResult.coef);
    const strength = coefficientStrength(activeResult.coef);
    const outlierFlagsX = outlierMask(dataset.x);
    const outlierFlagsY = outlierMask(dataset.y);
    const outlierCount = outlierFlagsX.filter((v, i) => v || outlierFlagsY[i]).length;
    const summary = summarizeInput(dataset, stats);
    const significance = activeResult.p < 0.05 ? 'há evidência estatística de associação' : 'não houve evidência estatística suficiente de associação';
    const compareNote = compareMessage(pearsonResult, spearmanResult, outlierCount);

    statusEl.className = 'success-box';
    statusEl.textContent = `Análise concluída com ${dataset.x.length} pares válidos. Método principal: ${activeMethod === 'spearman' ? 'Spearman' : 'Pearson'}.`;

    metricsEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">${coefName}</div><div class="metric-value">${utils.fmtSigned(activeResult.coef, 3)}</div><div class="metric-mini">associação ${direction}</div></div>
      <div class="metric-card"><div class="metric-label">p-valor</div><div class="metric-value">${utils.fmtP(activeResult.p)}</div><div class="metric-mini">teste bicaudal</div></div>
      <div class="metric-card"><div class="metric-label">IC95% do coeficiente</div><div class="metric-value">${Number.isFinite(activeResult.ci[0]) ? `${utils.fmtNumber(activeResult.ci[0], 3)} a ${utils.fmtNumber(activeResult.ci[1], 3)}` : '—'}</div><div class="metric-mini">Fisher z</div></div>
      <div class="metric-card"><div class="metric-label">Pearson vs Spearman</div><div class="metric-value">${utils.fmtSigned(pearsonResult.coef, 3)} / ${utils.fmtSigned(spearmanResult.coef, 3)}</div><div class="metric-mini">comparação de estabilidade</div></div>
      <div class="metric-card"><div class="metric-label">R² linear</div><div class="metric-value">${utils.fmtNumber(pearsonResult.r2, 3)}</div><div class="metric-mini">baseado no Pearson</div></div>
      <div class="metric-card"><div class="metric-label">Outliers possíveis</div><div class="metric-value">${outlierCount}</div><div class="metric-mini">critério 1,5 IQR</div></div>
    `;

    chartEl.className = 'chart-wrap';
    chartEl.innerHTML = buildScatterSvg(dataset, pearsonResult, utils);

    diagnosticsEl.innerHTML = `
      <div class="diagnostic-item">
        <div class="diagnostic-title">Direção e intensidade</div>
        <p>O método principal mostrou correlação <strong>${direction}</strong> de intensidade <strong>${strength}</strong>.</p>
      </div>
      <div class="diagnostic-item">
        <div class="diagnostic-title">Comparação entre métodos</div>
        <p>${utils.escapeHtml(compareNote)}</p>
      </div>
      <div class="diagnostic-item">
        <div class="diagnostic-title">Faixa dos dados</div>
        <p>${utils.escapeHtml(dataset.headers[0])}: ${utils.fmtNumber(summary.xMin, 2)} a ${utils.fmtNumber(summary.xMax, 2)}. ${utils.escapeHtml(dataset.headers[1])}: ${utils.fmtNumber(summary.yMin, 2)} a ${utils.fmtNumber(summary.yMax, 2)}.</p>
      </div>
      <div class="diagnostic-item">
        <div class="diagnostic-title">Pontos de atenção</div>
        ${buildBulletList([
          outlierCount ? `${outlierCount} ponto(s) podem estar influenciando a reta e o Pearson.` : 'Nenhum outlier evidente pelo critério simples de 1,5 IQR.',
          dataset.x.length < 8 ? 'A amostra é pequena; a estimativa fica mais sensível a variações individuais.' : 'O tamanho amostral já permite uma leitura gráfica mais estável.',
          activeMethod === 'pearson' ? 'Use o gráfico para confirmar se a relação parece linear.' : 'Mesmo escolhendo Spearman, o gráfico ajuda a ver o padrão bruto dos pontos.'
        ].map(item => utils.escapeHtml(item)))}
      </div>
    `;

    const reportText = `Observou-se correlação ${direction} entre ${dataset.headers[0]} e ${dataset.headers[1]}, com intensidade ${strength} (${coefName} = ${utils.fmtSigned(activeResult.coef, 3)}; p ${activeResult.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(activeResult.p)}).`;

    resultsEl.innerHTML = `
      ${utils.buildInterpretationCard(
        'Interpretação automática',
        `A análise pelo método ${activeMethod === 'pearson' ? 'de Pearson' : 'de Spearman'} indicou associação ${direction} de intensidade ${strength}; ${significance}.`,
        [
          `Pergunta analisada: ${contextEl.value || 'associação entre duas variáveis do estudo'}.`,
          `${coefName} = ${utils.fmtSigned(activeResult.coef, 3)} e p ${activeResult.p < 0.001 ? '< 0,001' : '= ' + utils.fmtP(activeResult.p)}.`,
          `A reta de tendência foi desenhada com base na regressão linear simples do Pearson.`
        ]
      )}
      <div class="result-card">
        <h4>Texto pronto para discussão</h4>
        <p>${utils.escapeHtml(reportText)}</p>
        <p class="small-note">Sempre descreva também o contexto clínico/epidemiológico e evite concluir causalidade a partir da correlação isoladamente.</p>
      </div>
      <div class="result-card">
        <h4>Resumo técnico</h4>
        <ul>
          <li>n = ${summary.n}</li>
          <li>Média de ${utils.escapeHtml(dataset.headers[0])}: ${utils.fmtNumber(summary.xMean, 2)} (DP ${utils.fmtNumber(summary.xSd, 2)})</li>
          <li>Média de ${utils.escapeHtml(dataset.headers[1])}: ${utils.fmtNumber(summary.yMean, 2)} (DP ${utils.fmtNumber(summary.ySd, 2)})</li>
          <li>Inclinação da reta linear: ${utils.fmtSigned(pearsonResult.slope, 3)} | Intercepto: ${utils.fmtSigned(pearsonResult.intercept, 3)}</li>
        </ul>
      </div>
    `;
  }

  root.querySelector('#c-load-example').addEventListener('click', () => {
    loadExampleById(exampleEl.value);
    renderOutput();
  });

  root.querySelector('#c-template').addEventListener('click', () => {
    utils.downloadText('modelo_correlacao.csv', 'ID;Variavel X;Variavel Y\nA;10;12\nB;11;13\nC;13;16\nD;15;17\n', 'text/csv;charset=utf-8');
  });

  fileEl.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    pasteEl.value = await utils.readFileText(file);
    refreshPreview();
    renderOutput();
  });

  pasteEl.addEventListener('input', refreshPreview);
  exampleEl.addEventListener('change', () => loadExampleById(exampleEl.value));
  methodEl.addEventListener('change', () => {
    if (pasteEl.value.trim()) renderOutput();
  });
  root.querySelector('#c-run').addEventListener('click', renderOutput);

  if (examples.length) {
    loadExampleById(examples[0].id);
    renderOutput();
  }
}
