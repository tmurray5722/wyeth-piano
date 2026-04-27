const { clearSessionCookie, sendJson } = require("../_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
};
