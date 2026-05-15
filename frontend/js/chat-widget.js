// ============================================
// APARTA — Widget de Chat Flotante
// ============================================

let chatState = {
    chatId: null,
    messages: [],
    isOpen: false
};

const API_URL = '';

function toggleChat() {
    const container = document.getElementById('chat-container');
    chatState.isOpen = !chatState.isOpen;
    container.classList.toggle('hidden', !chatState.isOpen);

    if (chatState.isOpen && !chatState.chatId) {
        startSession();
    }
}

async function startSession() {
    try {
        const res = await fetch(`${API_URL}/api/chat/session`);
        const data = await res.json();

        chatState.chatId = data.sessionId;
        clearMessages();
        addMessage(data.message, 'bot');
        showButtons(data.quickReplies || []);
    } catch (err) {
        addMessage('⚠️ Error de conexión. Intentá de nuevo.', 'bot');
    }
}

function addMessage(text, sender) {
    const messagesDiv = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;

    let html = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

    msgDiv.innerHTML = html;
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showButtons(buttons) {
    const buttonsDiv = document.getElementById('chat-buttons');
    buttonsDiv.innerHTML = '';

    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.label;
        button.onclick = () => {
            addMessage(btn.label, 'user');
            sendChatMessage(null, btn.id);
        };
        buttonsDiv.appendChild(button);
    });
}

function clearButtons() {
    document.getElementById('chat-buttons').innerHTML = '';
}

function clearMessages() {
    document.getElementById('chat-messages').innerHTML = '';
}

async function sendChatMessage(message, quickReplyId) {
    try {
        const response = await fetch(`${API_URL}/api/chat/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: chatState.chatId,
                message: message || '',
                quickReplyId: quickReplyId || null
            })
        });

        const result = await response.json();

        if (result.message) {
            addMessage(result.message, 'bot');
        }

        if (result.quickReplies && result.quickReplies.length > 0) {
            showButtons(result.quickReplies);
        } else {
            clearButtons();
        }

    } catch (err) {
        addMessage('⚠️ Error de conexión. Intentá de nuevo.', 'bot');
        console.error(err);
    }
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    input.value = '';
    sendChatMessage(text, null);
}

function handleKeyPress(e) {
    if (e.key === 'Enter') sendMessage();
}
