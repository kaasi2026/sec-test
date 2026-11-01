const languages = {
  fr: { name: 'Französisch', locale: 'fr-FR', whisper: 'fr' },
  es: { name: 'Spanisch', locale: 'es-ES', whisper: 'es' },
  it: { name: 'Italienisch', locale: 'it-IT', whisper: 'it' },
};

const $ = (selector) => document.querySelector(selector);
function loadRooms() {
  try {
    const rooms = JSON.parse(localStorage.getItem('parlons-rooms') || '[]');
    return Array.isArray(rooms) ? rooms.filter((room) => room && room.id && languages[room.language]) : [];
  } catch {
    return [];
  }
}

const state = {
  language: localStorage.getItem('parlons-language') || 'fr',
  model: localStorage.getItem('parlons-model') || '',
  history: [],
  rooms: loadRooms(),
  activeRoomId: localStorage.getItem('parlons-active-room') || '',
  recorder: null,
  chunks: [],
  startedAt: 0,
  timer: null,
  lastCoachAnswer: '',
};

if (!state.rooms.length) {
  state.rooms = [
    { id: 'fr-general', language: 'fr', name: 'Allgemein', messages: [] },
    { id: 'es-general', language: 'es', name: 'Allgemein', messages: [] },
    { id: 'it-general', language: 'it', name: 'Allgemein', messages: [] },
  ];
}
if (!state.rooms.some((room) => room.id === state.activeRoomId)) {
  state.activeRoomId = state.rooms.find((room) => room.language === state.language)?.id || state.rooms[0].id;
}

const sourceText = $('#source-text');
const settings = $('#settings-dialog');

async function saveHistory(entry) {
  try {
    const result = await api('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    state.history.push(result.entry);
  } catch (error) {
    showToast(`Lernverlauf konnte nicht gespeichert werden: ${error.message}`);
  }
  updateProgress();
}

async function loadHistory() {
  try {
    const result = await api('/api/practice');
    state.history = result.history;
    updateProgress();
  } catch (error) {
    showToast(`Lernverlauf konnte nicht geladen werden: ${error.message}`);
  }
}

function updateProgress() {
  const entries = state.history.filter((item) => item.language === state.language);
  $('#room-count').textContent = state.rooms.filter((room) => room.language === state.language).length;
  $('#word-count').textContent = entries.reduce((sum, item) => sum + item.words, 0);
  $('#progress-language').textContent = state.language.toUpperCase();
  const misses = entries.reduce((sum, item) => sum + item.missed.length, 0);
  $('#mistake-summary').textContent = misses ? `${misses} Wörter zum Wiederholen` : 'Deine Übungshistorie nutzen';
  $('#progress-note').textContent = entries.length
    ? `${entries.length} Übung${entries.length === 1 ? '' : 'en'} bisher. Weiter so.`
    : 'Jede Wiederholung bringt dich näher ans Ziel.';
}

function setLanguage(language) {
  state.language = language;
  localStorage.setItem('parlons-language', language);
  document.querySelectorAll('.language-tab').forEach((tab) => {
    const active = tab.dataset.language === language;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  const currentRoom = activeRoom();
  const room = currentRoom.language === language ? currentRoom : state.rooms.find((item) => item.language === language);
  if (room) state.activeRoomId = room.id;
  else createRoom(language);
  localStorage.setItem('parlons-active-room', state.activeRoomId);
  renderRooms();
  renderMessages();
  updateProgress();
}

function activeRoom() {
  return state.rooms.find((room) => room.id === state.activeRoomId) || state.rooms[0];
}

function persistRooms() {
  localStorage.setItem('parlons-rooms', JSON.stringify(state.rooms));
}

function createRoom(language = state.language) {
  const id = globalThis.crypto?.randomUUID?.() || `room-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const room = { id, language, name: 'Neuer Chat', messages: [] };
  state.rooms.unshift(room);
  state.activeRoomId = id;
  state.language = language;
  localStorage.setItem('parlons-language', language);
  localStorage.setItem('parlons-active-room', id);
  persistRooms();
  renderRooms();
  renderMessages();
  updateProgress();
  closeSidebar();
  return room;
}

function activateRoom(roomId) {
  const room = state.rooms.find((item) => item.id === roomId);
  if (!room) return;
  state.activeRoomId = room.id;
  state.language = room.language;
  localStorage.setItem('parlons-active-room', room.id);
  localStorage.setItem('parlons-language', room.language);
  document.querySelectorAll('.language-tab').forEach((tab) => {
    const active = tab.dataset.language === room.language;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  renderRooms();
  renderMessages();
  updateProgress();
  closeSidebar();
}

function renderRooms() {
  const list = $('#room-list');
  list.replaceChildren();
  const rooms = state.rooms.filter((room) => room.language === state.language);
  $('#room-count').textContent = rooms.length;
  rooms.forEach((room) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `room-item${room.id === state.activeRoomId ? ' active' : ''}`;
    button.dataset.roomId = room.id;
    const icon = document.createElement('span');
    icon.className = 'room-icon';
    icon.textContent = '◦';
    const name = document.createElement('span');
    name.className = 'room-name';
    name.textContent = room.name;
    button.append(icon, name);
    list.append(button);
  });
}

function renderMessages() {
  const room = activeRoom();
  const list = $('#room-messages');
  list.replaceChildren();
  $('#active-room-title').textContent = room.name;
  $('#room-subtitle').textContent = `${languages[room.language].name} · Dein persönlicher Sprachcoach`;
  if (!room.messages.length) {
    const welcome = document.createElement('div');
    welcome.className = 'welcome-state';
    const kicker = document.createElement('div');
    kicker.className = 'welcome-kicker';
    kicker.innerHTML = '<span class="welcome-spark">✳</span> DEIN SPRACHCOACH';
    const title = document.createElement('h2');
    const greeting = { fr: 'Bonjour !', es: '¡Hola!', it: 'Ciao!' }[room.language];
    title.textContent = `${greeting} Lass uns ${languages[room.language].name} sprechen.`;
    const description = document.createElement('p');
    description.textContent = 'Schreib auf Deutsch oder in deiner Lernsprache. Ich passe die Übungen an deinen Lernverlauf an.';
    const prompts = document.createElement('div');
    prompts.className = 'welcome-prompts';
    [
      ['✳', 'Stell mir eine Frage', 'question'],
      ['↻', 'Übe meine letzten Fehler', 'mistakes'],
      ['⇄', 'Hilf mir beim Übersetzen', 'translate'],
      ['◖', 'Einen Satz gemeinsam üben', 'practice'],
    ].forEach(([symbol, label, action]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'welcome-prompt';
      button.dataset.action = action;
      const icon = document.createElement('span');
      icon.className = 'prompt-symbol';
      icon.textContent = symbol;
      button.append(icon, document.createTextNode(label));
      prompts.append(button);
    });
    welcome.append(kicker, title, description, prompts);
    list.append(welcome);
  } else {
    room.messages.forEach((message) => list.append(renderMessage(message)));
  }
  if (state.pendingRoomId === room.id) list.append(createTypingIndicator());
  list.scrollTop = list.scrollHeight;
}

function createTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  const avatar = document.createElement('span');
  avatar.className = 'message-avatar';
  avatar.textContent = 'p.';
  const bubble = document.createElement('div');
  bubble.className = 'message-content';
  bubble.innerHTML = '<span class="typing-indicator"><i></i><i></i><i></i></span>';
  row.append(avatar, bubble);
  return row;
}

function renderMessage(message) {
  const row = document.createElement('div');
  row.className = `message-row ${message.role === 'user' ? 'user' : 'assistant'}`;
  if (message.role !== 'user') {
    const avatar = document.createElement('span');
    avatar.className = 'message-avatar';
    avatar.textContent = 'p.';
    row.append(avatar);
  }
  const bubble = document.createElement('div');
  bubble.className = 'message-content';
  bubble.textContent = message.text;
  if (message.kind === 'practice') {
    const result = document.createElement('div');
    result.className = 'message-result';
    result.textContent = message.score === null ? 'Keine Vergleichsvorlage vorhanden' : `${message.score}% Textübereinstimmung · keine phonetische Aussprachebewertung`;
    if (message.expectedWords?.length) {
      const words = document.createElement('div');
      words.className = 'word-feedback';
      message.expectedWords.forEach((word) => {
        const chip = document.createElement('span');
        chip.className = `word-chip${message.missed.includes(word) ? ' missed' : ''}`;
        chip.textContent = word;
        words.append(chip);
      });
      result.append(words);
    }
    bubble.append(result);
  }
  row.append(bubble);
  if (message.role !== 'user' && message.kind !== 'practice') {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'message-action';
    play.textContent = '◖ Vorlesen';
    play.addEventListener('click', () => speakText(message.text));
    actions.append(play);
    row.append(actions);
  }
  return row;
}

function closeSidebar() {
  $('#chat-app').classList.remove('sidebar-open');
  $('#sidebar-backdrop').hidden = true;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('visible'), 3500);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Anfrage fehlgeschlagen (${response.status})`);
  return result;
}

async function refreshStatus() {
  try {
    const status = await api('/api/status');
    setConnection('#ollama-dot', '#settings-ollama-dot', '#settings-ollama-status', status.ollama, 'Verbunden', 'Nicht erreichbar');
    $('#header-ollama-dot').classList.toggle('online', status.ollama);
    $('#header-ollama-dot').classList.toggle('offline', !status.ollama);
    $('#header-ollama-status').textContent = status.ollama ? 'OLLAMA BEREIT' : 'OLLAMA AUS';
    setConnection('#whisper-dot', null, '#whisper-status', status.whisper, 'Bereit', 'Nicht erreichbar');
    $('#ollama-status').textContent = status.ollama ? 'Lokale KI verbunden' : 'Ollama nicht gestartet';
    if (status.ollama) await refreshModels();
  } catch {
    $('#ollama-status').textContent = 'Lokale Dienste nicht erreichbar';
  }
}

function setConnection(dotSelector, secondaryDotSelector, textSelector, online, onlineText, offlineText) {
  const dot = $(dotSelector);
  dot.classList.toggle('online', online);
  dot.classList.toggle('offline', !online);
  if (secondaryDotSelector) {
    $(secondaryDotSelector).classList.toggle('online', online);
    $(secondaryDotSelector).classList.toggle('offline', !online);
  }
  $(textSelector).textContent = online ? onlineText : offlineText;
}

async function refreshModels() {
  const select = $('#model-select');
  try {
    const { models } = await api('/api/models');
    select.replaceChildren();
    if (!models.length) {
      select.add(new Option('Kein Modell installiert', ''));
      state.model = '';
      return;
    }
    models.forEach((name) => select.add(new Option(name, name)));
    if (!models.includes(state.model)) state.model = models[0];
    select.value = state.model;
    localStorage.setItem('parlons-model', state.model);
  } catch {
    select.replaceChildren(new Option('Ollama nicht erreichbar', ''));
  }
}

async function askCoach(messages, options = {}) {
  if (!state.model) throw new Error('Bitte starte Ollama und wähle in den Einstellungen ein Modell.');
  const answer = await api('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow: options.workflow || 'coach',
      model: state.model,
      messages: [
        {
          role: 'system',
          content: options.workflow === 'translate'
            ? `Du bist ein präziser Übersetzer. Übersetze zwischen ${languages[options.language || state.language].name} und Deutsch. Gib nur die passende Übersetzung aus.`
            : systemPrompt(options.language),
        },
        ...messages,
      ],
      language: options.language || state.language,
    }),
  });
  state.lastCoachAnswer = answer.text.trim();
  return state.lastCoachAnswer;
}

function historyContext() {
  return state.history.filter((item) => item.language === state.language).slice(-8)
    .map((item) => `Geübt: "${item.source}". Erkannt: "${item.recognized}". Nicht erkannt: ${item.missed.join(', ') || 'keine'}.`)
    .join('\n') || 'Noch keine gespeicherten Übungen.';
}

function systemPrompt(language = state.language) {
  return `Du bist ein freundlicher, geduldiger Sprachcoach für Deutschsprachige. Die Lernsprache ist ${languages[language].name}. Stelle jeweils nur eine kurze Frage. Erkläre Fehler knapp auf Deutsch und ermutige zum Antworten in der Lernsprache. Passe dich an diesen gespeicherten Lernverlauf an:\n${historyContext()}`;
}

function updateCharacterCount() {
  $('#char-count').textContent = `${sourceText.value.length.toLocaleString('de-DE')} / 4.000`;
}

function normalizeWords(text) {
  return text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ').replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/).filter(Boolean);
}

function compareText(expected, actual) {
  const expectedWords = normalizeWords(expected);
  const actualSet = new Set(normalizeWords(actual));
  const matched = expectedWords.filter((word) => actualSet.has(word));
  const missed = [...new Set(expectedWords.filter((word) => !actualSet.has(word)))];
  const score = expectedWords.length ? Math.round((matched.length / expectedWords.length) * 100) : 0;
  return { score, missed, expectedWords };
}

function getVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang.toLowerCase() === languages[state.language].locale.toLowerCase())
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(state.language));
}

function speak() {
  if (!sourceText.value.trim()) return showToast('Gib zuerst einen Text ein.');
  if (!('speechSynthesis' in window)) return showToast('Sprachausgabe wird von diesem Browser nicht unterstützt.');
  speakText(sourceText.value.trim());
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return showToast('Sprachausgabe wird von diesem Browser nicht unterstützt.');
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || languages[state.language].locale;
  $('#voice-label').textContent = voice ? voice.name : 'Systemstimme';
  $('#stop-speech').disabled = false;
  utterance.onend = utterance.onerror = () => { $('#stop-speech').disabled = true; };
  speechSynthesis.speak(utterance);
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast('Mikrofonaufnahme wird von diesem Browser nicht unterstützt.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
    state.recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
    state.chunks = [];
    state.recorder.ondataavailable = (event) => { if (event.data.size) state.chunks.push(event.data); };
    state.recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(state.chunks, { type: state.recorder.mimeType || 'audio/webm' });
      await transcribe(blob);
    };
    state.recorder.start();
    state.startedAt = Date.now();
    $('#recording-status').hidden = false;
    $('#record-button').classList.add('recording');
    $('#record-button').innerHTML = '<span class="record-dot"></span> Aufnahme stoppen';
    $('#record-hint').hidden = true;
    state.timer = setInterval(updateTimer, 250);
    updateTimer();
  } catch (error) {
    showToast(error.name === 'NotAllowedError' ? 'Bitte erlaube den Mikrofonzugriff.' : 'Mikrofon konnte nicht gestartet werden.');
  }
}

function stopRecording() {
  if (state.recorder?.state === 'recording') {
    state.recorder.stop();
    clearInterval(state.timer);
    $('#record-button').disabled = true;
    $('#record-button').innerHTML = '<span class="record-dot"></span> Wird ausgewertet …';
    $('#recording-status').hidden = true;
  }
}

function updateTimer() {
  const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
  $('#record-timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

async function transcribe(blob) {
  try {
    const filename = blob.type.includes('mp4') ? 'aufnahme.mp4' : 'aufnahme.webm';
    const result = await api('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': filename, 'X-Language': languages[state.language].whisper },
      body: blob,
    });
    await renderTranscript(result.text || '');
  } catch (error) {
    showToast(error.message);
  } finally {
    $('#record-button').disabled = false;
    $('#record-button').classList.remove('recording');
    $('#record-button').innerHTML = '<span class="record-dot"></span> Aufnahme starten';
    $('#record-hint').hidden = false;
  }
}

async function renderTranscript(recognized) {
  const expected = sourceText.value.trim();
  const comparison = expected ? compareText(expected, recognized) : { score: null, missed: [], expectedWords: [] };
  const words = normalizeWords(recognized);
  if (recognized) {
    const room = activeRoom();
    room.messages.push({
      role: 'assistant',
      kind: 'practice',
      text: `Erkannt: ${recognized}`,
      score: comparison.score,
      missed: comparison.missed,
      expectedWords: comparison.expectedWords,
    });
    persistRooms();
    renderMessages();
    await saveHistory({
      language: room.language,
      source: expected,
      recognized,
      missed: comparison.missed,
      words: words.length,
      at: Date.now() / 1000,
    });
  } else {
    addRoomMessage({ role: 'assistant', kind: 'practice', text: 'Keine Sprache erkannt. Versuch es noch einmal.', score: null, missed: [], expectedWords: [] });
  }
}

function addRoomMessage(message) {
  const room = activeRoom();
  room.messages.push(message);
  persistRooms();
  renderMessages();
}

async function sendChat(text, workflow = 'coach') {
  const room = activeRoom();
  const prompt = text.trim();
  if (!prompt) return;
  room.messages.push({ role: 'user', kind: 'chat', text: prompt });
  if (room.name === 'Neuer Chat') room.name = prompt.length > 28 ? `${prompt.slice(0, 27).trimEnd()}…` : prompt;
  persistRooms();
  renderRooms();
  state.pendingRoomId = room.id;
  if (activeRoom().id === room.id) renderMessages();
  $('#send-button').disabled = true;
  try {
    const messages = room.messages.filter((message) => message.kind === 'chat').slice(-16)
      .map((message) => ({ role: message.role, content: message.text }));
    const answer = await askCoach(messages, { workflow, language: room.language });
    room.messages.push({ role: 'assistant', kind: 'chat', text: answer });
    persistRooms();
  } catch (error) {
    showToast(error.message);
  } finally {
    state.pendingRoomId = null;
    $('#send-button').disabled = false;
    if (activeRoom().id === room.id) renderMessages();
  }
}

function repeatMistakes() {
  const entries = state.history.filter((item) => item.language === state.language && item.missed.length);
  const missed = [...new Set(entries.flatMap((item) => item.missed))];
  if (!missed.length) return showToast('Noch keine Fehler zum Wiederholen. Übe erst einen Satz.');
  sendChat(`Lass mich diese Wörter üben: ${missed.join(', ')}. Stelle mir eine Frage auf ${languages[state.language].name}, in deren Antwort ich einige davon verwenden kann.`);
}

document.querySelectorAll('.language-tab').forEach((tab) => tab.addEventListener('click', () => setLanguage(tab.dataset.language)));
$('#new-room').addEventListener('click', () => createRoom());
$('#room-list').addEventListener('click', (event) => {
  const roomButton = event.target.closest('[data-room-id]');
  if (roomButton) activateRoom(roomButton.dataset.roomId);
});
$('#room-messages').addEventListener('click', (event) => {
  const promptButton = event.target.closest('[data-action]');
  if (!promptButton) return;
  if (promptButton.dataset.action === 'question') sendChat(`Stelle mir eine kurze, interessante Frage auf ${languages[state.language].name}, passend zu meinem Lernstand.`);
  if (promptButton.dataset.action === 'mistakes') repeatMistakes();
  if (promptButton.dataset.action === 'translate') {
    state.composeWorkflow = 'translate';
    sourceText.focus();
    sourceText.placeholder = 'Füge einen Satz ein, den ich übersetzen soll …';
  }
  if (promptButton.dataset.action === 'practice') {
    state.composeWorkflow = 'coach';
    sourceText.focus();
    sourceText.placeholder = 'Schreib einen Satz, den du gemeinsam üben möchtest …';
  }
});
$('#room-messages').addEventListener('click', (event) => {
  const playButton = event.target.closest('.message-action');
  if (!playButton) return;
});
$('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const prompt = sourceText.value.trim();
  if (!prompt) return;
  sourceText.value = '';
  updateCharacterCount();
  const workflow = state.composeWorkflow || 'coach';
  state.composeWorkflow = null;
  sendChat(prompt, workflow);
});
sourceText.addEventListener('input', updateCharacterCount);
sourceText.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('#chat-form').requestSubmit();
  }
});
$('#speak-button').addEventListener('click', speak);
$('#stop-speech').addEventListener('click', () => {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  $('#stop-speech').disabled = true;
});
$('#record-button').addEventListener('click', () => state.recorder?.state === 'recording' ? stopRecording() : startRecording());
$('#translate-button').addEventListener('click', () => {
  const text = sourceText.value.trim();
  if (!text) return showToast('Füge zuerst einen Text zum Übersetzen ein.');
  sendChat(`Übersetze diesen Text aus dem ${languages[state.language].name} ins Deutsche. Gib nur die Übersetzung aus:\n\n${text}`, 'translate');
});
$('#settings-toggle').addEventListener('click', () => settings.showModal());
$('#header-settings').addEventListener('click', () => settings.showModal());
$('#refresh-models').addEventListener('click', refreshModels);
$('#model-select').addEventListener('change', (event) => {
  state.model = event.target.value;
  localStorage.setItem('parlons-model', state.model);
});
$('#question-button').addEventListener('click', () => sendChat(`Stelle mir eine kurze, interessante Frage auf ${languages[state.language].name}, passend zu meinem Lernstand.`));
$('#mistakes-button').addEventListener('click', repeatMistakes);
$('#sidebar-toggle').addEventListener('click', () => {
  $('#chat-app').classList.add('sidebar-open');
  $('#sidebar-backdrop').hidden = false;
});
$('#sidebar-backdrop').addEventListener('click', closeSidebar);
setLanguage(state.language in languages ? state.language : 'fr');
renderRooms();
renderMessages();
updateCharacterCount();
updateProgress();
loadHistory();
if ('speechSynthesis' in window) speechSynthesis.getVoices();
refreshStatus();