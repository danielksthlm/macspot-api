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

  return {
    debugLog
  };
}

module.exports = { createDebugLogger };