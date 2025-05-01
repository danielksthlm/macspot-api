export default async function (context, req) {
  context.log("🧪 Funktion startar UTAN import");

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: ["minimal"]
  };
}