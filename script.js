// === 設定 ===
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyJ3xJCkhakLUI_8mCsA6MPVrMXKTKuxIMSctkaJpnOmKFJ_ogq4hycm-3rtCcPMDBEKw/exec";

// === グローバル状態管理 ===
let rawData = {};
let userData = {};

let currentQuestions = [];
let currentIndex = 0;
let currentGenre = "";
let currentQuizType = "normal";
let currentQuizLabel = "";

// 白地図専用
let currentMapAllQuestions = [];
let currentMapResults = [];

// === 初期化 ===
window.onload = () => {
  loadUserData();
  loadCachedQuestions();
  loadDailyGoal();
  updateStats();
  updateHomeProgress();
  
  // ★追加：初期画面（ホーム）の状態をブラウザの履歴にセットする
  history.replaceState({ screen: 'screen-home' }, "", "");
};

// === 画面遷移（History API対応） ===
function showScreen(screenId, pushHistory = true) {
  // すべての画面を非表示
  document.querySelectorAll('.container').forEach(el => el.classList.add('hidden'));
  // 指定された画面を表示
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) targetScreen.classList.remove('hidden');
  window.scrollTo(0, 0);

  // ★追加：履歴をブラウザに積む
  if (pushHistory) {
    history.pushState({ screen: screenId }, "", "");
  }
}

// === ★新規追加：ブラウザの「戻る」「進む」「スワイプ」を検知 ===
window.addEventListener('popstate', (event) => {
  if (event.state && event.state.screen) {
    // 履歴に残っている画面IDへ遷移（履歴には追加しない）
    showScreen(event.state.screen, false);
  } else {
    // 履歴が空になったらホーム画面に戻る
    showScreen('screen-home', false);
  }
});
// === データ読み込み ===
function loadUserData() {
  userData = JSON.parse(localStorage.getItem('sommelier_user_data')) || {};
}

function saveUserData() {
  localStorage.setItem('sommelier_user_data', JSON.stringify(userData));
  updateStats();
  updateHomeProgress();
}

function loadCachedQuestions() {
  const cached = localStorage.getItem('sommelier_quiz_data');
  if (cached) {
    rawData = JSON.parse(cached);
  }
}

function loadDailyGoal() {
  const savedGoal = localStorage.getItem("sommelier_daily_goal");
  const input = document.getElementById("setting-daily-goal");
  if (!input) return;
  input.value = savedGoal || 10;
}

function saveDailyGoal() {
  const input = document.getElementById("setting-daily-goal");
  if (!input) return;
  let value = parseInt(input.value, 10);
  if (!Number.isFinite(value) || value < 1) value = 1;
  if (value > 999) value = 999;
  input.value = value;
  localStorage.setItem("sommelier_daily_goal", String(value));
}

async function fetchDataFromGAS() {
  if (GAS_API_URL.includes("YOUR_EXEC_URL")) {
    alert("script.js の GAS_API_URL を書き換えてください。");
    return;
  }
  try {
    const res = await fetch(GAS_API_URL);
    rawData = await res.json();
    localStorage.setItem('sommelier_quiz_data', JSON.stringify(rawData));
    alert("最新データの同期が完了しました！");
    updateStats();
    updateHomeProgress();
  } catch (err) {
    console.error(err);
    alert("データの取得に失敗しました。");
  }
}

// === ジャンル・サブカテゴリ選択 ===
function selectGenre(genreName) {
  const genreMap = {
    "ワイン総論": "ワイン総論",
    "国・地方別": "国・地方別",
    "ブドウ品種": "ブドウ品種",
    "ワインタイプ": "ワインタイプ",
    "ペアリング": "ペアリング",
    "その他酒類": "その他酒類",
    "法律": "法律",
    "白地図学習": "白地図学習"
  };

  const targetTabName = genreMap[genreName] || genreName;
  currentGenre = targetTabName;
  const genreData = rawData[targetTabName] || [];

  if (genreData.length === 0) {
    alert("このカテゴリには問題が登録されていません。設定画面からデータを同期してください。");
    return;
  }

  const uniqueSubCats = [...new Set(genreData.map(d => d.subCat).filter(Boolean))];
  const subCats = targetTabName === "白地図学習" ? uniqueSubCats : ["すべて", ...uniqueSubCats];

  const container = document.getElementById('subcat-list');
  container.innerHTML = "";

  subCats.forEach(sub => {
    const btn = document.createElement('button');
    btn.className = "btn btn-glass";

    let subList = genreData;
    if (sub !== "すべて") {
      subList = genreData.filter(d => d.subCat === sub);
    }
    // Lv.1以上（1回以上正解）を進捗数としてカウント
    const masteredCount = subList.filter(q => (userData[q.id]?.level || 0) >= 1 || userData[q.id]?.status === 'mastered').length;
    const progressText = ` (${masteredCount}/${subList.length})`;

    if (targetTabName === "白地図学習" && sub === "MAP") {
      btn.innerText = "MAPを見る";
    } else {
      btn.innerText = sub + progressText;
    }

    btn.onclick = () => {
      if (targetTabName === "白地図学習" && sub === "MAP") {
        location.href = "map.html";
        return;
      }
      startGenreQuiz(targetTabName, sub);
    };

    container.appendChild(btn);
  });

  document.getElementById('subcat-title').innerText = `${genreName} - サブカテゴリ`;
  showScreen('screen-subcat');
}

// === クイズ開始（ジャンル指定） ===
function startGenreQuiz(genre, subCat) {
  let list = rawData[genre] || [];
  if (subCat !== "すべて") {
    list = list.filter(d => d.subCat === subCat);
  }

  const fullMapList = genre === "白地図学習" ? [...list] : [];
  const targetPref = document.getElementById('setting-target').value;

  if (targetPref === 'unmastered') {
    list = list.filter(q => (userData[q.id]?.level || 0) < 1 && userData[q.id]?.status !== 'mastered');
  }

  if (list.length === 0) {
    alert("対象の問題がありません。");
    return;
  }

  const type = genre === "白地図学習" ? "map" : "normal";
  initQuiz(list, `${genre} (${subCat})`, type, fullMapList);
}

// === クイズ開始（AI復習 / 特殊モード） ===
function startSpecialQuiz(mode) {
  let list = [];
  let title = "";

  if (mode === 'srs') {
    list = getDailySrsQueue();
    list.sort(() => Math.random() - 0.5);
    title = "🍷 本日のAI復習";
  } else {
    Object.entries(rawData)
      .filter(([sheetName]) => !["白地図学習", "仕分け問題", "並び替え問題"].includes(sheetName))
      .forEach(([, arr]) => {
        if (Array.isArray(arr)) list.push(...arr);
      });

    if (mode === 'favorite') {
      list = list.filter(q => userData[q.id]?.favorite === true);
      title = "⭐ お気に入り復習";
    } else if (mode === 'weak') {
      list = list.filter(q => userData[q.id]?.status === 'weak');
      title = "🚨 弱点克服";
    } else {
      title = "一問一答（全範囲）";
    }
  }

  if (list.length === 0) {
    alert("対象の問題はありません。");
    return;
  }

  initQuiz(list, title, "normal", []);
}

function initQuiz(list, label, quizType = "normal", mapAllQuestions = []) {
  currentQuizType = quizType;
  currentQuizLabel = label;
  currentQuestions = [...list];
  currentMapResults = [];
  currentMapAllQuestions = quizType === "map" ? [...mapAllQuestions] : [];

  const orderPref = document.getElementById('setting-order').value;
  if (orderPref === 'random') {
    currentQuestions.sort(() => Math.random() - 0.5);
  }

  const countPref = document.getElementById('setting-count').value;
  if (countPref !== 'all') {
    currentQuestions = currentQuestions.slice(0, parseInt(countPref, 10));
  }

  currentIndex = 0;
  showQuestion();
  showScreen('screen-quiz');
}

// === 問題表示 ===
function showQuestion() {
  const q = currentQuestions[currentIndex];
  if (!q) return;

  const uState = userData[q.id] || { status: 'unseen', favorite: false, level: 0 };
  const badgeHTML = getLevelBadgeHTML(uState.level || 0);
  document.getElementById('quiz-cat-label').innerHTML = `${currentQuizLabel} ${badgeHTML}`;

  document.getElementById('quiz-counter').innerText = `${currentIndex + 1} / ${currentQuestions.length}`;
  document.getElementById('quiz-progress-bar').style.width = `${((currentIndex + 1) / currentQuestions.length) * 100}%`;
  document.getElementById('quiz-question').innerText = q.q;
  document.getElementById('quiz-answer').innerText = q.a;
  document.getElementById('quiz-note').innerText = q.note || "";

  const prevBtn = document.getElementById('btn-prev-question');
  if (prevBtn) {
    prevBtn.style.opacity = currentIndex === 0 ? "0.4" : "1";
    prevBtn.disabled = currentIndex === 0;
  }

  const imgContainer = document.getElementById('quiz-img-container');
  if (q.img && q.img.trim() !== "") {
    document.getElementById('quiz-img').src = q.img;
    imgContainer.classList.remove('hidden');
  } else {
    imgContainer.classList.add('hidden');
  }

  updateQuizButtons(uState);

  if (currentQuizType === "map") {
    showMapQuestion(q);
  } else {
    showNormalQuestion(q);
  }
}

// === 通常問題 ===
function showNormalQuestion(q) {
  document.getElementById('map-choice-group').classList.add('hidden');
  document.getElementById('map-feedback').classList.add('hidden');
  document.getElementById('btn-show-answer').classList.remove('hidden');
  document.getElementById('quiz-answer-group').classList.add('hidden');
  document.getElementById('quiz-note-box').classList.toggle('hidden', !q.note);
  document.getElementById('btn-next-question').classList.remove('hidden');
}

// === 白地図問題 ===
function showMapQuestion(q) {
  document.getElementById('btn-show-answer').classList.add('hidden');
  document.getElementById('quiz-answer-group').classList.add('hidden');
  document.getElementById('map-feedback').classList.add('hidden');
  document.getElementById('btn-next-question').classList.add('hidden');

  const container = document.getElementById('map-choice-group');
  container.innerHTML = "";
  container.classList.remove('hidden');

  const choices = [...new Set(currentMapAllQuestions.map(item => String(item.a).trim()).filter(Boolean))];
  choices.sort((a, b) => mapNumberValue(a) - mapNumberValue(b));

  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.type = "button";
    btn.className = "map-choice-btn";
    btn.innerText = choice;
    btn.addEventListener('click', () => answerMapQuestion(choice, btn));
    container.appendChild(btn);
  });
}

function mapNumberValue(value) {
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  const index = circled.indexOf(String(value).trim());
  if (index !== -1) return index + 1;
  const numeric = parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : 999;
}

function answerMapQuestion(selected, clickedButton) {
  const q = currentQuestions[currentIndex];
  const correctAnswer = String(q.a).trim();
  const isCorrect = selected === correctAnswer;

  const buttons = document.querySelectorAll('.map-choice-btn');
  buttons.forEach(btn => {
    btn.disabled = true;
    if (btn.innerText.trim() === correctAnswer) {
      btn.classList.add('correct');
    }
  });

  if (!isCorrect) {
    clickedButton.classList.add('wrong');
  }

  currentMapResults.push({ id: q.id, selected, correct: isCorrect });

  if (!userData[q.id]) {
    userData[q.id] = { status: 'unseen', favorite: false };
  }
  userData[q.id].status = isCorrect ? 'mastered' : 'weak';
  saveUserData();

  const feedback = document.getElementById('map-feedback');
  const title = document.getElementById('map-feedback-title');
  const note = document.getElementById('map-feedback-note');

  title.innerText = isCorrect ? "○ 正解" : `× 不正解 正解：${correctAnswer}`;
  note.innerText = q.note || "";

  feedback.classList.remove('hidden');
  document.getElementById('btn-next-question').classList.remove('hidden');
}

function showAnswer() {
  document.getElementById('btn-show-answer').classList.add('hidden');
  document.getElementById('quiz-answer-group').classList.remove('hidden');
}

// === 評価（覚えた/まだ）処理 & SRSレベル更新 ===
function evaluateCurrentQuestion(statusType) {
  const q = currentQuestions[currentIndex];
  if (!q) return;
  const qId = q.id;
  const today = getTodayString();

  if (!userData[qId]) {
    userData[qId] = { status: 'unseen', favorite: false, level: 0, nextDueDate: today, firstDate: today };
  } else if (!userData[qId].firstDate) {
    // 初めて解いた日を記録
    userData[qId].firstDate = today;
  }

  const currentLevel = userData[qId].level || 0;

  if (statusType === 'mastered') {
    const nextLevel = Math.min(currentLevel + 1, 4);
    userData[qId].level = nextLevel;
    userData[qId].status = 'mastered';

    const intervals = [1, 3, 7, 14];
    const daysToAdd = intervals[nextLevel - 1] || 1;
    userData[qId].nextDueDate = addDaysToString(today, daysToAdd);
  } else {
    userData[qId].level = 0;
    userData[qId].status = 'weak';
    userData[qId].nextDueDate = today;
  }

  saveUserData();

  if (typeof StudyTracker !== 'undefined' && StudyTracker.record) {
    StudyTracker.record(1);
  }

  nextQuestion();
}

// === お気に入り切り替え ===
function toggleFavoriteCurrent() {
  const qId = currentQuestions[currentIndex].id;
  if (!userData[qId]) {
    userData[qId] = { status: 'unseen', favorite: false, level: 0, nextDueDate: getTodayString() };
  }
  userData[qId].favorite = !userData[qId].favorite;
  saveUserData();
  updateQuizButtons(userData[qId]);
}

function updateQuizButtons(uState) {
  const favBtn = document.getElementById('btn-fav-toggle');
  if (favBtn) {
    favBtn.innerText = uState.favorite ? "★" : "☆";
    favBtn.style.color = uState.favorite ? "var(--accent)" : "var(--muted)";
  }
}

// === 前へ戻る・次へ ===
function prevQuestion() {
  if (currentIndex > 0) {
    currentIndex--;
    showQuestion();
  }
}

function nextQuestion() {
  currentIndex++;
  if (currentIndex >= currentQuestions.length) {
    if (currentQuizType === "map") {
      showMapResult();
    } else {
      alert("クイズ終了です！お疲れ様でした。");
      showScreen('screen-home');
    }
    return;
  }
  showQuestion();
}

// === 白地図完成図結果 ===
function showMapResult() {
  const correctCount = currentMapResults.filter(r => r.correct).length;
  document.getElementById('map-result-score').innerText = `${correctCount} / ${currentMapResults.length} 正解`;

  const resultImgContainer = document.getElementById('map-result-img-container');
  const mapImageQuestion = currentMapAllQuestions.find(q => q.img && q.img.trim() !== "");

  if (mapImageQuestion) {
    document.getElementById('map-result-img').src = mapImageQuestion.img;
    resultImgContainer.classList.remove('hidden');
  } else {
    resultImgContainer.classList.add('hidden');
  }

  const resultMap = {};
  currentMapResults.forEach(r => { resultMap[r.id] = r; });

  const list = document.getElementById('map-result-list');
  list.innerHTML = "";

  const sorted = [...currentMapAllQuestions].sort((a, b) => mapNumberValue(a.a) - mapNumberValue(b.a));

  sorted.forEach(q => {
    const row = document.createElement('div');
    row.className = "map-result-row";
    const result = resultMap[q.id];

    if (result) {
      row.classList.add(result.correct ? "is-correct" : "is-wrong");
    }

    const number = document.createElement('span');
    number.className = "map-result-number";
    number.innerText = q.a;

    const name = document.createElement('span');
    name.className = "map-result-name";
    name.innerText = getMapName(q.q);

    const mark = document.createElement('span');
    mark.className = "map-result-mark";
    mark.innerText = result ? (result.correct ? "○" : "×") : "";

    row.appendChild(number);
    row.appendChild(name);
    row.appendChild(mark);
    list.appendChild(row);
  });

  showScreen('screen-map-result');
}

function getMapName(question) {
  return String(question)
    .replace(/は何番(?:ですか)?[？?]?$/, "")
    .replace(/を選んでください[。．]?$/, "")
    .trim();
}

function restartMapQuiz() {
  initQuiz([...currentMapAllQuestions], currentQuizLabel, "map", [...currentMapAllQuestions]);
}

// === 用語検索 ===
function filterDictionary() {
  const keyword = document.getElementById('search-input').value.toLowerCase();
  const resultsContainer = document.getElementById('search-results');
  resultsContainer.innerHTML = "";
  if (!keyword) return;

  let allList = [];
  Object.values(rawData).forEach(arr => {
    if (Array.isArray(arr)) allList.push(...arr);
  });

  const filtered = allList.filter(item => {
    const q = String(item.q || "").toLowerCase();
    const a = String(item.a || "").toLowerCase();
    const note = String(item.note || "").toLowerCase();
    return q.includes(keyword) || a.includes(keyword) || note.includes(keyword);
  });

  filtered.slice(0, 30).forEach(item => {
    const div = document.createElement('div');
    div.className = 'search-item';
    div.innerHTML = `<strong>Q. ${item.q}</strong><br><span style="color:var(--primary); font-weight:800;">A. ${item.a}</span><br><small>${item.note || ""}</small>`;
    resultsContainer.appendChild(div);
  });
}

// === 統計＆ホーム画面進捗更新 ===
function updateStats() {
  let allList = [];
  Object.values(rawData).forEach(arr => {
    if (Array.isArray(arr)) allList.push(...arr);
  });

  let masteredCount = 0;
  let weakCount = 0;

  allList.forEach(q => {
    const st = userData[q.id]?.status;
    if (st === 'mastered') masteredCount++;
    if (st === 'weak') weakCount++;
  });

  document.getElementById('stat-total').innerText = allList.length;
  document.getElementById('stat-mastered').innerText = masteredCount;
  document.getElementById('stat-weak').innerText = weakCount;
}

function updateHomeProgress() {
  const genres = ["ワイン総論", "国・地方別", "ブドウ品種", "ワインタイプ", "ペアリング", "その他酒類", "法律", "白地図学習"];

  genres.forEach(g => {
    const list = rawData[g] || [];
    // Lv.1 以上（1回以上正解）を達成判定
    const mastered = list.filter(q => (userData[q.id]?.level || 0) >= 1 || userData[q.id]?.status === 'mastered').length;
    const total = list.length;
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

    const barEl = document.getElementById(`prog-${g}`);
    const textEl = document.getElementById(`prog-text-${g}`);

    if (barEl) barEl.style.width = `${pct}%`;
    if (textEl) textEl.innerText = `${mastered}/${total}問 (${pct}%)`;
  });

  updateSrsCardUI();
}

function resetUserData(type) {
  if (!confirm("本当にリセットしますか？")) return;

  Object.keys(userData).forEach(id => {
    if (type === 'mastered' && userData[id].status === 'mastered') {
      userData[id].status = 'unseen';
      userData[id].level = 0;
    }
    if (type === 'weak' && userData[id].status === 'weak') {
      userData[id].status = 'unseen';
      userData[id].level = 0;
    }
  });

  saveUserData();
  alert("リセット完了しました。");
}

// === お気に入り一覧画面の表示 ===
function showFavoriteListScreen() {
  const container = document.getElementById('favorite-list');
  const countEl = document.getElementById('favorite-list-count');
  container.innerHTML = "";

  let favList = [];
  Object.values(rawData).forEach(arr => {
    if (Array.isArray(arr)) {
      arr.forEach(q => {
        if (userData[q.id]?.favorite === true) {
          favList.push(q);
        }
      });
    }
  });

  if (countEl) countEl.innerText = `${favList.length}件登録中`;

  if (favList.length === 0) {
    container.innerHTML = `
      <div class="quiz-card" style="text-align:center; padding:30px 16px; color:var(--muted); font-size:13px;">
        お気に入りに登録された問題はありません。
      </div>
    `;
    showScreen('screen-favorite');
    return;
  }

  favList.forEach(q => {
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.style.margin = "0";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span class="badge">${q.subCat || '暗記項目'}</span>
        <button class="btn btn-glass" style="min-height:30px; padding:2px 10px; font-size:12px; color:var(--accent);" onclick="removeFavoriteFromList('${q.id}')">★ 解除</button>
      </div>
      <p class="q-text" style="margin-bottom:12px; font-size:16px;">${q.q}</p>
      <div class="a-box" style="margin:8px 0 0;">
        <span class="label">正解</span>
        <p class="a-text" style="font-size:16px;">${q.a}</p>
      </div>
      ${q.note ? `
        <div class="note-box" style="margin-top:8px; margin-bottom:0;">
          <span class="label">解説</span>
          <p class="note-text">${q.note}</p>
        </div>
      ` : ''}
    `;
    container.appendChild(card);
  });

  showScreen('screen-favorite');
}

function removeFavoriteFromList(qId) {
  if (userData[qId]) {
    userData[qId].favorite = false;
    saveUserData();
    showFavoriteListScreen();
  }
}

// === 日付計算補助（JST対応） ===
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const resY = date.getFullYear();
  const resM = String(date.getMonth() + 1).padStart(2, '0');
  const resD = String(date.getDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

// === バッジHTML生成 ===
function getLevelBadgeHTML(level = 0) {
  if (level === 1) return `<span class="srs-badge lvl-1">✓</span>`;
  if (level === 2) return `<span class="srs-badge lvl-2">✓✓</span>`;
  if (level === 3) return `<span class="srs-badge lvl-3">✓✓✓</span>`;
  if (level >= 4) return `<span class="srs-badge lvl-4">👑 Grand Cru</span>`;
  return `<span class="srs-badge lvl-0">未習得</span>`;
}

// 配列を偏りなくランダムにシャッフルする関数（Fisher-Yates）
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// === 本日のAI学習キュー生成（設定値反映版） ===
function getDailySrsQueue() {
  const today = getTodayString();
  let dueList = [];
  let newList = [];

  // localStorageから設定値を読み込み（設定がなければデフォルト値）
  const srsNew = parseInt(localStorage.getItem("sommelier_srs_new"), 10) || 20;
  const srsMaxTotal = parseInt(localStorage.getItem("sommelier_srs_max_total"), 10) || 100;

  const todayNewCount = Object.values(userData).filter(u => u.firstDate === today).length;
  const remainingNewLimit = Math.max(0, srsNew - todayNewCount);

  Object.entries(rawData)
    .filter(([sheetName]) => !["白地図学習", "仕分け問題", "並び替え問題"].includes(sheetName))
    .forEach(([, arr]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(q => {
        const u = userData[q.id];
        if (!u || u.status === 'unseen') {
          newList.push(q);
        } else if (u.nextDueDate <= today) {
          dueList.push(q);
        }
      });
    });

  // 未回答問題から設定した新規上限数分をランダム抽出
  shuffleArray(newList);
  const pickedNewQuestions = newList.slice(0, remainingNewLimit);

  // 復習＋新規を合体してシャッフル
  let queue = shuffleArray([...dueList, ...pickedNewQuestions]);

  // 設定された「合計最大出題数」で上限を切る
  if (queue.length > srsMaxTotal) {
    queue = queue.slice(0, srsMaxTotal);
  }

  return queue;
}

// === メイン復習カードのUI更新 ===
function updateSrsCardUI() {
  const queue = getDailySrsQueue();
  const btn = document.getElementById('btn-srs-main');

  if (!btn) return;

  if (queue.length === 0) {
    btn.disabled = true;
    btn.innerHTML = `本日の学習完了！🎉`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `学習を開始する (${queue.length}問)`;
  }
}

// === AI出題設定モーダルの制御（整理版） ===
function loadSrsSettings() {
  const elNew = document.getElementById("setting-srs-new");
  const elMin = document.getElementById("setting-srs-min-new");
  const elMax = document.getElementById("setting-srs-max-total");

  if (elNew) elNew.value = localStorage.getItem("sommelier_srs_new") || 20;
  if (elMin) elMin.value = localStorage.getItem("sommelier_srs_min_new") || 10;
  if (elMax) elMax.value = localStorage.getItem("sommelier_srs_max_total") || 100;
}

function validateSrsInputs() {
  const elNew = document.getElementById("setting-srs-new");
  const elMin = document.getElementById("setting-srs-min-new");
  if (!elNew || !elMin) return;

  const valNew = parseInt(elNew.value, 10) || 0;
  const valMin = parseInt(elMin.value, 10) || 0;

  elMin.max = valNew;
  if (valMin > valNew) {
    elMin.value = valNew;
  }
}

function openSrsModal() {
  loadSrsSettings();
  validateSrsInputs();
  document.getElementById("modal-srs").classList.remove("hidden");
}

function closeSrsModal(shouldSave = false) {
  if (shouldSave) {
    saveSrsSettings();
  }
  document.getElementById("modal-srs").classList.add("hidden");
}

function saveSrsSettings() {
  const elNew = document.getElementById("setting-srs-new");
  const elMin = document.getElementById("setting-srs-min-new");
  const elMax = document.getElementById("setting-srs-max-total");
  if (!elNew || !elMin || !elMax) return;

  validateSrsInputs();

  localStorage.setItem("sommelier_srs_new", elNew.value);
  localStorage.setItem("sommelier_srs_min_new", elMin.value);
  localStorage.setItem("sommelier_srs_max_total", elMax.value);
}

// === ヘルプモーダルの制御 ===
function openHelpModal() {
  const el = document.getElementById("modal-help");
  if (el) el.classList.remove("hidden");
}

function closeHelpModal() {
  const el = document.getElementById("modal-help");
  if (el) el.classList.add("hidden");
}