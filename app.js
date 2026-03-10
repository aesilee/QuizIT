/* ══════════════════════════════════════════════════════
   StudyDeck — app.js
   ══════════════════════════════════════════════════════ */

// ── DATA LAYER (localStorage) ──────────────────────────────────────────────
const STORAGE_KEY = 'studydeck_sets_v2';

function loadSets() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch(e) { return []; }
}
function saveSets(sets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── GLOBAL STATE ────────────────────────────────────────────────────────────
let sets          = loadSets();
let currentSetId  = null;
let editingSetId  = null;
let pageHistory   = ['home'];

// Study (flashcards)
let studyCards    = [];
let studyIndex    = 0;
let studyFlipped  = false;

// Learn state
let learnQueue    = [];
let learnIndex    = 0;
let learnPhase    = 1;   // 1 = MC, 2 = Fill
let learnCorrect  = 0;
let learnWrong    = 0;
let learnAnswered = false;
let learnAttempts = 0;   // fill-in attempts for current question (max 3)

// Test state
let testCards     = [];
let testConfig    = { format: 'fill', answerWith: 'term' };
let testMCAnswers = {};  // map of question index → selected option index

// Delete modal
let deleteTargetId = null;

// Card row counter (for create/edit page)
let cardRowCount  = 0;

// ── SIDEBAR HELPERS (defined early so all callers can use them) ─────────────
function updateSidebarActive(page, setId) {
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sidebar-set-btn').forEach(b => b.classList.remove('active'));
  if (page === 'home') {
    document.getElementById('snav-home')?.classList.add('active');
  } else if (page === 'create' && !setId) {
    document.getElementById('snav-new')?.classList.add('active');
  } else if (setId) {
    const btn = document.querySelector(`.sidebar-set-btn[data-id="${setId}"]`);
    if (btn) btn.classList.add('active');
  }
}

function renderSidebarSets() {
  sets = loadSets();
  const list = document.getElementById('sidebar-sets-list');
  if (!list) return;
  list.innerHTML = sets.map(s => `
    <button class="sidebar-set-btn" data-id="${s.id}" onclick="showSetDetail('${s.id}')">
      <span class="sidebar-set-dot"></span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title)}</span>
    </button>
  `).join('');
}

function setTopbarTitle(text) {
  const el = document.getElementById('topbar-title');
  if (el) el.textContent = text || '';
}

// ── NAVIGATION ─────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.getElementById('nav-back').style.display = id === 'home' ? 'none' : '';
  if (id === 'home') pageHistory = ['home'];
  else if (pageHistory[pageHistory.length - 1] !== id) pageHistory.push(id);
  window.scrollTo(0, 0);
  // Close mobile sidebar on page change
  document.getElementById('sidebar')?.classList.remove('mobile-open');
}

function navBack() {
  pageHistory.pop();
  const prev = pageHistory[pageHistory.length - 1] || 'home';
  if (prev === 'home') renderHome();
  else if (prev === 'set-detail' && currentSetId) showSetDetail(currentSetId);
  else showPage(prev);
}

// ── TOAST ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  document.getElementById('toast-icon').textContent = type === 'success' ? '✓' : '✕';
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 2600);
}

// ── ESCAPE HTML ────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── HOME ───────────────────────────────────────────────────────────────────
function renderHome() {
  sets = loadSets();
  showPage('home');
  setTopbarTitle('');
  updateSidebarActive('home', null);
  renderSidebarSets();
  const grid = document.getElementById('sets-grid');
  if (!sets.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="icon">📚</div>
        <h3>No sets yet</h3>
        <p>Create your first flashcard set to get started.</p>
      </div>`;
    return;
  }
  grid.innerHTML = sets.map(s => `
    <div class="set-card" onclick="showSetDetail('${s.id}')">
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.description || 'No description')}</p>
      <div class="set-card-meta">
        <span class="set-card-count">${s.cards.length} cards</span>
        <div class="set-card-actions" onclick="event.stopPropagation()">
          <button class="btn-icon" title="Edit"   onclick="editSet('${s.id}')">✏️</button>
          <button class="btn-icon" title="Delete" onclick="openDeleteModal('${s.id}')">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ── SET DETAIL ─────────────────────────────────────────────────────────────
function showSetDetail(id) {
  currentSetId = id;
  const set = sets.find(s => s.id === id);
  if (!set) { renderHome(); return; }
  document.getElementById('detail-title').textContent = set.title;
  document.getElementById('detail-desc').textContent  = set.description || '';
  document.getElementById('detail-card-list').innerHTML = set.cards.map((c, i) => `
    <div class="flashcard-item">
      <div class="flashcard-item-num">${i + 1}</div>
      <div class="flashcard-item-term">${esc(c.term)}</div>
      <div class="flashcard-item-def">${esc(c.definition)}</div>
    </div>
  `).join('');
  showPage('set-detail');
  setTopbarTitle(set.title);
  updateSidebarActive('set-detail', id);
}

function editCurrentSet() { editSet(currentSetId); }

// ── CREATE / EDIT SET ──────────────────────────────────────────────────────
function showPage_create(editId) {
  editingSetId = editId || null;
  cardRowCount = 0;
  document.getElementById('card-editor').innerHTML = '';
  document.getElementById('create-title').textContent = editId ? 'Edit Set' : 'Create New Set';

  if (editId) {
    const set = sets.find(s => s.id === editId);
    document.getElementById('set-title-input').value = set.title;
    document.getElementById('set-desc-input').value  = set.description || '';
    set.cards.forEach(c => addCardRow(c.term, c.definition));
  } else {
    document.getElementById('set-title-input').value = '';
    document.getElementById('set-desc-input').value  = '';
    addCardRow(); addCardRow(); addCardRow();
  }
  showPage('create');
  setTopbarTitle(editId ? 'Edit Set' : 'New Set');
  updateSidebarActive('create', editId || null);
}

function addCardRow(term = '', definition = '') {
  cardRowCount++;
  const n      = cardRowCount;
  const editor = document.getElementById('card-editor');
  const row    = document.createElement('div');
  row.className = 'card-row';
  row.id        = 'card-row-' + n;
  row.innerHTML = `
    <div class="card-row-num">${editor.children.length + 1}</div>
    <input type="text"  placeholder="Term"       class="card-term" value="${esc(term)}">
    <input type="text"  placeholder="Definition" class="card-def"  value="${esc(definition)}">
    <button class="btn-icon" onclick="removeCardRow(${n})" title="Remove">✕</button>
  `;
  editor.appendChild(row);
  reNumberRows();
}

function removeCardRow(n) {
  const row = document.getElementById('card-row-' + n);
  if (row) { row.remove(); reNumberRows(); }
}

function reNumberRows() {
  document.querySelectorAll('.card-row').forEach((row, i) => {
    row.querySelector('.card-row-num').textContent = i + 1;
  });
}

function editSet(id) { showPage_create(id); }

function saveSet() {
  const title = document.getElementById('set-title-input').value.trim();
  if (!title) { showToast('Please enter a set title', 'error'); return; }

  const rows  = document.querySelectorAll('.card-row');
  const cards = [];
  rows.forEach(row => {
    const term = row.querySelector('.card-term').value.trim();
    const def  = row.querySelector('.card-def').value.trim();
    if (term && def) cards.push({ id: genId(), term, definition: def });
  });
  if (cards.length < 2) { showToast('Add at least 2 cards', 'error'); return; }

  sets = loadSets();
  const desc = document.getElementById('set-desc-input').value.trim();
  if (editingSetId) {
    const idx = sets.findIndex(s => s.id === editingSetId);
    if (idx !== -1) sets[idx] = { ...sets[idx], title, description: desc, cards };
  } else {
    sets.push({ id: genId(), title, description: desc, cards, created: Date.now() });
  }
  saveSets(sets);
  renderSidebarSets();
  showToast(editingSetId ? 'Set updated!' : 'Set created!');
  if (editingSetId) showSetDetail(editingSetId);
  else renderHome();
}

// ── FLASHCARDS STUDY ────────────────────────────────────────────────────────
function startFlashcards() {
  const set  = sets.find(s => s.id === currentSetId);
  studyCards = [...set.cards];
  studyIndex = 0; studyFlipped = false;
  renderStudyCard();
  showPage('study');
  setTopbarTitle(set.title + ' — Flashcards');
  updateSidebarActive('study', currentSetId);
}

function renderStudyCard() {
  const c = studyCards[studyIndex];
  document.getElementById('card-term').textContent = c.term;
  document.getElementById('card-def').textContent  = c.definition;
  document.getElementById('card-inner').classList.remove('flipped');
  studyFlipped = false;
  document.getElementById('study-counter').textContent =
    `${studyIndex + 1} / ${studyCards.length}`;
  document.getElementById('study-progress-fill').style.width =
    `${((studyIndex + 1) / studyCards.length) * 100}%`;
}

function flipCard() {
  studyFlipped = !studyFlipped;
  document.getElementById('card-inner').classList.toggle('flipped', studyFlipped);
}

function nextCard() {
  if (studyIndex < studyCards.length - 1) { studyIndex++; renderStudyCard(); }
  else showToast('End of deck! 🎉');
}

function prevCard() {
  if (studyIndex > 0) { studyIndex--; renderStudyCard(); }
}

function shuffleCards() {
  studyCards = shuffle([...studyCards]);
  studyIndex = 0; renderStudyCard();
  showToast('Cards shuffled!');
}

// ── LEARN MODE ─────────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 3;

function startLearn() {
  const set  = sets.find(s => s.id === currentSetId);
  learnQueue = shuffle([...set.cards]);
  learnIndex = 0; learnPhase = 1;
  learnCorrect = 0; learnWrong = 0;
  learnAnswered = false; learnAttempts = 0;

  document.getElementById('learn-set-title').textContent = set.title;
  document.getElementById('learn-result').style.display        = 'none';
  document.getElementById('learn-question-card').style.display = '';
  document.getElementById('learn-counter').style.display       = '';

  updateLearnPhaseBadge();
  renderLearnQuestion();
  showPage('learn');
  setTopbarTitle(set.title + ' — Learn');
  updateSidebarActive('learn', currentSetId);
}

function updateLearnPhaseBadge() {
  const badge = document.getElementById('learn-phase-badge');
  if (learnPhase === 1) {
    badge.textContent = 'Phase 1 · Multiple Choice';
    badge.className   = 'learn-phase-badge phase-mc';
  } else {
    badge.textContent = 'Phase 2 · Fill in the Blank';
    badge.className   = 'learn-phase-badge phase-fill';
  }
}

function renderLearnQuestion() {
  const set        = sets.find(s => s.id === currentSetId);
  const totalCards = learnQueue.length;
  const progressPct = (learnIndex / totalCards) * 100;

  document.getElementById('learn-progress-fill').style.width =
    progressPct + '%';
  document.getElementById('learn-counter').textContent =
    `Question ${learnIndex + 1} of ${totalCards}`;

  // ── Phase transition / end ──
  if (learnIndex >= learnQueue.length) {
    if (learnPhase === 1) {
      learnPhase = 2;
      learnQueue = shuffle([...set.cards]);
      learnIndex = 0;
      updateLearnPhaseBadge();
      renderLearnQuestion();
    } else {
      showLearnResults();
    }
    return;
  }

  // ── Reset per-question state ──
  learnAnswered = false;
  learnAttempts = 0;
  document.getElementById('learn-next-btn').style.display = 'none';

  const card = learnQueue[learnIndex];

  if (learnPhase === 1) {
    // ── Multiple Choice ──
    document.getElementById('learn-q-text').textContent = card.definition;
    document.getElementById('learn-q-sub').textContent  = 'Which term matches this definition?';
    document.getElementById('learn-mc-options').style.display = '';
    document.getElementById('learn-fill-wrap').style.display  = 'none';

    const allCards = set.cards;
    const wrong = allCards.filter(c => c.id !== card.id);
    const opts  = shuffle([card, ...shuffle(wrong).slice(0, 3)]);
    const keys  = ['A', 'B', 'C', 'D'];

    document.getElementById('learn-mc-options').innerHTML = opts.map((o, i) => `
      <div class="mc-option" id="mc-opt-${i}" onclick="selectMC(${i}, ${o.id === card.id})">
        <div class="mc-key">${keys[i]}</div>
        <span>${esc(o.term)}</span>
      </div>
    `).join('');

  } else {
    // ── Fill in the Blank ──
    document.getElementById('learn-q-text').textContent = card.definition;
    document.getElementById('learn-q-sub').textContent  = 'Type the term for this definition:';
    document.getElementById('learn-mc-options').style.display = 'none';
    document.getElementById('learn-fill-wrap').style.display  = '';

    // Reset input
    const inp = document.getElementById('learn-fill-input');
    inp.value     = '';
    inp.className = 'fill-input';
    inp.disabled  = false;

    // Reset hint bar
    document.getElementById('learn-hint-bar').textContent = '';

    // Reset attempts dots
    renderAttemptDots(0);

    // Reset feedback
    const fb = document.getElementById('learn-fill-feedback');
    fb.className   = 'fill-feedback';
    fb.textContent = '';

    setTimeout(() => inp.focus(), 50);
  }
}

function renderAttemptDots(usedWrong) {
  const row = document.getElementById('learn-attempts-row');
  let html  = '';
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (i < usedWrong) html += `<div class="attempt-dot used-wrong"></div>`;
    else               html += `<div class="attempt-dot remaining"></div>`;
  }
  html += `<span style="font-size:0.78rem; color:var(--text3); margin-left:8px;">
    ${MAX_ATTEMPTS - usedWrong} attempt${(MAX_ATTEMPTS - usedWrong) !== 1 ? 's' : ''} left
  </span>`;
  row.innerHTML = html;
}

// ── MC Selection ──
function selectMC(idx, isCorrect) {
  if (learnAnswered) return;
  learnAnswered = true;

  document.querySelectorAll('.mc-option').forEach(el => el.classList.add('disabled'));
  document.getElementById('mc-opt-' + idx).classList.add(isCorrect ? 'correct' : 'wrong');

  if (!isCorrect) {
    const card = learnQueue[learnIndex];
    document.querySelectorAll('.mc-option').forEach(el => {
      if (el.querySelector('span').textContent === card.term) el.classList.add('correct');
    });
    learnWrong++;
  } else {
    learnCorrect++;
  }

  // Auto-advance after 900ms so user can see the result
  setTimeout(() => learnNext(), 900);
}

// ── Fill in the Blank ──
function fillKeydown(e) {
  if (e.key === 'Enter') checkFill();
}

function checkFill() {
  if (learnAnswered) return;

  const card   = learnQueue[learnIndex];
  const inp    = document.getElementById('learn-fill-input');
  const fb     = document.getElementById('learn-fill-feedback');
  const val    = inp.value.trim().toLowerCase();
  const answer = card.term.trim().toLowerCase();

  if (!val) return;

  if (val === answer) {
    learnAnswered = true;
    inp.className = 'fill-input correct';
    inp.disabled  = true;
    fb.textContent = '✓ Correct!';
    fb.className   = 'fill-feedback correct show';
    learnCorrect++;
    renderAttemptDots(learnAttempts);
    setTimeout(() => learnNext(), 900);

  } else {
    learnAttempts++;
    inp.value     = '';
    inp.className = 'fill-input wrong';
    renderAttemptDots(learnAttempts);

    if (learnAttempts < MAX_ATTEMPTS) {
      const words = card.term.trim().split(/\s+/);
      let hintLabel;
      if (words.length >= 2) {
        const hint = words.map(w => w[0].toUpperCase() + '_'.repeat(Math.max(w.length - 1, 2))).join(' ');
        hintLabel = `💡 Hint: ${hint}`;
      } else {
        hintLabel = `💡 Hint: Starts with "${card.term[0].toUpperCase()}"`;
      }
      document.getElementById('learn-hint-bar').textContent = hintLabel;
      fb.textContent = `✕ Not quite — try again!`;
      fb.className   = 'fill-feedback wrong show';
      setTimeout(() => {
        inp.className = 'fill-input';
        fb.className  = 'fill-feedback hint show';
        fb.textContent = `${hintLabel} — ${MAX_ATTEMPTS - learnAttempts} attempt${(MAX_ATTEMPTS - learnAttempts) !== 1 ? 's' : ''} left`;
        inp.focus();
      }, 600);

    } else {
      learnAnswered = true;
      inp.disabled  = true;
      fb.textContent = `✕ Correct answer: ${card.term}`;
      fb.className   = 'fill-feedback wrong show';
      learnWrong++;
      setTimeout(() => learnNext(), 1400); // slightly longer so user can read the answer
    }
  }
}

function learnNext() {
  learnIndex++;
  renderLearnQuestion();
}

function showLearnResults() {
  document.getElementById('learn-question-card').style.display = 'none';
  document.getElementById('learn-counter').style.display       = 'none';
  document.getElementById('learn-next-btn').style.display      = 'none';
  document.getElementById('learn-progress-fill').style.width   = '100%';
  document.getElementById('learn-correct-count').textContent   = learnCorrect;
  document.getElementById('learn-wrong-count').textContent     = learnWrong;

  const total = learnCorrect + learnWrong;
  const pct   = total ? Math.round((learnCorrect / total) * 100) : 0;
  document.getElementById('learn-result-sub').textContent =
    `You got ${learnCorrect} out of ${total} correct (${pct}%) across both phases.`;
  document.getElementById('learn-result').style.display = '';
}

// ── TEST OPTIONS OVERLAY ────────────────────────────────────────────────────
function openTestOptions() {
  document.getElementById('test-options-modal').classList.add('open');
}

function closeTestOptions() {
  document.getElementById('test-options-modal').classList.remove('open');
}

function selectOpt(groupId, el) {
  document.querySelectorAll(`#${groupId} .opt-btn`).forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
}

function startTestFromOptions() {
  // Read format
  const fmtEl = document.querySelector('#opt-format .opt-btn.selected');
  const ansEl = document.querySelector('#opt-answer .opt-btn.selected');
  testConfig.format     = fmtEl ? fmtEl.dataset.val : 'fill';
  testConfig.answerWith = ansEl ? ansEl.dataset.val : 'term';

  closeTestOptions();
  startTest();
}

// ── TEST MODE ──────────────────────────────────────────────────────────────
function startTest() {
  const set   = sets.find(s => s.id === currentSetId);
  testCards   = shuffle([...set.cards]);
  testMCAnswers = {};

  document.getElementById('test-set-title').textContent = set.title + ' — Test';
  document.getElementById('test-results').style.display  = 'none';
  document.getElementById('test-submit-btn').style.display = '';

  const formatLabel = testConfig.format === 'fill' ? 'Fill in the Blank' :
                      testConfig.format === 'mc'   ? 'Multiple Choice'   : 'Mixed';
  const ansLabel    = testConfig.answerWith === 'term' ? 'Term' : 'Definition';
  document.getElementById('test-subtitle').textContent =
    `Format: ${formatLabel} · Answer with: ${ansLabel}`;

  const container = document.getElementById('test-questions');
  container.innerHTML = testCards.map((c, i) => buildTestQuestion(c, i)).join('');

  // Reset question list sidebar
  document.getElementById('test-qlist-sidebar').style.display = 'none';
  qlistVisible = true;

  // Start timer
  testStartTime = Date.now();

  showPage('test');
  setTopbarTitle(set.title + ' — Test');
  updateSidebarActive('test', currentSetId);}

function buildTestQuestion(card, i) {
  // Decide format for this question
  let format = testConfig.format;
  if (format === 'both') format = i % 2 === 0 ? 'fill' : 'mc';

  // What the user SEES (the prompt)
  const prompt  = testConfig.answerWith === 'term' ? card.definition : card.term;
  // What the user must ANSWER
  const correctAnswer = testConfig.answerWith === 'term' ? card.term : card.definition;

  let inputHtml = '';

  if (format === 'mc') {
    const set    = sets.find(s => s.id === currentSetId);
    const pool   = testConfig.answerWith === 'term'
      ? set.cards.filter(c => c.id !== card.id).map(c => c.term)
      : set.cards.filter(c => c.id !== card.id).map(c => c.definition);

    const wrongs  = shuffle(pool).slice(0, 3);
    const options = shuffle([correctAnswer, ...wrongs]);
    const keys    = ['A', 'B', 'C', 'D'];

    inputHtml = `
      <div class="test-mc-options" id="test-mc-${i}">
        ${options.map((o, oi) => `
          <div class="test-mc-opt" id="test-mc-opt-${i}-${oi}"
               data-answer="${esc(correctAnswer)}"
               onclick="selectTestMC(${i}, ${oi}, this)">
            <div class="test-mc-key">${keys[oi]}</div>
            <span>${esc(o)}</span>
          </div>
        `).join('')}
      </div>
      <div class="test-q-feedback" id="test-fb-${i}"></div>
    `;
  } else {
    inputHtml = `
      <input type="text" class="test-q-input" id="test-ans-${i}"
             placeholder="Type the ${testConfig.answerWith}…"
             data-answer="${esc(correctAnswer)}">
      <div class="test-q-feedback" id="test-fb-${i}"></div>
    `;
  }

  return `
    <div class="test-q" id="test-q-${i}" data-format="${format}">
      <div class="test-q-num">Question ${i + 1}</div>
      <div class="test-q-text">${esc(prompt)}</div>
      ${inputHtml}
    </div>
  `;
}

function selectTestMC(qIdx, optIdx, el) {
  // Deselect all options for this question
  document.querySelectorAll(`#test-mc-${qIdx} .test-mc-opt`).forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  testMCAnswers[qIdx] = optIdx;
}

// ── TEST TIMER ─────────────────────────────────────────────────────────────
let testStartTime = null;

function submitTest() {
  let correct = 0;
  const results = []; // { qNum, isCorrect }

  testCards.forEach((card, i) => {
    const qEl   = document.getElementById('test-q-' + i);
    const fb    = document.getElementById('test-fb-' + i);
    const fmt   = qEl.dataset.format;
    let isCorrect = false;

    if (fmt === 'mc') {
      const opts     = document.querySelectorAll(`#test-mc-${i} .test-mc-opt`);
      const selected = document.querySelector(`#test-mc-${i} .test-mc-opt.selected`);
      opts.forEach(o => o.classList.add('disabled'));

      if (!selected) {
        fb.textContent = '✕ No answer selected.';
        fb.className   = 'test-q-feedback wrong show';
        results.push({ qNum: i + 1, isCorrect: false });
        return;
      }

      const userAns   = selected.querySelector('span').textContent.trim().toLowerCase();
      const rightAns  = selected.dataset.answer.trim().toLowerCase();
      isCorrect = userAns === rightAns;

      opts.forEach(o => {
        if (o.querySelector('span').textContent.trim().toLowerCase() ===
            o.dataset.answer.trim().toLowerCase()) {
          o.classList.add('correct');
        }
      });
      if (!isCorrect) {
        selected.classList.add('wrong');
        fb.textContent = `✕ Correct answer: ${selected.dataset.answer}`;
        fb.className   = 'test-q-feedback wrong show';
      } else {
        correct++;
        fb.textContent = '✓ Correct!';
        fb.className   = 'test-q-feedback correct show';
      }

    } else {
      const inp = document.getElementById('test-ans-' + i);
      const val = inp.value.trim().toLowerCase();
      const ans = inp.dataset.answer.trim().toLowerCase();
      inp.disabled = true;

      if (val === ans) {
        inp.className  = 'test-q-input correct';
        fb.textContent = '✓ Correct!';
        fb.className   = 'test-q-feedback correct show';
        correct++;
        isCorrect = true;
      } else {
        inp.className  = 'test-q-input wrong';
        fb.textContent = `✕ Answer: ${inp.dataset.answer}${val ? ' (you wrote: ' + inp.value + ')' : ''}`;
        fb.className   = 'test-q-feedback wrong show';
      }
    }
    results.push({ qNum: i + 1, isCorrect });
  });

  document.getElementById('test-submit-btn').style.display = 'none';
  const total = testCards.length;
  const wrong = total - correct;
  const pct   = Math.round((correct / total) * 100);

  // Score message
  const msgs = pct === 100 ? 'Perfect score! 🏆' :
               pct >= 80   ? 'Great job!' :
               pct >= 60   ? 'Good effort!' :
               pct >= 40   ? 'Keep practicing!' :
               'Be kind to yourself, and keep practicing!';

  // Timer
  const elapsed = testStartTime ? Math.round((Date.now() - testStartTime) / 1000) : 0;
  const mins = Math.floor(elapsed / 60);
  const timeStr = mins > 0
    ? `Your time: ${mins} min${mins !== 1 ? 's' : ''} ${elapsed % 60}s`
    : `Your time: ${elapsed}s`;

  document.getElementById('test-score-display').textContent  = pct + '%';
  document.getElementById('test-score-msg').textContent      = msgs;
  document.getElementById('test-time-display').textContent   = timeStr;
  document.getElementById('test-correct-count').textContent  = correct;
  document.getElementById('test-wrong-count').textContent    = wrong;

// Animate donut - green for correct, red for incorrect
const circumference = 314;
const correctOffset = circumference - (pct / 100) * circumference;
const incorrectPct = 100 - pct;
const incorrectOffset = circumference - (incorrectPct / 100) * circumference;

const donutCorrect = document.getElementById('donut-progress');
const donutWrong = document.getElementById('donut-progress-wrong');

requestAnimationFrame(() => {
  donutCorrect.style.strokeDashoffset = correctOffset;
  // Wrong arc starts where correct ends — offset it rotationally via JS
  donutWrong.style.strokeDasharray = `${(incorrectPct / 100) * circumference} ${circumference}`;
  donutWrong.style.strokeDashoffset = -(pct / 100) * circumference;
});

  // Question list sidebar
  const sidebar = document.getElementById('test-qlist-sidebar');
  const itemsEl = document.getElementById('test-qlist-items');
  itemsEl.innerHTML = results.map(r => `
    <div class="test-qlist-item" onclick="scrollToQuestion(${r.qNum - 1})">
      <span class="test-qlist-icon ${r.isCorrect ? 'correct' : 'wrong'}">${r.isCorrect ? '✓' : '✕'}</span>
      <span>${r.qNum}</span>
    </div>
  `).join('');
  sidebar.style.display = '';

  document.getElementById('test-results').style.display = '';
  document.getElementById('test-results').scrollIntoView({ behavior: 'smooth' });
}

function scrollToQuestion(idx) {
  const el = document.getElementById('test-q-' + idx);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

let qlistVisible = true;
function toggleQuestionList() {
  qlistVisible = !qlistVisible;
  const items = document.getElementById('test-qlist-items');
  const icon  = document.getElementById('qlist-toggle-icon');
  const label = document.getElementById('qlist-toggle-label');
  items.style.display = qlistVisible ? '' : 'none';
  icon.textContent    = qlistVisible ? '✕' : '☰';
  label.textContent   = qlistVisible ? 'Hide question list' : 'Show question list';
}

// ── DELETE MODAL ────────────────────────────────────────────────────────────
function openDeleteModal(id) {
  deleteTargetId = id;
  document.getElementById('delete-modal').classList.add('open');
}
function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('open');
  deleteTargetId = null;
}
function confirmDelete() {
  sets = loadSets().filter(s => s.id !== deleteTargetId);
  saveSets(sets);
  renderSidebarSets();
  closeDeleteModal();
  showToast('Set deleted');
  renderHome();
}

// ── UTILS ──────────────────────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── THEME ──────────────────────────────────────────────────────────────────
function toggleTheme(checkbox) {
  const isLight = checkbox.checked;
  document.body.classList.toggle('light-mode', isLight);
  localStorage.setItem('quizit_theme', isLight ? 'light' : 'dark');
}

function initTheme() {
  const saved = localStorage.getItem('quizit_theme');
  const preferLight = saved
    ? saved === 'light'
    : window.matchMedia('(prefers-color-scheme: light)').matches;
  document.body.classList.toggle('light-mode', preferLight);
  const cb = document.getElementById('theme-checkbox');
  if (cb) cb.checked = preferLight;
}

// ── INIT ───────────────────────────────────────────────────────────────────
initTheme();
renderHome();

document.getElementById('logo-btn').addEventListener('click', renderHome);

// ── SIDEBAR TOGGLE ─────────────────────────────────────────────────────────
let sidebarCollapsed = false;
const isMobile = () => window.innerWidth <= 768;

function toggleSidebar() {
  if (isMobile()) {
    document.getElementById('sidebar').classList.toggle('mobile-open');
  } else {
    sidebarCollapsed = !sidebarCollapsed;
    document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
    const btn = document.getElementById('collapse-btn');
    if (btn) btn.textContent = sidebarCollapsed ? '›' : '‹';
  }
}

// Close mobile sidebar when clicking outside
document.addEventListener('click', (e) => {
  if (!isMobile()) return;
  const sidebar = document.getElementById('sidebar');
  const hamburger = document.getElementById('topbar-hamburger');
  if (sidebar.classList.contains('mobile-open') &&
      !sidebar.contains(e.target) &&
      e.target !== hamburger) {
    sidebar.classList.remove('mobile-open');
  }
});