"use strict";

/* ---------------------------------------------------------------------------
 * Course Flashcards — static, dependency-free study app.
 * Individual progress lives in localStorage only and is never sent anywhere.
 * Anonymous, cookieless aggregate usage (visits, module opens, card flips) is
 * counted via GoatCounter — no IP retained, no personal or identifying data.
 * ------------------------------------------------------------------------- */

const STORAGE_PREFIX = "flashcards:v1";
const THEME_KEY = `${STORAGE_PREFIX}:theme`;
const LAST_SESSION_KEY = `${STORAGE_PREFIX}:lastSession`;

const state = {
  courses: [],
  currentCourse: null, // { id, title, modules: [{ id, title, file }] }
  currentModule: null, // { id, title, cards }
  cards: [], // active deck (full module deck or review-only subset)
  fullCards: [], // the module's full deck, regardless of review mode
  currentIndex: 0,
  isFlipped: false,
  known: new Set(),
  review: new Set(),
  reviewMode: false,
};

// Cached DOM references.
const el = {};

function cacheElements() {
  const ids = [
    "themeToggle", "courseSelect", "moduleSelect",
    "statusPosition", "statusKnown", "statusReview",
    "card", "cardText", "cardSide",
    "prevBtn", "flipBtn", "nextBtn",
    "knownBtn", "reviewBtn",
    "shuffleBtn", "reviewModeBtn", "resetBtn",
  ];
  ids.forEach((id) => { el[id] = document.getElementById(id); });
}

/* ----------------------------- Analytics ---------------------------------- */

// Fire an anonymous, aggregate GoatCounter event. Never throws — analytics must
// not break the app, and it silently no-ops if the script is blocked/absent.
function trackEvent(path, title) {
  try {
    if (window.goatcounter && typeof window.goatcounter.count === "function") {
      window.goatcounter.count({ path, title, event: true });
    }
  } catch (e) {
    /* analytics must never break the app */
  }
}

/* ----------------------------- Theme -------------------------------------- */

function initTheme() {
  let theme;
  try {
    theme = localStorage.getItem(THEME_KEY);
  } catch (e) {
    theme = null;
  }
  if (theme !== "light" && theme !== "dark") {
    const prefersDark = window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    theme = prefersDark ? "dark" : "light";
  }
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isDark = theme === "dark";
  el.themeToggle.textContent = isDark ? "☀️ Light" : "🌙 Dark";
  el.themeToggle.setAttribute("aria-pressed", String(isDark));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (e) {
    /* storage unavailable — theme still applies for this session */
  }
}

/* ----------------------------- Data loading ------------------------------- */

async function loadCourses() {
  try {
    const res = await fetch("data/courses.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.courses = await res.json();
    populateCourses();
  } catch (err) {
    console.error("Failed to load course list:", err);
    showCardMessage("Could not load course list.");
  }
}

function populateCourses() {
  // Keep the placeholder option, then append courses.
  state.courses.forEach((course) => {
    const opt = document.createElement("option");
    opt.value = course.id;
    opt.textContent = course.title;
    el.courseSelect.appendChild(opt);
  });
}

function selectCourse(courseId) {
  const meta = state.courses.find((c) => c.id === courseId);
  if (!meta) return;

  // Reset module-level state while a new course is chosen.
  state.currentModule = null;
  resetDeckState();
  el.moduleSelect.value = "";
  disableStudyButtons();

  // The registry already carries each course's module list (id, title, file);
  // cards are fetched lazily per module in selectModule().
  state.currentCourse = meta;
  populateModules();
  el.moduleSelect.disabled = false;
  showCardMessage("Select a module to begin.");
  saveLastSession(courseId, null);
}

function populateModules() {
  el.moduleSelect.innerHTML = '<option value="">Select a module…</option>';
  state.currentCourse.modules.forEach((mod) => {
    const opt = document.createElement("option");
    opt.value = mod.id;
    opt.textContent = mod.title;
    el.moduleSelect.appendChild(opt);
  });
}

async function selectModule(moduleId) {
  const mod = state.currentCourse &&
    state.currentCourse.modules.find((m) => m.id === moduleId);
  if (!mod) return;

  resetDeckState();
  disableStudyButtons();
  showCardMessage("Loading cards…");

  let cards;
  try {
    const res = await fetch(`data/${mod.file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cards = Array.isArray(data.cards) ? data.cards : [];
  } catch (err) {
    console.error("Failed to load module:", err);
    showCardMessage("Could not load this module.");
    return;
  }

  // Guard against a stale fetch if the user changed selection mid-load.
  if (el.moduleSelect.value !== moduleId) return;

  state.currentModule = { id: mod.id, title: mod.title, cards };
  state.fullCards = cards.slice();
  state.cards = state.fullCards.slice();

  if (!state.cards.length) {
    showCardMessage("No cards available for this module.");
    updateStatus();
    return;
  }

  loadProgress();
  saveLastSession(state.currentCourse.id, moduleId);
  trackEvent(`module-open/${state.currentCourse.id}/${moduleId}`, "Module opened");
  enableStudyButtons();
  renderCard();
}

function resetDeckState() {
  state.cards = [];
  state.fullCards = [];
  state.currentIndex = 0;
  state.isFlipped = false;
  state.known = new Set();
  state.review = new Set();
  state.reviewMode = false;
  el.reviewModeBtn.textContent = "Review missed";
}

/* ----------------------------- Rendering ---------------------------------- */

function showCardMessage(message) {
  el.cardText.textContent = message;
  el.cardSide.textContent = "";
}

function renderCard() {
  if (!state.cards.length) {
    showCardMessage("No cards available for this module.");
    updateStatus();
    return;
  }
  const card = state.cards[state.currentIndex];
  el.cardText.textContent = state.isFlipped ? card.back : card.front;
  el.cardSide.textContent = state.isFlipped ? "Answer" : "Question";
  updateStatus();
}

function updateStatus() {
  const total = state.cards.length;
  const position = total ? state.currentIndex + 1 : 0;
  el.statusPosition.textContent = `Card ${position} of ${total}`;
  el.statusKnown.textContent = `Known: ${state.known.size}`;
  el.statusReview.textContent = `Needs review: ${state.review.size}`;
}

/* ----------------------------- Card actions ------------------------------- */

function flipCard() {
  if (!state.cards.length) return;
  state.isFlipped = !state.isFlipped;
  renderCard();
  // Count reveals (front → back) as an aggregate proxy for cards studied.
  if (state.isFlipped) trackEvent("flip", "Card flip");
}

function nextCard() {
  if (!state.cards.length) return;
  state.currentIndex = (state.currentIndex + 1) % state.cards.length;
  state.isFlipped = false;
  renderCard();
  saveProgress();
}

function previousCard() {
  if (!state.cards.length) return;
  state.currentIndex =
    (state.currentIndex - 1 + state.cards.length) % state.cards.length;
  state.isFlipped = false;
  renderCard();
  saveProgress();
}

function currentCardId() {
  const card = state.cards[state.currentIndex];
  return card ? card.id : null;
}

function markKnown() {
  const id = currentCardId();
  if (!id) return;
  state.known.add(id);
  state.review.delete(id);
  updateStatus();
  saveProgress();
}

function markReview() {
  const id = currentCardId();
  if (!id) return;
  state.review.add(id);
  state.known.delete(id);
  updateStatus();
  saveProgress();
}

function shuffleCards() {
  if (!state.cards.length) return;
  // Fisher–Yates on the active deck. Progress (by card id) is untouched.
  for (let i = state.cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.cards[i], state.cards[j]] = [state.cards[j], state.cards[i]];
  }
  state.currentIndex = 0;
  state.isFlipped = false;
  renderCard();
  saveProgress();
}

function toggleReviewOnly() {
  if (!state.reviewMode) {
    if (state.review.size === 0) {
      window.alert("No cards marked for review yet.");
      return;
    }
    state.cards = state.fullCards.filter((c) => state.review.has(c.id));
    state.reviewMode = true;
    el.reviewModeBtn.textContent = "Show all cards";
  } else {
    state.cards = state.fullCards.slice();
    state.reviewMode = false;
    el.reviewModeBtn.textContent = "Review missed";
  }
  state.currentIndex = 0;
  state.isFlipped = false;
  renderCard();
  saveProgress();
}

function resetProgress() {
  if (!state.currentModule) return;
  if (!window.confirm("Reset progress for this module?")) return;

  try {
    localStorage.removeItem(storageKey());
  } catch (e) {
    /* storage unavailable — nothing to remove */
  }
  state.known = new Set();
  state.review = new Set();
  state.cards = state.fullCards.slice();
  state.currentIndex = 0;
  state.isFlipped = false;
  state.reviewMode = false;
  el.reviewModeBtn.textContent = "Review missed";
  renderCard();
}

/* ----------------------------- Persistence -------------------------------- */

function storageKey() {
  return `${STORAGE_PREFIX}:${state.currentCourse.id}:${state.currentModule.id}`;
}

function saveProgress() {
  if (!state.currentCourse || !state.currentModule) return;
  const payload = {
    known: Array.from(state.known),
    review: Array.from(state.review),
    lastIndex: state.currentIndex,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(payload));
  } catch (e) {
    /* storage full or unavailable — progress stays in memory only */
  }
}

function loadProgress() {
  let raw;
  try {
    raw = localStorage.getItem(storageKey());
  } catch (e) {
    raw = null;
  }
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    state.known = new Set(Array.isArray(data.known) ? data.known : []);
    state.review = new Set(Array.isArray(data.review) ? data.review : []);
    const idx = Number.isInteger(data.lastIndex) ? data.lastIndex : 0;
    state.currentIndex = Math.min(Math.max(idx, 0), state.cards.length - 1);
  } catch (err) {
    console.warn("Could not load saved progress.");
  }
}

function saveLastSession(courseId, moduleId) {
  try {
    localStorage.setItem(
      LAST_SESSION_KEY,
      JSON.stringify({ courseId, moduleId })
    );
  } catch (e) {
    /* storage unavailable — last session simply won't be restored */
  }
}

async function restoreLastSession() {
  let raw;
  try {
    raw = localStorage.getItem(LAST_SESSION_KEY);
  } catch (e) {
    raw = null;
  }
  if (!raw) return;

  let session;
  try {
    session = JSON.parse(raw);
  } catch (e) {
    return;
  }
  if (!session || !session.courseId) return;

  const courseExists = state.courses.some((c) => c.id === session.courseId);
  if (!courseExists) return;

  el.courseSelect.value = session.courseId;
  selectCourse(session.courseId);

  if (session.moduleId &&
      state.currentCourse &&
      state.currentCourse.modules.some((m) => m.id === session.moduleId)) {
    el.moduleSelect.value = session.moduleId;
    await selectModule(session.moduleId);
  }
}

/* ----------------------------- Button state ------------------------------- */

function studyButtons() {
  return [
    el.card, el.prevBtn, el.flipBtn, el.nextBtn,
    el.knownBtn, el.reviewBtn,
    el.shuffleBtn, el.reviewModeBtn, el.resetBtn,
  ];
}

function enableStudyButtons() {
  studyButtons().forEach((b) => { b.disabled = false; });
}

function disableStudyButtons() {
  studyButtons().forEach((b) => { b.disabled = true; });
}

/* ----------------------------- Events ------------------------------------- */

function bindEvents() {
  el.themeToggle.addEventListener("click", toggleTheme);

  el.courseSelect.addEventListener("change", (e) => {
    const id = e.target.value;
    if (id) {
      selectCourse(id);
    } else {
      state.currentCourse = null;
      state.currentModule = null;
      resetDeckState();
      el.moduleSelect.innerHTML = '<option value="">Select a module…</option>';
      el.moduleSelect.disabled = true;
      disableStudyButtons();
      showCardMessage("Choose a course and module to begin.");
      updateStatus();
    }
  });

  el.moduleSelect.addEventListener("change", (e) => {
    if (e.target.value) selectModule(e.target.value);
  });

  el.card.addEventListener("click", flipCard);
  el.flipBtn.addEventListener("click", flipCard);
  el.prevBtn.addEventListener("click", previousCard);
  el.nextBtn.addEventListener("click", nextCard);
  el.knownBtn.addEventListener("click", markKnown);
  el.reviewBtn.addEventListener("click", markReview);
  el.shuffleBtn.addEventListener("click", shuffleCards);
  el.reviewModeBtn.addEventListener("click", toggleReviewOnly);
  el.resetBtn.addEventListener("click", resetProgress);

  document.addEventListener("keydown", handleKeydown);
}

function handleKeydown(e) {
  // Don't hijack typing in the dropdowns.
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "SELECT") return;
  if (!state.cards.length) return;

  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      previousCard();
      break;
    case "ArrowRight":
      e.preventDefault();
      nextCard();
      break;
    case " ":
    case "Enter":
      // Let a focused button handle its own activation.
      if (document.activeElement && document.activeElement.tagName === "BUTTON"
          && document.activeElement !== el.card) {
        return;
      }
      e.preventDefault();
      flipCard();
      break;
    case "k":
    case "K":
      markKnown();
      break;
    case "j":
    case "J":
      markReview();
      break;
    default:
      break;
  }
}

/* ----------------------------- Init --------------------------------------- */

async function init() {
  cacheElements();
  initTheme();
  bindEvents();
  await loadCourses();
  await restoreLastSession();
}

document.addEventListener("DOMContentLoaded", init);
