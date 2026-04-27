const { forwardInquiry, normalizeInquiry, readBody, readStore, sendInquiryEmail, sendJson, writeStore } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const inquiry = normalizeInquiry(await readBody(request));
    if (!inquiry.name || !inquiry.email || !inquiry.message) {
      sendJson(response, 400, { error: "Name, email, and message are required." });
      return;
    }

    const inquiries = await readStore("inquiries");
    inquiries.push(inquiry);
    await writeStore("inquiries", inquiries);
    const emailed = await sendInquiryEmail(inquiry).catch(() => false);
    const forwarded = emailed || (await forwardInquiry(inquiry).catch(() => false));
    sendJson(response, 201, { ...inquiry, emailed, forwarded });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Inquiry failed." });
  }
};
