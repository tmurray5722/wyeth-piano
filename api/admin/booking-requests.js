const { readStore, requireAdmin, sendJson } = require("../_lib");

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  sendJson(response, 200, await readStore("bookingRequests"));
};
