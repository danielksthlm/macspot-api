// import { Pool } from 'pg';

// let pool;

export default async function (context, req) {
  context.log("✅ meeting_types körs utan databas");

  context.res = {
    status: 200,
    body: ["Zoom", "Teams", "FaceTime", "atClient", "atOffice"]
  };
}