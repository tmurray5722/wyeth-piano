const { adminPassword, makeSessionCookie, readBody, sendJson } = require("../_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readBody(request);
  if (body.password !== adminPassword) {
    sendJson(response, 401, { error: "Incorrect password" });
    return;
  }

  sendJson(response, 200, { ok: true }, { "Set-Cookie": makeSessionCookie() });
};
