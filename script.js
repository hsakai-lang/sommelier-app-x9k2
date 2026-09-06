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
};


function showScreen(screenId) {
  document.querySelectorAll('.container').forEach(el => {
    el.classList.add('hidden');
  });

  document.getElementById(screenId).classList.remove('hidden');
}


// === データ読み込み ===

function loadUserData() {
  userData = JSON.parse(
    localStorage.getItem('sommelier_user_data')
  ) || {};
}


function saveUserData() {
  localStorage.setItem(
    'sommelier_user_data',
    JSON.stringify(userData)
  );

  updateStats();
}


function loadCachedQuestions() {
  const cached = localStorage.getItem('sommelier_quiz_data');

  if (cached) {
    rawData = JSON.parse(cached);
  }
}

function loadDailyGoal() {

  const savedGoal =
    localStorage.getItem(
      "sommelier_daily_goal"
    );

  const input =
    document.getElementById(
      "setting-daily-goal"
    );

  if (!input) return;

  input.value =
    savedGoal || 10;
}


function saveDailyGoal() {

  const input =
    document.getElementById(
      "setting-daily-goal"
    );

  if (!input) return;

  let value =
    parseInt(input.value, 10);

  if (
    !Number.isFinite(value) ||
    value < 1
  ) {
    value = 1;
  }

  if (value > 999) {
    value = 999;
  }

  input.value = value;

  localStorage.setItem(
    "sommelier_daily_goal",
    String(value)
  );
}


async function fetchDataFromGAS() {

  if (GAS_API_URL.includes("YOUR_EXEC_URL")) {
    alert("script.js の GAS_API_URL を書き換えてください。");
    return;
  }

  try {

    const res = await fetch(GAS_API_URL);

    rawData = await res.json();

    localStorage.setItem(
      'sommelier_quiz_data',
      JSON.stringify(rawData)
    );

    alert("最新データの同期が完了しました！");

    updateStats();

  } catch (err) {

    console.error(err);

    alert("データの取得に失敗しました。");
  }
}


// === ジャンル選択 ===

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

  const targetTabName =
    genreMap[genreName] || genreName;

  currentGenre = targetTabName;

  const genreData =
    rawData[targetTabName] || [];


  if (genreData.length === 0) {

    alert(
      "このカテゴリには問題が登録されていません。設定画面からデータを同期してください。"
    );

    return;
  }


  const uniqueSubCats = [
    ...new Set(
      genreData
        .map(d => d.subCat)
        .filter(Boolean)
    )
  ];


  // 白地図学習だけは「すべて」を表示しない
  const subCats =
    targetTabName === "白地図学習"
      ? uniqueSubCats
      : ["すべて", ...uniqueSubCats];


  const container =
    document.getElementById('subcat-list');

  container.innerHTML = "";


  subCats.forEach(sub => {

    const btn =
      document.createElement('button');

    btn.className = "btn btn-glass";


    // MAPだけ表示名を少し分かりやすくする
    if (
      targetTabName === "白地図学習" &&
      sub === "MAP"
    ) {

      btn.innerText = "MAPを見る";

    } else {

      btn.innerText = sub;

    }


    btn.onclick = () => {

      // MAPを押したときだけ完成図ページへ
      if (
        targetTabName === "白地図学習" &&
        sub === "MAP"
      ) {

        location.href = "map.html";
        return;
      }


      // その他は今まで通りクイズ
      startGenreQuiz(
        targetTabName,
        sub
      );

    };


    container.appendChild(btn);

  });


  document.getElementById(
    'subcat-title'
  ).innerText =
    `${genreName} - サブカテゴリ`;


  showScreen('screen-subcat');
}

// === クイズ開始 ===

function startGenreQuiz(genre, subCat) {

  let list =
    rawData[genre] || [];


  if (subCat !== "すべて") {

    list = list.filter(
      d => d.subCat === subCat
    );
  }


  // 白地図では完成図表示用に
  // フィルタ前の全問題を保存
  const fullMapList =
    genre === "白地図学習"
      ? [...list]
      : [];


  const targetPref =
    document.getElementById(
      'setting-target'
    ).value;


  if (targetPref === 'unmastered') {

    list = list.filter(q =>
      (userData[q.id]?.status || 'unseen')
      !== 'mastered'
    );
  }


  if (list.length === 0) {

    alert("対象の問題がありません。");

    return;
  }


  const type =
    genre === "白地図学習"
      ? "map"
      : "normal";


  initQuiz(
    list,
    `${genre} (${subCat})`,
    type,
    fullMapList
  );
}


// === 通常のランダム・弱点復習 ===

function startSpecialQuiz(mode) {

  let list = [];
  let title = "";


  Object.entries(rawData)
    .filter(([sheetName]) =>
      sheetName !== "白地図学習"
    )
    .forEach(([, arr]) => {

      if (Array.isArray(arr)) {
        list.push(...arr);
      }

    });


  if (mode === 'favorite') {

    list = list.filter(q =>
      userData[q.id]?.favorite === true
    );

    title = "⭐ お気に入り復習";

  } else if (mode === 'weak') {

    list = list.filter(q =>
      userData[q.id]?.status === 'weak'
    );

    title = "🚨 弱点克服";

  } else {

    title = "一問一答（全範囲）";
  }


  if (list.length === 0) {

    alert("対象の問題がありません。");

    return;
  }


  initQuiz(
    list,
    title,
    "normal",
    []
  );
}


// === クイズ初期化 ===

function initQuiz(
  list,
  label,
  quizType = "normal",
  mapAllQuestions = []
) {

  currentQuizType = quizType;
  currentQuizLabel = label;

  currentQuestions = [...list];

  currentMapResults = [];

  currentMapAllQuestions =
    quizType === "map"
      ? [...mapAllQuestions]
      : [];


  const orderPref =
    document.getElementById(
      'setting-order'
    ).value;


  if (orderPref === 'random') {

    currentQuestions.sort(
      () => Math.random() - 0.5
    );
  }


  const countPref =
    document.getElementById(
      'setting-count'
    ).value;


  if (countPref !== 'all') {

    currentQuestions =
      currentQuestions.slice(
        0,
        parseInt(countPref, 10)
      );
  }


  currentIndex = 0;


  document.getElementById(
    'quiz-cat-label'
  ).innerText = label;


  showQuestion();

  showScreen('screen-quiz');
}


// === 問題表示 ===

function showQuestion() {

  const q =
    currentQuestions[currentIndex];


  if (!q) return;


  const uState =
    userData[q.id] || {
      status: 'unseen',
      favorite: false
    };


  document.getElementById(
    'quiz-counter'
  ).innerText =
    `${currentIndex + 1} / ${currentQuestions.length}`;


  document.getElementById(
    'quiz-progress-bar'
  ).style.width =
    `${((currentIndex + 1) / currentQuestions.length) * 100}%`;


  document.getElementById(
    'quiz-question'
  ).innerText = q.q;


  document.getElementById(
    'quiz-answer'
  ).innerText = q.a;


  document.getElementById(
    'quiz-note'
  ).innerText = q.note || "";


  // 画像
  const imgContainer =
    document.getElementById(
      'quiz-img-container'
    );


  if (q.img && q.img.trim() !== "") {

    document.getElementById(
      'quiz-img'
    ).src = q.img;

    imgContainer.classList.remove(
      'hidden'
    );

  } else {

    imgContainer.classList.add(
      'hidden'
    );
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

  document.getElementById(
    'map-choice-group'
  ).classList.add('hidden');


  document.getElementById(
    'map-feedback'
  ).classList.add('hidden');


  document.getElementById(
    'btn-show-answer'
  ).classList.remove('hidden');


  document.getElementById(
    'quiz-answer-group'
  ).classList.add('hidden');


  document.getElementById(
    'quiz-note-box'
  ).classList.toggle(
    'hidden',
    !q.note
  );


  document.getElementById(
    'btn-next-question'
  ).classList.remove('hidden');
}


// === 白地図問題 ===

function showMapQuestion(q) {

  document.getElementById(
    'btn-show-answer'
  ).classList.add('hidden');


  document.getElementById(
    'quiz-answer-group'
  ).classList.add('hidden');


  document.getElementById(
    'map-feedback'
  ).classList.add('hidden');


  document.getElementById(
    'btn-next-question'
  ).classList.add('hidden');


  const container =
    document.getElementById(
      'map-choice-group'
    );


  container.innerHTML = "";

  container.classList.remove(
    'hidden'
  );


  const choices = [
    ...new Set(
      currentMapAllQuestions
        .map(item => String(item.a).trim())
        .filter(Boolean)
    )
  ];


  choices.sort(
    (a, b) =>
      mapNumberValue(a) -
      mapNumberValue(b)
  );


  choices.forEach(choice => {

    const btn =
      document.createElement('button');

    btn.type = "button";

    btn.className =
      "map-choice-btn";

    btn.innerText = choice;

    btn.addEventListener(
      'click',
      () => answerMapQuestion(
        choice,
        btn
      )
    );

    container.appendChild(btn);
  });
}


// === 番号の並び順 ===

function mapNumberValue(value) {

  const circled =
    "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

  const index =
    circled.indexOf(
      String(value).trim()
    );


  if (index !== -1) {
    return index + 1;
  }


  const numeric =
    parseInt(value, 10);


  return Number.isFinite(numeric)
    ? numeric
    : 999;
}


// === 白地図回答 ===

function answerMapQuestion(
  selected,
  clickedButton
) {

  const q =
    currentQuestions[currentIndex];


  const correctAnswer =
    String(q.a).trim();


  const isCorrect =
    selected === correctAnswer;


  const buttons =
    document.querySelectorAll(
      '.map-choice-btn'
    );


  buttons.forEach(btn => {

    btn.disabled = true;


    if (
      btn.innerText.trim()
      === correctAnswer
    ) {

      btn.classList.add(
        'correct'
      );
    }

  });


  if (!isCorrect) {

    clickedButton.classList.add(
      'wrong'
    );
  }


  currentMapResults.push({
    id: q.id,
    selected,
    correct: isCorrect
  });


  if (!userData[q.id]) {

    userData[q.id] = {
      status: 'unseen',
      favorite: false
    };
  }


  userData[q.id].status =
    isCorrect
      ? 'mastered'
      : 'weak';


  saveUserData();


  const feedback =
    document.getElementById(
      'map-feedback'
    );


  const title =
    document.getElementById(
      'map-feedback-title'
    );


  const note =
    document.getElementById(
      'map-feedback-note'
    );


  if (isCorrect) {

    title.innerText =
      "○ 正解";

  } else {

    title.innerText =
      `× 不正解　正解：${correctAnswer}`;
  }


  note.innerText =
    q.note || "";


  feedback.classList.remove(
    'hidden'
  );


  document.getElementById(
    'btn-next-question'
  ).classList.remove('hidden');
}


// === 通常問題回答 ===

function showAnswer() {

  document.getElementById(
    'btn-show-answer'
  ).classList.add('hidden');


  document.getElementById(
    'quiz-answer-group'
  ).classList.remove('hidden');
}


function evaluateCurrentQuestion(statusType) {

  const qId =
    currentQuestions[currentIndex].id;


  if (!userData[qId]) {

    userData[qId] = {
      status: 'unseen',
      favorite: false
    };
  }


  userData[qId].status =
    statusType;


  saveUserData();

  StudyTracker.record(1);

  nextQuestion();
}


// === お気に入り ===

function toggleFavoriteCurrent() {

  const qId =
    currentQuestions[currentIndex].id;


  if (!userData[qId]) {

    userData[qId] = {
      status: 'unseen',
      favorite: false
    };
  }


  userData[qId].favorite =
    !userData[qId].favorite;


  saveUserData();

  updateQuizButtons(
    userData[qId]
  );
}


function updateQuizButtons(uState) {

  const favBtn =
    document.getElementById(
      'btn-fav-toggle'
    );


  favBtn.innerText =
    uState.favorite
      ? "★ お気に入り中"
      : "☆ お気に入り";


  favBtn.style.background =
    uState.favorite
      ? "#F7F1E6"
      : "";
}


// === 次の問題 ===

function nextQuestion() {

  currentIndex++;


  if (
    currentIndex >=
    currentQuestions.length
  ) {

    if (
      currentQuizType === "map"
    ) {

      showMapResult();

    } else {

      alert(
        "クイズ終了です！お疲れ様でした。"
      );

      showScreen(
        'screen-home'
      );
    }

    return;
  }


  showQuestion();
}


// === 白地図完成図 ===

function showMapResult() {

  const correctCount =
    currentMapResults.filter(
      r => r.correct
    ).length;


  document.getElementById(
    'map-result-score'
  ).innerText =
    `${correctCount} / ${currentMapResults.length} 正解`;


  const resultImgContainer =
    document.getElementById(
      'map-result-img-container'
    );


  const mapImageQuestion =
    currentMapAllQuestions.find(
      q =>
        q.img &&
        q.img.trim() !== ""
    );


  if (mapImageQuestion) {

    document.getElementById(
      'map-result-img'
    ).src =
      mapImageQuestion.img;


    resultImgContainer.classList.remove(
      'hidden'
    );

  } else {

    resultImgContainer.classList.add(
      'hidden'
    );
  }


  const resultMap = {};


  currentMapResults.forEach(r => {
    resultMap[r.id] = r;
  });


  const list =
    document.getElementById(
      'map-result-list'
    );


  list.innerHTML = "";


  const sorted =
    [...currentMapAllQuestions]
      .sort(
        (a, b) =>
          mapNumberValue(a.a) -
          mapNumberValue(b.a)
      );


  sorted.forEach(q => {

    const row =
      document.createElement('div');

    row.className =
      "map-result-row";


    const result =
      resultMap[q.id];


    if (result) {

      row.classList.add(
        result.correct
          ? "is-correct"
          : "is-wrong"
      );
    }


    const number =
      document.createElement('span');

    number.className =
      "map-result-number";

    number.innerText = q.a;


    const name =
      document.createElement('span');

    name.className =
      "map-result-name";

    name.innerText =
      getMapName(q.q);


    const mark =
      document.createElement('span');

    mark.className =
      "map-result-mark";


    if (result) {

      mark.innerText =
        result.correct
          ? "○"
          : "×";

    } else {

      mark.innerText = "";
    }


    row.appendChild(number);
    row.appendChild(name);
    row.appendChild(mark);

    list.appendChild(row);
  });


  showScreen(
    'screen-map-result'
  );
}


// === 問題文から地名を抜き出す ===

function getMapName(question) {

  return String(question)
    .replace(
      /は何番(?:ですか)?[？?]?$/,
      ""
    )
    .replace(
      /を選んでください[。．]?$/,
      ""
    )
    .trim();
}


// === 同じ白地図を再挑戦 ===

function restartMapQuiz() {

  initQuiz(
    [...currentMapAllQuestions],
    currentQuizLabel,
    "map",
    [...currentMapAllQuestions]
  );
}


// === 用語検索 ===

function filterDictionary() {

  const keyword =
    document.getElementById(
      'search-input'
    ).value.toLowerCase();


  const resultsContainer =
    document.getElementById(
      'search-results'
    );


  resultsContainer.innerHTML = "";


  if (!keyword) return;


  let allList = [];


  Object.values(rawData)
    .forEach(arr => {

      if (Array.isArray(arr)) {
        allList.push(...arr);
      }

    });


  const filtered =
    allList.filter(item => {

      const q =
        String(item.q || "")
          .toLowerCase();

      const a =
        String(item.a || "")
          .toLowerCase();

      const note =
        String(item.note || "")
          .toLowerCase();


      return (
        q.includes(keyword) ||
        a.includes(keyword) ||
        note.includes(keyword)
      );
    });


  filtered
    .slice(0, 30)
    .forEach(item => {

      const div =
        document.createElement(
          'div'
        );

      div.className =
        'search-item';


      div.innerHTML =
        `<strong>Q. ${item.q}</strong><br>` +
        `<span style="color:#c0392b;">A. ${item.a}</span><br>` +
        `<small>${item.note || ""}</small>`;


      resultsContainer.appendChild(
        div
      );
    });
}


// === 統計 ===

function updateStats() {

  let allList = [];


  Object.values(rawData)
    .forEach(arr => {

      if (Array.isArray(arr)) {
        allList.push(...arr);
      }

    });


  let masteredCount = 0;
  let weakCount = 0;


  allList.forEach(q => {

    const st =
      userData[q.id]?.status;


    if (st === 'mastered') {
      masteredCount++;
    }


    if (st === 'weak') {
      weakCount++;
    }
  });


  document.getElementById(
    'stat-total'
  ).innerText =
    allList.length;


  document.getElementById(
    'stat-mastered'
  ).innerText =
    masteredCount;


  document.getElementById(
    'stat-weak'
  ).innerText =
    weakCount;
}


// === リセット ===

function resetUserData(type) {

  if (
    !confirm(
      "本当にリセットしますか？"
    )
  ) {
    return;
  }


  Object.keys(userData)
    .forEach(id => {

      if (
        type === 'mastered' &&
        userData[id].status === 'mastered'
      ) {

        userData[id].status =
          'unseen';
      }


      if (
        type === 'weak' &&
        userData[id].status === 'weak'
      ) {

        userData[id].status =
          'unseen';
      }

    });


  saveUserData();

  alert(
    "リセット完了しました。"
  );
}