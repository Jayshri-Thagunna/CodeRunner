// ── API ──────────────────────────────────────────────────────────────────────
const API = 'http://localhost:3001';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  return res;
}

// ── File Store (in-memory cache; source of truth is the backend) ─────────────
const files = {}; // name → content string | null (null = not yet loaded)

// ── State ───────────────────────────────────────────────────────────────────
let sessionId = null;
let openTabs = [];
let activeFile = null;
let autoRunTimeout = null;
let previewObjectUrl = null;
let editor = null;
let isResizing = false;
let isSwitchingModel = false;
const unsaved = new Set();
const models = new Map();

// ── DOM refs ────────────────────────────────────────────────────────────────
const tabBar        = document.getElementById('tabBar');
const fileTree      = document.getElementById('fileTree');
const previewFrame  = document.getElementById('previewFrame');
const previewTitle  = document.getElementById('previewTitle');
const cursorPos     = document.getElementById('cursorPos');
const spacesInfo    = document.getElementById('spacesInfo');
const runBtn        = document.getElementById('runBtn');
const runBtnText    = document.getElementById('runBtnText');
const toast         = document.getElementById('toast');
const gitChanges    = document.getElementById('gitChanges');
const gitStatus     = document.getElementById('gitStatus');
const tabSizeSetting  = document.getElementById('settingTabSize');
const fontSizeSetting = document.getElementById('settingFontSize');
const wordWrapSetting = document.getElementById('settingWordWrap');

// ── Monaco setup ─────────────────────────────────────────────────────────────
window.MonacoEnvironment = {
  getWorkerUrl() {
    const source = `
      self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/' };
      importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/base/worker/workerMain.js');
    `;
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
  }
};

window.require.config({
  paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs' }
});

window.require(['vs/editor/editor.main'], async () => {
  initMonaco();
  bindUiEvents();
  spacesInfo.textContent = `Spaces: ${tabSizeSetting.value}`;
  await initSession();
});

// ── Session bootstrap ─────────────────────────────────────────────────────────
async function initSession() {
  try {
    const stored = localStorage.getItem('ide_session_id');

    if (stored) {
      const check = await apiFetch(`/api/files?sessionId=${stored}`);
      if (check.ok) {
        sessionId = stored;
        const { files: remoteFiles } = await check.json();
        for (const f of remoteFiles) files[f.name] = null;
      }
    }

    if (!sessionId) {
      const res = await apiFetch('/api/sessions', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      sessionId = data.sessionId;
      localStorage.setItem('ide_session_id', sessionId);
      for (const f of data.files) files[f.name] = null;
    }

    // Pre-load all file contents
    await Promise.all(Object.keys(files).map(loadFileContent));

    openTabs = Object.keys(files).slice(0, 2);
    activeFile = openTabs[0] || null;

    renderFileTree();
    renderTabs();
    if (activeFile) switchFile(activeFile);
    updateGitBadge();
  } catch (err) {
    console.error('Session init failed:', err);
    showToast('Cannot reach backend — is the API server running on port 3001?');
  }
}

async function loadFileContent(name) {
  if (files[name] !== null) return;
  try {
    const res = await apiFetch(`/api/files/${encodeURIComponent(name)}?sessionId=${sessionId}`);
    if (res.ok) {
      const { content } = await res.json();
      files[name] = content;
      if (models.has(name)) {
        const m = models.get(name);
        if (m.getValue() !== content) m.setValue(content);
      }
    }
  } catch (err) {
    console.error(`Failed to load ${name}:`, err);
  }
}

// ── Monaco init ───────────────────────────────────────────────────────────────
function initMonaco() {
  monaco.editor.defineTheme('codelab-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0d0d0d',
      'editor.lineHighlightBackground': '#141414',
      'editorCursor.foreground': '#f9fafb',
      'editorLineNumber.foreground': '#3a3a3a',
      'editorLineNumber.activeForeground': '#8a8a8a'
    }
  });

  editor = monaco.editor.create(document.getElementById('monacoEditor'), {
    theme: 'codelab-dark',
    fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
    fontLigatures: true,
    fontSize: parseInt(fontSizeSetting.value, 10) || 13,
    lineHeight: 21,
    minimap: { enabled: false },
    automaticLayout: true,
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    tabSize: parseInt(tabSizeSetting.value, 10) || 4,
    insertSpaces: true,
    wordWrap: wordWrapSetting.checked ? 'on' : 'off'
  });

  editor.onDidChangeModelContent(() => {
    if (isSwitchingModel || !activeFile) return;
    const model = editor.getModel();
    if (!model) return;
    files[activeFile] = model.getValue();
    markUnsaved(activeFile);
    scheduleAutoRun();
  });

  editor.onDidChangeCursorPosition(() => updateCursorStatus());

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveFile());
}

// ── Models ────────────────────────────────────────────────────────────────────
function ensureModel(name) {
  if (models.has(name)) return models.get(name);
  const uri = monaco.Uri.parse(`inmemory://model/${encodeURIComponent(name)}`);
  const model = monaco.editor.createModel(files[name] ?? '', inferLanguage(name), uri);
  model.updateOptions({ tabSize: parseInt(tabSizeSetting.value, 10) || 4, insertSpaces: true });
  models.set(name, model);
  return model;
}

function inferLanguage(name) {
  if (name.endsWith('.php'))  return 'php';
  if (name.endsWith('.css'))  return 'css';
  if (name.endsWith('.js'))   return 'javascript';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.html')) return 'html';
  if (name.endsWith('.md'))   return 'markdown';
  return 'plaintext';
}

// ── UI Bindings ───────────────────────────────────────────────────────────────
function bindUiEvents() {
  document.getElementById('newFileBtn').addEventListener('click', createNewFile);

  document.getElementById('folderToggle').addEventListener('click', () => {
    const arrow = document.querySelector('.folder-arrow');
    const collapsed = fileTree.style.display === 'none';
    fileTree.style.display = collapsed ? '' : 'none';
    arrow.style.transform = collapsed ? '' : 'rotate(-90deg)';
  });

  const panels = ['explorer', 'search', 'git', 'extensions', 'settings'];
  document.querySelectorAll('.activity-icon[data-panel]').forEach(icon => {
    icon.addEventListener('click', () => {
      const panel = icon.dataset.panel;
      document.querySelectorAll('.activity-icon').forEach(i => i.classList.remove('active'));
      icon.classList.add('active');
      panels.forEach(p => {
        document.getElementById(`panel-${p}`).classList.toggle('hidden', p !== panel);
      });
      const titles = { explorer: 'EXPLORER', search: 'SEARCH', git: 'SOURCE CONTROL', extensions: 'EXTENSIONS', settings: 'SETTINGS' };
      document.getElementById('sidebarTitle').textContent = titles[panel] || panel.toUpperCase();
    });
  });

  runBtn.addEventListener('click', runCode);

  document.getElementById('refreshPreview').addEventListener('click', () => {
    updatePreview();
    showToast('Preview refreshed');
  });

  document.getElementById('openExternal').addEventListener('click', () => {
    const html = getPreviewHtml();
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
  });

  setupResizeHandle();
  setupSearchHandlers();
  setupSettingsHandlers();
  setupTitleBarSearch();

  window.addEventListener('resize', () => { if (editor) editor.layout(); });
}

function setupResizeHandle() {
  const resizeHandle = document.getElementById('resizeHandle');
  const previewPanel = document.getElementById('previewPanel');

  resizeHandle.addEventListener('mousedown', e => {
    if (window.innerWidth <= 760) return;
    e.preventDefault();
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    // Disable pointer events on the iframe so it doesn't swallow mousemove/mouseup
    previewFrame.style.pointerEvents = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const workspace = document.querySelector('.workspace');
    const rect = workspace.getBoundingClientRect();
    const newWidth = rect.right - e.clientX;
    if (newWidth > 220 && newWidth < rect.width - 260) previewPanel.style.width = `${newWidth}px`;
  });

  const stopResize = () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    previewFrame.style.pointerEvents = '';
  };

  document.addEventListener('mouseup', stopResize);
  // Catch the case where the mouse is released outside the window
  document.addEventListener('mouseleave', stopResize);
}

function setupSearchHandlers() {
  const sidebarSearch = document.getElementById('sidebarSearch');
  const searchResults = document.getElementById('searchResults');

  sidebarSearch.addEventListener('input', () => {
    const query = sidebarSearch.value.trim();
    if (!query) { searchResults.innerHTML = ''; return; }

    const normalizedQuery = query.toLowerCase();
    const markPattern = new RegExp(escapeRegExp(query), 'gi');
    let html = '';

    Object.entries(files).forEach(([name, content]) => {
      if (!content) return;
      content.split('\n').forEach((line, i) => {
        if (!line.toLowerCase().includes(normalizedQuery)) return;
        const safeLine = escapeHtml(line).replace(markPattern, match => `<mark>${match}</mark>`);
        html += `
          <div class="search-result" data-file="${name}" data-line="${i + 1}">
            <span class="sr-file">${name}:${i + 1}</span>
            <span class="sr-line">${safeLine}</span>
          </div>`;
      });
    });

    searchResults.innerHTML = html || '<div class="sr-empty">No results</div>';
    searchResults.querySelectorAll('.search-result').forEach(el => {
      el.addEventListener('click', () => {
        const targetLine = parseInt(el.dataset.line, 10);
        switchFile(el.dataset.file);
        editor.revealLineInCenter(targetLine);
        editor.setPosition({ lineNumber: targetLine, column: 1 });
        editor.focus();
      });
    });
  });
}

function setupTitleBarSearch() {
  const searchInput  = document.getElementById('searchInput');
  const sidebarSearch = document.getElementById('sidebarSearch');

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchInput.value = ''; return; }
    if (e.key !== 'Enter') return;
    const value = searchInput.value.trim();
    if (!value) return;

    document.querySelectorAll('.activity-icon').forEach(i => i.classList.remove('active'));
    document.querySelector('.activity-icon[data-panel="search"]')?.classList.add('active');
    ['explorer', 'search', 'git', 'extensions', 'settings'].forEach(p => {
      document.getElementById(`panel-${p}`).classList.toggle('hidden', p !== 'search');
    });
    document.getElementById('sidebarTitle').textContent = 'SEARCH';
    sidebarSearch.value = value;
    sidebarSearch.dispatchEvent(new Event('input'));
  });
}

function setupSettingsHandlers() {
  fontSizeSetting.addEventListener('input', () => {
    const size = parseInt(fontSizeSetting.value, 10);
    if (Number.isNaN(size) || size < 10 || size > 24 || !editor) return;
    editor.updateOptions({ fontSize: size, lineHeight: Math.round(size * 1.6) });
  });

  tabSizeSetting.addEventListener('change', () => {
    const tabSize = parseInt(tabSizeSetting.value, 10) || 4;
    spacesInfo.textContent = `Spaces: ${tabSize}`;
    models.forEach(m => m.updateOptions({ tabSize, insertSpaces: true }));
  });

  wordWrapSetting.addEventListener('change', () => {
    if (!editor) return;
    editor.updateOptions({ wordWrap: wordWrapSetting.checked ? 'on' : 'off' });
  });
}

// ── Tabs and file tree ────────────────────────────────────────────────────────
function renderTabs() {
  tabBar.innerHTML = '';
  openTabs.forEach(name => {
    const tab = document.createElement('div');
    tab.className = `tab${name === activeFile ? ' active' : ''}`;
    tab.dataset.file = name;
    const dot = unsaved.has(name) ? '<span class="unsaved-dot">●</span>' : '';
    tab.innerHTML = `${getFileIcon(name)}<span>${name}</span>${dot}<span class="tab-close" data-file="${name}">×</span>`;
    tab.addEventListener('click', e => { if (!e.target.classList.contains('tab-close')) switchFile(name); });
    tab.querySelector('.tab-close').addEventListener('click', e => { e.stopPropagation(); closeTab(name); });
    tabBar.appendChild(tab);
  });
}

function renderFileTree() {
  const sorted = Object.keys(files).sort((a, b) => a.localeCompare(b));
  fileTree.innerHTML = sorted.map(name => `
    <div class="tree-item${name === activeFile ? ' active' : ''}" data-file="${name}">
      ${getFileIcon(name, true)}<span>${name}</span>
    </div>`).join('');

  fileTree.querySelectorAll('.tree-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.file;
      if (!openTabs.includes(name)) openTabs.push(name);
      switchFile(name);
    });
  });
}

async function switchFile(name) {
  if (!(name in files) || !editor) return;
  if (!openTabs.includes(name)) openTabs.push(name);

  // Lazy-load content if not yet fetched
  if (files[name] === null) await loadFileContent(name);

  activeFile = name;
  isSwitchingModel = true;
  editor.setModel(ensureModel(name));
  isSwitchingModel = false;

  renderTabs();
  highlightSidebarItem(name);
  previewTitle.textContent = `Preview: ${name}`;
  updateCursorStatus();
  scheduleAutoRun(true);
  editor.focus();
}

function closeTab(name) {
  const idx = openTabs.indexOf(name);
  if (idx === -1) return;
  openTabs = openTabs.filter(t => t !== name);

  if (activeFile === name) {
    const next = openTabs[idx - 1] || openTabs[0] || null;
    if (next) {
      switchFile(next);
    } else {
      activeFile = null;
      editor.setModel(null);
      previewTitle.textContent = 'Preview';
      if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
      previewFrame.removeAttribute('src');
    }
  }

  renderTabs();
  highlightSidebarItem(activeFile);
}

async function createNewFile() {
  const input = window.prompt('Enter file name (for example: utils.php):');
  if (!input) return;
  const name = input.trim();
  if (!name) return;

  if (/[\\/]/.test(name)) { showToast('Use a single filename without folder separators'); return; }
  if (name in files) { showToast('A file with that name already exists'); return; }

  const content = starterContentFor(name);

  try {
    const res = await apiFetch('/api/files', {
      method: 'POST',
      body: JSON.stringify({ sessionId, filename: name, content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(`Could not create file: ${err.error || res.status}`);
      return;
    }
  } catch {
    showToast('Create failed — backend unreachable');
    return;
  }

  files[name] = content;
  ensureModel(name);
  if (!openTabs.includes(name)) openTabs.push(name);
  markUnsaved(name);
  renderFileTree();
  switchFile(name);
  showToast(`+ Created ${name}`);
}

function markUnsaved(name) {
  if (!name) return;
  unsaved.add(name);
  updateGitBadge();
  renderTabs();
}

function updateGitBadge() {
  gitChanges.textContent = String(unsaved.size);
  if (unsaved.size > 0) {
    gitStatus.textContent = 'Dirty';
    gitStatus.classList.remove('green');
  } else {
    gitStatus.textContent = 'Clean';
    gitStatus.classList.add('green');
  }
}

function highlightSidebarItem(name) {
  fileTree.querySelectorAll('.tree-item').forEach(item => {
    item.classList.toggle('active', item.dataset.file === name);
  });
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveFile() {
  if (!activeFile || !editor.getModel()) return;
  const content = editor.getModel().getValue();
  files[activeFile] = content;

  try {
    const res = await apiFetch(`/api/files/${encodeURIComponent(activeFile)}`, {
      method: 'PUT',
      body: JSON.stringify({ sessionId, content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(`Save failed: ${err.error || res.status}`);
      return;
    }
  } catch {
    showToast('Save failed — backend unreachable');
    return;
  }

  unsaved.delete(activeFile);
  updateGitBadge();
  renderTabs();
  showToast(`Saved ${activeFile}`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
async function runCode() {
  if (!sessionId) { showToast('No active session'); return; }

  await saveFile();

  runBtnText.textContent = 'Running...';
  runBtn.disabled = true;
  runBtn.style.background = '#16a34a';

  try {
    const res = await apiFetch('/api/run', {
      method: 'POST',
      body: JSON.stringify({ sessionId, entryFile: activeFile || 'index.php' }),
    });

    if (res.status === 429) { showToast('Rate limited — slow down a bit'); return; }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(`Run error: ${err.error || res.status}`);
      return;
    }

    const result = await res.json();
    previewFrame.srcdoc = result.html || '';

    if (result.timedOut) {
      showToast('Execution timed out after 5s');
    } else if (result.stderr) {
      showToast(result.stderr.split('\n')[0]);
    } else {
      showToast('Executed successfully');
    }
  } catch {
    showToast('Run failed — backend unreachable');
  } finally {
    runBtnText.textContent = 'Run Code';
    runBtn.disabled = false;
    runBtn.style.background = '';
  }
}

// ── Auto-preview (non-PHP only) ───────────────────────────────────────────────
function scheduleAutoRun(immediate = false) {
  // PHP requires the Run button — only auto-preview HTML/CSS locally
  if (activeFile && activeFile.endsWith('.php')) return;
  clearTimeout(autoRunTimeout);
  if (immediate) { updatePreview(); return; }
  autoRunTimeout = setTimeout(updatePreview, 500);
}

// ── Preview (local, for HTML/CSS) ─────────────────────────────────────────────
function updatePreview() {
  const html = getPreviewHtml();
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  previewFrame.src = previewObjectUrl;
}

function getPreviewHtml() {
  const css = files['styles.css'] || '';

  if (activeFile && activeFile.endsWith('.html')) return injectCssIntoHtml(files[activeFile] || '', css);
  if (activeFile && activeFile.endsWith('.css') && files['index.html']) return injectCssIntoHtml(files['index.html'], files[activeFile]);
  if (files['index.html']) return injectCssIntoHtml(files['index.html'], css);

  return `<!doctype html><html><body style="font-family:sans-serif;padding:1rem;background:#0d0d0d;color:#ccc">
    <p>Click <strong>Run</strong> to execute PHP, or open an HTML file for live preview.</p>
  </body></html>`;
}

function injectCssIntoHtml(html, css) {
  if (!css) return html;
  const tag = `<style>${css}</style>`;
  return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : `${tag}${html}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function updateCursorStatus() {
  if (!editor) return;
  const pos = editor.getPosition();
  if (pos) cursorPos.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
}

function starterContentFor(name) {
  if (name.endsWith('.php'))  return `<?php\n\n$greeting = "Hello";\n\necho "<h1>" . $greeting . "</h1>";\n`;
  if (name.endsWith('.js'))   return `function main() {\n  console.log('Hello from ${name}');\n}\n\nmain();\n`;
  if (name.endsWith('.css'))  return `/* ${name} */\n\n:root {\n  color-scheme: dark;\n}\n`;
  if (name.endsWith('.html')) return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>${name}</title>\n</head>\n<body>\n  <h1>${name}</h1>\n</body>\n</html>\n`;
  if (name.endsWith('.json')) return '{\n  "name": "value"\n}\n';
  if (name.endsWith('.md'))   return `# ${name}\n\nStart writing...\n`;
  return '';
}

function getFileIcon(name, compact = false) {
  const size = compact ? 13 : 12;
  const stroke = compact ? '1.8' : '2';
  const colors = { '.php': '#60a5fa', '.css': '#a78bfa', '.js': '#facc15', '.json': '#fb923c' };
  const ext = Object.keys(colors).find(e => name.endsWith(e));
  const color = ext ? colors[ext] : '#9ca3af';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}

function escapeRegExp(v) { return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function escapeHtml(v) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
}
