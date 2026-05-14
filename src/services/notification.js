const { waClient } = require('../config/whatsapp');

class NotificationService {
  // Send simple text message
  async sendText(to, text) {
    try {
      await waClient.post('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text }
      });
      return { success: true };
    } catch (err) {
      console.error('WhatsApp send error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Send interactive buttons
  async sendButtons(to, text, buttons) {
    // buttons: [{id: 'btn_1', title: 'Option 1'}, ...]
    try {
      await waClient.post('/messages', {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text },
          action: {
            buttons: buttons.map((b, i) => ({
              type: 'reply',
              reply: { id: b.id || `btn_${i}`, title: b.title }
            }))
          }
        }
      });
      return { success: true };
    } catch (err) {
      console.error('WhatsApp buttons error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Send interactive list
  async sendList(to, text, title, sections) {
    try {
      await waClient.post('/messages', {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text },
          action: { button: title, sections }
        }
      });
      return { success: true };
    } catch (err) {
      console.error('WhatsApp list error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new NotificationService();
