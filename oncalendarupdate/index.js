module.exports = async function (context, req) {
  context.log('📬 Inkommande kalendernotifiering mottagen');

  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      body: 'Endast POST är tillåtet'
    };
    return;
  }

  // Validera Microsofts initiala verifiering
  if (req.query && req.query.validationToken) {
    context.log('✅ Verifiering av prenumeration');
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: req.query.validationToken
    };
    return;
  }

  const notifications = req.body?.value;
  if (!Array.isArray(notifications)) {
    context.res = {
      status: 400,
      body: 'Ogiltig payload'
    };
    return;
  }

  for (const note of notifications) {
    const throttleMap = globalThis.throttleMap || (globalThis.throttleMap = new Map());
    const now = Date.now();

    context.log(`🔔 Notis: Resource = ${note.resource}, ChangeType = ${note.changeType}, Subscription = ${note.subscriptionId}`);
    try {
      const fetch = require('node-fetch');
      const lastCall = throttleMap.get(note.resource) || 0;
      if (now - lastCall > 30 * 1000) {
        const res = await fetch(process.env.BACKGROUND_SLOT_REFRESH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'calendar_change', resource: note.resource })
        });
        throttleMap.set(note.resource, now);
        context.log(`♻️ Cacheuppdatering triggad: status ${res.status}`);
      } else {
        context.log(`⏳ Skippade cacheuppdatering för ${note.resource} – throttlad`);
      }
    } catch (err) {
      context.log(`❌ Misslyckades trigga cacheuppdatering: ${err.message}`);
    }
  }

  context.res = {
    status: 202,
    body: 'Notis mottagen'
  };
};