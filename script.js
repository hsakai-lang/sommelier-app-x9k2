// === 設定: GASのウェブアプリURLをここに書き換えてください ===
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyJ3xJCkhakLUI_8mCsA6MPVrMXKTKuxIMSctkaJpnOmKFJ_ogq4hycm-3rtCcPMDBEKw/exec";

// === グローバル状態管理 ===
let rawData = {};          // GASから取得した問題データ
let userData = {};         // LocalStorageのユーザー状態 { [id]: { status: 'unseen'|'mastered'|'weak', favorite: boolean } }
let currentQuestions = []; // 現在実行中の問題リスト
let currentIndex = 0;
let currentGenre = "";

// === 初期化 ===
window.onload = () => {
  loadUserData();
  loadCachedQuestions();
  updateStats();
};

function showScreen(screenId) {
  document.querySelectorAll('.container').forEach(el => el.classList.add('hidden'));
  document.getElementById(screenId).classList.remove('hidden');
}

// === データ読み込み & 同期 ===
function loadUserData() {
  userData = JSON.parse(localStorage.getItem('sommelier_user_data')) || {};
}

function saveUserData() {
  localStorage.setItem('sommelier_user_data', JSON.stringify(userData));
  updateStats();
}

function loadCachedQuestions() {
  const cached = localStorage.getItem('sommelier_quiz_data');
  if (cached) {
    rawData = JSON.parse(cached);
  }
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
  } catch (err) {
    alert("データの取得に失敗しました。");
  }
}

// === ジャンル・サブカテゴリ選択（タブ名マッピング補正版） ===
function selectGenre(genreName) {
  // HTML側の引数をスプレッドシートのタブ名に変換
  const genreMap = {
    "ワイン総論": "ワイン総論",
    "国・地方別": "国・地方別",
    "ブドウ品種": "ブドウ品種",
    "ワインタイプ": "ワインタイプ",
    "ペアリング": "ペアリング",
    "その他酒類": "その他酒類",
    "法律": "法律"
  };

  const targetTabName = genreMap[genreName] || genreName;
  currentGenre = targetTabName;
  const genreData = rawData[targetTabName] || [];
  
  if (genreData.length === 0) {
    alert("このカテゴリには問題が登録されていません。設定画面からデータを同期してください。");
    return;
  }

  // ユニークなサブカテゴリ一覧を取得
  const subCats = ["すべて", ...new Set(genreData.map(d => d.subCat).filter(Boolean))];
  
  const container = document.getElementById('subcat-list');
  container.innerHTML = "";
  
  subCats.forEach(sub => {
    const btn = document.createElement('button');
    btn.className = "btn btn-glass"; // デザインに合わせたボタンクラス
    btn.innerText = sub;
    btn.onclick = () => startGenreQuiz(targetTabName, sub);
    container.appendChild(btn);
  });

  document.getElementById('subcat-title').innerText = `${genreName} - サブカテゴリ`;
  showScreen('screen-subcat');
}

// === クイズ開始ロジック ===
function startGenreQuiz(genre, subCat) {
  let list = rawData[genre] || [];
  
  if (subCat !== "すべて") {
    list = list.filter(d => d.subCat === subCat);
  }

  // 設定フィルタ（未習得のみ）
  const targetPref = document.getElementById('setting-target').value;
  if (targetPref === 'unmastered') {
    list = list.filter(q => (userData[q.id]?.status || 'unseen') !== 'mastered');
  }

  initQuiz(list, `${genre} (${subCat})`);
}

function startSpecialQuiz(mode) {
  let list = [];
  let title = "";

  // 全シートのデータを結合
  Object.values(rawData).forEach(arr => list.push(...arr));

  if (mode === 'favorite') {
    list = list.filter(q => userData[q.id]?.favorite === true);
    title = "⭐ お気に入り復習";
  } else if (mode === 'weak') {
    list = list.filter(q => userData[q.id]?.status === 'weak');
    title = "🚨 弱点克服";
  } else {
    title = "一問一答（全範囲）";
  }

  if (list.length === 0) {
    alert("対象の問題がありません。");
    return;
  }

  initQuiz(list, title);
}

function initQuiz(list, label) {
  currentQuestions = [...list];
  
  // 設定（順序）
  const orderPref = document.getElementById('setting-order').value;
  if (orderPref === 'random') {
    currentQuestions.sort(() => Math.random() - 0.5);
  }

  // 設定（出題数）
  const countPref = document.getElementById('setting-count').value;
  if (countPref !== 'all') {
    currentQuestions = currentQuestions.slice(0, parseInt(countPref));
  }

  currentIndex = 0;
  document.getElementById('quiz-cat-label').innerText = label;
  showQuestion();
  showScreen('screen-quiz');
}

// === クイズ表示・操作 ===
function showQuestion() {
  const q = currentQuestions[currentIndex];
  const uState = userData[q.id] || { status: 'unseen', favorite: false };

  document.getElementById('quiz-counter').innerText = `${currentIndex + 1} / ${currentQuestions.length}`;
  document.getElementById('quiz-question').innerText = q.q;
  document.getElementById('quiz-answer').innerText = q.a;
  document.getElementById('quiz-note').innerText = q.note || "";

  // 画像の制御
  const imgContainer = document.getElementById('quiz-img-container');
  if (q.img && q.img.trim() !== "") {
    document.getElementById('quiz-img').src = q.img;
    imgContainer.classList.remove('hidden');
  } else {
    imgContainer.classList.add('hidden');
  }

  // 回答表示の初期化
  document.getElementById('btn-show-answer').classList.remove('hidden');
  document.getElementById('quiz-answer-group').classList.add('hidden');
  document.getElementById('quiz-note-box').classList.toggle('hidden', !q.note);

  updateQuizButtons(uState);
}

function showAnswer() {
  document.getElementById('btn-show-answer').classList.add('hidden');
  document.getElementById('quiz-answer-group').classList.remove('hidden');
}

function evaluateCurrentQuestion(statusType) {
  const qId = currentQuestions[currentIndex].id;
  if (!userData[qId]) userData[qId] = { status: 'unseen', favorite: false };
  
  userData[qId].status = statusType;
  saveUserData();
  nextQuestion();
}

function toggleFavoriteCurrent() {
  const qId = currentQuestions[currentIndex].id;
  if (!userData[qId]) userData[qId] = { status: 'unseen', favorite: false };
  
  userData[qId].favorite = !userData[qId].favorite;
  saveUserData();
  updateQuizButtons(userData[qId]);
}

function updateQuizButtons(uState) {
  const favBtn = document.getElementById('btn-fav-toggle');
  favBtn.innerText = uState.favorite ? "★ お気に入り中" : "⭐ お気に入り";
  favBtn.style.background = uState.favorite ? "#e67e22" : "#95a5a6";
}

function nextQuestion() {
  currentIndex++;
  if (currentIndex >= currentQuestions.length) {
    alert("クイズ終了です！お疲れ様でした。");
    showScreen('screen-home');
  } else {
    showQuestion();
  }
}

// === 用語検索 ===
function filterDictionary() {
  const keyword = document.getElementById('search-input').value.toLowerCase();
  const resultsContainer = document.getElementById('search-results');
  resultsContainer.innerHTML = "";

  if (!keyword) return;

  let allList = [];
  Object.values(rawData).forEach(arr => allList.push(...arr));

  const filtered = allList.filter(item => 
    item.q.toLowerCase().includes(keyword) || 
    item.a.toLowerCase().includes(keyword) || 
    item.note.toLowerCase().includes(keyword)
  );

  filtered.slice(0, 30).forEach(item => {
    const div = document.createElement('div');
    div.className = 'search-item';
    div.innerHTML = `<strong>Q. ${item.q}</strong><br><span style="color:#c0392b;">A. ${item.a}</span><br><small>${item.note}</small>`;
    resultsContainer.appendChild(div);
  });
}

// === 設定＆統計 ===
function updateStats() {
  let allList = [];
  Object.values(rawData).forEach(arr => allList.push(...arr));

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

function resetUserData(type) {
  if (!confirm("本当にリセットしますか？")) return;
  
  Object.keys(userData).forEach(id => {
    if (type === 'mastered' && userData[id].status === 'mastered') {
      userData[id].status = 'unseen';
    }
    if (type === 'weak' && userData[id].status === 'weak') {
      userData[id].status = 'unseen';
    }
  });

  saveUserData();
  alert("リセット完了しました。");
}