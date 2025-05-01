import { hello } from '../shared/testmodule.js';

context.log("🧪 Funktion startad");
context.log(hello());

context.res = {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
  body: ["dummy"]
};