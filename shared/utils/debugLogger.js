
function createDebugLogger(context) {
  const isDebug = process.env.DEBUG === 'true';
  const skipReasons = {};

  const debugLog = (msg) => {
    if (msg.startsWith('⛔') || msg.startsWith('🍽️') || msg.startsWith('📛')) {
      const reason = msg.split(' – ')[0];
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
    }
    if (isDebug) {
      if (typeof context?.log === 'function') {
        context.log(msg);
      } else {
        console.log(msg);
      }
    }
  };

  return {
    debugLog,
    getSkipSummary: () => skipReasons
  };
}

module.exports = { createDebugLogger };