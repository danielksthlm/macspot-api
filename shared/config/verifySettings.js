

function verifyBookingSettings(settings, context) {
  const expected = {
    default_office_address: 'string',
    default_home_address: 'string',
    fallback_travel_time_minutes: 'number',
    buffer_between_meetings: 'number',
    default_meeting_length_atoffice: 'array',
    default_meeting_length_atclient: 'array',
    default_meeting_length_digital: 'array',
    meeting_types: 'array',
    block_weekends: 'boolean',
    open_time: 'string',
    close_time: 'string',
    lunch_start: 'string',
    lunch_end: 'string',
    travel_time_window_start: 'string',
    travel_time_window_end: 'string',
    require_approval: 'boolean',
    max_days_in_advance: 'number',
    max_weekly_booking_minutes: 'number',
    cache_ttl_minutes: 'number',
    allowed_atclient_meeting_days: 'array',
    timezone: 'string'
  };

  const issues = [];
  for (const [key, type] of Object.entries(expected)) {
    const val = settings[key];
    if (val === undefined || val === null || (key === 'timezone' && String(val).trim() === '')) {
      issues.push(`❌ Saknar inställning: ${key}`);
    } else if (key === 'allowed_atclient_meeting_days') {
      if (!Array.isArray(val) || !val.every(v => typeof v === 'string')) {
        issues.push(`⚠️ Typfel för ${key}: ska vara array av strängar`);
      }
    } else if (key === 'require_approval') {
      if (typeof val !== 'boolean') {
        issues.push(`⚠️ Typfel för ${key}: ska vara boolean`);
      }
    } else if (type === 'array' ? !Array.isArray(val) : typeof val !== type) {
      issues.push(`⚠️ Typfel för ${key}: har ${typeof val}, förväntade ${type}`);
    }
  }

  if (issues.length > 0) {
    const message = '🛑 Problem med booking_settings:\n' + issues.join('\n');
    context.log.warn(message);
    throw new Error(message);
  }
}

module.exports = verifyBookingSettings;