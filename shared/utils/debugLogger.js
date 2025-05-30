function createDebugLogger(context) {
  const isDebug = process.env.DEBUG === 'true';

  const debugLog = (msg) => {
    if (isDebug) {
      if (typeof context?.log === 'function') {
        context.log(msg);
      } else {
        console.log(msg);
      }
    }
  };

  const debugLogSlotsSummary = (slots) => {
    if (!isDebug) return;
    const fmSlots = slots.filter(s => s.slot_part === 'FM');
    const emSlots = slots.filter(s => s.slot_part === 'EM');
    console.log(`📋 Totalt: ${slots.length} | ☀️ FM: ${fmSlots.length} | 🌙 EM: ${emSlots.length}`);
  };

  return {
    log: debugLog,
    logSlotsSummary: debugLogSlotsSummary
  };
}

module.exports = { createDebugLogger };