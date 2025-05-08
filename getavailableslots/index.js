 // Version 4
 
 async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  try {
    const { email, meeting_type, meeting_length } = req.body || {};

    if (!email || !meeting_type || !meeting_length) {
      res.status(400).json({ error: 'Missing one or more required fields: email, meeting_type, meeting_length' });
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      received: {
        email,
        meeting_type,
        meeting_length
      }
    });
  } catch (error) {
    console.error('🔥 FEL:', error.message, '\nSTACK:', error.stack);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}
module.exports = handler;
