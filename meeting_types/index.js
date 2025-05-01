import { db } from '../shared/db.js';

export default async function (context, req) {
  context.log("🧪 Funktion startar");
  context.log(db());

  context.res = {
    status: 200,
    body: ["import av shared fungerar"]
  };
}