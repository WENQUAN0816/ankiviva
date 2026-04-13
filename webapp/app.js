const STORAGE_KEYS = {
  users: "ankiviva.users",
  currentUser: "ankiviva.currentUser",
  profilePrefix: "ankiviva.profile.",
  responsesPrefix: "ankiviva.responses.",
};

const DB_NAME = "ankiviva-web-db";
const DB_VERSION = 1;
const RECORDING_STORE = "recordings";

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
  orderMode: document.getElementById("orderMode"),
  branchMode: document.getElementById("branchMode"),
  prepareMicBtn: document.getElementById("prepareMicBtn"),
  startSessionBtn: document.getElementById("startSessionBtn"),
  resumeSessionBtn: document.getElementById("resumeSessionBtn"),
  micStatus: document.getElementById("micStatus"),
  chapterFilters: document.getElementById("chapterFilters"),
  groupCountLabel: document.getElementById("groupCountLabel"),
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
  playPromptBtn: document.getElementById("playPromptBtn"),
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
  promptAudioMap: new Map(),
  questionMap: new Map(),
  currentUser: null,
  profile: null,
  session: null,
  mediaStream: null,
  mediaRecorder: null,
  recorderMimeType: "",
  recordChunks: [],
  currentPromptAudio: null,
  isRecording: false,
  promptPlaybackFinishedAt: null,
  elapsedTimer: null,
};

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
  const mm = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const ss = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
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
    .map((b) => b.toString(16).padStart(2, "0"))
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
      orderMode: "chapter",
      branchMode: "random",
      selectedChapters: [],
    },
    noteOverrides: {},
    activeSession: null,
  };
}

function loadProfile(username) {
  const profile = loadJson(getProfileKey(username), null);
  return profile ? { ...defaultProfile(), ...profile } : defaultProfile();
}

function saveProfile() {
  if (!state.currentUser || !state.profile) return;
  saveJson(getProfileKey(state.currentUser), state.profile);
}

function getResponsesForUser() {
  if (!state.currentUser) return [];
  return loadJson(getResponsesKey(state.currentUser), []);
}

function saveResponsesForUser(records) {
  if (!state.currentUser) return;
  saveJson(getResponsesKey(state.currentUser), records.slice(-1000));
}

function addResponseRecord(record) {
  const records = getResponsesForUser();
  records.push(record);
  saveResponsesForUser(records);
}

function updateStatus(message, type = "muted") {
  dom.statusLine.textContent = message;
  dom.statusLine.className = `message ${type}`;
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch("./api/health");
    state.config = response.ok ? { uploadEnabled: true } : { uploadEnabled: false };
  } catch {
    state.config = { uploadEnabled: false };
  }
}

async function loadQuestions() {
  const [questionsResp, manifestResp] = await Promise.all([
    fetch("./data/questions.json"),
    fetch("./data/prompt_audio_manifest.json"),
  ]);
  state.data = await questionsResp.json();
  state.questionMap = new Map(state.data.questions.map((question) => [question.id, question]));
  const manifest = await manifestResp.json();
  state.promptAudioMap = new Map((manifest.items || []).map((item) => [item.promptId, item.file]));
  dom.groupCountLabel.textContent = String(state.data.meta.groupCount);
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

  Object.entries(state.data.meta.chapters).forEach(([chapter, count]) => {
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
  });
}

function applyProfileToControls() {
  const settings = state.profile?.settings ?? defaultProfile().settings;
  dom.orderMode.value = settings.orderMode;
  dom.branchMode.value = settings.branchMode;
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

function getCurrentPromptSequence() {
  if (!state.session) return [];
  const group = getCurrentGroup();
  if (!group) return [];

  const prompts = [
    {
      promptId: `${group.id}-main`,
      groupId: group.id,
      chapter: group.chapter,
      groupTitle: group.title,
      typeLabel: "主问题",
      promptText: group.title,
      branch: null,
      depth: "main",
    },
  ];

  const buildBranch = (branchKey) => [
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

  const selection = state.session.branchSelections[group.id];
  if (state.session.branchMode === "all") {
    prompts.push(...buildBranch("A"), ...buildBranch("B"));
  } else if (selection) {
    prompts.push(...buildBranch(selection));
  }

  return prompts;
}

function getCurrentPrompt() {
  const sequence = getCurrentPromptSequence();
  if (!sequence.length || !state.session) return null;
  return sequence[state.session.currentPromptIndex] ?? null;
}

function getTotalPromptTarget() {
  if (!state.session) return 0;
  return state.session.branchMode === "all"
    ? state.session.groupIds.length * 5
    : state.session.groupIds.length * 3;
}

function getAnsweredPromptCount() {
  if (!state.session) return 0;
  const perGroup = state.session.branchMode === "all" ? 5 : 3;
  return state.session.currentGroupIndex * perGroup + state.session.currentPromptIndex;
}

function getNoteValue(prompt) {
  return state.profile?.noteOverrides?.[prompt.promptId] ?? "";
}

function persistSession() {
  if (!state.profile) return;
  state.profile.activeSession = state.session;
  saveProfile();
}

function startElapsedTimer() {
  clearInterval(state.elapsedTimer);
  state.promptPlaybackFinishedAt = Date.now();
  dom.timerLabel.textContent = "00:00";
  state.elapsedTimer = setInterval(() => {
    if (!state.promptPlaybackFinishedAt) return;
    const elapsed = Math.floor((Date.now() - state.promptPlaybackFinishedAt) / 1000);
    dom.timerLabel.textContent = formatSeconds(elapsed);
  }, 250);
}

function stopElapsedTimer() {
  clearInterval(state.elapsedTimer);
  state.elapsedTimer = null;
}

function stopPromptAudioPlayback() {
  if (state.currentPromptAudio) {
    state.currentPromptAudio.pause();
    state.currentPromptAudio.currentTime = 0;
    state.currentPromptAudio = null;
  }
}

function renderPrompt(resetNotes = false) {
  const prompt = getCurrentPrompt();
  const group = getCurrentGroup();
  if (!prompt || !group || !state.session) {
    dom.sessionTitle.textContent = "请先开始练习";
    dom.chapterLabel.textContent = "Chapter";
    dom.questionMetaLabel.textContent = "题目尚未开始";
    dom.promptTypeBadge.textContent = "待开始";
    dom.groupProgressLabel.textContent = "0 / 0";
    dom.promptProgressLabel.textContent = "0 / 0";
    dom.recordToggleBtn.disabled = true;
    dom.playPromptBtn.disabled = true;
    dom.nextPromptBtn.disabled = true;
    dom.notesEditor.value = "";
    dom.timerLabel.textContent = "00:00";
    return;
  }

  dom.sessionTitle.textContent = `当前练习：${state.session.orderMode === "random" ? "乱序" : "按章节顺序"} · ${
    { random: "随机分支", manual: "手动分支", all: "全分支" }[state.session.branchMode]
  }`;
  dom.chapterLabel.textContent = group.chapter;
  dom.questionMetaLabel.textContent = `${group.id} · ${prompt.typeLabel}`;
  dom.promptTypeBadge.textContent = prompt.typeLabel;
  dom.groupProgressLabel.textContent = `${state.session.currentGroupIndex + 1} / ${state.session.groupIds.length}`;
  dom.promptProgressLabel.textContent = `${getAnsweredPromptCount() + 1} / ${getTotalPromptTarget()}`;
  dom.playPromptBtn.disabled = false;
  dom.recordToggleBtn.disabled = true;
  dom.recordToggleBtn.textContent = "开始录音";
  dom.nextPromptBtn.disabled = false;
  dom.notesEditor.value = getNoteValue(prompt);
  if (resetNotes === true) {
    dom.notesEditor.value = getNoteValue(prompt);
  }
  dom.branchChooser.classList.add("hidden");
  dom.timerLabel.textContent = "00:00";
  stopElapsedTimer();
  renderAttemptsForCurrentPrompt();
}

async function prepareMic() {
  try {
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

async function playPrompt() {
  const prompt = getCurrentPrompt();
  if (!prompt) return;
  const audioSrc = state.promptAudioMap.get(prompt.promptId);
  if (!audioSrc) {
    updateStatus("当前题目没有对应的 MP3。", "danger");
    return;
  }

  stopPromptAudioPlayback();
  stopElapsedTimer();
  dom.timerLabel.textContent = "00:00";
  dom.recordToggleBtn.disabled = true;
  dom.recordToggleBtn.textContent = "开始录音";
  state.isRecording = false;

  const audio = new Audio(audioSrc);
  state.currentPromptAudio = audio;
  updateStatus("正在播放问题 MP3…", "muted");
  audio.onended = () => {
    state.currentPromptAudio = null;
    startElapsedTimer();
    dom.recordToggleBtn.disabled = false;
    updateStatus("问题播放结束。现在请手动点击开始录音。", "good");
  };
  audio.onerror = () => {
    state.currentPromptAudio = null;
    updateStatus("问题 MP3 播放失败。", "danger");
  };
  await audio.play();
}

async function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
    return;
  }

  try {
    const stream = getFreshRecordingStream();
    state.recordChunks = [];
    state.mediaRecorder = createRecorderFromStream(stream);
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        state.recordChunks.push(event.data);
      }
    };
    state.mediaRecorder.onstop = async () => {
      const prompt = getCurrentPrompt();
      if (!prompt) return;
      const blob = new Blob(state.recordChunks, { type: state.recorderMimeType || "audio/webm" });
      const audioKey = uid("audio");
      await saveRecordingBlob(audioKey, blob, {
        user: state.currentUser,
        promptId: prompt.promptId,
        createdAt: nowIso(),
      });

      const duration = state.promptPlaybackFinishedAt
        ? Math.max(1, Math.round((Date.now() - state.promptPlaybackFinishedAt) / 1000))
        : 0;

      const record = {
        id: uid("resp"),
        sessionId: state.session?.id,
        user: state.currentUser,
        promptId: prompt.promptId,
        groupId: prompt.groupId,
        chapter: prompt.chapter,
        typeLabel: prompt.typeLabel,
        promptText: prompt.promptText,
        createdAt: nowIso(),
        duration,
        audioKey,
        uploadUrl: null,
      };

      const uploadResult = await uploadRecording(blob, record);
      if (uploadResult?.url) {
        record.uploadUrl = uploadResult.url;
      }

      addResponseRecord(record);
      renderAttemptsForCurrentPrompt();
      updateStatus(record.uploadUrl ? "录音已保存并上传。" : "录音已保存。", "good");
    };
    state.mediaRecorder.start(1000);
    state.isRecording = true;
    dom.recordToggleBtn.textContent = "结束录音";
    updateStatus("正在录音。再次点击按钮即可结束录音。", "good");
  } catch (error) {
    updateStatus(`无法开始录音：${error.message}`, "danger");
  }
}

function stopRecording() {
  if (!state.isRecording || !state.mediaRecorder) return;
  state.isRecording = false;
  dom.recordToggleBtn.textContent = "开始录音";
  stopElapsedTimer();
  try {
    state.mediaRecorder.stop();
  } catch (error) {
    updateStatus(`停止录音失败：${error.message}`, "danger");
  }
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
  if (!group || !state.session || state.session.branchMode !== "manual") return;
  state.session.branchSelections[group.id] = branchKey;
  state.session.currentPromptIndex = 1;
  persistSession();
  dom.branchChooser.classList.add("hidden");
  renderPrompt(true);
}

function advancePrompt() {
  if (!state.session) return;
  stopPromptAudioPlayback();
  if (state.isRecording) {
    stopRecording();
  }
  const group = getCurrentGroup();
  const prompt = getCurrentPrompt();
  if (!group || !prompt) return;

  if (
    state.session.branchMode === "manual" &&
    prompt.depth === "main" &&
    !state.session.branchSelections[group.id]
  ) {
    dom.branchChooser.classList.remove("hidden");
    updateStatus("请选择 A 或 B 分支。", "muted");
    return;
  }

  const promptSequence = getCurrentPromptSequence();
  if (state.session.currentPromptIndex < promptSequence.length - 1) {
    state.session.currentPromptIndex += 1;
  } else if (state.session.currentGroupIndex < state.session.groupIds.length - 1) {
    state.session.currentGroupIndex += 1;
    state.session.currentPromptIndex = 0;
    const nextGroup = getCurrentGroup();
    if (state.session.branchMode === "random" && nextGroup && !state.session.branchSelections[nextGroup.id]) {
      state.session.branchSelections[nextGroup.id] = Math.random() < 0.5 ? "A" : "B";
    }
  } else {
    state.profile.activeSession = null;
    saveProfile();
    updateStatus("本轮练习已经完成。", "good");
    return;
  }

  persistSession();
  renderPrompt(true);
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
    meta.innerHTML = `
      <span>${record.typeLabel}</span>
      <span>${formatDate(record.createdAt)}</span>
      <span>${record.duration}s</span>
      <span>${record.uploadUrl ? "已上传" : "本地保存"}</span>
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
  const payload = {
    session: state.session,
    responses,
    exportedAt: nowIso(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ankiviva-session-${state.session.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
  dom.resumeSessionBtn.disabled = !state.profile.activeSession;
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
  stopPromptAudioPlayback();
  stopElapsedTimer();
  if (state.isRecording) stopRecording();
  state.currentUser = null;
  state.profile = null;
  state.session = null;
  localStorage.removeItem(STORAGE_KEYS.currentUser);
  dom.currentUserLabel.textContent = "-";
  dom.authOverlay.classList.remove("hidden");
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
    branchMode: dom.branchMode.value,
    orderMode: dom.orderMode.value,
    chapterSelection: selectedChapters,
    branchSelections: {},
  };
  if (state.session.branchMode === "random") {
    const firstGroup = getCurrentGroup();
    if (firstGroup) {
      state.session.branchSelections[firstGroup.id] = Math.random() < 0.5 ? "A" : "B";
    }
  }

  state.profile.settings = {
    orderMode: state.session.orderMode,
    branchMode: state.session.branchMode,
    selectedChapters,
  };
  persistSession();
  renderPrompt(true);
  updateStatus("已开始新练习。请先播放问题 MP3。", "muted");
}

function restoreSession(session) {
  state.session = session;
  renderPrompt(true);
  updateStatus("已恢复上次练习。", "muted");
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
  dom.resumeSessionBtn.addEventListener("click", () => {
    if (state.profile?.activeSession) {
      restoreSession(state.profile.activeSession);
    }
  });
  dom.playPromptBtn.addEventListener("click", playPrompt);
  dom.recordToggleBtn.addEventListener("click", toggleRecording);
  dom.nextPromptBtn.addEventListener("click", advancePrompt);
  dom.saveNotesBtn.addEventListener("click", persistNotes);
  dom.clearNotesBtn.addEventListener("click", clearNotes);
  dom.refreshAttemptsBtn.addEventListener("click", renderAttemptsForCurrentPrompt);
  dom.exportSessionBtn.addEventListener("click", exportCurrentSession);
  dom.branchChooser.addEventListener("click", (event) => {
    const button = event.target.closest("[data-branch]");
    if (button) chooseBranch(button.dataset.branch);
  });

  [dom.orderMode, dom.branchMode].forEach((element) => {
    element.addEventListener("change", () => {
      if (!state.profile) return;
      state.profile.settings = {
        ...state.profile.settings,
        orderMode: dom.orderMode.value,
        branchMode: dom.branchMode.value,
        selectedChapters: getSelectedChapters(),
      };
      saveProfile();
    });
  });
}

async function bootstrap() {
  await loadRuntimeConfig();
  await loadQuestions();
  attachEventListeners();

  dom.serverModeLabel.textContent = state.config.uploadEnabled
    ? "当前为服务器模式，可上传录音。"
    : "当前为静态模式，录音仅本地保存。";

  const rememberedUser = localStorage.getItem(STORAGE_KEYS.currentUser);
  if (rememberedUser && loadUsers()[rememberedUser]) {
    state.currentUser = rememberedUser;
    state.profile = loadProfile(rememberedUser);
    dom.currentUserLabel.textContent = rememberedUser;
    dom.authOverlay.classList.add("hidden");
    applyProfileToControls();
    renderChapterFilters();
    dom.resumeSessionBtn.disabled = !state.profile.activeSession;
    renderPrompt(false);
    updateStatus(
      state.profile.activeSession
        ? "已自动恢复登录状态。你可以继续上次练习。"
        : "已自动恢复登录状态。请开始新练习。",
      "muted"
    );
  } else {
    renderChapterFilters();
    dom.resumeSessionBtn.disabled = true;
    renderPrompt(false);
  }
}

bootstrap().catch((error) => {
  updateStatus(`初始化失败：${error.message}`, "danger");
});
