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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Object.assign(
        { why: "", workouts: [], meals: [], cravesResisted: 0,
          reminderTime: "18:00", notifyEnabled: false, lastNotifiedDate: "",
          calorieLog: {}, workoutLog: {} },
        parsed
      );
    }
  } catch (e) {}
  return {
    why: "", workouts: [], meals: [], cravesResisted: 0,
    reminderTime: "18:00", notifyEnabled: false, lastNotifiedDate: "",
    calorieLog: {}, workoutLog: {},
  };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

// Local calendar date as YYYY-MM-DD. Deliberately not toISOString(), which
// converts to UTC - a Date built from local midnight rolls back to the
// previous UTC day for anyone east of UTC, silently corrupting every
// date-keyed lookup (calendar cells, streaks, calorie/workout logs).
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function todayStr() {
  return toDateStr(new Date());
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 5 full weeks (Sun-Sat), ending with the current week - big enough cells
  // to tap on a phone, with the date number printed right on each one.
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay());
  const start = new Date(currentWeekStart);
  start.setDate(currentWeekStart.getDate() - 28);

  const workoutSet = new Set(state.workouts);
  const mealSet = new Set(state.meals);
  const todayDateStr = todayStr();

  for (let i = 0; i < 35; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    const cell = document.createElement("div");
    cell.textContent = d.getDate();

    if (d > today) {
      cell.className = "cal-cell cal-future";
      grid.appendChild(cell);
      continue;
    }

    const dateStr = toDateStr(d);
    const hasWorkout = workoutSet.has(dateStr);
    const hasMeal = mealSet.has(dateStr);

    let cls = "cal-none";
    if (hasWorkout && hasMeal) cls = "cal-both";
    else if (hasWorkout) cls = "cal-workout";
    else if (hasMeal) cls = "cal-meal";
    if (dateStr === todayDateStr) cls += " cal-today";

    const dayCalories = (state.calorieLog[dateStr] || []).reduce((sum, e) => sum + e.cals, 0);
    const dateLabel = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const tooltip = dateLabel + " — " + dayCalories + " cal" +
      (hasWorkout ? ", workout" : "") + (hasMeal ? ", clean eating" : "");

    cell.className = "cal-cell " + cls;
    cell.title = tooltip;
    cell.addEventListener("click", () => openDayDetail(dateStr, d));
    grid.appendChild(cell);
  }
}

function openDayDetail(dateStr, d) {
  const hasWorkout = state.workouts.includes(dateStr);
  const hasMeal = state.meals.includes(dateStr);
  const calEntries = state.calorieLog[dateStr] || [];
  const workoutEntries = state.workoutLog[dateStr] || [];
  const dayCalories = calEntries.reduce((sum, e) => sum + e.cals, 0);

  $("dayOverlayDate").textContent = d.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });

  const statusParts = [];
  if (hasWorkout) statusParts.push("Workout logged");
  if (hasMeal) statusParts.push("Clean eating logged");
  $("dayOverlayStatus").textContent = statusParts.length ? statusParts.join(" · ") : "Nothing logged this day";

  $("dayOverlayCalTotal").textContent = dayCalories;

  const calList = $("dayOverlayCalList");
  calList.innerHTML = "";
  if (calEntries.length === 0) {
    const li = document.createElement("li");
    li.className = "calorie-empty";
    li.textContent = "No food logged.";
    calList.appendChild(li);
  } else {
    calEntries.forEach((entry) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.className = "cal-entry-label";
      label.textContent = entry.label || "(unnamed)";
      const amount = document.createElement("span");
      amount.className = "cal-entry-amount";
      amount.textContent = entry.cals + " cal";
      li.appendChild(label);
      li.appendChild(amount);
      calList.appendChild(li);
    });
  }

  const workoutList = $("dayOverlayWorkoutList");
  workoutList.innerHTML = "";
  if (workoutEntries.length === 0) {
    const li = document.createElement("li");
    li.className = "calorie-empty";
    li.textContent = "No exercise logged.";
    workoutList.appendChild(li);
  } else {
    workoutEntries.forEach((entry) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.className = "cal-entry-label";
      label.textContent = entry.exercise;
      const detail = document.createElement("span");
      detail.className = "cal-entry-amount";
      detail.textContent = entry.sets + "x" + entry.reps + (entry.weight ? " @ " + entry.weight : "");
      li.appendChild(label);
      li.appendChild(detail);
      workoutList.appendChild(li);
    });
  }

  showOverlay("dayOverlay");
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
  logToday("meals");
}

function removeCalorieEntry(id) {
  const today = todayStr();
  const entries = state.calorieLog[today] || [];
  state.calorieLog[today] = entries.filter((e) => e.id !== id);
  saveState(state);
  renderCalories();
  renderCalendar();
}

// ---- Food search (USDA FoodData Central) ----
// The US government's official nutrition database - far better documented
// and more stable than Open Food Facts' search, which failed repeatedly.
// DEMO_KEY is rate-limited and shared globally across everyone using it
// without a key of their own; get a free one at fdc.nal.usda.gov/api-key-signup
// and swap it in below if this starts throttling.
const USDA_API_KEY = "DEMO_KEY";
const FOOD_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

async function searchFood(query) {
  const url = FOOD_SEARCH_URL + "?api_key=" + USDA_API_KEY +
    "&query=" + encodeURIComponent(query) + "&pageSize=8";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Food search failed: " + res.status);
  const data = await res.json();
  const foods = data.foods || [];

  return foods
    .map((food) => {
      const nutrients = food.foodNutrients || [];
      const energy = nutrients.find((n) => {
        const num = String(n.nutrientNumber);
        const unit = (n.unitName || "").toUpperCase();
        return (num === "1008" || n.nutrientName === "Energy") && unit === "KCAL";
      });
      const kcal = energy ? (energy.value ?? energy.amount) : null;
      return food.description && kcal != null ? { name: food.description, kcalPer100g: kcal } : null;
    })
    .filter(Boolean);
}

function renderFoodResults(results) {
  const list = $("foodResults");
  list.innerHTML = "";
  if (results.length === 0) {
    const li = document.createElement("li");
    li.className = "calorie-empty";
    li.textContent = "No matches. Try a different search, or add it manually below.";
    list.appendChild(li);
    return;
  }
  results.forEach((r) => {
    const li = document.createElement("li");
    li.className = "food-result-item";

    const name = document.createElement("span");
    name.className = "food-result-name";
    name.textContent = r.name;

    const kcal = document.createElement("span");
    kcal.className = "food-result-kcal";
    kcal.textContent = Math.round(r.kcalPer100g) + " kcal / 100g";

    const grams = document.createElement("input");
    grams.type = "number";
    grams.className = "food-result-grams";
    grams.value = "100";
    grams.min = "1";

    const addBtn = document.createElement("button");
    addBtn.className = "food-result-add";
    addBtn.textContent = "Add";
    addBtn.addEventListener("click", () => {
      const g = parseInt(grams.value, 10) || 100;
      const cals = Math.round((r.kcalPer100g / 100) * g);
      addCalorieEntry(r.name + " (" + g + "g)", cals);
      toast("Added " + cals + " cal.");
      $("foodSearchInput").value = "";
      $("foodResults").innerHTML = "";
    });

    li.appendChild(name);
    li.appendChild(kcal);
    li.appendChild(grams);
    li.appendChild(addBtn);
    list.appendChild(li);
  });
}

async function runFoodSearch() {
  const query = $("foodSearchInput").value.trim();
  if (!query) return;
  const list = $("foodResults");
  list.innerHTML = "";
  const loading = document.createElement("li");
  loading.className = "calorie-empty";
  loading.textContent = "Searching...";
  list.appendChild(loading);
  try {
    const results = await searchFood(query);
    renderFoodResults(results);
  } catch (e) {
    console.error("Food search error:", e);
    list.innerHTML = "";
    const li = document.createElement("li");
    li.className = "calorie-empty";
    li.textContent = "Couldn't reach the food database (it may be rate-limited on the shared demo key). Add it manually below.";
    list.appendChild(li);
  }
}

// ---- Manual workout log ----
function renderWorkoutLog() {
  const today = todayStr();
  const entries = state.workoutLog[today] || [];
  const list = $("workoutList");
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
    label.textContent = entry.exercise;

    const detail = document.createElement("span");
    detail.className = "cal-entry-amount";
    detail.textContent = entry.sets + "x" + entry.reps + (entry.weight ? " @ " + entry.weight : "");

    const remove = document.createElement("button");
    remove.className = "cal-entry-remove";
    remove.textContent = "✕";
    remove.addEventListener("click", () => removeWorkoutEntry(entry.id));

    li.appendChild(label);
    li.appendChild(detail);
    li.appendChild(remove);
    list.appendChild(li);
  });
}

function addExerciseEntry(exercise, sets, reps, weight) {
  const today = todayStr();
  if (!state.workoutLog[today]) state.workoutLog[today] = [];
  state.workoutLog[today].push({ id: Date.now() + "-" + Math.random(), exercise, sets, reps, weight });
  logToday("workouts");
}

function removeWorkoutEntry(id) {
  const today = todayStr();
  const entries = state.workoutLog[today] || [];
  state.workoutLog[today] = entries.filter((e) => e.id !== id);
  saveState(state);
  renderWorkoutLog();
}

function renderAll() {
  renderWhy();
  renderStreaks();
  renderCalendar();
  renderCalories();
  renderWorkoutLog();
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

  $("foodSearchBtn").addEventListener("click", runFoodSearch);
  $("foodSearchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runFoodSearch();
  });

  $("exerciseAddBtn").addEventListener("click", () => {
    const exercise = $("exerciseName").value.trim();
    const sets = parseInt($("exerciseSets").value, 10);
    const reps = parseInt($("exerciseReps").value, 10);
    const weight = parseInt($("exerciseWeight").value, 10);
    if (!exercise) {
      toast("Enter an exercise name.");
      return;
    }
    if (!sets || !reps) {
      toast("Enter sets and reps.");
      return;
    }
    addExerciseEntry(exercise, sets, reps, weight || null);
    $("exerciseName").value = "";
    $("exerciseSets").value = "";
    $("exerciseReps").value = "";
    $("exerciseWeight").value = "";
    $("exerciseName").focus();
    toast("Exercise logged.");
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
