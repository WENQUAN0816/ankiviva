const STORAGE_KEYS = {
  users: "ankiviva.users",
  currentUser: "ankiviva.currentUser",
  profilePrefix: "ankiviva.profile.",
  responsesPrefix: "ankiviva.responses.",
};

const DB_NAME = "ankiviva-web-db";
const DB_VERSION = 1;
const RECORDING_STORE = "recordings";
const PREP_SECONDS = 3;
const RECORD_SECONDS = 45;
const FINAL_WARNING_SECONDS = 5;
const TRAINING_MODE_LABELS = {
  focus: "重点复习",
  topic: "主题全覆盖",
  mock: "模拟答辩",
};
const TRAINING_MODE_HINTS = {
  focus: "主问题全部保留，并额外加入我判断最容易被追问的高概率问题。",
  topic: "每个主问题下 A/B 两条追问都会完整练一遍，适合查漏补缺。",
  mock: "按真实答辩节奏，每组只走一条追问链，可选随机或手动分支。",
};
const FOCUS_BRANCH_SELECTIONS = Object.freeze({
  Q01: "A",
  Q04: "B",
  Q05: "A",
  Q06: "A",
  Q07: "B",
  Q08: "A",
  Q15: "A",
  Q18: "A",
  Q20: "A",
  Q22: "A",
  Q29: "A",
  Q30: "B",
});

const dom = {
  authOverlay: document.getElementById("authOverlay"),
  showLoginBtn: document.getElementById("showLoginBtn"),
  showRegisterBtn: document.getElementById("showRegisterBtn"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  registerUsername: document.getElementById("registerUsername"),
  registerPassword: document.getElementById("registerPassword"),
  registerPassword2: document.getElementById("registerPassword2"),
  authMessage: document.getElementById("authMessage"),
  logoutBtn: document.getElementById("logoutBtn"),
  currentUserLabel: document.getElementById("currentUserLabel"),
  serverModeLabel: document.getElementById("serverModeLabel"),
  trainingMode: document.getElementById("trainingMode"),
  orderMode: document.getElementById("orderMode"),
  branchModeRow: document.getElementById("branchModeRow"),
  branchMode: document.getElementById("branchMode"),
  playbackRate: document.getElementById("playbackRate"),
  trainingModeHint: document.getElementById("trainingModeHint"),
  prepareMicBtn: document.getElementById("prepareMicBtn"),
  startSessionBtn: document.getElementById("startSessionBtn"),
  resumeSessionBtn: document.getElementById("resumeSessionBtn"),
  pauseSessionBtn: document.getElementById("pauseSessionBtn"),
  endSessionBtn: document.getElementById("endSessionBtn"),
  micStatus: document.getElementById("micStatus"),
  chapterFilters: document.getElementById("chapterFilters"),
  groupCountLabel: document.getElementById("groupCountLabel"),
  focusPromptCountLabel: document.getElementById("focusPromptCountLabel"),
  fullPromptCountLabel: document.getElementById("fullPromptCountLabel"),
  singlePromptCountLabel: document.getElementById("singlePromptCountLabel"),
  exportSessionBtn: document.getElementById("exportSessionBtn"),
  sessionTitle: document.getElementById("sessionTitle"),
  groupProgressLabel: document.getElementById("groupProgressLabel"),
  promptProgressLabel: document.getElementById("promptProgressLabel"),
  timerLabel: document.getElementById("timerLabel"),
  chapterLabel: document.getElementById("chapterLabel"),
  questionMetaLabel: document.getElementById("questionMetaLabel"),
  promptTypeBadge: document.getElementById("promptTypeBadge"),
  promptListenHint: document.getElementById("promptListenHint"),
  promptTextLabel: document.getElementById("promptTextLabel"),
  promptTextZhLabel: document.getElementById("promptTextZhLabel"),
  questionTree: document.getElementById("questionTree"),
  referenceAnswerPanel: document.getElementById("referenceAnswerPanel"),
  answerPurposeBadge: document.getElementById("answerPurposeBadge"),
  answerPurposeText: document.getElementById("answerPurposeText"),
  answerConclusionText: document.getElementById("answerConclusionText"),
  answerLogicText: document.getElementById("answerLogicText"),
  answerEvidenceText: document.getElementById("answerEvidenceText"),
  answerBoundaryText: document.getElementById("answerBoundaryText"),
  toggleAnswerBtn: document.getElementById("toggleAnswerBtn"),
  previousPromptBtn: document.getElementById("previousPromptBtn"),
  playPromptBtn: document.getElementById("playPromptBtn"),
  restartAnswerBtn: document.getElementById("restartAnswerBtn"),
  recordToggleBtn: document.getElementById("recordToggleBtn"),
  nextPromptBtn: document.getElementById("nextPromptBtn"),
  statusLine: document.getElementById("statusLine"),
  branchChooser: document.getElementById("branchChooser"),
  saveNotesBtn: document.getElementById("saveNotesBtn"),
  clearNotesBtn: document.getElementById("clearNotesBtn"),
  notesEditor: document.getElementById("notesEditor"),
  attemptList: document.getElementById("attemptList"),
  refreshAttemptsBtn: document.getElementById("refreshAttemptsBtn"),
};

const state = {
  config: null,
  data: null,
  questionMap: new Map(),
  promptTranslations: {},
  referenceAnswers: {},
  currentUser: null,
  profile: null,
  session: null,
  mediaStream: null,
  mediaRecorder: null,
  recorderMimeType: "",
  recordChunks: [],
  currentPromptAudio: null,
  promptAudioUrlCache: new Map(),
  isRecording: false,
  promptPhase: "idle",
  promptTimerHandle: null,
  activePromptToken: null,
  recordStartedAt: null,
  activeRecordingPrompt: null,
  answerVisible: false,
  audioCueContext: null,
};

function supportsBrowserSpeech() {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof SpeechSynthesisUtterance !== "undefined";
}

function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function formatDate(value) {
  return new Date(value).toLocaleString("zh-CN");
}

function formatSeconds(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const mm = Math.floor(safe / 60).toString().padStart(2, "0");
  const ss = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function compareQuestionIds(left, right) {
  const leftNum = Number.parseInt(String(left.id || "").replace(/[^\d]/g, ""), 10);
  const rightNum = Number.parseInt(String(right.id || "").replace(/[^\d]/g, ""), 10);
  return leftNum - rightNum;
}

function buildMetaFromQuestions(questions, title = "AnkiViva Question Bank") {
  const chapters = {};
  for (const question of questions) {
    chapters[question.chapter] = (chapters[question.chapter] || 0) + 1;
  }
  const focusPromptCount = questions.reduce(
    (sum, question) => sum + (FOCUS_BRANCH_SELECTIONS[question.id] ? 3 : 1),
    0
  );
  return {
    title,
    groupCount: questions.length,
    focusPromptCount,
    fullPromptCount: questions.length * 5,
    singleBranchPromptCount: questions.length * 3,
    chapters,
  };
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function hashText(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function loadUsers() {
  return loadJson(STORAGE_KEYS.users, {});
}

function saveUsers(users) {
  saveJson(STORAGE_KEYS.users, users);
}

function getProfileKey(username) {
  return `${STORAGE_KEYS.profilePrefix}${username}`;
}

function getResponsesKey(username) {
  return `${STORAGE_KEYS.responsesPrefix}${username}`;
}

function defaultProfile() {
  return {
    settings: {
      trainingMode: "mock",
      orderMode: "chapter",
      branchMode: "random",
      playbackRate: "1",
      selectedChapters: [],
    },
    noteOverrides: {},
    activeSession: null,
  };
}

function normalizeTrainingMode(trainingMode, legacyBranchMode = "random") {
  if (trainingMode === "focus" || trainingMode === "topic" || trainingMode === "mock") {
    return trainingMode;
  }
  if (legacyBranchMode === "all") {
    return "topic";
  }
  return "mock";
}

function normalizeBranchMode(branchMode) {
  return branchMode === "manual" ? "manual" : "random";
}

function normalizeProfileSettings(settings = {}) {
  const fallback = defaultProfile().settings;
  return {
    ...fallback,
    ...settings,
    trainingMode: normalizeTrainingMode(settings.trainingMode, settings.branchMode),
    branchMode: normalizeBranchMode(settings.branchMode),
    playbackRate: String(settings.playbackRate || fallback.playbackRate),
    selectedChapters: Array.isArray(settings.selectedChapters) ? settings.selectedChapters : [],
  };
}

function normalizeSession(session) {
  if (!session) return null;
  return {
    ...session,
    trainingMode: normalizeTrainingMode(session.trainingMode, session.branchMode),
    branchMode: normalizeBranchMode(session.branchMode),
    branchSelections: session.branchSelections || {},
    isPaused: Boolean(session.isPaused),
    isCompleted: Boolean(session.isCompleted),
  };
}

function loadProfile(username) {
  const profile = loadJson(getProfileKey(username), null);
  if (!profile) {
    return defaultProfile();
  }

  const fallback = defaultProfile();
  return {
    ...fallback,
    ...profile,
    settings: normalizeProfileSettings(profile.settings || {}),
    noteOverrides: {
      ...fallback.noteOverrides,
      ...(profile.noteOverrides || {}),
    },
    activeSession: normalizeSession(profile.activeSession),
  };
}

function saveProfile() {
  if (!state.currentUser || !state.profile) return;
  saveJson(getProfileKey(state.currentUser), state.profile);
}

function updateSessionActionButtons() {
  const activeSession = state.profile?.activeSession ?? null;
  dom.resumeSessionBtn.disabled = !activeSession;
  dom.resumeSessionBtn.textContent = activeSession?.isPaused ? "继续已暂停练习" : "继续上次练习";

  const hasSession = Boolean(state.session);
  const sessionPaused = Boolean(state.session?.isPaused);
  const sessionCompleted = Boolean(state.session?.isCompleted);
  dom.pauseSessionBtn.disabled = !hasSession || sessionPaused || sessionCompleted || state.isRecording;
  dom.endSessionBtn.disabled = !hasSession || state.isRecording;
}

function clearPersistedActiveSession() {
  if (!state.profile) return;
  state.profile.activeSession = null;
  saveProfile();
  updateSessionActionButtons();
}

function getResponsesForUser(username = state.currentUser) {
  if (!username) return [];
  return loadJson(getResponsesKey(username), []);
}

function saveResponsesForUser(records, username = state.currentUser) {
  if (!username) return;
  saveJson(getResponsesKey(username), records.slice(-1000));
}

function addResponseRecord(record, username = state.currentUser) {
  const records = getResponsesForUser(username);
  records.push(record);
  saveResponsesForUser(records, username);
}

function updateStatus(message, type = "muted") {
  dom.statusLine.textContent = message;
  dom.statusLine.className = `message ${type}`;
}

async function fetchJson(url, fallback = null) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (fallback !== null) return fallback;
      throw new Error(`${url} -> ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch("./api/health");
    state.config = response.ok
      ? await response.json()
      : { uploadEnabled: false, azureSpeechEnabled: false, azureSpeechVoice: "" };
  } catch {
    state.config = { uploadEnabled: false, azureSpeechEnabled: false, azureSpeechVoice: "" };
  }
  state.config.browserSpeechEnabled = supportsBrowserSpeech();
}

async function loadQuestions() {
  const [baseData, extraData, promptTranslations, referenceAnswers] = await Promise.all([
    fetchJson("./data/questions.json"),
    fetchJson("./data/questions_extra.json", { questions: [] }),
    fetchJson("./data/prompt_translations.json", { prompts: {} }),
    fetchJson("./data/reference_answers_main.json", { answers: {} }),
  ]);

  const questions = [...(baseData.questions || []), ...(extraData.questions || [])].sort(compareQuestionIds);
  state.data = {
    meta: buildMetaFromQuestions(questions, baseData.meta?.title || "AnkiViva Question Bank"),
    questions,
  };
  state.questionMap = new Map(questions.map((question) => [question.id, question]));
  state.promptTranslations = promptTranslations.prompts || {};
  state.referenceAnswers = referenceAnswers.answers || {};
  dom.groupCountLabel.textContent = String(state.data.meta.groupCount);
  dom.focusPromptCountLabel.textContent = String(state.data.meta.focusPromptCount);
  dom.fullPromptCountLabel.textContent = String(state.data.meta.fullPromptCount);
  dom.singlePromptCountLabel.textContent = String(state.data.meta.singleBranchPromptCount);
}

async function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDING_STORE)) {
        db.createObjectStore(RECORDING_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveRecordingBlob(id, blob, meta) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORDING_STORE, "readwrite");
    tx.objectStore(RECORDING_STORE).put({ id, blob, meta });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getRecordingBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORDING_STORE, "readonly");
    const req = tx.objectStore(RECORDING_STORE).get(id);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => reject(req.error);
  });
}

function sanitizeFileSegment(value, fallback = "item") {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function formatExportIndex(index) {
  return String(index).padStart(3, "0");
}

function getAudioExtension(record, blob) {
  const mimeType = String(blob?.type || record?.mimeType || "").toLowerCase();
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return ".m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return ".mp3";
  if (mimeType.includes("ogg")) return ".ogg";
  if (mimeType.includes("wav")) return ".wav";
  return ".webm";
}

function downloadBlobFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadRecordingBlobForRecord(record) {
  if (record?.audioKey) {
    try {
      const blob = await getRecordingBlob(record.audioKey);
      if (blob) return blob;
    } catch {
      // Fall through to remote fetch when local IndexedDB audio is unavailable.
    }
  }

  if (record?.uploadUrl) {
    try {
      const response = await fetch(record.uploadUrl);
      if (response.ok) {
        return await response.blob();
      }
    } catch {
      // Ignore remote fetch failure and keep export moving.
    }
  }

  return null;
}

function buildSessionPromptOrderMap(session, responses = []) {
  const promptOrder = new Map();
  let cursor = 0;

  for (const groupId of session?.groupIds || []) {
    const group = state.questionMap.get(groupId);
    const prompts = getPromptSequenceForGroup(group, session);
    for (const prompt of prompts) {
      if (!promptOrder.has(prompt.promptId)) {
        cursor += 1;
        promptOrder.set(prompt.promptId, cursor);
      }
    }
  }

  for (const record of responses) {
    if (!promptOrder.has(record.promptId)) {
      cursor += 1;
      promptOrder.set(record.promptId, cursor);
    }
  }

  return promptOrder;
}

async function buildOrderedSessionExportItems(session, responses) {
  const promptOrder = buildSessionPromptOrderMap(session, responses);
  const sorted = [...responses].sort((left, right) => {
    const leftOrder = promptOrder.get(left.promptId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = promptOrder.get(right.promptId) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    const createdDiff = new Date(left.createdAt) - new Date(right.createdAt);
    if (createdDiff !== 0) return createdDiff;

    return String(left.id || "").localeCompare(String(right.id || ""));
  });

  const blobs = await Promise.all(sorted.map((record) => loadRecordingBlobForRecord(record)));
  const attemptsPerPrompt = new Map();

  return sorted.map((record, index) => {
    const attemptNumber = (attemptsPerPrompt.get(record.promptId) || 0) + 1;
    attemptsPerPrompt.set(record.promptId, attemptNumber);
    return {
      ...record,
      orderIndex: promptOrder.get(record.promptId) ?? Number.MAX_SAFE_INTEGER,
      exportIndex: index + 1,
      attemptNumber,
      audioBlob: blobs[index],
    };
  });
}

function buildExportQuestionText(item, audioPath) {
  const lines = [
    `Export index: ${formatExportIndex(item.exportIndex)}`,
    `Session ID: ${item.sessionId || "-"}`,
    `Prompt ID: ${item.promptId || "-"}`,
    `Group ID: ${item.groupId || "-"}`,
    `Chapter: ${item.chapter || "-"}`,
    `Type: ${item.typeLabel || "-"}`,
    `Attempt: ${item.attemptNumber}`,
    `Recorded at: ${item.createdAt || "-"}`,
    `Duration seconds: ${item.duration || 0}`,
    `Audio file: ${audioPath || "(missing)"}`,
  ];

  if (item.uploadUrl) {
    lines.push(`Uploaded URL: ${item.uploadUrl}`);
  }

  lines.push(
    "",
    "English question:",
    item.promptText || "",
    "",
    "Chinese question:",
    item.promptTextZh || ""
  );

  return lines.join("\r\n");
}

function buildExportSummaryText(session, items, exportedAt) {
  const lines = [
    "AnkiViva Session Export",
    `Session ID: ${session.id}`,
    `Training mode: ${session.trainingMode}`,
    `Order mode: ${session.orderMode}`,
    `Branch mode: ${session.branchMode}`,
    `Started at: ${session.startedAt}`,
    `Exported at: ${exportedAt}`,
    `Total exported answers: ${items.length}`,
    "",
    "Ordered files:",
  ];

  for (const item of items) {
    const indexLabel = formatExportIndex(item.exportIndex);
    const safePromptId = sanitizeFileSegment(item.promptId, "prompt");
    const safeType = sanitizeFileSegment(item.typeLabel, "answer");
    const audioExt = getAudioExtension(item, item.audioBlob);
    const audioFile = item.audioBlob
      ? `audio/${indexLabel}_${safePromptId}_${safeType}_answer${audioExt}`
      : "(missing)";

    lines.push(
      `${indexLabel} | ${item.promptId} | ${item.typeLabel} | attempt ${item.attemptNumber} | ${audioFile}`
    );
  }

  return lines.join("\r\n");
}

function getSelectedChapters() {
  const checked = [...dom.chapterFilters.querySelectorAll("input[type=checkbox]:checked")];
  return checked.map((node) => node.dataset.chapter);
}

function renderChapterFilters() {
  dom.chapterFilters.innerHTML = "";
  const selected = new Set(
    state.profile?.settings.selectedChapters?.length
      ? state.profile.settings.selectedChapters
      : Object.keys(state.data.meta.chapters)
  );

  for (const [chapter, count] of Object.entries(state.data.meta.chapters)) {
    const row = document.createElement("label");
    row.className = "checkbox-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(chapter);
    checkbox.dataset.chapter = chapter;
    const span = document.createElement("span");
    span.textContent = `${chapter} (${count})`;
    row.append(checkbox, span);
    dom.chapterFilters.appendChild(row);
  }
}

function applyProfileToControls() {
  const settings = state.profile?.settings ?? defaultProfile().settings;
  dom.trainingMode.value = settings.trainingMode;
  dom.orderMode.value = settings.orderMode;
  dom.branchMode.value = settings.branchMode;
  dom.playbackRate.value = String(settings.playbackRate || "1");
  updateTrainingModeControls();
}

function updateTrainingModeControls() {
  const trainingMode = dom.trainingMode.value;
  const isMockMode = trainingMode === "mock";
  dom.branchModeRow.classList.toggle("hidden", !isMockMode);
  dom.branchMode.disabled = !isMockMode;
  dom.trainingModeHint.textContent = TRAINING_MODE_HINTS[trainingMode] || "";
}

function setAuthTab(mode) {
  const loginMode = mode === "login";
  dom.loginForm.classList.toggle("hidden", !loginMode);
  dom.registerForm.classList.toggle("hidden", loginMode);
  dom.showLoginBtn.classList.toggle("active", loginMode);
  dom.showRegisterBtn.classList.toggle("active", !loginMode);
  dom.authMessage.textContent = "";
}

function getCurrentGroup() {
  if (!state.session) return null;
  const groupId = state.session.groupIds[state.session.currentGroupIndex];
  return state.questionMap.get(groupId) ?? null;
}

function buildMainPrompt(group) {
  return {
    promptId: `${group.id}-main`,
    groupId: group.id,
    chapter: group.chapter,
    groupTitle: group.title,
    typeLabel: "主问题",
    promptText: group.title,
    branch: null,
    depth: "main",
  };
}

function buildBranchPromptSequence(group, branchKey) {
  return [
    {
      promptId: `${group.id}-${branchKey}`,
      groupId: group.id,
      chapter: group.chapter,
      groupTitle: group.title,
      typeLabel: `第一层追问 ${branchKey}`,
      promptText: group.followups[branchKey].prompt,
      branch: branchKey,
      depth: "first",
    },
    {
      promptId: `${group.id}-${group.followups[branchKey].secondLevel.label}`,
      groupId: group.id,
      chapter: group.chapter,
      groupTitle: group.title,
      typeLabel: `第二层追问 ${group.followups[branchKey].secondLevel.label}`,
      promptText: group.followups[branchKey].secondLevel.prompt,
      branch: branchKey,
      depth: "second",
    },
  ];
}

function getFocusBranchSelection(groupId) {
  return FOCUS_BRANCH_SELECTIONS[groupId] || null;
}

function getPromptSequenceForGroup(group, session = state.session) {
  if (!group || !session) return [];

  const prompts = [buildMainPrompt(group)];
  if (session.trainingMode === "topic") {
    prompts.push(...buildBranchPromptSequence(group, "A"), ...buildBranchPromptSequence(group, "B"));
    return prompts;
  }

  if (session.trainingMode === "focus") {
    const focusBranch = getFocusBranchSelection(group.id);
    if (focusBranch) {
      prompts.push(...buildBranchPromptSequence(group, focusBranch));
    }
    return prompts;
  }

  const selection = session.branchSelections[group.id];
  if (selection) {
    prompts.push(...buildBranchPromptSequence(group, selection));
  }
  return prompts;
}

function getCurrentPromptSequence() {
  return getPromptSequenceForGroup(getCurrentGroup(), state.session);
}

function getProjectedPromptCountForGroup(group, session = state.session) {
  if (!group || !session) return 0;
  if (session.trainingMode === "topic") return 5;
  if (session.trainingMode === "focus") {
    return getFocusBranchSelection(group.id) ? 3 : 1;
  }
  return 3;
}

function getCurrentPrompt() {
  const sequence = getCurrentPromptSequence();
  if (!sequence.length || !state.session) return null;
  return sequence[state.session.currentPromptIndex] ?? null;
}

function getPromptEnglish(prompt) {
  if (!prompt) return "";
  return state.promptTranslations[prompt.promptId] || prompt.promptText;
}

function getPromptChinese(prompt) {
  return prompt?.promptText || "";
}

function getReferenceAnswer(prompt) {
  if (!prompt) return null;
  return state.referenceAnswers[prompt.promptId] || null;
}

function getTotalPromptTarget() {
  if (!state.session) return 0;
  return state.session.groupIds.reduce((sum, groupId) => {
    const group = state.questionMap.get(groupId);
    return sum + getProjectedPromptCountForGroup(group, state.session);
  }, 0);
}

function getAnsweredPromptCount() {
  if (!state.session) return 0;
  let completed = 0;
  for (let index = 0; index < state.session.currentGroupIndex; index += 1) {
    const groupId = state.session.groupIds[index];
    const group = state.questionMap.get(groupId);
    completed += getProjectedPromptCountForGroup(group, state.session);
  }
  return completed + state.session.currentPromptIndex;
}

function getNoteValue(prompt) {
  return state.profile?.noteOverrides?.[prompt.promptId] ?? "";
}

function getCurrentPlaybackRate() {
  const parsed = Number.parseFloat(dom.playbackRate.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function hasPreviousPrompt() {
  if (!state.session) return false;
  return state.session.currentPromptIndex > 0 || state.session.currentGroupIndex > 0;
}

function persistSession() {
  if (!state.profile) return;
  state.profile.activeSession = normalizeSession(state.session);
  saveProfile();
  updateSessionActionButtons();
}

function clearPromptAutomation() {
  if (state.promptTimerHandle) {
    clearInterval(state.promptTimerHandle);
    state.promptTimerHandle = null;
  }
}

function stopPromptAudioPlayback() {
  if (state.currentPromptAudio) {
    if (typeof state.currentPromptAudio.pause === "function") {
      state.currentPromptAudio.pause();
      state.currentPromptAudio.currentTime = 0;
    } else if (state.currentPromptAudio.kind === "speech" && supportsBrowserSpeech()) {
      window.speechSynthesis.cancel();
    }
    state.currentPromptAudio = null;
  }
}

function setTimerValue(seconds, options = {}) {
  const { danger = false } = options;
  dom.timerLabel.textContent = formatSeconds(seconds);
  dom.timerLabel.classList.toggle("timer-danger", danger);
}

async function primeAudioCueContext() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!state.audioCueContext) {
    state.audioCueContext = new AudioContextCtor();
  }
  if (state.audioCueContext.state === "suspended") {
    try {
      await state.audioCueContext.resume();
    } catch {
      return null;
    }
  }
  return state.audioCueContext;
}

async function playBeep({ frequency, duration, type, volume }) {
  const context = await primeAudioCueContext();
  if (!context) return;

  const startAt = context.currentTime;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

function playRecordingStartCue() {
  void playBeep({
    frequency: 920,
    duration: 0.22,
    type: "triangle",
    volume: 0.08,
  });
}

function playCountdownCue() {
  void playBeep({
    frequency: 660,
    duration: 0.12,
    type: "square",
    volume: 0.06,
  });
}

function updatePromptControls() {
  const hasPrompt = Boolean(getCurrentPrompt() && state.session);
  const sessionCompleted = Boolean(state.session?.isCompleted);
  const sessionPaused = Boolean(state.session?.isPaused);
  const replayingQuestion = state.promptPhase === "question_replay";
  const canPrevious = hasPrompt && !state.isRecording && !sessionPaused && hasPreviousPrompt() && !replayingQuestion;
  const canReplay = hasPrompt && !state.isRecording && !sessionPaused && state.promptPhase === "finished";
  const canRestart = hasPrompt && !state.isRecording && !sessionPaused && !replayingQuestion;
  const canStop = hasPrompt && state.isRecording;
  const canNext =
    hasPrompt && !state.isRecording && !sessionPaused && state.promptPhase === "finished" && !sessionCompleted;

  dom.previousPromptBtn.disabled = !canPrevious;
  dom.playPromptBtn.disabled = !canReplay;
  dom.restartAnswerBtn.disabled = !canRestart;
  dom.recordToggleBtn.disabled = !canStop;
  dom.nextPromptBtn.disabled = !canNext;
  dom.recordToggleBtn.textContent = "提前结束录音";
  updateSessionActionButtons();
  updateAnswerToggleButton();
}

function hidePromptTexts() {
  dom.promptListenHint.textContent = "Listen to the examiner's question first.";
  dom.promptListenHint.classList.remove("hidden");
  dom.promptTextLabel.textContent = "";
  dom.promptTextZhLabel.textContent = "";
  dom.promptTextLabel.classList.add("hidden");
  dom.promptTextZhLabel.classList.add("hidden");
}

function showPromptTexts(prompt) {
  dom.promptListenHint.classList.add("hidden");
  dom.promptTextLabel.textContent = getPromptEnglish(prompt);
  dom.promptTextZhLabel.textContent = getPromptChinese(prompt);
  dom.promptTextLabel.classList.remove("hidden");
  dom.promptTextZhLabel.classList.remove("hidden");
}

function hideReferenceAnswer() {
  state.answerVisible = false;
  dom.referenceAnswerPanel.classList.add("hidden");
  dom.answerPurposeBadge.textContent = "Purpose";
  dom.answerPurposeText.textContent = "老师提问目的会显示在这里。";
  dom.answerConclusionText.textContent = "-";
  dom.answerLogicText.textContent = "-";
  dom.answerEvidenceText.textContent = "-";
  dom.answerBoundaryText.textContent = "-";
  updateAnswerToggleButton();
}

function showReferenceAnswer(prompt) {
  const answer = getReferenceAnswer(prompt);
  if (!answer) {
    hideReferenceAnswer();
    return false;
  }

  state.answerVisible = false;
  dom.referenceAnswerPanel.classList.add("hidden");
  dom.answerPurposeBadge.textContent = "Purpose";
  dom.answerPurposeText.textContent = answer.purposeZh || "";
  dom.answerConclusionText.textContent = answer.conclusion || "-";
  dom.answerLogicText.textContent = answer.logic || "-";
  dom.answerEvidenceText.textContent = answer.evidence || "-";
  dom.answerBoundaryText.textContent = answer.boundary || "-";
  updateAnswerToggleButton();
  return true;
}

function updateAnswerToggleButton() {
  const prompt = getCurrentPrompt();
  if (!prompt) {
    dom.toggleAnswerBtn.disabled = true;
    dom.toggleAnswerBtn.textContent = "查看结构化答案";
    return;
  }
  const hasAnswer = Boolean(prompt && getReferenceAnswer(prompt));
  const canToggle = hasAnswer && (state.promptPhase === "recording" || state.promptPhase === "finished");
  dom.toggleAnswerBtn.disabled = !canToggle;
  if (!hasAnswer) {
    dom.toggleAnswerBtn.textContent = "本题暂无结构化答案";
    return;
  }
  if (!canToggle) {
    dom.toggleAnswerBtn.textContent = "开始录音后可查看答案";
    return;
  }
  dom.toggleAnswerBtn.textContent = state.answerVisible ? "隐藏结构化答案" : "查看结构化答案";
}

function toggleReferenceAnswer() {
  if (dom.toggleAnswerBtn.disabled) return;
  state.answerVisible = !state.answerVisible;
  dom.referenceAnswerPanel.classList.toggle("hidden", !state.answerVisible);
  updateAnswerToggleButton();
}

function renderQuestionTree(group, prompt) {
  dom.questionTree.innerHTML = "";
  if (!group || !prompt) return;

  const currentSequence = getCurrentPromptSequence();
  const trainingMode = state.session?.trainingMode;
  const selectedBranch = state.session?.branchSelections?.[group.id] ?? null;
  const focusBranch = getFocusBranchSelection(group.id);
  const article = document.createElement("article");
  article.className = "tree-node active current-only";

  const head = document.createElement("div");
  head.className = "tree-node-head";

  const tag = document.createElement("span");
  tag.className = "tree-node-tag";
  tag.textContent = prompt.typeLabel;
  head.appendChild(tag);

  const order = document.createElement("span");
  order.className = "muted";
  order.textContent = `本组第 ${state.session.currentPromptIndex + 1} / ${currentSequence.length} 题`;
  head.appendChild(order);

  if (selectedBranch && trainingMode === "mock") {
    const branch = document.createElement("span");
    branch.className = "muted";
    branch.textContent = `当前分支：${selectedBranch}`;
    head.appendChild(branch);
  }

  const text = document.createElement("p");
  text.className = "tree-node-text";
  if (prompt.depth === "main") {
    text.textContent = "Current step: answer the main viva question for this group.";
  } else if (prompt.depth === "first") {
    text.textContent = "Current step: answer the first follow-up question only.";
  } else {
    text.textContent = "Current step: answer the second follow-up question only.";
  }

  const note = document.createElement("p");
  note.className = "tree-note muted";

  if (trainingMode === "mock" && state.session?.branchMode === "manual" && prompt.depth === "main" && !selectedBranch) {
    note.textContent = "先只回答这道主问题。录音结束后，再选择 A 或 B 进入下一道追问。";
  } else if (trainingMode === "focus" && prompt.depth === "main" && focusBranch) {
    note.textContent = `当前是重点复习模式。答完主问题后，会继续进入我预设的高概率追问 ${focusBranch} 线。`;
  } else if (trainingMode === "focus" && prompt.depth === "main") {
    note.textContent = "当前是重点复习模式。本题只练主问题，用来快速打稳主线。";
  } else if (trainingMode === "focus") {
    note.textContent = "这是重点复习模式里的高概率追问，建议重点打磨这条回答链。";
  } else if (trainingMode === "topic" && prompt.depth === "main") {
    note.textContent = "当前是主题模式。本题主问题答完后，A/B 两条追问都会完整练一遍。";
  } else if (trainingMode === "topic") {
    note.textContent = "当前是主题模式。你正在按完整题树逐条练习这一条分支问题。";
  } else if (prompt.depth === "main") {
    note.textContent = "当前是模拟答辩模式。本组只走一条追问链，录音会只保存到这道当前题目下。";
  } else if (prompt.depth === "first") {
    note.textContent = "当前只回答这一道第一层追问。录音只对应这道追问。";
  } else {
    note.textContent = "当前只回答这一道第二层追问。录音只对应这道追问。";
  }

  article.append(head, text, note);
  dom.questionTree.appendChild(article);
}

function renderPrompt(resetNotes = false) {
  const prompt = getCurrentPrompt();
  const group = getCurrentGroup();

  clearPromptAutomation();
  stopPromptAudioPlayback();
  state.promptPhase = "idle";
  state.activePromptToken = null;

  if (!prompt || !group || !state.session) {
    dom.sessionTitle.textContent = "请先开始练习";
    dom.chapterLabel.textContent = "Chapter";
    dom.questionMetaLabel.textContent = "题目尚未开始";
    dom.promptTypeBadge.textContent = "待开始";
    dom.groupProgressLabel.textContent = "0 / 0";
    dom.promptProgressLabel.textContent = "0 / 0";
    hidePromptTexts();
    hideReferenceAnswer();
    dom.questionTree.innerHTML = "";
    dom.notesEditor.value = "";
    dom.timerLabel.textContent = "00:00";
    dom.branchChooser.classList.add("hidden");
    renderAttemptsForCurrentPrompt();
    updatePromptControls();
    return;
  }

  const modeLabel = TRAINING_MODE_LABELS[state.session.trainingMode] || TRAINING_MODE_LABELS.mock;
  const branchModeLabel = state.session.trainingMode === "mock"
    ? ` · ${state.session.branchMode === "manual" ? "手动追问" : "随机追问"}`
    : "";
  const sessionStateLabel = state.session.isPaused ? " · 已暂停" : state.session.isCompleted ? " · 已结束" : "";
  dom.sessionTitle.textContent =
    `当前练习：${state.session.orderMode === "random" ? "乱序" : "按章节顺序"} · ${modeLabel}${branchModeLabel}${sessionStateLabel}`;
  dom.chapterLabel.textContent = group.chapter;
  dom.questionMetaLabel.textContent = `${group.id} · ${prompt.typeLabel}`;
  dom.promptTypeBadge.textContent = prompt.typeLabel;
  dom.groupProgressLabel.textContent = `${state.session.currentGroupIndex + 1} / ${state.session.groupIds.length}`;
  dom.promptProgressLabel.textContent = `${getAnsweredPromptCount() + 1} / ${getTotalPromptTarget()}`;
  hidePromptTexts();
  hideReferenceAnswer();
  dom.notesEditor.value = resetNotes ? getNoteValue(prompt) : getNoteValue(prompt);
  dom.branchChooser.classList.add("hidden");
  setTimerValue(0);
  renderQuestionTree(group, prompt);
  renderAttemptsForCurrentPrompt();
  if (state.session.isPaused) {
    updateStatus("练习已暂停。点击“继续已暂停练习”会从当前题重新开始。", "muted");
    updatePromptControls();
    return;
  }
  startPromptCycle();
}

async function prepareMic() {
  try {
    await primeAudioCueContext();
    if (!state.mediaStream) {
      state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    const tracks = state.mediaStream.getAudioTracks();
    const label = tracks[0]?.label || "系统默认麦克风";
    dom.micStatus.textContent = `麦克风已就绪：${label}`;
    updateStatus("麦克风初始化成功。", "good");
    return true;
  } catch (error) {
    dom.micStatus.textContent = `麦克风初始化失败：${error.message}`;
    updateStatus(`麦克风初始化失败：${error.message}`, "danger");
    return false;
  }
}

function getFreshRecordingStream() {
  if (!state.mediaStream) {
    throw new Error("请先初始化麦克风。");
  }
  const liveTracks = state.mediaStream.getAudioTracks().filter((track) => track.readyState === "live");
  if (!liveTracks.length) {
    throw new Error("当前没有可用的 live 音频轨道。");
  }
  return new MediaStream(liveTracks);
}

function createRecorderFromStream(stream) {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", ""];
  let lastError = null;
  for (const mimeType of candidates) {
    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      state.recorderMimeType = mimeType || recorder.mimeType || "";
      return recorder;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("浏览器无法为当前音频流创建录音器。");
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("无法读取音频文件。"));
        return;
      }
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function uploadRecording(blob, record) {
  try {
    const response = await fetch("./api/upload-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: state.currentUser,
        promptId: record.promptId,
        typeLabel: record.typeLabel,
        mimeType: blob.type || "audio/webm",
        fileName: `${record.id}.webm`,
        audioBase64: await blobToBase64(blob),
      }),
    });
    if (!response.ok) {
      throw new Error(`upload failed: ${response.status}`);
    }
    return await response.json();
  } catch {
    return null;
  }
}

async function getPromptAudioUrl(prompt) {
  if (!prompt) return null;
  if (state.promptAudioUrlCache.has(prompt.promptId)) {
    return state.promptAudioUrlCache.get(prompt.promptId);
  }

  const response = await fetch("./api/synthesize-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      promptId: prompt.promptId,
      text: getPromptEnglish(prompt),
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS ${response.status}`);
  }

  const data = await response.json();
  if (!data.url) {
    throw new Error("TTS returned no audio URL.");
  }

  state.promptAudioUrlCache.set(prompt.promptId, data.url);
  return data.url;
}

async function playQuestionAudio(promptToken, prompt) {
  const audioUrl = await getPromptAudioUrl(prompt);
  if (state.activePromptToken !== promptToken || !audioUrl) return;

  updateStatus("正在播放英文评委提问…", "muted");
  const audio = new Audio(audioUrl);
  audio.playbackRate = getCurrentPlaybackRate();
  state.currentPromptAudio = audio;

  await new Promise((resolve, reject) => {
    audio.onended = () => {
      state.currentPromptAudio = null;
      resolve(true);
    };
    audio.onerror = () => {
      state.currentPromptAudio = null;
      reject(new Error("English prompt audio failed to play."));
    };
    audio.play().catch(reject);
  });
}

async function speakPromptWithBrowserSpeech(promptToken, prompt) {
  if (!supportsBrowserSpeech()) {
    throw new Error("Browser speech synthesis is not available.");
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  await new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(getPromptEnglish(prompt));
    utterance.lang = "en-GB";
    utterance.rate = getCurrentPlaybackRate();
    utterance.pitch = 1;

    state.currentPromptAudio = {
      kind: "speech",
      utterance,
    };

    utterance.onend = () => {
      state.currentPromptAudio = null;
      resolve(true);
    };
    utterance.onerror = (event) => {
      state.currentPromptAudio = null;
      reject(new Error(event.error || "Browser speech failed."));
    };

    if (state.activePromptToken !== promptToken) {
      state.currentPromptAudio = null;
      resolve(true);
      return;
    }

    synth.speak(utterance);
  });
}

async function playQuestionAudioCompat(promptToken, prompt) {
  if (state.config?.azureSpeechEnabled) {
    try {
      await playQuestionAudio(promptToken, prompt);
      return;
    } catch (error) {
      if (!state.config?.browserSpeechEnabled) {
        throw error;
      }
    }
  }

  updateStatus("Using browser speech for the English examiner question.", "muted");
  await speakPromptWithBrowserSpeech(promptToken, prompt);
}

function startPromptCycle() {
  const prompt = getCurrentPrompt();
  if (!prompt || !state.session || state.session.isCompleted || state.session.isPaused) {
    updatePromptControls();
    return;
  }

  clearPromptAutomation();
  stopPromptAudioPlayback();
  state.promptPhase = "question_audio";
  state.activePromptToken = uid("prompt");
  const promptToken = state.activePromptToken;
  setTimerValue(0);
  updatePromptControls();
  hidePromptTexts();
  hideReferenceAnswer();

  (async () => {
    try {
      await playQuestionAudioCompat(promptToken, prompt);
      if (state.activePromptToken !== promptToken) return;

      state.promptPhase = "prepare";
      let remaining = PREP_SECONDS;
      setTimerValue(remaining);
      updatePromptControls();
      updateStatus(`英文问题播放结束，${PREP_SECONDS} 秒后自动录音。`, "muted");

      state.promptTimerHandle = window.setInterval(() => {
        if (state.activePromptToken !== promptToken) return;
        remaining -= 1;
        if (remaining > 0) {
          setTimerValue(remaining);
          updateStatus(`准备倒计时：还剩 ${remaining} 秒。`, "muted");
          return;
        }

        clearPromptAutomation();
        beginAutoRecording(promptToken).catch((error) => {
          state.promptPhase = "error";
          updatePromptControls();
          updateStatus(`无法开始录音：${error.message}`, "danger");
        });
      }, 1000);
    } catch (error) {
      state.promptPhase = "error";
      updatePromptControls();
      updateStatus(`无法播放英文问题：${error.message}`, "danger");
    }
  })();
}

async function beginAutoRecording(promptToken) {
  if (state.activePromptToken !== promptToken) return;
  const prompt = getCurrentPrompt();
  if (!prompt) return;

  showPromptTexts(prompt);
  showReferenceAnswer(prompt);

  const stream = getFreshRecordingStream();
  state.recordChunks = [];
  state.mediaRecorder = createRecorderFromStream(stream);
  state.activeRecordingPrompt = {
    ...prompt,
    recordingUser: state.currentUser,
    recordingSessionId: state.session?.id,
    promptTextEn: getPromptEnglish(prompt),
    promptTextZh: getPromptChinese(prompt),
  };
  state.recordStartedAt = Date.now();

  state.mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      state.recordChunks.push(event.data);
    }
  };

  state.mediaRecorder.onstop = async () => {
    const finishedPrompt = state.activeRecordingPrompt;
    const blob = new Blob(state.recordChunks, { type: state.recorderMimeType || "audio/webm" });
    const duration = state.recordStartedAt
      ? Math.max(1, Math.round((Date.now() - state.recordStartedAt) / 1000))
      : 0;

    state.isRecording = false;
    state.promptPhase = "finished";
    state.recordStartedAt = null;
    state.activeRecordingPrompt = null;
    setTimerValue(0);
    updatePromptControls();

    if (!finishedPrompt || !blob.size) {
      updateStatus("录音没有成功保存，请重试本题。", "danger");
      return;
    }

    const audioKey = uid("audio");
    await saveRecordingBlob(audioKey, blob, {
      user: finishedPrompt.recordingUser,
      promptId: finishedPrompt.promptId,
      createdAt: nowIso(),
    });

    const record = {
      id: uid("resp"),
      sessionId: finishedPrompt.recordingSessionId,
      user: finishedPrompt.recordingUser,
      promptId: finishedPrompt.promptId,
      groupId: finishedPrompt.groupId,
      chapter: finishedPrompt.chapter,
      typeLabel: finishedPrompt.typeLabel,
      promptText: finishedPrompt.promptTextEn,
      promptTextZh: finishedPrompt.promptTextZh,
      createdAt: nowIso(),
      duration,
      mimeType: blob.type || state.recorderMimeType || "audio/webm",
      audioKey,
      uploadUrl: null,
    };

    const uploadResult = await uploadRecording(blob, record);
    if (uploadResult?.url) {
      record.uploadUrl = uploadResult.url;
    }

    addResponseRecord(record, finishedPrompt.recordingUser);
    await renderAttemptsForCurrentPrompt();
    updateStatus(record.uploadUrl ? "录音已自动结束并上传。" : "录音已自动结束并保存。", "good");
  };

  state.mediaRecorder.start(1000);
  playRecordingStartCue();
  state.isRecording = true;
  state.promptPhase = "recording";
  updatePromptControls();

  let remaining = RECORD_SECONDS;
  setTimerValue(remaining);
  updateStatus(`自动录音已开始，你有 ${RECORD_SECONDS} 秒回答时间。`, "good");

  state.promptTimerHandle = window.setInterval(() => {
    if (state.activePromptToken !== promptToken) return;
    remaining -= 1;
    const isDanger = remaining > 0 && remaining <= FINAL_WARNING_SECONDS;
    setTimerValue(remaining, { danger: isDanger });
    if (isDanger) {
      playCountdownCue();
    }
    if (remaining <= 0) {
      stopRecording("auto");
    }
  }, 1000);
}

function stopRecording(reason = "manual") {
  if (!state.isRecording || !state.mediaRecorder) return;
  clearPromptAutomation();
  setTimerValue(0);
  updateStatus(
    reason === "auto" ? "45 秒已到，正在保存录音…" : "已提前结束录音，正在保存…",
    "muted"
  );
  try {
    state.mediaRecorder.stop();
  } catch (error) {
    state.isRecording = false;
    state.promptPhase = "error";
    updatePromptControls();
    updateStatus(`停止录音失败：${error.message}`, "danger");
  }
}

function restartCurrentPrompt() {
  if (!state.session || state.isRecording || state.session.isPaused) return;
  if (state.session.isCompleted) {
    state.session.isCompleted = false;
    persistSession();
  }
  renderPrompt(true);
}

async function replayCurrentQuestionAudio() {
  const prompt = getCurrentPrompt();
  if (!prompt || !state.session || state.isRecording || state.session.isPaused || state.promptPhase !== "finished") {
    return;
  }

  stopPromptAudioPlayback();
  const previousToken = state.activePromptToken;
  const replayToken = uid("prompt-replay");
  state.activePromptToken = replayToken;
  state.promptPhase = "question_replay";
  updatePromptControls();

  try {
    await playQuestionAudioCompat(replayToken, prompt);
  } catch (error) {
    if (state.activePromptToken !== replayToken) return;
    state.activePromptToken = previousToken;
    state.promptPhase = "finished";
    updatePromptControls();
    updateStatus(`Unable to replay the English question: ${error.message}`, "danger");
    return;
  }

  if (state.activePromptToken !== replayToken) return;
  state.activePromptToken = previousToken;
  state.promptPhase = "finished";
  updatePromptControls();
  updateStatus("English question replay finished. You can continue or restart this answer.", "muted");
}

function goToPreviousPrompt() {
  if (!state.session || state.isRecording || state.session.isPaused || !hasPreviousPrompt()) return;

  if (state.session.isCompleted) {
    state.session.isCompleted = false;
  }

  if (state.session.currentPromptIndex > 0) {
    state.session.currentPromptIndex -= 1;
  } else {
    state.session.currentGroupIndex -= 1;
    const previousSequence = getCurrentPromptSequence();
    state.session.currentPromptIndex = Math.max(previousSequence.length - 1, 0);
  }

  persistSession();
  renderPrompt(true);
}

function persistNotes() {
  const prompt = getCurrentPrompt();
  if (!prompt || !state.profile) return;
  state.profile.noteOverrides[prompt.promptId] = dom.notesEditor.value;
  saveProfile();
  updateStatus("备答已保存。", "good");
}

function clearNotes() {
  dom.notesEditor.value = "";
  persistNotes();
}

function chooseBranch(branchKey) {
  const group = getCurrentGroup();
  if (
    !group ||
    !state.session ||
    state.session.isPaused ||
    state.session.trainingMode !== "mock" ||
    state.session.branchMode !== "manual"
  ) {
    return;
  }
  state.session.branchSelections[group.id] = branchKey;
  state.session.currentPromptIndex = 1;
  persistSession();
  dom.branchChooser.classList.add("hidden");
  renderPrompt(true);
}

function advancePrompt() {
  if (!state.session || state.session.isPaused || state.promptPhase !== "finished" || state.isRecording) return;

  const group = getCurrentGroup();
  const prompt = getCurrentPrompt();
  if (!group || !prompt) return;

  if (
    state.session.trainingMode === "mock" &&
    state.session.branchMode === "manual" &&
    prompt.depth === "main" &&
    !state.session.branchSelections[group.id]
  ) {
    dom.branchChooser.classList.remove("hidden");
    dom.nextPromptBtn.disabled = true;
    dom.playPromptBtn.disabled = true;
    updateStatus("请选择 A 或 B 分支，然后系统会自动开始下一题。", "muted");
    return;
  }

  const promptSequence = getCurrentPromptSequence();
  if (state.session.currentPromptIndex < promptSequence.length - 1) {
    state.session.currentPromptIndex += 1;
  } else if (state.session.currentGroupIndex < state.session.groupIds.length - 1) {
    state.session.currentGroupIndex += 1;
    state.session.currentPromptIndex = 0;
    const nextGroup = getCurrentGroup();
    if (
      state.session.trainingMode === "mock" &&
      state.session.branchMode === "random" &&
      nextGroup &&
      !state.session.branchSelections[nextGroup.id]
    ) {
      state.session.branchSelections[nextGroup.id] = Math.random() < 0.5 ? "A" : "B";
    }
  } else {
    state.session.isCompleted = true;
    clearPersistedActiveSession();
    updatePromptControls();
    dom.nextPromptBtn.disabled = true;
    updateStatus("本轮练习已经完成。你可以导出结果或重启最后一题。", "good");
    return;
  }

  persistSession();
  renderPrompt(true);
}

function applySessionToControls(session) {
  if (!session) return;
  dom.trainingMode.value = session.trainingMode;
  dom.orderMode.value = session.orderMode;
  dom.branchMode.value = session.branchMode;
  updateTrainingModeControls();
}

function pauseCurrentSession() {
  if (!state.session) {
    updateStatus("当前没有进行中的练习。", "danger");
    return;
  }
  if (state.isRecording) {
    updateStatus("正在录音时不能暂停。请先结束当前录音。", "danger");
    return;
  }
  if (state.session.isCompleted) {
    updateStatus("本轮练习已经结束。", "muted");
    return;
  }
  if (state.session.isPaused) {
    updateStatus("当前练习已经处于暂停状态。", "muted");
    return;
  }

  clearPromptAutomation();
  stopPromptAudioPlayback();
  state.promptPhase = "idle";
  state.activePromptToken = null;
  state.session.isPaused = true;
  persistSession();
  renderPrompt(false);
}

function endCurrentSession() {
  if (!state.session) {
    updateStatus("当前没有进行中的练习。", "danger");
    return;
  }
  if (state.isRecording) {
    updateStatus("正在录音时不能直接结束。请先结束当前录音。", "danger");
    return;
  }
  if (!window.confirm("结束当前练习后，将不能继续本轮进度，但已保存的录音仍会保留。确定结束吗？")) {
    return;
  }

  clearPromptAutomation();
  stopPromptAudioPlayback();
  state.promptPhase = "idle";
  state.activePromptToken = null;
  clearPersistedActiveSession();
  state.session = null;
  renderPrompt(false);
  updateStatus("已结束当前练习。已保存的录音仍然保留。", "muted");
}

async function renderAttemptsForCurrentPrompt() {
  const prompt = getCurrentPrompt();
  dom.attemptList.innerHTML = "";
  if (!prompt || !state.currentUser) {
    dom.attemptList.innerHTML = '<p class="muted">暂无记录。</p>';
    return;
  }

  const records = getResponsesForUser()
    .filter((record) => record.promptId === prompt.promptId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  if (!records.length) {
    dom.attemptList.innerHTML = '<p class="muted">当前题目还没有作答记录。</p>';
    return;
  }

  for (const record of records) {
    const wrapper = document.createElement("article");
    wrapper.className = "attempt-item";

    const meta = document.createElement("div");
    meta.className = "attempt-meta";
    const uploadClass = record.uploadUrl ? "attempt-status-uploaded" : "";
    meta.innerHTML = `
      <span>${record.typeLabel}</span>
      <span>${formatDate(record.createdAt)}</span>
      <span>${record.duration}s</span>
      <span class="${uploadClass}">${record.uploadUrl ? "已上传" : "本地保存"}</span>
    `;
    wrapper.appendChild(meta);

    const audio = document.createElement("audio");
    audio.controls = true;
    if (record.uploadUrl) {
      audio.src = record.uploadUrl;
    } else if (record.audioKey) {
      const blob = await getRecordingBlob(record.audioKey);
      if (blob) {
        audio.src = URL.createObjectURL(blob);
      }
    }
    wrapper.appendChild(audio);
    dom.attemptList.appendChild(wrapper);
  }
}

async function exportCurrentSession() {
  if (!state.session || !state.currentUser) {
    updateStatus("当前没有可导出的练习。", "danger");
    return;
  }
  const responses = getResponsesForUser().filter((record) => record.sessionId === state.session.id);
  if (!responses.length) {
    updateStatus("å½“å‰ç»ƒä¹ è¿˜æ²¡æœ‰å¯å¯¼å‡ºçš„å½•éŸ³ã€‚", "danger");
    return;
  }

  const JSZipCtor = window.JSZip;
  if (typeof JSZipCtor !== "function") {
    updateStatus("å¯¼å‡º zip åŠŸèƒ½æœªåŠ è½½å®Œæˆï¼Œè¯·åˆ·æ–°é¡µé¢åŽé‡è¯•ã€‚", "danger");
    return;
  }

  const originalLabel = dom.exportSessionBtn.textContent;
  dom.exportSessionBtn.disabled = true;
  dom.exportSessionBtn.textContent = "æ­£åœ¨æ‰“åŒ… ZIP...";
  updateStatus("æ­£åœ¨æ‰“åŒ…é¢˜ç›®æ–‡æœ¬å’Œå½•éŸ³éŸ³é¢‘â€¦", "muted");

  try {
    const exportedAt = nowIso();
    const items = await buildOrderedSessionExportItems(state.session, responses);
    const zip = new JSZipCtor();
    const questionFolder = zip.folder("questions");
    const audioFolder = zip.folder("audio");
    const manifestItems = [];

    for (const item of items) {
      const indexLabel = formatExportIndex(item.exportIndex);
      const safePromptId = sanitizeFileSegment(item.promptId, "prompt");
      const safeType = sanitizeFileSegment(item.typeLabel, "answer");
      const baseName = `${indexLabel}_${safePromptId}_${safeType}`;
      const audioExt = getAudioExtension(item, item.audioBlob);
      const audioFileName = `${baseName}_answer${audioExt}`;
      const audioPath = item.audioBlob ? `audio/${audioFileName}` : "";

      questionFolder.file(
        `${baseName}_question.txt`,
        buildExportQuestionText(item, audioPath)
      );

      if (item.audioBlob) {
        audioFolder.file(audioFileName, item.audioBlob);
      }

      manifestItems.push({
        exportIndex: item.exportIndex,
        promptOrder: item.orderIndex,
        attemptNumber: item.attemptNumber,
        promptId: item.promptId,
        groupId: item.groupId,
        chapter: item.chapter,
        typeLabel: item.typeLabel,
        promptText: item.promptText,
        promptTextZh: item.promptTextZh,
        createdAt: item.createdAt,
        duration: item.duration,
        mimeType: item.mimeType || item.audioBlob?.type || "",
        audioFile: audioPath || null,
        uploadUrl: item.uploadUrl || null,
      });
    }

    zip.file("session-summary.txt", buildExportSummaryText(state.session, items, exportedAt));
    zip.file(
      "session-manifest.json",
      JSON.stringify(
        {
          session: state.session,
          exportedAt,
          exportedBy: state.currentUser,
          itemCount: manifestItems.length,
          items: manifestItems,
        },
        null,
        2
      )
    );

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    downloadBlobFile(blob, `ankiviva-session-${state.session.id}.zip`);
    updateStatus(`å·²å¯¼å‡º ZIPï¼Œå…± ${manifestItems.length} æ¡ä½œç­”ã€‚`, "good");
  } catch (error) {
    updateStatus(`å¯¼å‡ºå¤±è´¥ï¼š${error.message}`, "danger");
  } finally {
    dom.exportSessionBtn.disabled = false;
    dom.exportSessionBtn.textContent = originalLabel;
  }
}

async function exportCurrentSessionZip() {
  if (!state.session || !state.currentUser) {
    updateStatus("No session is available for export.", "danger");
    return;
  }

  const responses = getResponsesForUser().filter((record) => record.sessionId === state.session.id);
  if (!responses.length) {
    updateStatus("No recordings are available for export in this session.", "danger");
    return;
  }

  const JSZipCtor = window.JSZip;
  if (typeof JSZipCtor !== "function") {
    updateStatus("ZIP export is not ready yet. Refresh the page and try again.", "danger");
    return;
  }

  const originalLabel = dom.exportSessionBtn.textContent;
  dom.exportSessionBtn.disabled = true;
  dom.exportSessionBtn.textContent = "Packing ZIP...";
  updateStatus("Packing ordered question text and recordings into a ZIP file...", "muted");

  try {
    const exportedAt = nowIso();
    const items = await buildOrderedSessionExportItems(state.session, responses);
    const zip = new JSZipCtor();
    const questionFolder = zip.folder("questions");
    const audioFolder = zip.folder("audio");
    const manifestItems = [];

    for (const item of items) {
      const indexLabel = formatExportIndex(item.exportIndex);
      const safePromptId = sanitizeFileSegment(item.promptId, "prompt");
      const safeType = sanitizeFileSegment(item.typeLabel, "answer");
      const baseName = `${indexLabel}_${safePromptId}_${safeType}`;
      const audioExt = getAudioExtension(item, item.audioBlob);
      const audioFileName = `${baseName}_answer${audioExt}`;
      const audioPath = item.audioBlob ? `audio/${audioFileName}` : "";

      questionFolder.file(
        `${baseName}_question.txt`,
        buildExportQuestionText(item, audioPath)
      );

      if (item.audioBlob) {
        audioFolder.file(audioFileName, item.audioBlob);
      }

      manifestItems.push({
        exportIndex: item.exportIndex,
        promptOrder: item.orderIndex,
        attemptNumber: item.attemptNumber,
        promptId: item.promptId,
        groupId: item.groupId,
        chapter: item.chapter,
        typeLabel: item.typeLabel,
        promptText: item.promptText,
        promptTextZh: item.promptTextZh,
        createdAt: item.createdAt,
        duration: item.duration,
        mimeType: item.mimeType || item.audioBlob?.type || "",
        audioFile: audioPath || null,
        uploadUrl: item.uploadUrl || null,
      });
    }

    zip.file("session-summary.txt", buildExportSummaryText(state.session, items, exportedAt));
    zip.file(
      "session-manifest.json",
      JSON.stringify(
        {
          session: state.session,
          exportedAt,
          exportedBy: state.currentUser,
          itemCount: manifestItems.length,
          items: manifestItems,
        },
        null,
        2
      )
    );

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    downloadBlobFile(blob, `ankiviva-session-${state.session.id}.zip`);
    updateStatus(`ZIP export is ready. Exported ${manifestItems.length} answers.`, "good");
  } catch (error) {
    updateStatus(`ZIP export failed: ${error.message}`, "danger");
  } finally {
    dom.exportSessionBtn.disabled = false;
    dom.exportSessionBtn.textContent = originalLabel;
  }
}

async function login(username, password) {
  const users = loadUsers();
  if (!users[username]) throw new Error("用户不存在。");
  const hash = await hashText(password);
  if (users[username].passwordHash !== hash) throw new Error("密码错误。");
  state.currentUser = username;
  state.profile = loadProfile(username);
  saveJson(STORAGE_KEYS.currentUser, username);
  dom.currentUserLabel.textContent = username;
  dom.authOverlay.classList.add("hidden");
  applyProfileToControls();
  renderChapterFilters();
  renderPrompt(false);
  updateSessionActionButtons();
  updateStatus("登录成功。请选择训练设置并开始。", "good");
}

async function register(username, password) {
  const users = loadUsers();
  if (users[username]) throw new Error("用户名已存在。");
  const hash = await hashText(password);
  users[username] = {
    passwordHash: hash,
    createdAt: nowIso(),
  };
  saveUsers(users);
}

function logout() {
  clearPromptAutomation();
  stopPromptAudioPlayback();
  if (state.isRecording) {
    stopRecording("manual");
  }
  state.currentUser = null;
  state.profile = null;
  state.session = null;
  state.promptPhase = "idle";
  state.activePromptToken = null;
  localStorage.removeItem(STORAGE_KEYS.currentUser);
  dom.currentUserLabel.textContent = "-";
  dom.authOverlay.classList.remove("hidden");
  renderPrompt(false);
  updateStatus("已退出当前用户。", "muted");
}

async function startNewSession() {
  const selectedChapters = getSelectedChapters();
  if (!selectedChapters.length) {
    updateStatus("至少选择一个章节。", "danger");
    return;
  }
  const micReady = await prepareMic();
  if (!micReady) return;

  let groups = state.data.questions.filter((question) => selectedChapters.includes(question.chapter));
  if (dom.orderMode.value === "random") {
    groups = shuffleArray(groups);
  }

  state.session = {
    id: uid("session"),
    startedAt: nowIso(),
    groupIds: groups.map((group) => group.id),
    currentGroupIndex: 0,
    currentPromptIndex: 0,
    trainingMode: dom.trainingMode.value,
    branchMode: normalizeBranchMode(dom.branchMode.value),
    orderMode: dom.orderMode.value,
    chapterSelection: selectedChapters,
    branchSelections: {},
    isPaused: false,
    isCompleted: false,
  };

  if (state.session.trainingMode === "mock" && state.session.branchMode === "random") {
    const firstGroup = getCurrentGroup();
    if (firstGroup) {
      state.session.branchSelections[firstGroup.id] = Math.random() < 0.5 ? "A" : "B";
    }
  }

  state.profile.settings = {
    trainingMode: state.session.trainingMode,
    orderMode: state.session.orderMode,
    branchMode: state.session.branchMode,
    playbackRate: dom.playbackRate.value,
    selectedChapters,
  };
  persistSession();
  renderPrompt(true);
  updateStatus(`已开始${TRAINING_MODE_LABELS[state.session.trainingMode]}，系统会自动进入 3 秒准备和 45 秒录音。`, "muted");
}

async function restoreSession(session) {
  const micReady = await prepareMic();
  if (!micReady) return;
  state.session = normalizeSession(session);
  state.session.isPaused = false;
  state.session.isCompleted = false;
  persistSession();
  applySessionToControls(state.session);
  renderPrompt(true);
  updateStatus("已恢复上次练习，系统会从当前题重新开始。", "muted");
}

function attachEventListeners() {
  dom.showLoginBtn.addEventListener("click", () => setAuthTab("login"));
  dom.showRegisterBtn.addEventListener("click", () => setAuthTab("register"));
  dom.logoutBtn.addEventListener("click", logout);

  dom.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await login(dom.loginUsername.value.trim(), dom.loginPassword.value);
      dom.loginPassword.value = "";
    } catch (error) {
      dom.authMessage.textContent = error.message;
    }
  });

  dom.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = dom.registerUsername.value.trim();
    const password = dom.registerPassword.value;
    if (password !== dom.registerPassword2.value) {
      dom.authMessage.textContent = "两次密码不一致。";
      return;
    }
    try {
      await register(username, password);
      dom.authMessage.textContent = "注册成功，请返回登录。";
      setAuthTab("login");
      dom.loginUsername.value = username;
    } catch (error) {
      dom.authMessage.textContent = error.message;
    }
  });

  dom.prepareMicBtn.addEventListener("click", prepareMic);
  dom.startSessionBtn.addEventListener("click", startNewSession);
  dom.pauseSessionBtn.addEventListener("click", pauseCurrentSession);
  dom.endSessionBtn.addEventListener("click", endCurrentSession);
  dom.resumeSessionBtn.addEventListener("click", async () => {
    if (state.profile?.activeSession) {
      await restoreSession(state.profile.activeSession);
    }
  });
  dom.playPromptBtn.addEventListener("click", replayCurrentQuestionAudio);
  dom.restartAnswerBtn.addEventListener("click", restartCurrentPrompt);
  dom.previousPromptBtn.addEventListener("click", goToPreviousPrompt);
  dom.recordToggleBtn.addEventListener("click", () => stopRecording("manual"));
  dom.nextPromptBtn.addEventListener("click", advancePrompt);
  dom.toggleAnswerBtn.addEventListener("click", toggleReferenceAnswer);
  dom.saveNotesBtn.addEventListener("click", persistNotes);
  dom.clearNotesBtn.addEventListener("click", clearNotes);
  dom.refreshAttemptsBtn.addEventListener("click", renderAttemptsForCurrentPrompt);
  dom.exportSessionBtn.addEventListener("click", exportCurrentSessionZip);
  dom.branchChooser.addEventListener("click", (event) => {
    const button = event.target.closest("[data-branch]");
    if (button) chooseBranch(button.dataset.branch);
  });

  dom.trainingMode.addEventListener("change", () => {
    updateTrainingModeControls();
    if (!state.profile) return;
    state.profile.settings = {
      ...state.profile.settings,
      trainingMode: dom.trainingMode.value,
      orderMode: dom.orderMode.value,
      branchMode: normalizeBranchMode(dom.branchMode.value),
      playbackRate: dom.playbackRate.value,
      selectedChapters: getSelectedChapters(),
    };
    saveProfile();
  });

  for (const element of [dom.orderMode, dom.branchMode, dom.playbackRate]) {
    element.addEventListener("change", () => {
      if (!state.profile) return;
      state.profile.settings = {
        ...state.profile.settings,
        trainingMode: dom.trainingMode.value,
        orderMode: dom.orderMode.value,
        branchMode: normalizeBranchMode(dom.branchMode.value),
        playbackRate: dom.playbackRate.value,
        selectedChapters: getSelectedChapters(),
      };
      saveProfile();
    });
  }
}

function renderRuntimeModeLabel() {
  if (state.config.uploadEnabled && state.config.azureSpeechEnabled) {
    dom.serverModeLabel.textContent =
      `Server mode: recordings can upload, and examiner audio uses Azure Speech (${state.config.azureSpeechVoice}).`;
    return;
  }

  if (state.config.uploadEnabled) {
    dom.serverModeLabel.textContent =
      "Server mode: recordings can upload. Examiner audio falls back when Azure Speech is unavailable.";
    return;
  }

  if (state.config.browserSpeechEnabled) {
    dom.serverModeLabel.textContent =
      "Static / GitHub Pages mode: phone access is supported. Recordings stay in this browser, and examiner audio uses browser speech.";
    return;
  }

  dom.serverModeLabel.textContent =
    "Static / GitHub Pages mode: phone access is supported. Recordings stay in this browser.";
}

async function bootstrap() {
  await loadRuntimeConfig();
  await loadQuestions();
  attachEventListeners();
  updateTrainingModeControls();

  if (state.config.uploadEnabled && state.config.azureSpeechEnabled) {
    dom.serverModeLabel.textContent = `当前为服务器模式，可上传录音，英文提问语音已接入 Azure Speech (${state.config.azureSpeechVoice}).`;
  } else if (state.config.uploadEnabled) {
    dom.serverModeLabel.textContent = "当前为服务器模式，可上传录音，但未检测到 Azure Speech 配置。";
  } else {
    dom.serverModeLabel.textContent = "当前为静态模式，录音仅本地保存。";
  }

  renderRuntimeModeLabel();

  const rememberedUser = localStorage.getItem(STORAGE_KEYS.currentUser);
  if (rememberedUser && loadUsers()[rememberedUser]) {
    state.currentUser = rememberedUser;
    state.profile = loadProfile(rememberedUser);
    dom.currentUserLabel.textContent = rememberedUser;
    dom.authOverlay.classList.add("hidden");
    applyProfileToControls();
    renderChapterFilters();
    updateSessionActionButtons();
    renderPrompt(false);
    updateStatus(
      state.profile.activeSession
        ? "已自动恢复登录状态。你可以继续上次练习。"
        : "已自动恢复登录状态。请开始新练习。",
      "muted"
    );
  } else {
    renderChapterFilters();
    updateSessionActionButtons();
    renderPrompt(false);
  }
}

bootstrap().catch((error) => {
  updateStatus(`初始化失败：${error.message}`, "danger");
});
