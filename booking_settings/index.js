const { getSettings } = require('../shared/config/settingsLoader');
const graphClient = require('../shared/calendar/msGraph')();

module.exports = async function (context, req) {
  try {
    const settings = await getSettings();
    context.res = {
      status: 200,
      body: settings
    };
  } catch (err) {
    context.log.error('Fel vid hämtning av booking_settings', err);
    context.res = {
      status: 500,
      body: { error: 'Kunde inte hämta booking_settings' }
    };
  }
};