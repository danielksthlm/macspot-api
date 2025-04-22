import db from "../../lib/utils/db.js";

export async function get(req) {
  const lang = req.query?.lang || "sv";
  if (!["sv", "en"].includes(lang)) {
    return {
      status: 400,
      jsonBody: { error: "Unsupported language" }
    };
  }

  try {
    const result = await db.query(`SELECT key, ${lang} FROM translation`);
    const translations = {};
    for (const row of result.rows) {
      translations[row.key] = row[lang];
    }

    return {
      status: 200,
      jsonBody: translations
    };
  } catch (error) {
    console.error("❌ Fel vid hämtning av översättningar:", error);
    return {
      status: 500,
      jsonBody: { error: "Failed to fetch translations" }
    };
  }
}