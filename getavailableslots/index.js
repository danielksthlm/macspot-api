console.log("🧪 getavailableslots/index.js – MINIMAL VERSION LADDADE");

module.exports = async function (context, req) {
  context.log("🧪 Azure Function körs");
  context.res = {
    status: 200,
    body: { message: "✅ getavailableslots fungerar" }
  };
};