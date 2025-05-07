module.exports = async function (context, req) {
  context.log('✅ Funktion anropad');

  if (!req || !req.body) {
    context.res = {
      status: 400,
      body: { error: 'Saknar req.body' }
    };
    return;
  }

  const { email, meeting_type, meeting_length } = req.body;
  context.log('📥 Data mottagen:', { email, meeting_type, meeting_length });

  context.res = {
    status: 200,
    body: { message: 'Funktion kördes utan fel', input: req.body }
  };
};
