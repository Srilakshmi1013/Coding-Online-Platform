// ============================================================
// CodeArena – Main Application Logic
// ============================================================

// ---- State ----
let currentUser = null;
let currentProblemId = null;
let codeMirrorEditor = null;
let currentFilter = 'all';
let currentSearch = '';

// ---- Storage Helpers ----
const Storage = {
  getUsers: () => JSON.parse(localStorage.getItem('ca_users') || '{}'),
  saveUsers: (u) => localStorage.setItem('ca_users', JSON.stringify(u)),
  getActivity: (uid) => JSON.parse(localStorage.getItem(`ca_activity_${uid}`) || '{}'),
  saveActivity: (uid, a) => localStorage.setItem(`ca_activity_${uid}`, JSON.stringify(a)),
  getSubmissions: (uid) => JSON.parse(localStorage.getItem(`ca_subs_${uid}`) || '[]'),
  saveSubmissions: (uid, s) => localStorage.setItem(`ca_subs_${uid}`, JSON.stringify(s)),
  getSolvedSet: (uid) => new Set(JSON.parse(localStorage.getItem(`ca_solved_${uid}`) || '[]')),
  saveSolvedSet: (uid, s) => localStorage.setItem(`ca_solved_${uid}`, JSON.stringify([...s])),
  getAttemptedSet: (uid) => new Set(JSON.parse(localStorage.getItem(`ca_attempted_${uid}`) || '[]')),
  saveAttemptedSet: (uid, s) => localStorage.setItem(`ca_attempted_${uid}`, JSON.stringify([...s])),
};

// ---- Utilities ----
function showNotification(msg, type = 'info') {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  n.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.body.appendChild(n);
  setTimeout(() => {
    n.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => n.remove(), 300);
  }, 3000);
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ---- View Management ----
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
}

function showPage(pageClass) {
  document.querySelectorAll('.dashboard-page, .problems-page, .solver-page, .profile-page')
    .forEach(p => p.classList.remove('active'));
  document.querySelector(`.${pageClass}`).classList.add('active');
  // Update nav
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const map = {
    'dashboard-page': 'nav-dashboard',
    'problems-page': 'nav-problems',
    'profile-page': 'nav-profile',
  };
  if (map[pageClass]) {
    const el = document.getElementById(map[pageClass]);
    if (el) el.classList.add('active');
  }
}

// ---- Auth ----
function initAuth() {
  const session = localStorage.getItem('ca_session');
  if (session) {
    const users = Storage.getUsers();
    if (users[session]) {
      currentUser = users[session];
      currentUser.uid = session;
      initApp();
      return;
    }
  }
  showView('auth-view');
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.target).classList.add('active');
    clearAuthMessages();
  });
});

function clearAuthMessages() {
  document.querySelectorAll('.auth-message').forEach(m => {
    m.className = 'auth-message';
    m.textContent = '';
  });
}

document.getElementById('register-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass = document.getElementById('reg-pass').value;
  const msg = document.getElementById('reg-message');

  if (!name || !email || !pass) return showMsg(msg, 'All fields are required.', 'error');
  if (pass.length < 6) return showMsg(msg, 'Password must be at least 6 characters.', 'error');

  const users = Storage.getUsers();
  if (users[email]) return showMsg(msg, 'An account with this email already exists.', 'error');

  const user = { name, email, password: pass, joinedAt: Date.now() };
  users[email] = user;
  Storage.saveUsers(users);

  showMsg(msg, '🎉 Account created! Logging you in...', 'success');
  setTimeout(() => loginUser(email, pass), 1000);
});

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const msg = document.getElementById('login-message');
  loginUser(email, pass, msg);
});

function loginUser(email, pass, msgEl) {
  const users = Storage.getUsers();
  // Allow social OAuth users (password stored as '__oauth__') to bypass normal check
  const isOAuth = pass === '__oauth__' && users[email] && users[email].password === '__oauth__';
  if (!users[email] || (!isOAuth && users[email].password !== pass)) {
    if (msgEl) showMsg(msgEl, 'Invalid email or password.', 'error');
    return;
  }
  localStorage.setItem('ca_session', email);
  currentUser = users[email];
  currentUser.uid = email;
  initApp();
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `auth-message ${type}`;
}

document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('ca_session');
  currentUser = null;
  currentProblemId = null;
  showView('auth-view');
  showNotification('Logged out successfully.', 'info');
});

// ---- App Init ----
function initApp() {
  showView('app-view');
  // Set user info in nav
  document.getElementById('nav-username').textContent = currentUser.name;
  document.getElementById('nav-avatar').textContent = getInitials(currentUser.name);
  document.getElementById('nav-avatar-profile').textContent = getInitials(currentUser.name);
  document.getElementById('nav-username-profile').textContent = currentUser.name;

  showPage('dashboard-page');
  renderDashboard();
}

// ---- Navigation ----
document.getElementById('nav-dashboard').addEventListener('click', () => {
  showPage('dashboard-page');
  renderDashboard();
});

document.getElementById('nav-problems').addEventListener('click', () => {
  showPage('problems-page');
  renderProblems();
});

document.getElementById('nav-profile').addEventListener('click', () => {
  showPage('profile-page');
  renderProfile();
});

document.getElementById('nav-logo').addEventListener('click', () => {
  showPage('dashboard-page');
  renderDashboard();
});

// ---- Dashboard ----
function renderDashboard() {
  const uid = currentUser.uid;
  const solved = Storage.getSolvedSet(uid);
  const submissions = Storage.getSubmissions(uid);
  const activity = Storage.getActivity(uid);

  // Streak
  const streak = computeStreak(activity);
  document.getElementById('dash-streak').textContent = streak;

  // Welcome message
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-greeting').textContent = `${greeting}, ${currentUser.name.split(' ')[0]}! 👋`;

  // Solved counts per difficulty
  const easySolved = [...solved].filter(id => PROBLEMS.find(p => p.id === +id)?.difficulty === 'Easy').length;
  const medSolved  = [...solved].filter(id => PROBLEMS.find(p => p.id === +id)?.difficulty === 'Medium').length;
  const hardSolved = [...solved].filter(id => PROBLEMS.find(p => p.id === +id)?.difficulty === 'Hard').length;
  const easyTotal  = PROBLEMS.filter(p => p.difficulty === 'Easy').length;
  const medTotal   = PROBLEMS.filter(p => p.difficulty === 'Medium').length;
  const hardTotal  = PROBLEMS.filter(p => p.difficulty === 'Hard').length;

  // Make stat cards clickable — navigate to problems filtered by difficulty
  document.getElementById('stat-card-easy').onclick = () => navigateToProblemsFiltered('Easy');
  document.getElementById('stat-card-medium').onclick = () => navigateToProblemsFiltered('Medium');
  document.getElementById('stat-card-hard').onclick = () => navigateToProblemsFiltered('Hard');

  document.getElementById('easy-solved').textContent = easySolved;
  document.getElementById('easy-total').textContent = `/ ${easyTotal}`;
  document.getElementById('easy-bar').style.width = `${(easySolved / easyTotal) * 100}%`;
  document.getElementById('medium-solved').textContent = medSolved;
  document.getElementById('medium-total').textContent = `/ ${medTotal}`;
  document.getElementById('medium-bar').style.width = `${(medSolved / medTotal) * 100}%`;
  document.getElementById('hard-solved').textContent = hardSolved;
  document.getElementById('hard-total').textContent = `/ ${hardTotal}`;
  document.getElementById('hard-bar').style.width = `${(hardSolved / hardTotal) * 100}%`;

  // Profile stats in sidebar
  document.getElementById('side-total').textContent = solved.size;
  document.getElementById('side-rank').textContent = computeRank(solved.size);
  document.getElementById('side-streak').textContent = streak;
  document.getElementById('side-acceptance').textContent = computeAcceptance(submissions);

  // Heatmap
  renderHeatmap(activity);

  // Recent submissions
  renderRecentSubmissions(submissions);

  // Featured problems (clickable cards)
  const attempted = Storage.getAttemptedSet(uid);
  renderFeaturedProblems(solved, attempted);
}

function computeStreak(activity) {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (activity[key] && activity[key] > 0) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function computeRank(solved) {
  if (solved === 0) return 'Beginner';
  if (solved < 5) return 'Novice';
  if (solved < 10) return 'Apprentice';
  if (solved < 20) return 'Coder';
  return 'Expert';
}

function computeAcceptance(subs) {
  if (!subs.length) return '0%';
  const accepted = subs.filter(s => s.status === 'Accepted').length;
  return `${Math.round((accepted / subs.length) * 100)}%`;
}

function renderHeatmap(activity) {
  const container = document.getElementById('heatmap-grid');
  container.innerHTML = '';
  const tooltip = document.getElementById('heatmap-tooltip');

  const today = new Date();
  const weeks = 26;
  const days = weeks * 7;

  // Build data map
  const start = new Date(today);
  start.setDate(start.getDate() - days + 1);

  // Group into weeks
  let weekCells = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const count = activity[key] || 0;
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.count = Math.min(count, 5);
    cell.dataset.date = key;
    cell.dataset.count_raw = count;

    cell.addEventListener('mouseenter', (e) => {
      tooltip.textContent = `${key}: ${count} submission${count !== 1 ? 's' : ''}`;
      tooltip.classList.add('visible');
    });

    cell.addEventListener('mousemove', (e) => {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY - 28) + 'px';
    });

    cell.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));

    weekCells.push(cell);

    if ((i + 1) % 7 === 0 || i === days - 1) {
      const week = document.createElement('div');
      week.className = 'heatmap-week';
      weekCells.forEach(c => week.appendChild(c));
      container.appendChild(week);
      weekCells = [];
    }
  }
}

function renderRecentSubmissions(subs) {
  const container = document.getElementById('recent-submissions');
  if (!subs.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No submissions yet. Start solving!</p></div>`;
    return;
  }
  const recent = [...subs].reverse().slice(0, 8);
  container.innerHTML = recent.map(s => `
    <div class="submission-item" onclick="openProblem(${s.problemId})" style="cursor:pointer" title="Click to open problem">
      <div class="sub-left">
        <div class="sub-status-dot ${s.status === 'Accepted' ? 'accepted' : 'wrong'}"></div>
        <div>
          <div class="sub-title sub-title-link">${s.title}</div>
          <div class="sub-lang">${s.lang}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div class="sub-status ${s.status === 'Accepted' ? 'accepted' : 'wrong'}">${s.status}</div>
        <div class="sub-time">${formatTimeAgo(s.ts)}</div>
      </div>
    </div>
  `).join('');
}

// Navigate to problems page with a pre-set difficulty filter
function navigateToProblemsFiltered(difficulty) {
  currentFilter = difficulty;
  currentSearch = '';
  document.getElementById('problems-search').value = '';
  showPage('problems-page');
  document.getElementById('nav-problems').classList.add('active');
  // Update filter button UI
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const filterMap = { 'Easy': 'filter-easy', 'Medium': 'filter-medium', 'Hard': 'filter-hard', 'all': 'filter-all' };
  const btn = document.getElementById(filterMap[difficulty]);
  if (btn) btn.classList.add('active');
  renderProblems();
}

// Render featured problem cards on dashboard
function renderFeaturedProblems(solved, attempted) {
  const container = document.getElementById('featured-problems');
  if (!container) return;

  // Pick 3 unsolved: 1 easy, 1 medium, 1 hard (or fallback to any)
  const pick = (diff) => {
    const unsolved = PROBLEMS.filter(p => p.difficulty === diff && !solved.has(p.id.toString()));
    return unsolved.length ? unsolved[0] : PROBLEMS.find(p => p.difficulty === diff);
  };

  const featured = [pick('Easy'), pick('Medium'), pick('Hard')].filter(Boolean);

  container.innerHTML = featured.map(p => {
    const isSolved = solved.has(p.id.toString());
    const isAttempted = attempted.has(p.id.toString()) && !isSolved;
    const statusTag = isSolved
      ? '<span style="color:var(--accent-green);font-size:0.75rem;font-weight:600">✓ Solved</span>'
      : isAttempted
        ? '<span style="color:var(--accent-yellow);font-size:0.75rem;font-weight:600">○ Attempted</span>'
        : '<span style="color:var(--text-muted);font-size:0.75rem">Not started</span>';
    const tagHtml = p.tags.slice(0,2).map(t => `<span class="prob-tag">${t}</span>`).join('');
    return `
      <div class="featured-prob-card" onclick="openProblem(${p.id})" title="Click to solve">
        <div class="fpc-top">
          <span class="diff-badge ${p.difficulty}">${p.difficulty}</span>
          ${statusTag}
        </div>
        <div class="fpc-title">#${p.id} — ${p.title}</div>
        <div class="fpc-tags">${tagHtml}</div>
        <div class="fpc-footer">
          <span class="fpc-acc">Acceptance: ${p.acceptance}%</span>
          <span class="fpc-solve-btn">Solve →</span>
        </div>
      </div>
    `;
  }).join('');
}

// ---- Problems List ----
function renderProblems() {
  const uid = currentUser.uid;
  const solved = Storage.getSolvedSet(uid);
  const attempted = Storage.getAttemptedSet(uid);

  let filtered = PROBLEMS;

  if (currentFilter !== 'all') {
    filtered = filtered.filter(p => p.difficulty === currentFilter);
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  const tbody = document.getElementById('problems-tbody');
  tbody.innerHTML = filtered.map(p => {
    const isSolved = solved.has(p.id.toString());
    const isAttempted = attempted.has(p.id.toString()) && !isSolved;
    const statusIcon = isSolved
      ? '<span class="prob-status-icon solved">✓</span>'
      : isAttempted
        ? '<span class="prob-status-icon attempted">○</span>'
        : '<span class="prob-status-icon">·</span>';

    const tags = p.tags.map(t => `<span class="prob-tag">${t}</span>`).join('');
    return `
      <tr onclick="openProblem(${p.id})" id="prob-row-${p.id}">
        <td class="prob-num">${p.id}</td>
        <td>
          <div class="prob-title">
            ${statusIcon}
            ${p.title}
          </div>
        </td>
        <td><span class="diff-badge ${p.difficulty}">${p.difficulty}</span></td>
        <td><div class="prob-tags">${tags}</div></td>
        <td>
          <div class="acceptance-bar-wrapper">
            <div class="acceptance-bar">
              <div class="acceptance-fill" style="width:${p.acceptance}%"></div>
            </div>
            <span class="acceptance-pct">${p.acceptance}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🔍</div><p>No problems match your search.</p></div></td></tr>`;
  }
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderProblems();
  });
});

document.getElementById('problems-search').addEventListener('input', (e) => {
  currentSearch = e.target.value;
  renderProblems();
});

// ---- Problem Solver ----
function openProblem(id) {
  currentProblemId = id;
  const problem = PROBLEMS.find(p => p.id === id);
  if (!problem) return;

  // Mark as attempted
  const uid = currentUser.uid;
  const attempted = Storage.getAttemptedSet(uid);
  attempted.add(id.toString());
  Storage.saveAttemptedSet(uid, attempted);

  showPage('solver-page');
  renderProblemSolver(problem);

  // Notify timer widget to reset and auto-start
  document.dispatchEvent(new Event('problemOpened'));
}

function renderProblemSolver(problem) {
  // Header
  document.getElementById('solver-prob-title').textContent = problem.title;
  document.getElementById('solver-prob-num').textContent = `#${problem.id}`;
  document.getElementById('solver-prob-diff').className = `diff-badge ${problem.difficulty}`;
  document.getElementById('solver-prob-diff').textContent = problem.difficulty;
  document.getElementById('solver-prob-acc').textContent = `Acceptance: ${problem.acceptance}%`;

  const tags = problem.tags.map(t => `<span class="prob-tag">${t}</span>`).join('');
  document.getElementById('solver-prob-tags').innerHTML = tags;

  // Description
  document.getElementById('solver-desc-body').innerHTML = problem.description;

  // Examples
  const examplesHtml = problem.examples.map((ex, i) => `
    <div class="example-block">
      <div class="ex-label">Example ${i + 1}</div>
      <div class="ex-row"><span class="ex-key">Input:</span><span class="ex-val">${ex.input}</span></div>
      <div class="ex-row"><span class="ex-key">Output:</span><span class="ex-val">${ex.output}</span></div>
      ${ex.explanation ? `<div class="ex-note">Explanation: ${ex.explanation}</div>` : ''}
    </div>
  `).join('');
  document.getElementById('solver-examples').innerHTML = examplesHtml;

  // Constraints
  const constraintsHtml = problem.constraints.map(c => `<div class="constraint-item">${c}</div>`).join('');
  document.getElementById('solver-constraints').innerHTML = constraintsHtml;

  // Code editor
  const lang = document.getElementById('lang-select').value;
  setupCodeEditor(problem, lang);

  // Clear output
  const outputBody = document.getElementById('output-body');
  outputBody.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem">Run your code to see results here.</div>';
}

function setupCodeEditor(problem, lang) {
  const starter = problem.starterCode[lang] || problem.starterCode.javascript;
  if (codeMirrorEditor) {
    codeMirrorEditor.setValue(starter);
    const mode = lang === 'python' ? 'python' : lang === 'java' ? 'text/x-java' : 'javascript';
    codeMirrorEditor.setOption('mode', mode);
  } else {
    codeMirrorEditor = CodeMirror(document.getElementById('code-editor-mount'), {
      value: starter,
      mode: lang === 'python' ? 'python' : lang === 'java' ? 'text/x-java' : 'javascript',
      theme: 'default',
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      lineWrapping: false,
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      extraKeys: {
        'Tab': cm => cm.execCommand('insertSoftTab'),
        'Ctrl-/': 'toggleComment',
        'Cmd-/': 'toggleComment',
      }
    });
  }
}

document.getElementById('lang-select').addEventListener('change', (e) => {
  const problem = PROBLEMS.find(p => p.id === currentProblemId);
  if (problem) setupCodeEditor(problem, e.target.value);
});

// ---- Run Code ----
document.getElementById('btn-run').addEventListener('click', () => {
  const problem = PROBLEMS.find(p => p.id === currentProblemId);
  if (!problem) return;
  runCode(problem, false);
});

// ---- Submit Code ----
document.getElementById('btn-submit').addEventListener('click', () => {
  const problem = PROBLEMS.find(p => p.id === currentProblemId);
  if (!problem) return;
  runCode(problem, true);
});

function runCode(problem, isSubmit) {
  const code = codeMirrorEditor.getValue();
  const lang = document.getElementById('lang-select').value;
  const outputBody = document.getElementById('output-body');
  const outputPanel = document.getElementById('editor-output');
  outputPanel.classList.remove('collapsed');

  // Show a running indicator
  outputBody.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;display:flex;align-items:center;gap:10px">
    <span style="display:inline-block;width:14px;height:14px;border:2px solid var(--accent-blue);border-top-color:transparent;border-radius:50%;animation:spin 0.7s linear infinite"></span>
    Running ${lang} code...
  </div>`;

  if (lang === 'javascript') {
    runJavaScript(code, problem, isSubmit, outputBody);
  } else if (lang === 'python') {
    runPython(code, problem, isSubmit, outputBody);
  } else if (lang === 'java') {
    runJava(code, problem, isSubmit, outputBody);
  }
}

/* ──────────── JAVASCRIPT EXECUTION ──────────── */
function runJavaScript(code, problem, isSubmit, outputBody) {
  const results = [];
  let allPassed = true;
  const fnName = extractFnName(code);

  for (const tc of problem.testCases) {
    try {
      const fn = new Function(`
        ${code}
        return ${fnName}(...arguments[0]);
      `);
      const result = fn(tc.input);
      const passed = JSON.stringify(result) === JSON.stringify(tc.expected);
      if (!passed) allPassed = false;
      results.push({ passed, input: JSON.stringify(tc.input), expected: JSON.stringify(tc.expected), got: JSON.stringify(result) });
    } catch (err) {
      allPassed = false;
      results.push({ passed: false, input: JSON.stringify(tc.input), expected: JSON.stringify(tc.expected), got: `Error: ${err.message}` });
    }
  }

  renderResults(results, allPassed, problem, isSubmit, outputBody);
}

/* ──────────── PYTHON EXECUTION (Skulpt) ──────────── */
function runPython(code, problem, isSubmit, outputBody) {
  if (typeof Sk === 'undefined') {
    outputBody.innerHTML = `<div class="test-result fail"><div class="tr-title fail">⚠ Python Runtime Unavailable</div>
      <div class="tr-row">Please check your internet connection — Skulpt (Python runtime) could not load.</div></div>`;
    return;
  }

  // Normalise: if user writes LeetCode-style class Solution, convert to bare function
  let pyCode = code;
  const classMatch = pyCode.match(/class\s+Solution\s*:\s*([\s\S]+)/);
  if (classMatch) {
    // Extract the method body and dedent by 4 spaces
    pyCode = classMatch[1]
      .split('\n')
      .map(line => line.startsWith('    ') ? line.slice(4) : line)
      .join('\n');
    // Remove 'self' parameter
    pyCode = pyCode.replace(/def\s+(\w+)\s*\(\s*self\s*,?\s*/g, 'def $1(');
    pyCode = pyCode.replace(/def\s+(\w+)\s*\(\s*self\s*\)/g, 'def $1()');
  }

  const results = [];
  let idx = 0;

  function runNextCase() {
    if (idx >= problem.testCases.length) {
      const allPassed = results.every(r => r.passed);
      renderResults(results, allPassed, problem, isSubmit, outputBody);
      return;
    }
    const tc = problem.testCases[idx++];

    // Inject test harness: call function with test input, print result
    const inputRepr = tc.input.map(v => JSON.stringify(v)).join(', ');
    const fnName = extractPyFnName(pyCode);
    const harness = `${pyCode}\n__result__ = ${fnName}(${inputRepr})\nprint(__result__)`;

    let output = '';
    Sk.configure({
      output: (text) => { output += text; },
      read: (x) => {
        if (Sk.builtinFiles === undefined || Sk.builtinFiles['files'][x] === undefined)
          throw "File not found: '" + x + "'";
        return Sk.builtinFiles['files'][x];
      },
      execLimit: 5000
    });

    Sk.misceval.asyncToPromise(() =>
      Sk.importMainWithBody('<stdin>', false, harness, true)
    ).then(() => {
      const got = output.trim();
      const expected = JSON.stringify(tc.expected);
      // Normalise: Python prints True/False, lists as [1, 2], etc.
      const normalise = s => {
        // Python True/False
        s = s.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
        try { return JSON.stringify(JSON.parse(s)); } catch { return s.trim(); }
      };
      const passed = normalise(got) === normalise(expected)
                  || got === String(tc.expected)
                  || normalise(got) === normalise(String(tc.expected));
      results.push({ passed, input: JSON.stringify(tc.input), expected, got });
      runNextCase();
    }).catch(err => {
      const msg = err.toString().replace(/^.*?(Error|Exception):/,'').trim();
      results.push({ passed: false, input: JSON.stringify(tc.input), expected: JSON.stringify(tc.expected), got: `Error: ${msg}` });
      runNextCase();
    });
  }
  runNextCase();
}

function extractPyFnName(code) {
  const m = code.match(/^def\s+(\w+)\s*\(/m);
  return m ? m[1] : 'solution';
}

/* ──────────── JAVA EXECUTION (Transpile → JS) ──────────── */
function runJava(code, problem, isSubmit, outputBody) {
  const results = [];
  let allPassed = true;

  // Extract the method body from the Java class
  // We look for the first public method that isn't main
  const methodMatch = code.match(/(?:public|private|protected)?\s+(?:static\s+)?(?:\w+[\[\]]*)\s+(\w+)\s*\(([^)]*)\)\s*\{([\s\S]*)/);
  if (!methodMatch) {
    outputBody.innerHTML = `<div class="test-result fail">
      <div class="tr-title fail">⚠ Parse Error</div>
      <div class="tr-row">Could not find a valid method in your Java code. Make sure you have a method like:<br>
      <code style="font-size:0.8rem">public int twoSum(int[] nums, int target) { ... }</code></div>
    </div>`;
    return;
  }

  const javaMethodName = methodMatch[1];
  const javaParams = methodMatch[2];
  const javaBody = extractJavaBody(code, javaMethodName);

  // Convert Java → JS
  let jsCode;
  try {
    jsCode = javaToJs(javaBody, javaParams);
  } catch (e) {
    outputBody.innerHTML = `<div class="test-result fail">
      <div class="tr-title fail">⚠ Transpile Error</div>
      <div class="tr-row">${e.message}</div>
    </div>`;
    return;
  }

  const paramNames = javaParams.split(',').map(p => p.trim().split(/\s+/).pop()).filter(Boolean);

  for (const tc of problem.testCases) {
    try {
      const argList = paramNames.join(', ');
      const fn = new Function(...paramNames, jsCode);
      const result = fn(...tc.input);
      const passed = JSON.stringify(result) === JSON.stringify(tc.expected);
      if (!passed) allPassed = false;
      results.push({ passed, input: JSON.stringify(tc.input), expected: JSON.stringify(tc.expected), got: JSON.stringify(result) });
    } catch (err) {
      allPassed = false;
      results.push({ passed: false, input: JSON.stringify(tc.input), expected: JSON.stringify(tc.expected), got: `Runtime Error: ${err.message}` });
    }
  }

  renderResults(results, allPassed, problem, isSubmit, outputBody);
}

function extractJavaBody(code, fnName) {
  // Find the method and extract its body (handles nested braces)
  const start = code.indexOf(fnName);
  if (start === -1) return '';
  let braceStart = code.indexOf('{', start);
  if (braceStart === -1) return '';
  let depth = 0, i = braceStart;
  let body = '';
  while (i < code.length) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) break; }
    if (depth > 0 && i > braceStart) body += code[i];
    i++;
  }
  return body;
}

function javaToJs(javaBody, javaParams) {
  let js = javaBody;

  // Type declarations → var
  js = js.replace(/\b(?:int|long|double|float|boolean|String|char|byte|short)\s*(\[\])?\s+(\w+)\s*=/g, (_, arr, name) => `var ${name} =`);
  js = js.replace(/\b(?:int|long|double|float|boolean|String|char|byte|short)\s*(\[\])?\s+(\w+)\s*;/g, (_, arr, name) => `var ${name};`);

  // int[] arr = new int[n]  →  var arr = new Array(n).fill(0)
  js = js.replace(/new\s+(?:int|double|float|long|boolean)\[([^\]]+)\]/g, (_, n) => `new Array(${n}).fill(0)`);
  // new int[]{1,2,3} → [1,2,3]
  js = js.replace(/new\s+\w+\[\]\s*\{([^}]*)\}/g, (_, vals) => `[${vals}]`);
  // ArrayList / List → Array
  js = js.replace(/new\s+ArrayList\s*<[^>]*>\s*\(\)/g, '[]');
  js = js.replace(/\.add\(/g, '.push(');
  js = js.replace(/\.size\(\)/g, '.length');
  js = js.replace(/\.get\((\w+)\)/g, '[$1]');
  js = js.replace(/\.contains\(/g, '.includes(');
  // HashMap
  js = js.replace(/new\s+HashMap\s*<[^>]*>\s*\(\)/g, '{}');
  js = js.replace(/\.put\(([^,]+),\s*([^)]+)\)/g, '[$1] = $2');
  js = js.replace(/\.containsKey\(/g, '.hasOwnProperty(');
  js = js.replace(/\.getOrDefault\(([^,]+),\s*([^)]+)\)/g, '[$1] !== undefined ? [$1] : $2');

  // System.out.println → console.log
  js = js.replace(/System\.out\.println\(/g, 'console.log(');
  js = js.replace(/System\.out\.print\(/g, 'console.log(');

  // String methods
  js = js.replace(/\.length\(\)/g, '.length');
  js = js.replace(/\.charAt\((\w+)\)/g, '[$1]');
  js = js.replace(/\.substring\(/g, '.slice(');
  js = js.replace(/\.toCharArray\(\)/g, '.split("")');
  js = js.replace(/\.equals\(/g, '=== ');
  js = js.replace(/String\.valueOf\(/g, 'String(');
  js = js.replace(/Integer\.parseInt\(/g, 'parseInt(');
  js = js.replace(/Math\.max\(/g, 'Math.max(');
  js = js.replace(/Math.min\(/g, 'Math.min(');
  js = js.replace(/Math\.abs\(/g, 'Math.abs(');

  // Boolean literals
  js = js.replace(/\btrue\b/g, 'true');
  js = js.replace(/\bfalse\b/g, 'false');
  js = js.replace(/\bnull\b/g, 'null');

  // Enhanced for loop: for (int x : arr) → for (let x of arr)
  js = js.replace(/for\s*\(\s*(?:int|String|double|long|var)\s+(\w+)\s*:\s*(\w+)\s*\)/g, 'for (var $1 of $2)');

  // Type casts: (int) x → Math.trunc(x) , (char) x → String.fromCharCode(x)
  js = js.replace(/\(int\)\s*(\w+)/g, 'Math.trunc($1)');
  js = js.replace(/\(char\)\s*(\w+)/g, 'String.fromCharCode($1)');
  js = js.replace(/\(\w+\)\s*(\w+)/g, '$1');  // remove other casts

  return js;
}

/* ──────────── SHARED RESULT RENDERER ──────────── */
function renderResults(results, allPassed, problem, isSubmit, outputBody) {
  if (isSubmit) {
    finalizeSubmission(problem, allPassed, isSubmit, results);
  } else {
    outputBody.innerHTML = results.map((r, i) => `
      <div class="test-result ${r.passed ? 'pass' : 'fail'}">
        <div class="tr-title ${r.passed ? 'pass' : 'fail'}">
          ${r.passed ? '✓ Test Case ' + (i+1) + ' Passed' : '✗ Test Case ' + (i+1) + ' Failed'}
        </div>
        <div class="tr-row">Input: <span>${r.input}</span></div>
        <div class="tr-row">Expected: <span>${r.expected}</span></div>
        <div class="tr-row">Got: <span>${r.got}</span></div>
      </div>
    `).join('');
  }
}

function extractFnName(code) {
  // Try to extract function name
  const match = code.match(/function\s+(\w+)\s*\(/);
  if (match) return match[1];
  const arrowMatch = code.match(/(?:const|let|var)\s+(\w+)\s*=/);
  if (arrowMatch) return arrowMatch[1];
  return 'solution';
}

function finalizeSubmission(problem, allPassed, isSubmit, results) {
  const uid = currentUser.uid;
  const outputBody = document.getElementById('output-body');

  if (allPassed) {
    // Mark as solved
    const solved = Storage.getSolvedSet(uid);
    solved.add(problem.id.toString());
    Storage.saveSolvedSet(uid, solved);

    // Record activity
    const activity = Storage.getActivity(uid);
    const today = new Date().toISOString().slice(0, 10);
    activity[today] = (activity[today] || 0) + 1;
    Storage.saveActivity(uid, activity);

    // Save submission
    const subs = Storage.getSubmissions(uid);
    subs.push({ problemId: problem.id, title: problem.title, lang: document.getElementById('lang-select').value, status: 'Accepted', ts: Date.now() });
    Storage.saveSubmissions(uid, subs);

    if (isSubmit) {
      // Stop timer and capture elapsed time for the solved badge
      const elapsed = (typeof timerStop === 'function') ? timerStop() : 0;
      const timeLabel = elapsed > 0
        ? `<div class="timer-solved-badge">⏱ Solved in ${(typeof timerFormat === 'function') ? timerFormat(elapsed) : elapsed + 's'}</div>`
        : '';
      outputBody.innerHTML = `
        <div class="submit-result accepted">
          <div class="sr-icon">🎉</div>
          <div class="sr-title">Accepted!</div>
          <div class="sr-sub">All test cases passed. Great work!</div>
          ${timeLabel}
        </div>
      `;
      showNotification(`"${problem.title}" solved! 🎉`, 'success');
    }
  } else {
    // Save wrong submission
    const subs = Storage.getSubmissions(uid);
    subs.push({ problemId: problem.id, title: problem.title, lang: document.getElementById('lang-select').value, status: 'Wrong Answer', ts: Date.now() });
    Storage.saveSubmissions(uid, subs);

    if (isSubmit) {
      const failedResults = results ? results.filter(r => !r.passed) : [];
      const firstFail = failedResults[0];
      outputBody.innerHTML = `
        <div class="submit-result wrong">
          <div class="sr-icon">❌</div>
          <div class="sr-title">Wrong Answer</div>
          <div class="sr-sub">Some test cases failed. Check your logic and try again.</div>
        </div>
        ${firstFail ? `
        <div class="test-result fail" style="margin:12px 16px 0">
          <div class="tr-title fail">First Failing Case</div>
          <div class="tr-row">Input: <span>${firstFail.input}</span></div>
          <div class="tr-row">Expected: <span>${firstFail.expected}</span></div>
          <div class="tr-row">Got: <span>${firstFail.got}</span></div>
        </div>` : ''}
      `;
    }
  }
}

// Solver tab switching
document.querySelectorAll('.solver-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.solver-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.target;
    document.querySelectorAll('.solver-panel').forEach(p => p.style.display = 'none');
    document.getElementById(target).style.display = 'block';
  });
});

// Back button
document.getElementById('solver-back').addEventListener('click', () => {
  showPage('problems-page');
  renderProblems();
});

// Output toggle
document.getElementById('output-toggle').addEventListener('click', () => {
  const panel = document.getElementById('editor-output');
  panel.classList.toggle('collapsed');
  document.getElementById('output-toggle').textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
});

// ---- Profile ----
function renderProfile() {
  const uid = currentUser.uid;
  const solved = Storage.getSolvedSet(uid);
  const submissions = Storage.getSubmissions(uid);
  const activity = Storage.getActivity(uid);

  const easySolved = [...solved].filter(id => PROBLEMS.find(p => p.id === +id)?.difficulty === 'Easy').length;
  const medSolved  = [...solved].filter(id => PROBLEMS.find(p => p.id === +id)?.difficulty === 'Medium').length;
  const hardSolved = [...solved].filter(id => PROBLEMS.find(p => p.id === +id)?.difficulty === 'Hard').length;
  const easyTotal  = PROBLEMS.filter(p => p.difficulty === 'Easy').length;
  const medTotal   = PROBLEMS.filter(p => p.difficulty === 'Medium').length;
  const hardTotal  = PROBLEMS.filter(p => p.difficulty === 'Hard').length;

  document.getElementById('profile-initials').textContent = getInitials(currentUser.name);
  document.getElementById('profile-name').textContent = currentUser.name;
  document.getElementById('profile-email').textContent = currentUser.email;
  document.getElementById('profile-email-2').textContent = currentUser.email;
  document.getElementById('profile-rank-label').textContent = computeRank(solved.size);

  document.getElementById('profile-total').textContent = solved.size;
  document.getElementById('profile-streak').textContent = computeStreak(activity);
  document.getElementById('profile-acceptance').textContent = computeAcceptance(submissions);

  // Badges
  const badges = [];
  if (solved.size >= 1) badges.push('<span class="badge green">🚀 First Solve</span>');
  if (solved.size >= 5) badges.push('<span class="badge blue">⚡ Problem Solver</span>');
  if (solved.size >= 10) badges.push('<span class="badge gold">🏆 Expert Coder</span>');
  if (easySolved >= 5) badges.push('<span class="badge green">✅ Easy Master</span>');
  if (medSolved >= 3) badges.push('<span class="badge blue">⚡ Medium Crusher</span>');
  if (hardSolved >= 1) badges.push('<span class="badge gold">🔥 Hard Breaker</span>');
  document.getElementById('profile-badges').innerHTML = badges.length ? badges.join('') : '<span style="color:var(--text-muted);font-size:0.85rem">Solve problems to earn badges!</span>';

  // Breakdown bars
  document.getElementById('easy-br-fill').style.width = `${(easySolved / easyTotal) * 100}%`;
  document.getElementById('medium-br-fill').style.width = `${(medSolved / medTotal) * 100}%`;
  document.getElementById('hard-br-fill').style.width = `${(hardSolved / hardTotal) * 100}%`;
  document.getElementById('easy-br-count').textContent = `${easySolved} / ${easyTotal}`;
  document.getElementById('medium-br-count').textContent = `${medSolved} / ${medTotal}`;
  document.getElementById('hard-br-count').textContent = `${hardSolved} / ${hardTotal}`;

  // Join date
  const joined = new Date(currentUser.joinedAt);
  document.getElementById('profile-joined').textContent = joined.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ---- Nav user click goes to profile ----
document.getElementById('nav-user-area').addEventListener('click', () => {
  showPage('profile-page');
  renderProfile();
});

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
