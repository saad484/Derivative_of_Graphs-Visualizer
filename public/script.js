/* ================================================================
   Derivative of Graphs – Frontend Logic
   ================================================================
   Two view modes:
     1. "snapshots"    – all snapshots shown as a time×vertex grid
                         (black edges only, NO red edges)
     2. "differential" – window [t, t+Δ-1] with black + red edges
   ================================================================ */

// --------------- State ---------------
let graphData = null;   // current TemporalGraph (JSON)
let cy        = null;   // Cytoscape instance
let viewMode  = 'empty'; // 'empty' | 'snapshots' | 'differential'

// --------------- DOM refs ---------------
const $ = (sel) => document.querySelector(sel);

const dom = {
  inpNodes:      $('#inp-nodes'),
  inpSnapshots:  $('#inp-snapshots'),
  inpEdgeProb:   $('#inp-edge-prob'),
  inpT:          $('#inp-t'),
  inpDelta:      $('#inp-delta'),
  btnGenerate:   $('#btn-generate'),
  btnCompute:    $('#btn-compute'),
  btnViewSnaps:  $('#btn-view-snaps'),
  btnViewExpansion: $('#btn-view-expansion'),
  btnAnalyze:    $('#btn-analyze'),
  btnUpload:     $('#btn-upload'),
  btnReset:      $('#btn-reset'),
  btnJsonLoad:   $('#btn-json-load'),
  btnJsonCancel: $('#btn-json-cancel'),
  modalUpload:   $('#modal-upload'),
  jsonInput:     $('#json-input'),
  panelInfo:     $('#panel-info'),
  panelAnalysis: $('#panel-analysis'),
  statusBar:     $('#status-bar'),
  timeAxis:      $('#time-axis'),
  snapshotBars:  $('#snapshot-bars'),
  twinList:      $('#twin-list'),
  legendDiff:    $('#legend-diff'),
  legendSnap:    $('#legend-snap'),
  cyContainer:   $('#cy'),
};

// --------------- Helpers ---------------

function setStatus(msg, level = 'idle') {
  const cls = level === 'ok' ? 'dot-ok' : level === 'error' ? 'dot-error' : 'dot-idle';
  dom.statusBar.innerHTML = `<span class="dot ${cls}"></span>${msg}`;
}

async function api(endpoint, body = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function enableControls(enabled) {
  dom.btnCompute.disabled      = !enabled;
  dom.btnViewSnaps.disabled    = !enabled;
  dom.btnViewExpansion.disabled = !enabled;
  dom.btnAnalyze.disabled      = !enabled;
}

function setViewMode(mode) {
  viewMode = mode;
  dom.legendSnap.style.display = mode === 'snapshots'    ? '' : 'none';
  dom.legendDiff.style.display = mode === 'differential' ? '' : 'none';
}

// --------------- Cytoscape setup ---------------

function initCytoscape() {
  cy = cytoscape({
    container: dom.cyContainer,
    elements: [],
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#58a6ff',
          'border-width': 2,
          'border-color': '#30363d',
          'label': 'data(label)',
          'color': '#e6edf3',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '10px',
          'font-family': "'Cascadia Code','Fira Code',Consolas,monospace",
          'width': 36,
          'height': 36,
          'text-outline-width': 2,
          'text-outline-color': '#0d1117',
        },
      },
      // Black edges (within-snapshot adjacency)
      {
        selector: 'edge[type = "black"]',
        style: {
          'line-color': '#8b949e',
          'width': 2,
          'curve-style': 'unbundled-bezier',
          'control-point-distances': [0],
          'control-point-weights': [0.5],
          'line-style': 'solid',
          'opacity': 0.75,
        },
      },
      // Red edges (temporal continuity)
      {
        selector: 'edge[type = "red"]',
        style: {
          'line-color': '#f85149',
          'width': 1.5,
          'curve-style': 'bezier',
          'line-style': 'dashed',
          'line-dash-pattern': [6, 4],
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#f85149',
          'arrow-scale': 0.8,
          'opacity': 0.55,
        },
      },
      // Eternal twin highlight
      {
        selector: 'node.twin-highlight',
        style: {
          'background-color': '#3fb950',
          'border-color': '#3fb950',
          'border-width': 3,
        },
      },
    ],
    layout: { name: 'preset' },
    wheelSensitivity: 0.3,
    minZoom: 0.1,
    maxZoom: 4,
  });
}

// ================================================================
//  Grid layout helper (time on X, vertex on Y)
// ================================================================

function applyGridLayout(timeRange) {
  const vertices = graphData.vertices;
  const hSpacing = 140;
  const vSpacing = 70;
  const padX = 80;
  const padY = 50;

  cy.nodes().forEach((node) => {
    const t = node.data('time');
    const v = node.data('vertex');
    const col = timeRange.indexOf(t);
    const row = vertices.indexOf(v);
    node.position({ x: padX + col * hSpacing, y: padY + row * vSpacing });
  });

  cy.fit(undefined, 40);

  // Curve black edges outward so non-adjacent connections are visible
  // (like the paper's static-expansion figure)
  cy.edges('[type = "black"]').forEach((edge) => {
    const srcV = edge.data('source').split('_t')[0];
    const tgtV = edge.data('target').split('_t')[0];
    const srcIdx = vertices.indexOf(parseInt(srcV));
    const tgtIdx = vertices.indexOf(parseInt(tgtV));
    const gap = Math.abs(srcIdx - tgtIdx);
    // Adjacent vertices: minimal curve; distant vertices: larger curve
    const dist = gap <= 1 ? 0 : gap * 18;
    edge.style('control-point-distances', [dist]);
  });

  // Time axis labels
  dom.timeAxis.innerHTML =
    '<span style="color:var(--text-secondary)">Time axis:</span>' +
    timeRange.map((t) => `<span class="time-axis-label">t=${t}</span>`).join('');
}

// ================================================================
//  ALL-SNAPSHOTS VIEW  (generate → see all frames at once)
// ================================================================

function renderAllSnapshots() {
  setViewMode('snapshots');

  const nodes = [];
  const edges = [];

  // Build time-vertices for every snapshot
  for (let t = 0; t < graphData.lifetime; t++) {
    for (const v of graphData.vertices) {
      nodes.push({
        group: 'nodes',
        data: {
          id: `${v}_t${t}`,
          label: `v${v}`,
          vertex: v,
          time: t,
        },
      });
    }

    // Black edges for snapshot t (no red edges in this view)
    graphData.snapshots[t].forEach(([u, v], i) => {
      edges.push({
        group: 'edges',
        data: {
          id: `b_${t}_${i}`,
          source: `${u}_t${t}`,
          target: `${v}_t${t}`,
          type: 'black',
        },
      });
    });
  }

  cy.elements().remove();
  cy.add([...nodes, ...edges]);

  const allTimes = Array.from({ length: graphData.lifetime }, (_, i) => i);
  applyGridLayout(allTimes);

  // Stats
  const totalBlack = edges.length;
  $('#info-diff-nodes').textContent  = nodes.length;
  $('#info-black-edges').textContent = totalBlack;
  $('#info-red-edges').textContent   = 0;

  setStatus(
    `All ${graphData.lifetime} snapshots \u2014 ${nodes.length} time-vertices, ${totalBlack} black edges`,
    'ok',
  );
}

// ================================================================
//  DIFFERENTIAL VIEW  (window [t, t+Δ-1] with red edges added)
// ================================================================

function renderDifferential(data) {
  setViewMode('differential');

  const elements = [
    ...data.nodes.map((n) => ({ group: 'nodes', data: n.data })),
    ...data.edges.map((e) => ({ group: 'edges', data: e.data })),
  ];

  cy.elements().remove();
  cy.add(elements);

  const times = [...new Set(data.nodes.map((n) => n.data.time))].sort((a, b) => a - b);
  applyGridLayout(times);

  if (data.stats) {
    $('#info-diff-nodes').textContent  = data.stats.num_nodes;
    $('#info-black-edges').textContent = data.stats.num_black_edges;
    $('#info-red-edges').textContent   = data.stats.num_red_edges;
  }
}

// ================================================================
//  Snapshot bar chart (sidebar)
// ================================================================

function renderSnapshotBars(edgeCounts) {
  const maxEdges = Math.max(...edgeCounts, 1);
  dom.snapshotBars.innerHTML = edgeCounts
    .map((count, i) => {
      const pct = Math.max((count / maxEdges) * 100, 5);
      return `<div class="snapshot-bar" data-t="${i}" style="height:${pct}%"
                   title="t=${i}: ${count} edges">
                <span class="snapshot-bar-label">${i}</span>
              </div>`;
    })
    .join('');
}

// ================================================================
//  STATIC EXPANSION VIEW  (full G-> with red edges)
// ================================================================

async function viewStaticExpansion() {
  if (!graphData) return;
  setStatus('Computing static expansion G\u2192\u2026', 'idle');
  dom.btnViewExpansion.disabled = true;

  try {
    const result = await api('/api/static-expansion', { graph: graphData });
    setViewMode('differential'); // reuse differential legend (black + red)
    const elements = [
      ...result.nodes.map((n) => ({ group: 'nodes', data: n.data })),
      ...result.edges.map((e) => ({ group: 'edges', data: e.data })),
    ];
    cy.elements().remove();
    cy.add(elements);

    const times = [...new Set(result.nodes.map((n) => n.data.time))].sort((a, b) => a - b);
    applyGridLayout(times);

    if (result.stats) {
      $('#info-diff-nodes').textContent  = result.stats.num_nodes;
      $('#info-black-edges').textContent = result.stats.num_black_edges;
      $('#info-red-edges').textContent   = result.stats.num_red_edges;
    }
    setStatus(
      `Static expansion G\u2192 \u2014 ${result.stats.num_nodes} nodes, ` +
      `${result.stats.num_black_edges} black + ${result.stats.num_red_edges} red edges`,
      'ok',
    );
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  } finally {
    dom.btnViewExpansion.disabled = false;
  }
}

// ================================================================
//  API Actions
// ================================================================

async function generateGraph() {
  setStatus('Generating temporal graph\u2026', 'idle');
  dom.btnGenerate.disabled = true;

  try {
    const result = await api('/api/init-random', {
      num_nodes:     parseInt(dom.inpNodes.value) || 10,
      num_snapshots: parseInt(dom.inpSnapshots.value) || 5,
      edge_prob:     parseFloat(dom.inpEdgeProb.value) || 0.2,
    });
    graphData = result.graph;
    onGraphLoaded();
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  } finally {
    dom.btnGenerate.disabled = false;
  }
}

function onGraphLoaded() {
  dom.inpT.value = 0;
  dom.inpT.max   = graphData.lifetime - 1;
  dom.inpDelta.value = Math.min(2, graphData.lifetime);
  dom.inpDelta.max   = graphData.lifetime;

  dom.panelInfo.style.display = '';
  $('#info-vertices').textContent = graphData.vertices.length;
  $('#info-lifetime').textContent = graphData.lifetime;

  const unionSet = new Set();
  graphData.snapshots.forEach((edges) => {
    edges.forEach(([u, v]) => unionSet.add(Math.min(u, v) + '_' + Math.max(u, v)));
  });
  $('#info-union-edges').textContent = unionSet.size;

  renderSnapshotBars(graphData.snapshots.map((e) => e.length));
  enableControls(true);
  dom.btnReset.disabled = false;
  dom.panelAnalysis.style.display = 'none';

  // Show all snapshots in the grid (no red edges)
  renderAllSnapshots();
}

async function computeDifferential() {
  if (!graphData) return;
  const t     = parseInt(dom.inpT.value) || 0;
  const delta = parseInt(dom.inpDelta.value) || 2;

  setStatus(`Computing differential  t=${t}, \u0394=${delta}\u2026`, 'idle');
  dom.btnCompute.disabled = true;

  try {
    const result = await api('/api/differential', { graph: graphData, t, delta });
    renderDifferential(result);
    setStatus(
      `Differential G\u2192^{${t},${delta}} \u2014 ` +
      `${result.stats.num_nodes} nodes, ` +
      `${result.stats.num_black_edges} black + ${result.stats.num_red_edges} red edges`,
      'ok',
    );
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  } finally {
    dom.btnCompute.disabled = false;
  }
}

async function analyzeGraph() {
  if (!graphData) return;
  const t     = parseInt(dom.inpT.value) || 0;
  const delta = parseInt(dom.inpDelta.value) || 2;

  setStatus('Running analysis\u2026', 'idle');
  dom.btnAnalyze.disabled = true;

  try {
    const result = await api('/api/analyze', { graph: graphData, t, delta });

    dom.panelAnalysis.style.display = '';
    $('#info-tw-current').textContent =
      result.tw_current_differential != null ? result.tw_current_differential : '\u2014';
    $('#info-dtw-delta').textContent =
      result.dtw_delta != null ? result.dtw_delta : '\u2014';
    $('#info-max-deg').textContent =
      result.max_degree_differential != null ? result.max_degree_differential : '\u2014';
    $('#info-twin-count').textContent = result.num_eternal_twins;

    // Tree-width per start-time bar chart
    const twContainer = $('#tw-per-t-container');
    if (result.dtw_per_t && result.dtw_per_t.length > 0) {
      twContainer.style.display = '';
      const maxTw = Math.max(...result.dtw_per_t.map(([, tw]) => tw), 1);
      $('#tw-bars').innerHTML = result.dtw_per_t
        .map(([tVal, tw]) => {
          const pct = Math.max((tw / maxTw) * 100, 8);
          return `<div class="snapshot-bar" style="height:${pct}%;background:var(--yellow)"
                       title="t=${tVal}: tw=${tw}">
                    <span class="snapshot-bar-label">${tVal}</span>
                  </div>`;
        })
        .join('');
    } else {
      twContainer.style.display = 'none';
    }

    if (result.eternal_twins.length === 0) {
      dom.twinList.innerHTML = '<li class="no-data">No eternal twins found</li>';
    } else {
      dom.twinList.innerHTML = result.eternal_twins
        .map((tw) => `<li><span class="twin-badge">twin</span> v${tw.u} \u2194 v${tw.v}</li>`)
        .join('');
    }

    // Highlight twin vertices
    if (cy) {
      cy.nodes().removeClass('twin-highlight');
      const twinVerts = new Set();
      result.eternal_twins.forEach(({ u, v }) => { twinVerts.add(u); twinVerts.add(v); });
      cy.nodes().forEach((node) => {
        if (twinVerts.has(node.data('vertex'))) node.addClass('twin-highlight');
      });
    }

    setStatus(`Analysis complete \u2014 ${result.num_eternal_twins} eternal twin pair(s)`, 'ok');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  } finally {
    dom.btnAnalyze.disabled = false;
  }
}

// ================================================================
//  Reset
// ================================================================

function resetAll() {
  graphData = null;
  if (cy) cy.elements().remove();

  setViewMode('empty');
  dom.timeAxis.innerHTML =
    '<span style="color:var(--text-secondary)">Time axis:</span>' +
    '<span class="no-data">generate a graph to begin</span>';

  enableControls(false);
  dom.btnReset.disabled         = true;
  dom.panelInfo.style.display     = 'none';
  dom.panelAnalysis.style.display = 'none';

  setStatus('Ready', 'idle');
}

// ================================================================
//  Upload / Paste JSON
// ================================================================

function openUploadModal()  { dom.modalUpload.classList.add('active'); }
function closeUploadModal() { dom.modalUpload.classList.remove('active'); }

function loadJsonGraph() {
  try {
    const raw = dom.jsonInput.value.trim();
    if (!raw) throw new Error('Empty input');
    const parsed = JSON.parse(raw);
    if (!parsed.vertices || !parsed.snapshots)
      throw new Error('JSON must have "vertices" and "snapshots" keys');
    parsed.lifetime = parsed.snapshots.length;
    graphData = parsed;
    closeUploadModal();
    onGraphLoaded();
    setStatus('Graph loaded from JSON', 'ok');
  } catch (err) {
    setStatus(`JSON error: ${err.message}`, 'error');
  }
}

// ================================================================
//  Event listeners
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  initCytoscape();

  dom.btnGenerate.addEventListener('click', generateGraph);
  dom.btnCompute.addEventListener('click', computeDifferential);
  dom.btnViewSnaps.addEventListener('click', () => { if (graphData) renderAllSnapshots(); });
  dom.btnViewExpansion.addEventListener('click', viewStaticExpansion);
  dom.btnAnalyze.addEventListener('click', analyzeGraph);
  dom.btnReset.addEventListener('click', resetAll);
  dom.btnUpload.addEventListener('click', openUploadModal);
  dom.btnJsonLoad.addEventListener('click', loadJsonGraph);
  dom.btnJsonCancel.addEventListener('click', closeUploadModal);

  dom.modalUpload.addEventListener('click', (e) => {
    if (e.target === dom.modalUpload) closeUploadModal();
  });

  [dom.inpT, dom.inpDelta].forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') computeDifferential();
    });
  });
});
