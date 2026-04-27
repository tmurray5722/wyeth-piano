const { normalizeAvailability, readBody, readStore, requireAdmin, sendJson, writeStore } = require("../_lib");

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;

  if (request.method === "GET") {
    sendJson(response, 200, await readStore("availability"));
    return;
  }

  if (request.method === "PUT") {
    try {
      const availability = normalizeAvailability(await readBody(request));
      await writeStore("availability", availability);
      sendJson(response, 200, availability);
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Availability save failed." });
    }
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
};
