module.exports = async function (context, req) {
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    };
    return;
  }

  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      body: { message: 'Method Not Allowed' }
    };
    return;
  }

  try {
    const { email, meeting_type, meeting_length } = req.body || {};

    if (!email || !meeting_type || !meeting_length) {
      context.res = {
        status: 400,
        body: { error: 'Missing one or more required fields: email, meeting_type, meeting_length' }
      };
      return;
    }

    context.res = {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: {
        received: {
          email,
          meeting_type,
          meeting_length
        }
      }
    };
  } catch (error) {
    context.log('🔥 FEL:', error.message, '\nSTACK:', error.stack);
    context.res = {
      status: 500,
      body: { error: error.message, stack: error.stack }
    };
  }
};
