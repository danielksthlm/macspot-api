const fetch = require('node-fetch');

module.exports = async function (context, req) {
  const base = 'https://macspotbackend.azurewebsites.net/api';
  const tests = [];

  async function testEndpoint(name, method, url, body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    try {
      const res = await fetch(url, options);
      const status = res.status;
      const json = await res.json();
      return { name, status, ok: res.ok, response: json };
    } catch (err) {
      return { name, status: 0, ok: false, error: err.message };
    }
  }

  tests.push(await testEndpoint('meeting_types', 'GET', `${base}/meeting_types`));
  tests.push(await testEndpoint('booking_settings', 'GET', `${base}/booking_settings`));
  tests.push(await testEndpoint('validate_contact', 'POST', `${base}/validate_contact`, {
    email: 'daniel@anynode.se',
    meeting_type: 'zoom'
  }));
  tests.push(await testEndpoint('getavailableslots', 'POST', `${base}/getavailableslots`, {
    email: 'daniel@anynode.se',
    meeting_type: 'zoom',
    meeting_length: 30,
    contact_id: 'test-contact-id'
  }));

  context.res = {
    status: 200,
    body: {
      message: '✅ Resultat från frontend-test via backend',
      tests
    }
  };
};