// All state lives in localStorage. No backend, no accounts, no tracking.
const STORAGE_KEY = "push_app_state_v1";

const CRAVE_QUOTES = [
  "The craving is temporary. The regret from breaking your streak lasts a lot longer than a donut tastes.",
  "You're not hungry. You're bored, stressed, or tired. Food won't fix any of those.",
  "In 20 minutes this craving will be gone whether you eat or not. Outlast it.",
  "Every time you say no, it gets easier. Every time you say yes, it gets harder. Pick your future.",
  "Nobody who ever regretted a workout. Plenty of people regret the binge.",
  "You didn't get here by accident, and you won't get out by accident either. This moment is the work.",
  "The version of you tomorrow morning is begging you to make this choice right now.",
  "This is the rep that counts. Not the gym rep — this one.",
];

const CRAVE_TIPS = [
  "Drink a full glass of water and wait 10 minutes. Thirst mimics hunger.",
  "Brush your teeth. Almost nothing tastes good right after.",
  "Go for a 5-minute walk — even just around the room. Change your environment, change your urge.",
  "Have a big glass of water or black coffee/tea and a protein snack if you're genuinely hungry.",
  "Text someone and tell them you're craving. Saying it out loud kills a lot of its power.",
  "Set a timer for 10 minutes and do literally anything else. Cravings are waves — they peak and pass.",
];

const WORKOUT_QUOTES = [
  "You don't have to feel motivated. You just have to put your shoes on. Motivation shows up after.",
  "10 minutes. That's the deal. If you still want to quit after 10 minutes, you can — but you won't.",
  "Future you is already thanking present you. Don't let them down.",
  "You've regretted skipping a workout. You've never regretted finishing one.",
  "Discipline is choosing between what you want now and what you want most.",
  "Nobody is coming to do this for you. That's the whole point — this is yours.",
  "Show up for the version of yourself you're trying to become, not the one you feel like today.",
];

const WORKOUT_TIPS = [
  "Put your workout clothes on right now, before you decide anything else.",
  "Commit to just a 10-minute warmup. You almost always keep going once you start.",
  "Pick the single easiest exercise on your list and do just that one first.",
  "Play the song that always gets you moving. Right now, before you think more about it.",
  "Lower the bar: a walk counts. Doing something beats doing nothing.",
];

const BADGE_DEFS = [
  { id: "streak3", label: "3-day streak", check: (s) => Math.max(streakLen(s.workouts), streakLen(s.meals)) >= 3 },
  { id: "streak7", label: "7-day streak", check: (s) => Math.max(streakLen(s.workouts), streakLen(s.meals)) >= 7 },
  { id: "streak30", label: "30-day streak", check: (s) => Math.max(streakLen(s.workouts), streakLen(s.meals)) >= 30 },
  { id: "resist10", label: "Resisted 10 cravings", check: (s) => s.cravesResisted >= 10 },
  { id: "resist50", label: "Resisted 50 cravings", check: (s) => s.cravesResisted >= 50 },
  { id: "workouts25", label: "25 workouts logged", check: (s) => s.workouts.length >= 25 },
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Object.assign(
        { why: "", workouts: [], meals: [], cravesResisted: 0,
          reminderTime: "18:00", notifyEnabled: false, lastNotifiedDate: "",
          calorieLog: {} },
        parsed
      );
    }
  } catch (e) {}
  return {
    why: "", workouts: [], meals: [], cravesResisted: 0,
    reminderTime: "18:00", notifyEnabled: false, lastNotifiedDate: "",
    calorieLog: {},
  };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Counts consecutive days up to and including today (or yesterday, so it
// doesn't reset to 0 the moment you wake up before logging today).
function streakLen(dateList) {
  const set = new Set(dateList);
  let count = 0;
  let cursor = set.has(todayStr()) ? 0 : 1;
  while (set.has(daysAgoStr(cursor))) {
    count++;
    cursor++;
  }
  return count;
}

// Longest run of consecutive days ever logged in a date list (not just the
// streak ending today) — used for the "best streak" stat.
function longestStreak(dateList) {
  const dates = [...new Set(dateList)].sort();
  let best = 0;
  let current = 0;
  let prevTime = null;
  for (const d of dates) {
    const t = new Date(d + "T00:00:00").getTime();
    if (prevTime !== null && t - prevTime === 86400000) {
      current++;
    } else {
      current = 1;
    }
    best = Math.max(best, current);
    prevTime = t;
  }
  return best;
}

function loggedToday(state) {
  const today = todayStr();
  return state.workouts.includes(today) || state.meals.includes(today);
}

let state = loadState();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function $(id) {
  return document.getElementById(id);
}

function showOverlay(id) {
  $(id).classList.remove("hidden");
}
function hideOverlay(id) {
  $(id).classList.add("hidden");
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function renderWhy() {
  $("whyText").textContent = state.why && state.why.trim()
    ? state.why
    : "Tap the pencil to set your reason.";
}

function renderStreaks() {
  $("workoutStreakNum").textContent = streakLen(state.workouts);
  $("cleanStreakNum").textContent = streakLen(state.meals);
  $("workoutStreakBest").textContent = "best: " + longestStreak(state.workouts);
  $("cleanStreakBest").textContent = "best: " + longestStreak(state.meals);

  const totalDays = new Set([...state.workouts, ...state.meals]).size;
  $("totalDays").textContent = totalDays + " total day" + (totalDays === 1 ? "" : "s") + " logged";
}

function renderCalendar() {
  const grid = $("calendarGrid");
  grid.innerHTML = "";

  const numDays = 91; // 13 weeks
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (numDays - 1));

  // Pad so the grid's first column lines up on the correct weekday row.
  const padding = start.getDay();
  for (let i = 0; i < padding; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell cal-empty";
    grid.appendChild(cell);
  }

  const workoutSet = new Set(state.workouts);
  const mealSet = new Set(state.meals);

  for (let i = 0; i < numDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const hasWorkout = workoutSet.has(dateStr);
    const hasMeal = mealSet.has(dateStr);

    let cls = "cal-none";
    if (hasWorkout && hasMeal) cls = "cal-both";
    else if (hasWorkout) cls = "cal-workout";
    else if (hasMeal) cls = "cal-meal";

    const cell = document.createElement("div");
    cell.className = "cal-cell " + cls;
    cell.title = dateStr;
    grid.appendChild(cell);
  }
}

function renderCalories() {
  const today = todayStr();
  const entries = state.calorieLog[today] || [];
  const total = entries.reduce((sum, e) => sum + e.cals, 0);
  $("calorieTotal").textContent = total;

  const list = $("calorieList");
  list.innerHTML = "";
  if (entries.length === 0) {
    const li = document.createElement("li");
    li.className = "calorie-empty";
    li.textContent = "Nothing logged yet today.";
    list.appendChild(li);
    return;
  }
  entries.forEach((entry) => {
    const li = document.createElement("li");

    const label = document.createElement("span");
    label.className = "cal-entry-label";
    label.textContent = entry.label || "(unnamed)";

    const amount = document.createElement("span");
    amount.className = "cal-entry-amount";
    amount.textContent = entry.cals + " cal";

    const remove = document.createElement("button");
    remove.className = "cal-entry-remove";
    remove.textContent = "✕";
    remove.addEventListener("click", () => removeCalorieEntry(entry.id));

    li.appendChild(label);
    li.appendChild(amount);
    li.appendChild(remove);
    list.appendChild(li);
  });
}

function addCalorieEntry(label, cals) {
  const today = todayStr();
  if (!state.calorieLog[today]) state.calorieLog[today] = [];
  state.calorieLog[today].push({ id: Date.now() + "-" + Math.random(), label, cals });
  saveState(state);
  renderCalories();
}

function removeCalorieEntry(id) {
  const today = todayStr();
  const entries = state.calorieLog[today] || [];
  state.calorieLog[today] = entries.filter((e) => e.id !== id);
  saveState(state);
  renderCalories();
}

function renderBadges() {
  const container = $("badges");
  container.innerHTML = "";
  BADGE_DEFS.forEach((b) => {
    const earned = b.check(state);
    const el = document.createElement("span");
    el.className = "badge" + (earned ? " earned" : "");
    el.textContent = (earned ? "★ " : "") + b.label;
    container.appendChild(el);
  });
}

function renderAll() {
  renderWhy();
  renderStreaks();
  renderBadges();
  renderCalendar();
  renderCalories();
}

function whyReminderText() {
  if (state.why && state.why.trim()) {
    return "Remember: " + state.why;
  }
  return "Set your \"why\" (tap the ✎ icon) so this reminder hits harder next time.";
}

// ---- Craving overlay ----
function openCraveOverlay() {
  $("craveQuote").textContent = pick(CRAVE_QUOTES);
  $("craveTip").textContent = pick(CRAVE_TIPS);
  $("craveWhyReminder").textContent = whyReminderText();
  resetTimer("craveTimer", "craveTimerBtn", 90);
  showOverlay("craveOverlay");
}

// ---- Workout overlay ----
function openWorkoutOverlay() {
  $("workoutQuote").textContent = pick(WORKOUT_QUOTES);
  $("workoutTip").textContent = pick(WORKOUT_TIPS);
  $("workoutWhyReminder").textContent = whyReminderText();
  resetTimer("workoutTimer", "workoutTimerBtn", 600);
  showOverlay("workoutOverlay");
}

// ---- Timer logic (shared for both overlays) ----
const timers = {};

function fmt(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return m + ":" + s;
}

function resetTimer(displayId, btnId, seconds) {
  clearInterval(timers[displayId]);
  $(displayId).textContent = fmt(seconds);
  const btn = $(btnId);
  btn.textContent = "Start timer";
  btn.dataset.remaining = seconds;
  btn.dataset.running = "0";
}

function toggleTimer(displayId, btnId) {
  const btn = $(btnId);
  if (btn.dataset.running === "1") {
    clearInterval(timers[displayId]);
    btn.dataset.running = "0";
    btn.textContent = "Resume";
    return;
  }
  btn.dataset.running = "1";
  btn.textContent = "Pause";
  timers[displayId] = setInterval(() => {
    let remaining = parseInt(btn.dataset.remaining, 10) - 1;
    if (remaining <= 0) {
      remaining = 0;
      clearInterval(timers[displayId]);
      btn.dataset.running = "0";
      btn.textContent = "Done";
      $(displayId).textContent = fmt(0);
      return;
    }
    btn.dataset.remaining = remaining;
    $(displayId).textContent = fmt(remaining);
  }, 1000);
}

// ---- Logging ----
function logToday(listName) {
  const today = todayStr();
  if (!state[listName].includes(today)) {
    state[listName].push(today);
    saveState(state);
  }
  renderAll();
}

// ---- Reminder / notifications ----
// Best-effort only: this can fire while the app is open, not while the
// browser is fully closed (that requires a push server this app doesn't have).
function renderNotifyStatus() {
  const el = $("notifyStatus");
  if (!("Notification" in window)) {
    el.textContent = "Notifications aren't supported in this browser.";
  } else if (state.notifyEnabled && Notification.permission === "granted") {
    el.textContent = "On — reminding you at " + state.reminderTime + " if you haven't logged that day.";
  } else {
    el.textContent = "Off.";
  }
  $("reminderTimeInput").value = state.reminderTime || "18:00";
}

function checkReminder() {
  if (!state.notifyEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
  const today = todayStr();
  if (state.lastNotifiedDate === today) return;
  const now = new Date();
  const [h, m] = (state.reminderTime || "18:00").split(":").map(Number);
  const reminderPassed = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
  if (reminderPassed && !loggedToday(state)) {
    new Notification("Push", { body: "You haven't logged a workout or clean eating today. Still time." });
    state.lastNotifiedDate = today;
    saveState(state);
  }
}

function init() {
  renderAll();

  $("editGoalBtn").addEventListener("click", () => {
    $("whyInput").value = state.why || "";
    showOverlay("whyOverlay");
  });
  $("whyCard").addEventListener("click", () => {
    $("whyInput").value = state.why || "";
    showOverlay("whyOverlay");
  });
  $("saveWhy").addEventListener("click", () => {
    state.why = $("whyInput").value.trim();
    saveState(state);
    renderWhy();
    hideOverlay("whyOverlay");
  });

  $("craveBtn").addEventListener("click", openCraveOverlay);
  $("workoutBtn").addEventListener("click", openWorkoutOverlay);

  $("craveTimerBtn").addEventListener("click", () => toggleTimer("craveTimer", "craveTimerBtn"));
  $("workoutTimerBtn").addEventListener("click", () => toggleTimer("workoutTimer", "workoutTimerBtn"));

  $("craveNext").addEventListener("click", () => {
    $("craveQuote").textContent = pick(CRAVE_QUOTES);
    $("craveTip").textContent = pick(CRAVE_TIPS);
  });
  $("workoutNext").addEventListener("click", () => {
    $("workoutQuote").textContent = pick(WORKOUT_QUOTES);
    $("workoutTip").textContent = pick(WORKOUT_TIPS);
  });

  $("craveWon").addEventListener("click", () => {
    state.cravesResisted = (state.cravesResisted || 0) + 1;
    logToday("meals");
    saveState(state);
    renderAll();
    hideOverlay("craveOverlay");
    toast("That's a win. Logged.");
  });

  $("workoutDone").addEventListener("click", () => {
    logToday("workouts");
    hideOverlay("workoutOverlay");
    toast("Workout logged. Nice work.");
  });

  $("logWorkout").addEventListener("click", () => {
    logToday("workouts");
    toast("Workout logged.");
  });
  $("logClean").addEventListener("click", () => {
    logToday("meals");
    toast("Clean eating logged.");
  });

  $("calorieAddBtn").addEventListener("click", () => {
    const labelInput = $("calorieLabel");
    const amountInput = $("calorieAmount");
    const cals = parseInt(amountInput.value, 10);
    if (!cals || cals <= 0) {
      toast("Enter a calorie amount first.");
      return;
    }
    addCalorieEntry(labelInput.value.trim(), cals);
    labelInput.value = "";
    amountInput.value = "";
    labelInput.focus();
  });

  $("settingsBtn").addEventListener("click", () => {
    renderNotifyStatus();
    showOverlay("settingsOverlay");
  });

  $("enableReminder").addEventListener("click", () => {
    state.reminderTime = $("reminderTimeInput").value || "18:00";
    if (!("Notification" in window)) {
      toast("Notifications aren't supported in this browser.");
      return;
    }
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") {
        state.notifyEnabled = true;
        saveState(state);
        renderNotifyStatus();
        toast("Reminder enabled.");
      } else {
        state.notifyEnabled = false;
        saveState(state);
        renderNotifyStatus();
        toast("Notification permission denied.");
      }
    });
  });

  $("disableReminder").addEventListener("click", () => {
    state.notifyEnabled = false;
    saveState(state);
    renderNotifyStatus();
    toast("Reminder turned off.");
  });

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => hideOverlay(btn.dataset.close));
  });
  document.querySelectorAll(".overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => {
      if (e.target === ov) ov.classList.add("hidden");
    });
  });

  checkReminder();
  setInterval(checkReminder, 60000);
}

document.addEventListener("DOMContentLoaded", init);
