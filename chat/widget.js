// ── PORTFOLIO CHATBOT ── floating chat that asks /api/chat about Ignacio.
// Follows the page language (the <html lang> attribute set by setLang).
(function () {
  var TEXT = {
    es: {
      fab: 'Preguntale a mi IA',
      title: 'Asistente de Ignacio',
      sub: 'Responde sobre mi porfolio y CV',
      close: 'Cerrar chat',
      placeholder: 'Escribí tu pregunta…',
      send: 'Enviar',
      hello: '¡Hola! Soy el asistente de Ignacio. Preguntame lo que quieras sobre sus proyectos, experiencia, stack o disponibilidad.',
      chips: ['¿Qué es SmartOps Agent?', '¿Qué tecnologías usa?', '¿Busca trabajo remoto?', '¿Cómo lo contacto?'],
      note: 'Respuestas generadas con IA a partir del porfolio y el CV.',
      error: 'No pude responder ahora. Probá de nuevo en un rato o escribile a isanchez.workmail@gmail.com.',
      limit: 'Llegaste al límite de preguntas por ahora. Probá más tarde o escribile a isanchez.workmail@gmail.com.'
    },
    en: {
      fab: 'Ask my AI',
      title: "Ignacio's assistant",
      sub: 'Answers about my portfolio and CV',
      close: 'Close chat',
      placeholder: 'Type your question…',
      send: 'Send',
      hello: "Hi! I'm Ignacio's assistant. Ask me anything about his projects, experience, stack or availability.",
      chips: ['What is SmartOps Agent?', 'What tech stack does he use?', 'Is he open to remote work?', 'How can I contact him?'],
      note: 'AI-generated answers based on the portfolio and CV.',
      error: "I couldn't answer right now. Please try again later or email isanchez.workmail@gmail.com.",
      limit: "You've reached the question limit for now. Please try later or email isanchez.workmail@gmail.com."
    }
  };
  var STORE_KEY = 'portfolio-chat';
  var history = [];
  try { history = JSON.parse(sessionStorage.getItem(STORE_KEY)) || []; } catch (e) {}

  function lang() { return document.documentElement.lang === 'en' ? 'en' : 'es'; }
  function t(key) { return TEXT[lang()][key]; }

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>';

  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'chat-fab';
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-controls', 'chat-panel');
  fab.innerHTML = ICON_CHAT + '<span class="chat-fab-label"></span>';

  var panel = document.createElement('section');
  panel.id = 'chat-panel';
  panel.className = 'chat-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'chat-title');
  panel.innerHTML =
    '<div class="chat-head"><div class="chat-head-text"><div class="chat-title" id="chat-title"></div><div class="chat-sub"></div></div>' +
    '<button type="button" class="chat-close">×</button></div>' +
    '<div class="chat-log" aria-live="polite"></div>' +
    '<div class="chat-suggestions"></div>' +
    '<form class="chat-form"><input class="chat-input" type="text" maxlength="800" autocomplete="off">' +
    '<button type="submit" class="chat-send">' + ICON_SEND + '</button></form>' +
    '<p class="chat-note"></p>';

  var log = panel.querySelector('.chat-log');
  var chips = panel.querySelector('.chat-suggestions');
  var form = panel.querySelector('.chat-form');
  var input = panel.querySelector('.chat-input');
  var sendBtn = panel.querySelector('.chat-send');
  var closeBtn = panel.querySelector('.chat-close');
  var busy = false;

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  // Minimal formatting: **bold**, [text](url) and bare URLs/emails become links.
  function format(text) {
    var html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<)]+[^\s<).,;:!?])|([\w.+-]+@[\w-]+\.[\w.]+\w)/g, function (m, label, url, bare, email) {
      if (url) return '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
      if (bare) return '<a href="' + bare + '" target="_blank" rel="noopener">' + bare + '</a>';
      return '<a href="mailto:' + email + '">' + email + '</a>';
    });
    return html;
  }

  function addBubble(role, text, extraClass) {
    var el = document.createElement('div');
    el.className = 'chat-msg ' + (role === 'user' ? 'user' : 'bot') + (extraClass ? ' ' + extraClass : '');
    el.innerHTML = format(text);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function render() {
    fab.querySelector('.chat-fab-label').textContent = t('fab');
    fab.setAttribute('aria-label', t('fab'));
    panel.querySelector('.chat-title').textContent = t('title');
    panel.querySelector('.chat-sub').textContent = t('sub');
    panel.querySelector('.chat-note').textContent = t('note');
    closeBtn.setAttribute('aria-label', t('close'));
    sendBtn.setAttribute('aria-label', t('send'));
    input.placeholder = t('placeholder');
    input.setAttribute('aria-label', t('placeholder'));

    log.innerHTML = '';
    addBubble('assistant', t('hello'));
    history.forEach(function (m) { addBubble(m.role, m.content); });

    chips.innerHTML = '';
    chips.hidden = history.length > 0;
    t('chips').forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-chip';
      b.textContent = q;
      b.addEventListener('click', function () { ask(q); });
      chips.appendChild(b);
    });
  }

  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-20))); } catch (e) {}
  }

  function ask(question) {
    question = question.trim();
    if (!question || busy) return;
    busy = true;
    sendBtn.disabled = true;
    chips.hidden = true;
    history.push({ role: 'user', content: question });
    addBubble('user', question);
    input.value = '';
    var typing = addBubble('assistant', '');
    typing.innerHTML = '<span class="chat-typing" aria-hidden="true"><span></span><span></span><span></span></span>';

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-12) })
    })
      .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
      .then(function (res) {
        typing.remove();
        if (res.status === 200 && res.data.reply) {
          history.push({ role: 'assistant', content: res.data.reply });
          addBubble('assistant', res.data.reply);
          save();
        } else {
          history.pop();
          addBubble('assistant', t(res.status === 429 ? 'limit' : 'error'), 'error');
        }
      })
      .catch(function () {
        typing.remove();
        history.pop();
        addBubble('assistant', t('error'), 'error');
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }

  function open() {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    input.focus();
    log.scrollTop = log.scrollHeight;
  }
  function close() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }

  fab.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });

  // Re-render the fixed texts when the page language changes.
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  document.body.appendChild(fab);
  document.body.appendChild(panel);
  render();
})();
