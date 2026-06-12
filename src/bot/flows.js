const flows = {
  // Welcome message
  welcome: (practiceName) => `¡Hola! Soy el asistente virtual de *${practiceName}*.\n\n¿En qué puedo ayudarte?\n\n🗓 *!agendar* — Reservar una cita\n📋 *!citas* — Ver mis citas\n❌ *!cancelar* — Cancelar una cita\n💰 *!pagos* — Ver mis pagos\n❓ *!ayuda* — Ver opciones`,

  // Session type selection
  selectType: (feeTypes) => {
    let text = '¿Qué tipo de sesión necesitas?\n\n';
    feeTypes.forEach((ft, i) => {
      text += `${i + 1}️⃣ *${ft.label}* — $${ft.fee} (${ft.duration} min)\n`;
    });
    text += '\nEscribe el número o el nombre del tipo.';
    return text;
  },

  // Date selection (placeholder, will be populated from Cal.com)
  selectDate: 'Elige una fecha disponible:\n\n(Se cargarán las fechas disponibles)',

  // Summary before payment
  appointmentSummary: (data) => {
    const total = data.fee || 0;
    const deposit = data.deposit_amount || Math.round(total * 0.2);
    return `*Resumen de tu cita:*\n\n📅 Fecha: ${data.date}\n🕐 Hora: ${data.time}\n📋 Tipo: ${data.type_label}\n💰 Total: $${total}\n💳 Anticipo (${data.deposit_percent || 20}%): $${deposit}\n\n¿Confirmas la cita?`;
  },

  // Payment link sent
  paymentRequest: (stripeUrl) => `¡Perfecto! Para confirmar tu cita, paga el anticipo con el siguiente link:\n\n${stripeUrl}\n\nUna vez realizado el pago, tu cita quedará confirmada automáticamente.`,

  // Payment confirmed
  paymentConfirmed: (data) => `✅ *¡Pago confirmado!*\n\nTu cita está agendada:\n📅 ${data.date} a las ${data.time}\n📋 ${data.type_label || 'Sesión'}\n\nTe esperamos 🙌\n\nSi necesitas cancelar o reprogramar, escribe *!cancelar*.`,

  // Appointments list
  appointmentsList: (appointments) => {
    if (!appointments || appointments.length === 0) {
      return 'No tienes citas agendadas.\n\nEscribe *!agendar* para reservar una.';
    }
    let text = '*Tus próximas citas:*\n\n';
    appointments.forEach((apt, i) => {
      const status = apt.status === 'confirmed' ? '✅' : apt.status === 'pending' ? '⏳' : '❌';
      text += `${i + 1}. ${status} ${apt.date} ${apt.time} — ${apt.type_label || apt.type}\n`;
    });
    return text;
  },

  // Cancel confirmation
  cancelConfirm: (appointment) => `¿Cancelar esta cita?\n\n📅 ${appointment.date} ${appointment.time}\n📋 ${appointment.type}\n\nEscribe *SÍ* para confirmar la cancelación.`,

  // Cancellation success
  cancelSuccess: '✅ Tu cita ha sido cancelada.\n\nSi quieres agendar otra, escribe *!agendar*.',

  // Help
  help: (practiceName) => `*Opciones disponibles:*\n\n🗓 *!agendar* — Reservar nueva cita\n📋 *!citas* — Ver citas actuales\n❌ *!cancelar* — Cancelar una cita\n💰 *!pagos* — Ver estado de pagos\n❓ *!ayuda* — Ver este menú\n\n_${practiceName}_`,

  // Invalid option
  invalidOption: 'No entendí esa opción. Escribe *!ayuda* para ver las opciones disponibles.'
};

module.exports = flows;
