// ── File Store ──────────────────────────────────────────────────────────────
const files = {
  'index.php': `<?php

  // Welcome to PHP CodeLab

  $greeting = "Hello World";

  $time = date('H:i:s');

?>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PHP CodeLab</title>
</head>
<body>
  <h1><?php echo $greeting; ?></h1>
  <p>Current server time: <span data-clock><?php echo $time; ?></span></p>
</body>
</html>`,
  'styles.css': `/* PHP CodeLab - Main Styles */

body {
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  background: #8f172a;
  color: #f8fafc;
  margin: 0;
  padding: 2rem;
}

h1 {
  margin-bottom: 0.6rem;
  font-size: 2rem;
}

p {
  opacity: 0.9;
}`,
  'config.json': `{
  "name": "php-codelab-project",
  "version": "1.0.0",
  "php": "8.2",
  "entry": "index.php",
  "env": {
    "APP_ENV": "development",
    "APP_DEBUG": true,
    "APP_URL": "http://localhost:8080"
  }
}`
};

// ── State ───────────────────────────────────────────────────────────────────
let openTabs = ['index.php', 'styles.css'];
let activeFile = 'index.php';
let autoRunTimeout = null;
let previewObjectUrl = null;
let editor = null;
let isResizing = false;
let isSwitchingModel = false;
const unsaved = new Set();
const models = new Map();

// ── DOM refs ────────────────────────────────────────────────────────────────
const tabBar = document.getElementById('tabBar');
const fileTree = document.getElementById('fileTree');
const previewFrame = document.getElementById('previewFrame');
const previewTitle = document.getElementById('previewTitle');
const cursorPos = document.getElementById('cursorPos');
const spacesInfo = document.getElementById('spacesInfo');
const runBtn = document.getElementById('runBtn');
const runBtnText = document.getElementById('runBtnText');
const toast = document.getElementById('toast');
const gitChanges = document.getElementById('gitChanges');
const gitStatus = document.getElementById('gitStatus');
const tabSizeSetting = document.getElementById('settingTabSize');
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
  paths: {
    vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs'
  }
});

window.require(['vs/editor/editor.main'], () => {
  initMonaco();
  bindUiEvents();
  renderFileTree();
  renderTabs();
  switchFile(activeFile);
  updateGitBadge();
  spacesInfo.textContent = `Spaces: ${tabSizeSetting.value}`;
});

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

  editor.onDidChangeCursorPosition(() => {
    updateCursorStatus();
  });

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    saveFile();
  });
}

// ── Models ──────────────────────────────────────────────────────────────────
function ensureModel(name) {
  if (models.has(name)) return models.get(name);

  const uri = monaco.Uri.parse(`inmemory://model/${encodeURIComponent(name)}`);
  const model = monaco.editor.createModel(files[name] || '', inferLanguage(name), uri);
  model.updateOptions({
    tabSize: parseInt(tabSizeSetting.value, 10) || 4,
    insertSpaces: true
  });
  models.set(name, model);
  return model;
}

function inferLanguage(name) {
  if (name.endsWith('.php')) return 'php';
  if (name.endsWith('.css')) return 'css';
  if (name.endsWith('.js')) return 'javascript';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.html')) return 'html';
  if (name.endsWith('.md')) return 'markdown';
  return 'plaintext';
}

// ── UI Bindings ─────────────────────────────────────────────────────────────
function bindUiEvents() {
  document.getElementById('newFileBtn').addEventListener('click', createNewFile);

  // Folder toggle
  document.getElementById('folderToggle').addEventListener('click', () => {
    const arrow = document.querySelector('.folder-arrow');
    const collapsed = fileTree.style.display === 'none';
    fileTree.style.display = collapsed ? '' : 'none';
    arrow.style.transform = collapsed ? '' : 'rotate(-90deg)';
  });

  // Activity bar
  const panels = ['explorer', 'search', 'git', 'extensions', 'settings'];
  document.querySelectorAll('.activity-icon[data-panel]').forEach(icon => {
    icon.addEventListener('click', () => {
      const panel = icon.dataset.panel;
      document.querySelectorAll('.activity-icon').forEach(item => item.classList.remove('active'));
      icon.classList.add('active');
      panels.forEach(p => {
        document.getElementById(`panel-${p}`).classList.toggle('hidden', p !== panel);
      });
      const titles = {
        explorer: 'EXPLORER',
        search: 'SEARCH',
        git: 'SOURCE CONTROL',
        extensions: 'EXTENSIONS',
        settings: 'SETTINGS'
      };
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

  window.addEventListener('resize', () => {
    if (editor) editor.layout();
  });
}

function setupResizeHandle() {
  const resizeHandle = document.getElementById('resizeHandle');
  const previewPanel = document.getElementById('previewPanel');

  resizeHandle.addEventListener('mousedown', () => {
    if (window.innerWidth <= 760) return;
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const workspace = document.querySelector('.workspace');
    const rect = workspace.getBoundingClientRect();
    const newWidth = rect.right - e.clientX;
    if (newWidth > 220 && newWidth < rect.width - 260) {
      previewPanel.style.width = `${newWidth}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

function setupSearchHandlers() {
  const sidebarSearch = document.getElementById('sidebarSearch');
  const searchResults = document.getElementById('searchResults');

  sidebarSearch.addEventListener('input', () => {
    const query = sidebarSearch.value.trim();
    if (!query) {
      searchResults.innerHTML = '';
      return;
    }

    const normalizedQuery = query.toLowerCase();
    const escaped = escapeRegExp(query);
    const markPattern = new RegExp(escaped, 'gi');
    let html = '';

    Object.entries(files).forEach(([name, content]) => {
      content.split('\n').forEach((line, i) => {
        if (!line.toLowerCase().includes(normalizedQuery)) return;
        const safeLine = escapeHtml(line).replace(markPattern, match => `<mark>${match}</mark>`);
        html += `
          <div class="search-result" data-file="${name}" data-line="${i + 1}">
            <span class="sr-file">${name}:${i + 1}</span>
            <span class="sr-line">${safeLine}</span>
          </div>
        `;
      });
    });

    searchResults.innerHTML = html || '<div class="sr-empty">No results</div>';
    searchResults.querySelectorAll('.search-result').forEach(el => {
      el.addEventListener('click', () => {
        const targetFile = el.dataset.file;
        const targetLine = parseInt(el.dataset.line, 10);
        switchFile(targetFile);
        editor.revealLineInCenter(targetLine);
        editor.setPosition({ lineNumber: targetLine, column: 1 });
        editor.focus();
      });
    });
  });
}

function setupTitleBarSearch() {
  const searchInput = document.getElementById('searchInput');
  const sidebarSearch = document.getElementById('sidebarSearch');

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      return;
    }

    if (e.key !== 'Enter') return;
    const value = searchInput.value.trim();
    if (!value) return;

    document.querySelectorAll('.activity-icon').forEach(item => item.classList.remove('active'));
    const searchIcon = document.querySelector('.activity-icon[data-panel="search"]');
    if (searchIcon) searchIcon.classList.add('active');

    ['explorer', 'search', 'git', 'extensions', 'settings'].forEach(panel => {
      document.getElementById(`panel-${panel}`).classList.toggle('hidden', panel !== 'search');
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
    editor.updateOptions({
      fontSize: size,
      lineHeight: Math.round(size * 1.6)
    });
  });

  tabSizeSetting.addEventListener('change', () => {
    const tabSize = parseInt(tabSizeSetting.value, 10) || 4;
    spacesInfo.textContent = `Spaces: ${tabSize}`;
    models.forEach(model => {
      model.updateOptions({ tabSize, insertSpaces: true });
    });
  });

  wordWrapSetting.addEventListener('change', () => {
    if (!editor) return;
    editor.updateOptions({ wordWrap: wordWrapSetting.checked ? 'on' : 'off' });
  });
}

// ── Tabs and file tree ───────────────────────────────────────────────────────
function renderTabs() {
  tabBar.innerHTML = '';

  openTabs.forEach(name => {
    const tab = document.createElement('div');
    tab.className = `tab${name === activeFile ? ' active' : ''}`;
    tab.dataset.file = name;

    const unsavedDot = unsaved.has(name) ? '<span class="unsaved-dot">●</span>' : '';
    tab.innerHTML = `
      ${getFileIcon(name)}
      <span>${name}</span>
      ${unsavedDot}
      <span class="tab-close" data-file="${name}">×</span>
    `;

    tab.addEventListener('click', e => {
      if (e.target.classList.contains('tab-close')) return;
      switchFile(name);
    });

    tab.querySelector('.tab-close').addEventListener('click', e => {
      e.stopPropagation();
      closeTab(name);
    });

    tabBar.appendChild(tab);
  });
}

function renderFileTree() {
  const sorted = Object.keys(files).sort((a, b) => a.localeCompare(b));
  fileTree.innerHTML = sorted
    .map(name => {
      const activeClass = name === activeFile ? ' active' : '';
      return `
        <div class="tree-item${activeClass}" data-file="${name}">
          ${getFileIcon(name, true)}
          <span>${name}</span>
        </div>
      `;
    })
    .join('');

  fileTree.querySelectorAll('.tree-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.file;
      if (!openTabs.includes(name)) openTabs.push(name);
      switchFile(name);
    });
  });
}

function switchFile(name) {
  if (!files[name] || !editor) return;
  if (!openTabs.includes(name)) openTabs.push(name);

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

  openTabs = openTabs.filter(tab => tab !== name);

  if (activeFile === name) {
    const next = openTabs[idx - 1] || openTabs[0] || null;
    if (next) {
      switchFile(next);
    } else {
      activeFile = null;
      editor.setModel(null);
      previewTitle.textContent = 'Preview';
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }
      previewFrame.removeAttribute('src');
    }
  }

  renderTabs();
  highlightSidebarItem(activeFile);
}

function createNewFile() {
  const input = window.prompt('Enter file name (for example: app.js):');
  if (!input) return;

  const name = input.trim();
  if (!name) return;

  if (/[\\/]/.test(name)) {
    showToast('Use a single filename without folder separators');
    return;
  }

  if (files[name]) {
    showToast('A file with that name already exists');
    return;
  }

  files[name] = starterContentFor(name);
  ensureModel(name);
  openTabs.push(name);
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

// ── Save / Run ───────────────────────────────────────────────────────────────
function saveFile() {
  if (!activeFile || !editor.getModel()) return;
  files[activeFile] = editor.getModel().getValue();
  unsaved.delete(activeFile);
  updateGitBadge();
  renderTabs();
  updatePreview();
  showToast(`Saved ${activeFile}`);
}

function runCode() {
  runBtnText.textContent = 'Running...';
  runBtn.disabled = true;
  runBtn.style.background = '#16a34a';

  setTimeout(() => {
    saveFile();
    updatePreview();
    runBtnText.textContent = 'Run Code';
    runBtn.disabled = false;
    runBtn.style.background = '';
    showToast('Code executed successfully');
  }, 280);
}

function scheduleAutoRun(immediate = false) {
  clearTimeout(autoRunTimeout);
  if (immediate) {
    updatePreview();
    return;
  }
  autoRunTimeout = setTimeout(updatePreview, 500);
}

// ── Preview ──────────────────────────────────────────────────────────────────
function updatePreview() {
  const html = getPreviewHtml();

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }

  previewObjectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  previewFrame.src = previewObjectUrl;
}

function getPreviewHtml() {
  const css = files['styles.css'] || '';

  if (activeFile && activeFile.endsWith('.html')) {
    return injectCssIntoHtml(files[activeFile], css);
  }

  if (activeFile && activeFile.endsWith('.css') && files['index.html']) {
    return injectCssIntoHtml(files['index.html'], files[activeFile]);
  }

  if (files['index.php']) {
    return simulatePHP(files['index.php'], css);
  }

  if (files['index.html']) {
    return injectCssIntoHtml(files['index.html'], css);
  }

  return `
    <!doctype html>
    <html>
      <body style="font-family: sans-serif; padding: 1rem;">
        <h3>No previewable file found</h3>
        <p>Create an HTML or PHP file to preview output.</p>
      </body>
    </html>
  `;
}

function simulatePHP(src, extraCss) {
  const now = new Date();
  const timeString = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(part => String(part).padStart(2, '0'))
    .join(':');

  const vars = {};
  const phpBlock = src.match(/<\?php([\s\S]*?)\?>/);
  if (phpBlock) {
    const code = phpBlock[1];
    [...code.matchAll(/\$(\w+)\s*=\s*["']([^"']+)["']/g)].forEach(match => {
      vars[match[1]] = match[2];
    });
    const timeVarMatch = code.match(/\$(\w+)\s*=\s*date\s*\(/);
    if (timeVarMatch) vars[timeVarMatch[1]] = timeString;
  }

  let html = src.replace(/<\?php[\s\S]*?\?>/g, '');
  html = html.replace(/<\?php\s+echo\s+\$(\w+)\s*;?\s*\?>/g, (_, name) => vars[name] || '');
  html = injectCssIntoHtml(html, extraCss);

  if (html.includes('data-clock')) {
    html = html.replace('</body>', `
      <script>
        (function () {
          function tick() {
            var now = new Date();
            var value = [now.getHours(), now.getMinutes(), now.getSeconds()]
              .map(function (n) { return String(n).padStart(2, '0'); })
              .join(':');
            document.querySelectorAll('[data-clock]').forEach(function (node) {
              node.textContent = value;
            });
          }
          tick();
          setInterval(tick, 1000);
        })();
      <\/script>
    </body>`);
  }

  return html;
}

function injectCssIntoHtml(html, css) {
  if (!css) return html;
  const styleTag = `<style>${css}</style>`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${styleTag}</head>`);
  }

  return `${styleTag}${html}`;
}

// ── Status / helpers ────────────────────────────────────────────────────────
function updateCursorStatus() {
  if (!editor) return;
  const pos = editor.getPosition();
  if (!pos) return;
  cursorPos.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
}

function starterContentFor(name) {
  if (name.endsWith('.js')) {
    return `function main() {\n  console.log('Hello from ${name}');\n}\n\nmain();\n`;
  }

  if (name.endsWith('.css')) {
    return `/* ${name} */\n\n:root {\n  color-scheme: dark;\n}\n`;
  }

  if (name.endsWith('.html')) {
    return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${name}</title>\n</head>\n<body>\n  <h1>${name}</h1>\n</body>\n</html>\n`;
  }

  if (name.endsWith('.json')) {
    return '{\n  "name": "value"\n}\n';
  }

  if (name.endsWith('.md')) {
    return `# ${name}\n\nStart writing...\n`;
  }

  if (name.endsWith('.php')) {
    return `<?php\n\n$greeting = "Hello";\n\n?>\n\n<h1><?php echo $greeting; ?></h1>\n`;
  }

  return '';
}

function getFileIcon(name, compact = false) {
  const size = compact ? 13 : 12;
  const stroke = compact ? '1.8' : '2';
  if (name.endsWith('.php')) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="${stroke}"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  }
  if (name.endsWith('.css')) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="${stroke}"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  }
  if (name.endsWith('.js')) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="${stroke}"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  }
  if (name.endsWith('.json')) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="${stroke}"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="${stroke}"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2200);
}
