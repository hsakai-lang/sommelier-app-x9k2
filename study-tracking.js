const StudyTracker = (() => {

  const LOG_KEY = "sommelier_study_log";
  const GOAL_KEY = "sommelier_daily_goal";


  function getDateKey(date = new Date()) {

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
  }


  function shiftDate(dateKey, days) {

    const [y, m, d] =
      dateKey.split("-").map(Number);

    const date =
      new Date(y, m - 1, d);

    date.setDate(
      date.getDate() + days
    );

    return getDateKey(date);
  }


  function getLog() {

    try {

      return JSON.parse(
        localStorage.getItem(LOG_KEY)
      ) || {};

    } catch {

      return {};

    }
  }


  function saveLog(log) {

    localStorage.setItem(
      LOG_KEY,
      JSON.stringify(log)
    );
  }


  function getGoal() {

    const value =
      parseInt(
        localStorage.getItem(GOAL_KEY),
        10
      );

    return Number.isFinite(value) && value >= 1
      ? value
      : 10;
  }


  function setGoal(value) {

    let goal =
      parseInt(value, 10);

    if (!Number.isFinite(goal)) {
      goal = 10;
    }

    goal =
      Math.min(
        999,
        Math.max(1, goal)
      );

    localStorage.setItem(
      GOAL_KEY,
      String(goal)
    );


    // 今日まだ未達成なら新しい目標を反映
    const log =
      getLog();

    const today =
      getDateKey();

    if (log[today]) {

      log[today].goal =
        goal;

      if (
        log[today].count >= goal
      ) {
        log[today].achieved = true;
      }

      saveLog(log);
    }


    render();

    return goal;
  }


  function record(count = 1) {

    count =
      parseInt(count, 10);

    if (
      !Number.isFinite(count) ||
      count < 1
    ) {
      return;
    }


    const log =
      getLog();

    const today =
      getDateKey();

    const goal =
      getGoal();


    if (!log[today]) {

      log[today] = {
        count: 0,
        goal: goal,
        achieved: false
      };

    }


    log[today].count +=
      count;

    log[today].goal =
      goal;


    if (
      log[today].count >= goal
    ) {
      log[today].achieved = true;
    }


    saveLog(log);

    render();
  }


  function getStats() {

    const log =
      getLog();

    const today =
      getDateKey();

    const goal =
      getGoal();

    const todayData =
      log[today] || {
        count: 0,
        achieved: false
      };


    const achievedDays =
      Object.keys(log)
        .filter(
          key => log[key]?.achieved
        );


    // 今日が未達成でも、
    // 昨日まで連続達成ならその記録を表示
    let cursor =
      todayData.achieved
        ? today
        : shiftDate(today, -1);

    let streak = 0;


    while (
      log[cursor]?.achieved
    ) {

      streak++;

      cursor =
        shiftDate(
          cursor,
          -1
        );
    }


    return {
      count: todayData.count || 0,
      goal,
      achieved: !!todayData.achieved,
      streak,
      totalDays: achievedDays.length
    };
  }


  function render() {

    const stats =
      getStats();


    const countEl =
      document.getElementById(
        "today-study-count"
      );

    const goalEl =
      document.getElementById(
        "today-study-goal"
      );

    const progressEl =
      document.getElementById(
        "today-study-progress"
      );

    const streakEl =
      document.getElementById(
        "study-streak"
      );

    const totalEl =
      document.getElementById(
        "study-total-days"
      );

    const goalInput =
      document.getElementById(
        "setting-daily-goal"
      );


    if (countEl) {
      countEl.textContent =
        stats.count;
    }


    if (goalEl) {
      goalEl.textContent =
        stats.goal;
    }


    if (progressEl) {

      const percentage =
        Math.min(
          100,
          (stats.count / stats.goal) * 100
        );

      progressEl.style.width =
        `${percentage}%`;
    }


    if (streakEl) {
      streakEl.textContent =
        stats.streak;
    }


    if (totalEl) {
      totalEl.textContent =
        stats.totalDays;
    }


    if (goalInput) {
      goalInput.value =
        stats.goal;
    }

  }


  function saveGoalFromInput() {

    const input =
      document.getElementById(
        "setting-daily-goal"
      );

    if (!input) return;

    input.value =
      setGoal(input.value);
  }


  window.addEventListener(
    "load",
    render
  );


  return {
    record,
    render,
    getStats,
    getGoal,
    setGoal,
    saveGoalFromInput
  };

})();