(() => {
  "use strict";

  const YEAR = 2026;
  const STORE_KEY = "bora-planner-v1";
  const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const $ = (selector) => document.querySelector(selector);

  const initial = {
    profileName: "보라",
    todos: {},
    stats: {},
    settings: { focus: 25, shortBreak: 5, longBreak: 15, sets: 4 },
    timer: { mode: "focus", running: false, remaining: 25 * 60, duration: 25 * 60, currentSet: 1, endAt: null, lastTick: null }
  };

  let state = loadState();
  const today = new Date();
  const defaultDate = today.getFullYear() === YEAR ? today : new Date(YEAR, 0, 1);
  let selectedDate = keyOf(defaultDate);
  let visibleMonth = defaultDate.getMonth();
  let tickHandle = null;
  let toastHandle = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      const merged = { ...initial, ...saved };
      merged.settings = { ...initial.settings, ...(saved?.settings || {}) };
      merged.timer = { ...initial.timer, ...(saved?.timer || {}) };
      return merged;
    } catch (_) {
      return structuredClone(initial);
    }
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function keyOf(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function dateFromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDate(key, includeYear = false) {
    const date = dateFromKey(key);
    const prefix = includeYear ? `${date.getFullYear()}년 ` : "";
    return `${prefix}${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
  }

  function formatClock(totalSeconds) {
    const seconds = Math.max(0, Math.ceil(totalSeconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function modeDuration(mode) {
    return state.settings[mode] * 60;
  }

  function modeLabel(mode) {
    return mode === "focus" ? "집중 시간" : mode === "shortBreak" ? "짧은 휴식" : "긴 휴식";
  }

  function renderAll() {
    renderCalendar();
    renderTodos();
    renderTimer();
    renderStats();
    $("#dateSummary").textContent = formatDate(selectedDate, true);
    renderProfile();
  }

  function renderProfile() {
    const name = (state.profileName || initial.profileName).trim() || initial.profileName;
    const input = $("#nicknameInput");
    if (input && document.activeElement !== input) input.value = name;
  }

  function renderCalendar() {
    $("#monthNumber").textContent = String(visibleMonth + 1).padStart(2, "0");
    $("#monthName").textContent = MONTHS[visibleMonth];
    const first = new Date(YEAR, visibleMonth, 1);
    const start = new Date(YEAR, visibleMonth, 1 - first.getDay());
    const grid = $("#calendarGrid");
    grid.innerHTML = "";

    for (let i = 0; i < 42; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = keyOf(date);
      const todos = state.todos[key] || [];
      const focusSeconds = state.stats[key]?.seconds || 0;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "day-cell";
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `${formatDate(key, true)}, 할 일 ${todos.length}개, 집중 ${Math.floor(focusSeconds / 60)}분`);
      if (date.getMonth() !== visibleMonth) button.classList.add("is-muted");
      if (key === selectedDate) button.classList.add("is-selected");
      if (key === keyOf(today) && today.getFullYear() === YEAR) button.classList.add("is-today");
      button.innerHTML = `<span class="day-number">${date.getDate()}</span><span class="day-badges">${todos.length ? '<i class="day-task-dot"></i>' : ""}${focusSeconds >= 60 ? `<b class="day-focus">${Math.floor(focusSeconds / 60)}분</b>` : ""}</span>`;
      button.addEventListener("click", () => {
        selectedDate = key;
        if (date.getFullYear() === YEAR && date.getMonth() !== visibleMonth) visibleMonth = date.getMonth();
        renderAll();
      });
      grid.appendChild(button);
    }
  }

  function renderTodos() {
    const items = state.todos[selectedDate] || [];
    const list = $("#todoList");
    list.innerHTML = "";
    $("#selectedDateLabel").textContent = `${dateFromKey(selectedDate).getMonth() + 1}월 ${dateFromKey(selectedDate).getDate()}일`;
    $("#todoCount").textContent = `${items.filter((item) => item.done).length} / ${items.length}`;
    $("#todoEmpty").hidden = items.length > 0;
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = `todo-item${item.done ? " is-done" : ""}`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "todo-check";
      checkbox.checked = item.done;
      checkbox.setAttribute("aria-label", `${item.text} 완료 표시`);
      checkbox.addEventListener("change", () => {
        item.done = checkbox.checked;
        saveState();
        renderTodos();
      });
      const label = document.createElement("label");
      label.textContent = item.text;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "todo-delete";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `${item.text} 삭제`);
      remove.addEventListener("click", () => {
        state.todos[selectedDate] = items.filter((todo) => todo.id !== item.id);
        if (!state.todos[selectedDate].length) delete state.todos[selectedDate];
        saveState();
        renderAll();
      });
      li.append(checkbox, label, remove);
      list.appendChild(li);
    });
  }

  function renderTimer() {
    const timer = state.timer;
    $("#timerDisplay").textContent = formatClock(timer.remaining);
    $("#timerMode").textContent = modeLabel(timer.mode);
    $("#setLabel").textContent = `${timer.currentSet} / ${state.settings.sets} 세트`;
    $("#timerProgress").style.width = `${Math.min(100, Math.max(0, (1 - timer.remaining / timer.duration) * 100))}%`;
    $("#startPauseButton").textContent = timer.running ? "일시정지" : timer.remaining < timer.duration ? "계속하기" : timer.mode === "focus" ? "집중 시작" : "휴식 시작";
    $("#liveChip").classList.toggle("is-active", timer.running);
    $("#liveChip").querySelector("b").textContent = timer.running ? (timer.mode === "focus" ? "집중 중" : "휴식 중") : "준비";
    const name = (state.profileName || initial.profileName).trim() || initial.profileName;
    document.title = timer.running ? `${formatClock(timer.remaining)} · ${modeLabel(timer.mode)} | ${name}` : `${name} — 2026 캘린더 & 포커스`;
  }

  function statFor(key) {
    return state.stats[key] || { seconds: 0, sessions: 0 };
  }

  function renderStats() {
    const selected = statFor(selectedDate);
    const monthPrefix = `${YEAR}-${String(visibleMonth + 1).padStart(2, "0")}`;
    const monthStats = Object.entries(state.stats).filter(([key]) => key.startsWith(monthPrefix));
    const monthSeconds = monthStats.reduce((sum, [, value]) => sum + (value.seconds || 0), 0);
    const monthSessions = monthStats.reduce((sum, [, value]) => sum + (value.sessions || 0), 0);
    $("#selectedMinutes").innerHTML = `${Math.floor(selected.seconds / 60)}<small>분</small>`;
    $("#monthMinutes").innerHTML = `${Math.floor(monthSeconds / 60)}<small>분</small>`;
    $("#completedSessions").innerHTML = `${monthSessions}<small>회</small>`;
    $("#statsDateText").textContent = `${dateFromKey(selectedDate).getMonth() + 1}월 ${dateFromKey(selectedDate).getDate()}일의 집중 기록입니다.`;

    const end = dateFromKey(selectedDate);
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(end);
      date.setDate(end.getDate() - offset);
      const seconds = statFor(keyOf(date)).seconds || 0;
      days.push({ label: WEEKDAYS[date.getDay()], seconds });
    }
    const max = Math.max(60, ...days.map((day) => day.seconds));
    const total = days.reduce((sum, day) => sum + day.seconds, 0);
    $("#weekTotal").textContent = `${Math.floor(total / 60)}분`;
    $("#weekChart").innerHTML = days.map((day) => `<span class="bar-wrap" title="${Math.floor(day.seconds / 60)}분"><i class="bar-slot"><i class="bar" style="height:${Math.max(4, day.seconds / max * 100)}%"></i></i><b>${day.label}</b></span>`).join("");
  }

  function addFocusSeconds(seconds) {
    if (seconds <= 0) return;
    const key = keyOf(new Date());
    if (!state.stats[key]) state.stats[key] = { seconds: 0, sessions: 0 };
    state.stats[key].seconds += seconds;
  }

  function startTimer() {
    state.timer.running = true;
    state.timer.lastTick = Date.now();
    state.timer.endAt = Date.now() + state.timer.remaining * 1000;
    saveState();
    ensureTicker();
    renderTimer();
  }

  function pauseTimer() {
    processTick();
    state.timer.running = false;
    state.timer.endAt = null;
    state.timer.lastTick = null;
    saveState();
    renderAll();
  }

  function processTick() {
    if (!state.timer.running) return;
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(state.timer.remaining, (now - (state.timer.lastTick || now)) / 1000));
    if (state.timer.mode === "focus") addFocusSeconds(elapsed);
    state.timer.remaining = Math.max(0, (state.timer.endAt - now) / 1000);
    state.timer.lastTick = now;
    if (state.timer.remaining <= 0) completeStage();
    saveState();
    renderTimer();
    if (Math.floor(now / 5000) !== Math.floor((now - 1000) / 5000)) {
      renderCalendar();
      renderStats();
    }
  }

  function completeStage() {
    const wasFocus = state.timer.mode === "focus";
    if (wasFocus) {
      const key = keyOf(new Date());
      if (!state.stats[key]) state.stats[key] = { seconds: 0, sessions: 0 };
      state.stats[key].sessions += 1;
      const finishedSet = state.timer.currentSet;
      state.timer.mode = finishedSet >= state.settings.sets ? "longBreak" : "shortBreak";
      showToast("집중 세트를 마쳤어요. 이제 잠시 쉬어가세요.");
    } else {
      if (state.timer.mode === "longBreak") state.timer.currentSet = 1;
      else state.timer.currentSet = Math.min(state.settings.sets, state.timer.currentSet + 1);
      state.timer.mode = "focus";
      showToast("휴식이 끝났어요. 다음 집중을 시작해 보세요.");
    }
    state.timer.running = false;
    state.timer.duration = modeDuration(state.timer.mode);
    state.timer.remaining = state.timer.duration;
    state.timer.endAt = null;
    state.timer.lastTick = null;
  }

  function resetTimer() {
    state.timer.running = false;
    state.timer.remaining = modeDuration(state.timer.mode);
    state.timer.duration = state.timer.remaining;
    state.timer.endAt = null;
    state.timer.lastTick = null;
    saveState();
    renderAll();
  }

  function skipStage() {
    if (state.timer.running) processTick();
    completeStage();
    saveState();
    renderAll();
  }

  function ensureTicker() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(processTick, 250);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function encodeShare(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function decodeShare(value) {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function shareStatus() {
    if (state.timer.running) processTick();
    const payload = {
      v: 1,
      mode: state.timer.mode,
      running: state.timer.running,
      remaining: Math.ceil(state.timer.remaining),
      endAt: state.timer.running ? state.timer.endAt : null,
      set: state.timer.currentSet,
      sets: state.settings.sets,
      profileName: (state.profileName || initial.profileName).trim() || initial.profileName,
      createdAt: Date.now()
    };
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = `status=${encodeShare(payload)}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast("현재 상태 링크를 복사했어요.");
    } catch (_) {
      window.prompt("아래 링크를 복사해 공유하세요.", url.toString());
    }
  }

  function renderSharedView(payload) {
    $("#app").hidden = true;
    $("#statusViewer").hidden = false;
    const mode = ["focus", "shortBreak", "longBreak"].includes(payload.mode) ? payload.mode : "focus";
    const isFocus = mode === "focus";
    const sharedName = (payload.profileName || initial.profileName).trim().slice(0, 16) || initial.profileName;
    $("#statusViewer .brand span:last-child").textContent = sharedName;
    $("#shareEyebrow").textContent = isFocus ? "FOCUSING NOW" : "ON A BREAK";
    $("#shareTitle").textContent = payload.running ? (isFocus ? `${sharedName}님은 지금 집중하고 있어요` : `${sharedName}님은 지금 쉬고 있어요`) : `${sharedName}님의 타이머가 잠시 멈췄어요`;
    $("#shareNote").textContent = `${payload.set || 1} / ${payload.sets || 4} 세트`;

    const update = () => {
      const remaining = payload.running && payload.endAt ? Math.max(0, Math.ceil((payload.endAt - Date.now()) / 1000)) : Math.max(0, payload.remaining || 0);
      $("#shareTime").textContent = formatClock(remaining);
      if (payload.running && payload.endAt && remaining > 0) {
        const until = new Date(payload.endAt).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
        $("#shareUntil").textContent = isFocus ? `${until}까지 집중할 예정이에요.` : `${until}까지 쉬고 돌아올게요.`;
      } else if (remaining <= 0) {
        $("#shareTitle").textContent = isFocus ? `${sharedName}님의 집중 시간이 끝났어요` : `${sharedName}님의 휴식 시간이 끝났어요`;
        $("#shareUntil").textContent = "공유된 타이머가 종료되었습니다.";
      } else {
        $("#shareUntil").textContent = `남은 시간 ${formatClock(remaining)}에서 일시정지했어요.`;
      }
    };
    update();
    setInterval(update, 1000);
  }

  function setupWebMCP() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const tools = [
      {
        name: "add_calendar_todo",
        title: "캘린더 할 일 추가",
        description: "2026년의 지정한 날짜에 새 할 일을 추가합니다.",
        inputSchema: { type: "object", properties: { date: { type: "string", pattern: "^2026-\\d{2}-\\d{2}$" }, text: { type: "string", minLength: 1, maxLength: 80 } }, required: ["date", "text"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!/^2026-\d{2}-\d{2}$/.test(input?.date || "") || !input?.text?.trim()) throw new Error("올바른 2026년 날짜와 할 일을 입력하세요.");
          const date = dateFromKey(input.date);
          if (keyOf(date) !== input.date) throw new Error("유효하지 않은 날짜입니다.");
          state.todos[input.date] ||= [];
          state.todos[input.date].push({ id: crypto.randomUUID(), text: input.text.trim().slice(0, 80), done: false });
          selectedDate = input.date;
          visibleMonth = date.getMonth();
          saveState();
          renderAll();
          return { date: input.date, added: true, total: state.todos[input.date].length };
        }
      },
      {
        name: "start_focus_timer",
        title: "집중 타이머 시작",
        description: "현재 설정으로 뽀모도로 집중 타이머를 시작합니다.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute() {
          if (state.timer.mode !== "focus") {
            state.timer.mode = "focus";
            state.timer.duration = modeDuration("focus");
            state.timer.remaining = state.timer.duration;
          }
          startTimer();
          return { started: true, remainingSeconds: Math.ceil(state.timer.remaining), set: state.timer.currentSet };
        }
      },
      {
        name: "read_focus_summary",
        title: "집중 기록 조회",
        description: "지정한 날짜에 기록된 집중 시간과 완료 세트를 조회합니다.",
        inputSchema: { type: "object", properties: { date: { type: "string", pattern: "^2026-\\d{2}-\\d{2}$" } }, required: ["date"], additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input) {
          if (!/^2026-\d{2}-\d{2}$/.test(input?.date || "")) throw new Error("날짜를 YYYY-MM-DD 형식으로 입력하세요.");
          const stat = statFor(input.date);
          return { date: input.date, focusMinutes: Math.floor(stat.seconds / 60), completedSessions: stat.sessions };
        }
      }
    ];
    tools.forEach((tool) => { try { context.registerTool(tool); } catch (_) {} });
  }

  function bindEvents() {
    $("#prevMonth").addEventListener("click", () => { visibleMonth = Math.max(0, visibleMonth - 1); renderAll(); });
    $("#nextMonth").addEventListener("click", () => { visibleMonth = Math.min(11, visibleMonth + 1); renderAll(); });
    $("#todayButton").addEventListener("click", () => {
      const date = today.getFullYear() === YEAR ? today : new Date(YEAR, 0, 1);
      selectedDate = keyOf(date);
      visibleMonth = date.getMonth();
      renderAll();
    });
    $("#todoForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = $("#todoInput");
      const text = input.value.trim();
      if (!text) return;
      state.todos[selectedDate] ||= [];
      state.todos[selectedDate].push({ id: crypto.randomUUID(), text, done: false });
      input.value = "";
      saveState();
      renderAll();
    });
    $("#startPauseButton").addEventListener("click", () => state.timer.running ? pauseTimer() : startTimer());
    $("#resetButton").addEventListener("click", resetTimer);
    $("#skipButton").addEventListener("click", skipStage);
    $("#settingsButton").addEventListener("click", () => {
      const panel = $("#timerSettings");
      panel.hidden = !panel.hidden;
      $("#settingsButton").setAttribute("aria-expanded", String(!panel.hidden));
    });
    $("#applySettings").addEventListener("click", () => {
      const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || min));
      state.settings = {
        focus: clamp($("#focusMinutes").value, 1, 180),
        shortBreak: clamp($("#shortBreakMinutes").value, 1, 60),
        longBreak: clamp($("#longBreakMinutes").value, 1, 120),
        sets: clamp($("#totalSets").value, 1, 12)
      };
      state.timer.currentSet = Math.min(state.timer.currentSet, state.settings.sets);
      resetTimer();
      $("#timerSettings").hidden = true;
      $("#settingsButton").setAttribute("aria-expanded", "false");
      showToast("타이머 설정을 적용했어요.");
    });
    $("#shareButton").addEventListener("click", shareStatus);
    $("#nicknameInput").addEventListener("input", (event) => {
      state.profileName = event.target.value.trim().slice(0, 16) || initial.profileName;
      saveState();
      renderTimer();
    });
    $("#nicknameInput").addEventListener("blur", renderProfile);
    window.addEventListener("beforeunload", () => { if (state.timer.running) processTick(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && state.timer.running) processTick(); });
  }

  function hydrateSettings() {
    $("#focusMinutes").value = state.settings.focus;
    $("#shortBreakMinutes").value = state.settings.shortBreak;
    $("#longBreakMinutes").value = state.settings.longBreak;
    $("#totalSets").value = state.settings.sets;
  }

  function init() {
    const statusMatch = window.location.hash.match(/^#status=(.+)$/);
    if (statusMatch) {
      try { renderSharedView(decodeShare(statusMatch[1])); return; } catch (_) { history.replaceState(null, "", window.location.pathname); }
    }
    hydrateSettings();
    bindEvents();
    if (state.timer.running && state.timer.endAt) processTick();
    ensureTicker();
    renderAll();
    setupWebMCP();
  }

  init();
})();
