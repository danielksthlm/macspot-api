module.exports = async function (context, req) {
  context.log('✅ Funktion getavailableslots anropad');

  context.res = {
    status: 200,
    body: {
      message: 'Testfunktion körd korrekt'
    }
  };
};