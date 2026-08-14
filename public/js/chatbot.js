// ==========================================================================
// SAS Barber - Agente de IA para Atendimento ao Cliente
// Usa o endpoint seguro /api/chat (backend proxy para o Google Gemini)
// ==========================================================================

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────
  let conversationHistory = [];
  let isOpen = false;
  let isTyping = false;

  // ── Inject HTML ──────────────────────────────────────────────────────────
  function createWidget() {
    const html = `
      <!-- SAS Bot Floating Widget -->
      <div id="sas-chatbot-wrapper">
        <!-- Trigger Button -->
        <button id="sas-chat-toggle" aria-label="Abrir chat com assistente" title="Fale com nosso assistente IA">
          <span class="sas-chat-icon-default">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="currentColor"/>
              <circle cx="8" cy="11" r="1.2" fill="white"/>
              <circle cx="12" cy="11" r="1.2" fill="white"/>
              <circle cx="16" cy="11" r="1.2" fill="white"/>
            </svg>
          </span>
          <span class="sas-chat-icon-close">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="sas-chat-notification" id="sas-notification-badge">1</span>
        </button>

        <!-- Chat Window -->
        <div id="sas-chat-window" role="dialog" aria-label="Chat com SAS Bot" aria-hidden="true">
          <!-- Header -->
          <div class="sas-chat-header">
            <div class="sas-chat-header-avatar">
              <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="20" fill="#d4af37"/>
                <text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" font-size="18" font-family="serif" fill="#0a0b0d">✂</text>
              </svg>
              <span class="sas-online-dot"></span>
            </div>
            <div class="sas-chat-header-info">
              <strong>SAS Bot</strong>
              <span>Assistente Virtual · Online agora</span>
            </div>
            <button class="sas-chat-header-close" id="sas-close-btn" aria-label="Fechar chat">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <!-- Messages -->
          <div class="sas-chat-messages" id="sas-messages-container">
            <!-- Initial welcome message -->
            <div class="sas-msg sas-msg-bot">
              <div class="sas-msg-avatar">✂</div>
              <div class="sas-msg-bubble">
                Olá! Sou o <strong>SAS Bot</strong>, seu assistente virtual da <strong>SAS Barber</strong>. 💈<br><br>
                Posso te ajudar com informações sobre nossos serviços, preços e agendamentos. Como posso te ajudar hoje?
              </div>
            </div>
            <!-- Quick actions -->
            <div class="sas-quick-actions" id="sas-quick-actions">
              <button class="sas-quick-btn" data-msg="Quais são os serviços disponíveis?">💇 Ver Serviços</button>
              <button class="sas-quick-btn" data-msg="Quais são os preços?">💰 Ver Preços</button>
              <button class="sas-quick-btn" data-msg="Como faço um agendamento?">📅 Agendar</button>
              <button class="sas-quick-btn" data-msg="Qual o horário de funcionamento?">🕐 Horários</button>
            </div>
          </div>

          <!-- Typing indicator (hidden by default) -->
          <div class="sas-typing-indicator" id="sas-typing" style="display:none;">
            <div class="sas-msg-avatar">✂</div>
            <div class="sas-typing-dots">
              <span></span><span></span><span></span>
            </div>
          </div>

          <!-- Input Area -->
          <div class="sas-chat-input-area">
            <div class="sas-input-wrapper">
              <textarea
                id="sas-user-input"
                placeholder="Digite sua mensagem..."
                rows="1"
                aria-label="Digite sua mensagem"
                maxlength="500"
              ></textarea>
              <button id="sas-send-btn" aria-label="Enviar mensagem" disabled>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <p class="sas-powered-by">⚡ Powered by Google Gemini AI</p>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  // ── Inject CSS ───────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'sas-chatbot-styles';
    style.textContent = `
      /* ===== SAS Chatbot Widget ===== */
      #sas-chatbot-wrapper {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 99999;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      /* Toggle Button */
      #sas-chat-toggle {
        width: 62px;
        height: 62px;
        border-radius: 50%;
        background: linear-gradient(135deg, #d4af37 0%, #f3e5ab 50%, #aa8410 100%);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(212, 175, 55, 0.5), 0 2px 8px rgba(0,0,0,0.3);
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
        position: relative;
        color: #0a0b0d;
      }

      #sas-chat-toggle:hover {
        transform: scale(1.1) rotate(-5deg);
        box-shadow: 0 6px 28px rgba(212, 175, 55, 0.7), 0 3px 12px rgba(0,0,0,0.4);
      }

      #sas-chat-toggle svg {
        width: 28px;
        height: 28px;
        transition: opacity 0.25s ease, transform 0.25s ease;
      }

      .sas-chat-icon-default { display: flex; }
      .sas-chat-icon-close { display: none; }

      #sas-chat-toggle.open .sas-chat-icon-default { display: none; }
      #sas-chat-toggle.open .sas-chat-icon-close { display: flex; }
      #sas-chat-toggle.open { background: linear-gradient(135deg, #272c36 0%, #1b1e25 100%); color: #fff; }

      /* Notification Badge */
      .sas-chat-notification {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #ef4444;
        color: white;
        font-size: 11px;
        font-weight: 700;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #0a0b0d;
        animation: sas-pulse 2s infinite;
      }

      .sas-chat-notification.hidden { display: none; }

      @keyframes sas-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); }
      }

      /* Chat Window */
      #sas-chat-window {
        position: absolute;
        bottom: 78px;
        right: 0;
        width: 370px;
        max-height: 560px;
        background: #14171c;
        border: 1px solid #272c36;
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 4px 20px rgba(212,175,55,0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0.85) translateY(20px);
        transform-origin: bottom right;
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      #sas-chat-window.open {
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: all;
      }

      /* Header */
      .sas-chat-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 18px;
        background: linear-gradient(135deg, #1b1e25 0%, #14171c 100%);
        border-bottom: 1px solid #272c36;
        position: relative;
        flex-shrink: 0;
      }

      .sas-chat-header::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
        background: linear-gradient(90deg, #d4af37, #f3e5ab, #aa8410);
      }

      .sas-chat-header-avatar {
        position: relative;
        flex-shrink: 0;
      }

      .sas-chat-header-avatar svg {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        border: 2px solid #d4af37;
      }

      .sas-online-dot {
        position: absolute;
        bottom: 1px;
        right: 1px;
        width: 11px;
        height: 11px;
        background: #10b981;
        border-radius: 50%;
        border: 2px solid #14171c;
        animation: sas-online-blink 3s infinite;
      }

      @keyframes sas-online-blink {
        0%, 90%, 100% { opacity: 1; }
        95% { opacity: 0.4; }
      }

      .sas-chat-header-info {
        flex-grow: 1;
      }

      .sas-chat-header-info strong {
        display: block;
        font-size: 15px;
        color: #f1f5f9;
        font-weight: 700;
        letter-spacing: 0.3px;
      }

      .sas-chat-header-info span {
        font-size: 12px;
        color: #10b981;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .sas-chat-header-close {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        transition: color 0.2s, background 0.2s;
      }

      .sas-chat-header-close:hover { color: #f1f5f9; background: #272c36; }
      .sas-chat-header-close svg { width: 18px; height: 18px; }

      /* Messages */
      .sas-chat-messages {
        flex-grow: 1;
        overflow-y: auto;
        padding: 16px 14px 8px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        scroll-behavior: smooth;
      }

      .sas-chat-messages::-webkit-scrollbar { width: 4px; }
      .sas-chat-messages::-webkit-scrollbar-track { background: transparent; }
      .sas-chat-messages::-webkit-scrollbar-thumb { background: #272c36; border-radius: 4px; }

      .sas-msg {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        animation: sas-msg-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes sas-msg-in {
        from { opacity: 0; transform: translateY(12px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .sas-msg-bot { flex-direction: row; }
      .sas-msg-user { flex-direction: row-reverse; }

      .sas-msg-avatar {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: linear-gradient(135deg, #d4af37, #aa8410);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        flex-shrink: 0;
        border: 1px solid #d4af37;
      }

      .sas-msg-content {
        display: flex;
        flex-direction: column;
        max-width: 82%;
      }

      .sas-msg-bot .sas-msg-content { align-items: flex-start; }
      .sas-msg-user .sas-msg-content { align-items: flex-end; }

      .sas-msg-bubble {
        padding: 10px 14px;
        border-radius: 18px;
        font-size: 13.5px;
        line-height: 1.55;
        color: #f1f5f9;
      }

      .sas-msg-bot .sas-msg-bubble {
        background: #1b1e25;
        border: 1px solid #272c36;
        border-bottom-left-radius: 4px;
      }

      .sas-msg-user .sas-msg-bubble {
        background: linear-gradient(135deg, #d4af37 0%, #c9a227 100%);
        color: #0a0b0d;
        border-bottom-right-radius: 4px;
        font-weight: 500;
      }

      .sas-msg-time {
        font-size: 10px;
        color: #475569;
        margin-top: 3px;
        padding: 0 4px;
      }

      /* Quick Actions */
      .sas-quick-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding-left: 38px;
        animation: sas-msg-in 0.4s 0.15s both;
      }

      .sas-quick-btn {
        background: transparent;
        border: 1px solid #d4af37;
        color: #d4af37;
        border-radius: 20px;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.2s ease;
        white-space: nowrap;
      }

      .sas-quick-btn:hover {
        background: #d4af37;
        color: #0a0b0d;
        transform: translateY(-1px);
        box-shadow: 0 3px 10px rgba(212,175,55,0.3);
      }

      /* Typing Indicator */
      .sas-typing-indicator {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        padding: 0 14px 8px;
        flex-shrink: 0;
      }

      .sas-typing-dots {
        background: #1b1e25;
        border: 1px solid #272c36;
        border-radius: 18px;
        border-bottom-left-radius: 4px;
        padding: 12px 16px;
        display: flex;
        gap: 5px;
        align-items: center;
      }

      .sas-typing-dots span {
        width: 7px;
        height: 7px;
        background: #d4af37;
        border-radius: 50%;
        animation: sas-dot-bounce 1.4s infinite ease-in-out;
      }

      .sas-typing-dots span:nth-child(1) { animation-delay: 0s; }
      .sas-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
      .sas-typing-dots span:nth-child(3) { animation-delay: 0.4s; }

      @keyframes sas-dot-bounce {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-6px); opacity: 1; }
      }

      /* Input Area */
      .sas-chat-input-area {
        padding: 12px 14px 10px;
        border-top: 1px solid #272c36;
        background: #14171c;
        flex-shrink: 0;
      }

      .sas-input-wrapper {
        display: flex;
        gap: 8px;
        align-items: flex-end;
        background: #1b1e25;
        border: 1px solid #272c36;
        border-radius: 14px;
        padding: 8px 8px 8px 14px;
        transition: border-color 0.2s;
      }

      .sas-input-wrapper:focus-within {
        border-color: #d4af37;
        box-shadow: 0 0 0 3px rgba(212,175,55,0.15);
      }

      #sas-user-input {
        flex-grow: 1;
        background: none;
        border: none;
        color: #f1f5f9;
        font-size: 13.5px;
        font-family: inherit;
        resize: none;
        outline: none;
        line-height: 1.5;
        max-height: 100px;
        overflow-y: auto;
      }

      #sas-user-input::placeholder { color: #475569; }

      #sas-send-btn {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: linear-gradient(135deg, #d4af37, #aa8410);
        border: none;
        color: #0a0b0d;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s ease;
      }

      #sas-send-btn:disabled {
        background: #272c36;
        color: #475569;
        cursor: not-allowed;
      }

      #sas-send-btn:not(:disabled):hover {
        transform: scale(1.08);
        box-shadow: 0 3px 12px rgba(212,175,55,0.4);
      }

      #sas-send-btn svg { width: 16px; height: 16px; }

      .sas-powered-by {
        text-align: center;
        font-size: 10.5px;
        color: #334155;
        margin-top: 6px;
        letter-spacing: 0.3px;
      }

      /* Error bubble */
      .sas-msg-error .sas-msg-bubble {
        background: rgba(239, 68, 68, 0.1) !important;
        border-color: rgba(239, 68, 68, 0.3) !important;
        color: #fca5a5 !important;
      }

      /* Responsive */
      @media (max-width: 480px) {
        #sas-chatbot-wrapper {
          bottom: 16px;
          right: 16px;
        }
        #sas-chat-window {
          width: calc(100vw - 32px);
          right: 0;
          max-height: 70vh;
        }
      }

      /* Wiggle animation (triggered via JS) */
      @keyframes sas-wiggle {
        0%,100% { transform: rotate(0deg) scale(1); }
        20% { transform: rotate(-12deg) scale(1.1); }
        40% { transform: rotate(12deg) scale(1.1); }
        60% { transform: rotate(-8deg) scale(1.05); }
        80% { transform: rotate(8deg) scale(1.05); }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Utilities ────────────────────────────────────────────────────────────
  function scrollToBottom() {
    const container = document.getElementById('sas-messages-container');
    if (container) {
      setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
    }
  }

  function getTime() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function appendMessage(text, role, isError) {
    const container = document.getElementById('sas-messages-container');
    const isBot = role === 'bot';

    const wrapper = document.createElement('div');
    wrapper.className = `sas-msg sas-msg-${isBot ? 'bot' : 'user'}${isError ? ' sas-msg-error' : ''}`;

    const botAvatar = `<div class="sas-msg-avatar">✂</div>`;
    const userAvatar = `<div class="sas-msg-avatar" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);border-color:#3b82f6;">👤</div>`;

    wrapper.innerHTML = `
      ${isBot ? botAvatar : userAvatar}
      <div class="sas-msg-content">
        <div class="sas-msg-bubble">${text}</div>
        <div class="sas-msg-time">${getTime()}</div>
      </div>
    `;

    container.appendChild(wrapper);
    scrollToBottom();
    return wrapper;
  }

  function setTyping(show) {
    const indicator = document.getElementById('sas-typing');
    const container = document.getElementById('sas-messages-container');
    if (!indicator) return;
    if (show) {
      indicator.style.display = 'flex';
      container.after(indicator); // Keep typing below messages
      scrollToBottom();
    } else {
      indicator.style.display = 'none';
    }
    isTyping = show;
  }

  function formatBotText(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // ── Fallback responses (when API is not configured) ──────────────────────
  function getFallbackResponse(text) {
    const t = text.toLowerCase();
    if (t.includes('preco') || t.includes('preço') || t.includes('valor') || t.includes('custa')) {
      return '💈 Nossos preços são:\n\n• **Corte**: R$ 40,00\n• **Barba**: R$ 30,00\n• **Pigmentação**: R$ 25,00\n• **Corte & Barba**: R$ 65,00\n\nQuer agendar? Estamos prontos para te atender!';
    }
    if (t.includes('hora') || t.includes('funcionament') || t.includes('abr') || t.includes('fech')) {
      return '🕐 Funcionamos de **Segunda a Sábado**, das **9h às 20h**.\n\nNos domingos e feriados estamos fechados.';
    }
    if (t.includes('agenda') || t.includes('marcar') || t.includes('reserv')) {
      return '📅 Para agendar, você pode:\n\n• Usar nosso **sistema online** diretamente no site\n• Entrar em contato com a barbearia\n\nFácil e rápido! 😊';
    }
    if (t.includes('servico') || t.includes('serviço') || t.includes('corte') || t.includes('barba') || t.includes('pigment')) {
      return '✂️ Na **SAS Barber** oferecemos:\n\n• **Corte** – visual moderno ou clássico\n• **Barba** – modelagem e tratamento completo\n• **Pigmentação** – disfarce de falhas\n• **Corte & Barba** – combo completo com desconto!\n\nTodos com produtos premium! 🏆';
    }
    return '😊 Olá! Posso te ajudar com informações sobre nossos **serviços**, **preços**, **horários** ou **agendamentos**.\n\nÉ só perguntar! 💈';
  }

  // ── API Call (via backend proxy) ─────────────────────────────────────────
  async function callChatAPI(userMessage) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        history: conversationHistory
      })
    });

    const data = await response.json();

    if (!response.ok || data.offline) {
      // Backend offline or key not configured — use fallback
      return { text: getFallbackResponse(userMessage), isFallback: true };
    }

    // Update history for context continuity
    conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });
    conversationHistory.push({ role: 'model', parts: [{ text: data.reply }] });

    // Trim history to last 20 turns
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    return { text: data.reply, isFallback: false };
  }

  // ── Send Message ─────────────────────────────────────────────────────────
  async function sendMessage(text) {
    const input = document.getElementById('sas-user-input');
    const sendBtn = document.getElementById('sas-send-btn');

    const userText = (text || input.value).trim();
    if (!userText || isTyping) return;

    // Clear input
    if (!text) {
      input.value = '';
      input.style.height = 'auto';
    }
    sendBtn.disabled = true;

    // Hide quick actions
    const quickActions = document.getElementById('sas-quick-actions');
    if (quickActions) quickActions.style.display = 'none';

    // Show user message
    appendMessage(userText, 'user');
    setTyping(true);

    try {
      const { text: botReply } = await callChatAPI(userText);
      setTyping(false);
      appendMessage(formatBotText(botReply), 'bot');
    } catch (err) {
      setTyping(false);
      console.warn('[SAS Bot] Erro:', err.message);
      appendMessage(formatBotText(getFallbackResponse(userText)), 'bot');
    }

    if (input.value.trim()) {
      sendBtn.disabled = false;
    }
  }

  // ── Toggle Chat ──────────────────────────────────────────────────────────
  function toggleChat() {
    isOpen = !isOpen;
    const chatWindow = document.getElementById('sas-chat-window');
    const toggle = document.getElementById('sas-chat-toggle');
    const badge = document.getElementById('sas-notification-badge');
    const input = document.getElementById('sas-user-input');

    chatWindow.classList.toggle('open', isOpen);
    chatWindow.setAttribute('aria-hidden', String(!isOpen));
    toggle.classList.toggle('open', isOpen);

    if (isOpen) {
      badge.classList.add('hidden');
      setTimeout(() => input && input.focus(), 300);
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    createWidget();

    document.getElementById('sas-chat-toggle').addEventListener('click', toggleChat);
    document.getElementById('sas-close-btn').addEventListener('click', toggleChat);

    const sendBtn = document.getElementById('sas-send-btn');
    const input = document.getElementById('sas-user-input');

    sendBtn.addEventListener('click', () => sendMessage());

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
      sendBtn.disabled = !input.value.trim() || isTyping;
    });

    // Quick action buttons
    document.querySelectorAll('.sas-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.getAttribute('data-msg');
        if (msg) sendMessage(msg);
      });
    });

    // Subtle attention animation after 3 seconds
    setTimeout(() => {
      const toggle = document.getElementById('sas-chat-toggle');
      if (toggle && !isOpen) {
        toggle.style.animation = 'sas-wiggle 0.7s ease';
        setTimeout(() => { toggle.style.animation = ''; }, 800);
      }
    }, 3500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
