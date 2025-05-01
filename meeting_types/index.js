import { pingShared, add } from '../shared/db.js';

context.log("🧪 meeting_types startar");

// context.log(pingShared());
// context.log("2 + 3 =", add(2, 3));

// const client = await getDb().connect();
// ...
// client.release();
// ...
// const values = ...

context.res = {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
  body: ["dummy1", "dummy2"]
};