const { supabase } = require('../config/supabase');
const handlers = require('./handlers');
const flows = require('./flows');
const notification = require('../services/notification');

class BotEngine {
  async processMessage(phone, message, interactiveId = null) {
    // Get or create conversation
    let { data: conv } = await supabase
      .from('bot_conversations')
      .select('*')
      .eq('phone', phone)
      .single();

    if (!conv) {
      const { data: newConv } = await supabase
        .from('bot_conversations')
        .insert({ phone, state: 'idle', data: {} })
        .select().single();
      conv = newConv;
    }

    // Update last interaction
    await supabase.from('bot_conversations')
      .update({ last_interaction: new Date().toISOString() })
      .eq('phone', phone);

    const msg = (interactiveId || message || '').toString().trim().toLowerCase();
    const state = conv.state || 'idle';

    let result = null;

    // Route by state
    switch (state) {
      case 'idle':
        result = await this.handleIdle(phone, msg, conv);
        break;
      case 'selecting_type':
        result = await handlers.handleTypeSelection(phone, message, conv);
        break;
      case 'selecting_date':
        result = await handlers.handleDateSelection(phone, interactiveId || message, conv);
        break;
      case 'confirming':
        result = await this.handleConfirming(phone, msg, conv);
        break;
      case 'awaiting_payment':
        result = await this.handleAwaitingPayment(phone, msg, conv);
        break;
      case 'cancelling':
        result = await this.handleCancelling(phone, interactiveId || message, conv);
        break;
      default:
        result = { state: 'idle', data: {} };
    }

    // Update conversation state
    if (result) {
      await supabase.from('bot_conversations')
        .update({ state: result.state, data: result.data || {} })
        .eq('phone', phone);
    }

    return result;
  }

  async handleIdle(phone, message, conv) {
    // Check if patient exists
    const { data: patient } = await supabase.from('patients').select('*').eq('phone', phone).single();
    const { data: settings } = await supabase.from('settings').select('value').eq('key', 'practice_name').single();
    const practiceName = settings?.value?.name || 'la consulta';

    switch (message) {
      case '!agendar':
      case 'agendar':
      case 'cita':
        return handlers.handleAgendar(phone, conv);

      case '!citas':
      case 'citas':
      case 'mis citas':
        await handlers.handleCitas(phone);
        return { state: 'idle', data: {} };

      case '!cancelar':
      case 'cancelar':
        return handlers.handleCancelar(phone);

      case '!pagos':
      case 'pagos':
        await this.handlePagos(phone);
        return { state: 'idle', data: {} };

      case '!ayuda':
      case 'ayuda':
      case 'help':
        await notification.sendText(phone, flows.help(practiceName));
        return { state: 'idle', data: {} };

      default:
        // Welcome for new users, help for returning
        if (!patient) {
          // Register new patient
          await supabase.from('patients').insert({
            name: 'Paciente',
            phone,
            status: 'active'
          });
        }
        await notification.sendText(phone, flows.welcome(practiceName));
        return { state: 'idle', data: { name: patient?.name || 'Paciente' } };
    }
  }

  async handleConfirming(phone, message, conv) {
    const confirmed = message.includes('sí') || message.includes('si') || message === 'confirm_yes' || message === '✅ sí';
    return handlers.handleConfirmation(phone, confirmed, conv);
  }

  async handleAwaitingPayment(phone, message, conv) {
    await notification.sendText(phone, '⏳ Estamos esperando la confirmación de tu pago. Te avisaremos cuando se complete. Si tenés problemas, escribí *!ayuda*.');
    return { state: 'awaiting_payment', data: conv.data };
  }

  async handleCancelling(phone, selectionId, conv) {
    if (selectionId.startsWith('cancel_')) {
      const appointmentId = selectionId.replace('cancel_', '');
      return handlers.handleCancelConfirm(phone, appointmentId, conv);
    }
    await notification.sendText(phone, flows.invalidOption);
    return { state: conv.state, data: conv.data };
  }

  async handlePagos(phone) {
    const { data: appointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_phone', phone)
      .eq('paid', true)
      .order('created_at', { ascending: false });

    if (!appointments || appointments.length === 0) {
      await notification.sendText(phone, 'No tenés pagos registrados.');
      return;
    }

    let text = '*Tus pagos:*\n\n';
    appointments.forEach((apt, i) => {
      text += `${i + 1}. $${apt.deposit_amount} — ${apt.date} ${apt.time}\n`;
    });
    await notification.sendText(phone, text);
  }
}

module.exports = new BotEngine();
