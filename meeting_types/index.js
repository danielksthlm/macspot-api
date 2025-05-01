import { pingShared, add } from '../shared/db.js';

context.log(pingShared());
context.log("2 + 3 =", add(2, 3));