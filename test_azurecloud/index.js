const { DateTime } = require("luxon");

function reportXml(startDate, endDate) {
  return `
    <c:time-range start="${DateTime.fromISO(startDate).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}" end="${DateTime.fromISO(endDate).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}"/>
  `;
}

module.exports = {
  reportXml
};