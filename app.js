// ── File Store ──────────────────────────────────────────────────────────────
const files = {
  'index.php': `<?php

  // Welcome to PHP CodeLab

  $greeting = "Hello World" ;

  $time = date ( 'H:i:s' );

?>


<!DOCTYPE html>

  <html lang = "en" >

    <head>

      <style>

        body {

          background-color : #8f172a ;

          color : #f8fafc ;

        }

      </style>

    </head>

    <body>

      <h1> <?php echo $greeting ; ?> </h1>

      <p> Current server time: <?php echo $time ; ?> </p>

    </body>

  </html>`,

  'styles.css': `/* PHP CodeLab - Main Styles */

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0d0d0d;
  color: #ccc;
  margin: 0;
  padding: 0;
}

.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem;
}

h1 {
  color: #22c55e;
  font-size: 2rem;
}

p {
  color: #aaa;
  line-height: 1.6;
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
  },
  "dependencies": {
    "php-parser": "^4.0",
    "monolog": "^3.0"
  }
}`
};

// ── State ────────────────────────────────────────────────────────────────────
let openTabs = ['index.php', 'styles.css'];
let activeFile = 'index.php';
let unsaved = new Set();
let autoRunTimeout = null;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const tabBar       = document.getElementById('tabBar');
const codeEditor   = document.getElementById('codeEditor');
const lineNumbers  = document.getElementById('lineNumbers');
const previewFrame = document.getElementById('previewFrame');
const previewTitle = document.getElementById('previewTitle');
const cursorPos    = document.getElementById('cursorPos');
const spacesInfo   = document.getElementById('spacesInfo');
const runBtn       = document.getElementById('runBtn');
const runBtnText   = document.getElementById('runBtnText');
const toast        = document.getElementById('toast');
const gitChanges   = document.getElementById('gitChanges');

// ── Tab Management ────────────────────────────────────────────────────────────
function renderTabs() {
  tabBar.innerHTML = '';
  openTabs.forEach(name => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (name === activeFile ? ' active' : '');
    tab.dataset.file = name;

    const icon = getFileIcon(name);
    const dot  = unsaved.has(name) ? '<span class="unsaved-dot">●</span>' : '';

    tab.innerHTML = `
      ${icon}
      <span>${name}</span>
      ${dot}
      <span class="tab-close" data-file="${name}">×</span>
    `;

    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) return;
      switchFile(name);
    });

    tab.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(name);
    });

    tabBar.appendChild(tab);
  });
}

function getFileIcon(name) {
  if (name.endsWith('.php'))  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  if (name.endsWith('.css'))  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  if (name.endsWith('.json')) return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}

function switchFile(name) {
  if (!files[name]) return;
  // save current content
  files[activeFile] = codeEditor.value;
  activeFile = name;
  if (!openTabs.includes(name)) openTabs.push(name);
  codeEditor.value = files[name];
  updateLineNumbers();
  renderTabs();
  highlightSidebarItem(name);
  previewTitle.textContent = `Preview: ${name}`;
  updatePreview();
  codeEditor.focus();
}

function closeTab(name) {
  const idx = openTabs.indexOf(name);
  openTabs = openTabs.filter(t => t !== name);
  unsaved.delete(name);
  if (activeFile === name) {
    activeFile = openTabs[Math.max(0, idx - 1)] || openTabs[0] || null;
    if (activeFile) {
      codeEditor.value = files[activeFile];
      updateLineNumbers();
      updatePreview();
    } else {
      codeEditor.value = '';
      lineNumbers.innerHTML = '';
    }
  }
  renderTabs();
}

// ── Sidebar File Tree ─────────────────────────────────────────────────────────
document.querySelectorAll('.tree-item[data-file]').forEach(item => {
  item.addEventListener('click', () => {
    const name = item.dataset.file;
    if (name === 'assets') return;
    if (!openTabs.includes(name)) openTabs.push(name);
    switchFile(name);
  });
});

function highlightSidebarItem(name) {
  document.querySelectorAll('.tree-item').forEach(el => {
    el.classList.toggle('active', el.dataset.file === name);
  });
}

// Folder toggle
document.getElementById('folderToggle').addEventListener('click', () => {
  const tree = document.getElementById('fileTree');
  const arrow = document.querySelector('.folder-arrow');
  const collapsed = tree.style.display === 'none';
  tree.style.display = collapsed ? '' : 'none';
  arrow.style.transform = collapsed ? '' : 'rotate(-90deg)';
});

// ── Activity Bar ──────────────────────────────────────────────────────────────
const panels = ['explorer','search','git','extensions','settings'];
document.querySelectorAll('.activity-icon[data-panel]').forEach(icon => {
  icon.addEventListener('click', () => {
    const panel = icon.dataset.panel;
    document.querySelectorAll('.activity-icon').forEach(i => i.classList.remove('active'));
    icon.classList.add('active');
    panels.forEach(p => {
      document.getElementById(`panel-${p}`).classList.toggle('hidden', p !== panel);
    });
    const titles = { explorer:'EXPLORER', search:'SEARCH', git:'SOURCE CONTROL', extensions:'EXTENSIONS', settings:'SETTINGS' };
    document.getElementById('sidebarTitle').textContent = titles[panel] || panel.toUpperCase();
  });
});

// ── Code Editor ───────────────────────────────────────────────────────────────
codeEditor.addEventListener('input', () => {
  files[activeFile] = codeEditor.value;
  unsaved.add(activeFile);
  gitChanges.textContent = unsaved.size;
  updateLineNumbers();
  renderTabs();
  scheduleAutoRun();
});

codeEditor.addEventListener('keydown', (e) => {
  // Tab key → insert spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    const tabSize = parseInt(document.getElementById('settingTabSize')?.value || 4);
    const spaces = ' '.repeat(tabSize);
    const start = codeEditor.selectionStart;
    const end   = codeEditor.selectionEnd;
    codeEditor.value = codeEditor.value.substring(0, start) + spaces + codeEditor.value.substring(end);
    codeEditor.selectionStart = codeEditor.selectionEnd = start + spaces.length;
    files[activeFile] = codeEditor.value;
    updateLineNumbers();
    scheduleAutoRun();
  }
  // Ctrl+S → save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveFile();
  }
  // Ctrl+Z handled natively
});

codeEditor.addEventListener('keyup', updateCursor);
codeEditor.addEventListener('click', updateCursor);
codeEditor.addEventListener('scroll', syncScroll);

function syncScroll() {
  lineNumbers.scrollTop = codeEditor.scrollTop;
}

function updateCursor() {
  const val = codeEditor.value;
  const pos = codeEditor.selectionStart;
  const lines = val.substring(0, pos).split('\n');
  const ln = lines.length;
  const col = lines[lines.length - 1].length + 1;
  cursorPos.textContent = `Ln ${ln}, Col ${col}`;
}

function updateLineNumbers() {
  const count = (codeEditor.value.match(/\n/g) || []).length + 1;
  lineNumbers.innerHTML = Array.from({ length: count }, (_, i) =>
    `<span>${i + 1}</span>`
  ).join('');
  lineNumbers.scrollTop = codeEditor.scrollTop;
}

// ── Save ──────────────────────────────────────────────────────────────────────
function saveFile() {
  files[activeFile] = codeEditor.value;
  unsaved.delete(activeFile);
  gitChanges.textContent = unsaved.size;
  renderTabs();
  showToast(`✓ Saved ${activeFile}`);
  updatePreview();
}

// ── Auto-run ──────────────────────────────────────────────────────────────────
function scheduleAutoRun() {
  clearTimeout(autoRunTimeout);
  autoRunTimeout = setTimeout(updatePreview, 800);
}

// ── Preview ───────────────────────────────────────────────────────────────────
function updatePreview() {
  const php = files['index.php'] || '';
  const css = files['styles.css'] || '';

  // Simulate PHP: replace <?php ... ?> blocks with JS-evaluated output
  let html = simulatePHP(php, css);

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  previewFrame.src = url;
}

function simulatePHP(src, extraCss) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // Extract variables from PHP block
  const vars = {};
  const phpBlock = src.match(/<\?php([\s\S]*?)\?>/);
  if (phpBlock) {
    const code = phpBlock[1];
    // $var = "value" or $var = 'value'
    const strMatches = [...code.matchAll(/\$(\w+)\s*=\s*["']([^"']+)["']/g)];
    strMatches.forEach(m => vars[m[1]] = m[2]);
    // $time = date(...)
    if (/\$(\w+)\s*=\s*date\s*\(/.test(code)) {
      const m = code.match(/\$(\w+)\s*=\s*date\s*\(/);
      if (m) vars[m[1]] = timeStr;
    }
  }

  // Remove PHP blocks, then replace echo statements
  let html = src.replace(/<\?php[\s\S]*?\?>/g, '');

  // Replace <?php echo $var ; ?> inline
  html = html.replace(/<\?php\s+echo\s+\$(\w+)\s*;?\s*\?>/g, (_, name) => vars[name] || '');

  // Inject extra CSS if not already in the HTML
  if (extraCss && !html.includes('<link') && !html.includes(extraCss.substring(0, 20))) {
    html = html.replace('</head>', `<style>${extraCss}</style></head>`);
  }

  // Inject live clock script into preview
  html = html.replace('</body>', `
    <script>
      (function() {
        function tick() {
          var els = document.querySelectorAll('[data-clock]');
          var now = new Date();
          var t = [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map(function(n){ return String(n).padStart(2,'0'); }).join(':');
          els.forEach(function(el){ el.textContent = t; });
        }
        tick();
        setInterval(tick, 1000);
      })();
    <\/script>
  </body>`);

  return html;
}

// ── Run Button ────────────────────────────────────────────────────────────────
runBtn.addEventListener('click', () => {
  runBtnText.textContent = 'Running...';
  runBtn.disabled = true;
  runBtn.style.background = '#16a34a';
  setTimeout(() => {
    saveFile();
    updatePreview();
    runBtnText.textContent = 'Run Code';
    runBtn.disabled = false;
    runBtn.style.background = '';
    showToast('▶ Code executed successfully');
  }, 600);
});

// ── Refresh / Open External ───────────────────────────────────────────────────
document.getElementById('refreshPreview').addEventListener('click', () => {
  updatePreview();
  showToast('Preview refreshed');
});

document.getElementById('openExternal').addEventListener('click', () => {
  const php = files['index.php'] || '';
  const css = files['styles.css'] || '';
  const html = simulatePHP(php, css);
  const blob = new Blob([html], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank');
});

// ── Resize Handle ─────────────────────────────────────────────────────────────
const resizeHandle = document.getElementById('resizeHandle');
const previewPanel = document.getElementById('previewPanel');
let isResizing = false;

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const workspace = document.querySelector('.workspace');
  const rect = workspace.getBoundingClientRect();
  const newWidth = rect.right - e.clientX;
  if (newWidth > 180 && newWidth < rect.width - 200) {
    previewPanel.style.width = newWidth + 'px';
  }
});

document.addEventListener('mouseup', () => {
  isResizing = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// ── Search in Files ───────────────────────────────────────────────────────────
document.getElementById('sidebarSearch').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const results = document.getElementById('searchResults');
  if (!q) { results.innerHTML = ''; return; }

  let html = '';
  Object.entries(files).forEach(([name, content]) => {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(q)) {
        const safe = line.replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const highlighted = safe.replace(new RegExp(q, 'gi'), m => `<mark>${m}</mark>`);
        html += `<div class="search-result" data-file="${name}" data-line="${i}">
          <span class="sr-file">${name}:${i+1}</span>
          <span class="sr-line">${highlighted}</span>
        </div>`;
      }
    });
  });

  results.innerHTML = html || '<div class="sr-empty">No results</div>';
  results.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      switchFile(el.dataset.file);
      // jump to line
      const lineIdx = parseInt(el.dataset.line);
      const lines = codeEditor.value.split('\n');
      const charPos = lines.slice(0, lineIdx).join('\n').length + 1;
      codeEditor.setSelectionRange(charPos, charPos + lines[lineIdx].length);
      codeEditor.focus();
    });
  });
});

// ── Title bar search ──────────────────────────────────────────────────────────
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') e.target.value = '';
});

// ── Settings ──────────────────────────────────────────────────────────────────
document.getElementById('settingFontSize').addEventListener('input', (e) => {
  const size = parseInt(e.target.value);
  if (size >= 10 && size <= 24) {
    codeEditor.style.fontSize = size + 'px';
    document.getElementById('lineNumbers').style.fontSize = (size - 1) + 'px';
  }
});

document.getElementById('settingTabSize').addEventListener('change', (e) => {
  spacesInfo.textContent = `Spaces: ${e.target.value}`;
});

document.getElementById('settingWordWrap').addEventListener('change', (e) => {
  codeEditor.style.whiteSpace = e.target.checked ? 'pre-wrap' : 'pre';
  codeEditor.style.overflowX  = e.target.checked ? 'hidden' : 'auto';
});

// ── Live Clock in status bar ──────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  // update preview time if visible
  updatePreview();
}
setInterval(tickClock, 1000);

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.add('hidden'), 2200);
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  codeEditor.value = files[activeFile];
  updateLineNumbers();
  renderTabs();
  updatePreview();
  updateCursor();
}

init();
