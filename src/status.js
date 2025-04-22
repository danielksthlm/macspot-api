console.log("✅ status.js är laddad!");

import { app } from '@azure/functions';

app.http('status', {
  route: 'status',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async () => {
    return {
      status: 200,
      jsonBody: {
        message: "🎉 Det fungerar!",
        time: new Date().toISOString()
      }
    };
  }
});