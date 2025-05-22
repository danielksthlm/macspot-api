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

  // Testscenarier: varje objekt representerar ett API-test med beskrivning
  const scenarios = [
    {
      name: 'meeting_types',
      method: 'GET',
      url: `${base}/meeting_types`,
      description: 'Hämtar tillgängliga mötestyper'
    },
    {
      name: 'booking_settings',
      method: 'GET',
      url: `${base}/booking_settings`,
      description: 'Hämtar bokningsinställningar'
    },
    {
      name: 'validate_contact',
      method: 'POST',
      url: `${base}/validate_contact`,
      body: {
        email: 'daniel@anynode.se',
        meeting_type: 'zoom'
      },
      description: 'Validerar kontaktuppgifter för given e-post och mötestyp'
    },
    {
      name: 'getavailableslots',
      method: 'POST',
      url: `${base}/getavailableslots`,
      body: {
        email: 'daniel@anynode.se',
        meeting_type: 'zoom',
        meeting_length: 30,
        contact_id: 'test-contact-id'
      },
      description: 'Hämtar lediga tider för bokning'
    }
  ];

  for (const scenario of scenarios) {
    tests.push(await testEndpoint(scenario.name, scenario.method, scenario.url, scenario.body));
  }

  context.res = {
    status: 200,
    body: {
      message: '✅ Resultat från frontend-test via backend',
      tests
    }
  };
};