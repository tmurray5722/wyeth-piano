const crypto = require("node:crypto");

const adminPassword = process.env.ADMIN_PASSWORD || "jazz-admin";
const sessionSecret = process.env.SESSION_SECRET || "wyeth-fertig-admin-session";
const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const contactWebhookUrl = process.env.CONTACT_WEBHOOK_URL || "";
const resendApiKey = process.env.RESEND_API_KEY || "";
const contactFromEmail = process.env.CONTACT_FROM_EMAIL || "Wyeth Fertig Website <onboarding@resend.dev>";

const defaults = {
  availability: {
    artistName: "Wyeth Fertig",
    bookingEmail: "wyethfertig@gmail.com",
    eventDurationHours: 2,
    availableWeekdays: [0, 5, 6],
    extraAvailableDates: [],
    blackoutDates: []
  },
  bookings: [],
  bookingRequests: [],
  inquiries: []
};

function hasStorage() {
  return Boolean(kvUrl && kvToken);
}

async function kvCommand(command) {
  if (!hasStorage()) {
    throw new Error("Live storage is not configured. Add Vercel KV or Upstash Redis env vars in Vercel.");
  }

  const response = await fetch(kvUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error("Live storage request failed.");
  }

  return response.json();
}

async function readStore(key) {
  if (!hasStorage()) {
    return defaults[key];
  }

  const data = await kvCommand(["GET", `wyeth:${key}`]);
  if (!data.result) {
    return defaults[key];
  }

  return JSON.parse(data.result);
}

async function writeStore(key, value) {
  await kvCommand(["SET", `wyeth:${key}`, JSON.stringify(value)]);
  return value;
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("hex");
}

function makeSessionCookie() {
  const value = "admin";
  return `admin_session=${value}.${sign(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`;
}

function clearSessionCookie() {
  return "admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

function isAdmin(request) {
  const cookie = parseCookies(request.headers.cookie).admin_session;
  if (!cookie) return false;
  const [value, signature] = cookie.split(".");
  return value === "admin" && signature === sign(value);
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body || "{}");
  }

  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return JSON.parse(body || "{}");
}

function sendJson(response, status, body, headers = {}) {
  response.statusCode = status;
  Object.entries({
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  }).forEach(([key, value]) => response.setHeader(key, value));
  response.end(JSON.stringify(body));
}

function requireAdmin(request, response) {
  if (isAdmin(request)) return true;
  sendJson(response, 401, { error: "Login required" });
  return false;
}

function normalizeDateList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
}

function normalizeAvailability(value) {
  return {
    artistName: String(value.artistName || "Wyeth Fertig").trim(),
    bookingEmail: String(value.bookingEmail || "wyethfertig@gmail.com").trim(),
    eventDurationHours: Math.min(3, Math.max(1, Number(value.eventDurationHours) || 2)),
    availableWeekdays: Array.isArray(value.availableWeekdays)
      ? [...new Set(value.availableWeekdays.map(Number))]
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
          .sort((a, b) => a - b)
      : [],
    extraAvailableDates: normalizeDateList(value.extraAvailableDates),
    blackoutDates: normalizeDateList(value.blackoutDates)
  };
}

function normalizeBooking(value) {
  const durationHours = Number(value.durationHours);
  return {
    id: value.id || crypto.randomUUID(),
    createdAt: value.createdAt || new Date().toISOString(),
    date: String(value.selectedDate || value.date || "").trim(),
    timeSlot: String(value.timeSlot || "").trim(),
    durationHours: Number.isFinite(durationHours) ? Math.min(3, Math.max(1, durationHours)) : 2,
    eventType: String(value.eventType || "").trim(),
    clientEmail: String(value.clientEmail || "").trim(),
    venue: String(value.venue || "").trim()
  };
}

function createCalendarHold(booking) {
  const [year, month, day] = booking.date.split("-").map(Number);
  const [hour, minute] = booking.timeSlot.split(":").map(Number);
  const start = new Date(year, month - 1, day, hour, minute);
  const end = new Date(start);
  end.setMinutes(start.getMinutes() + booking.durationHours * 60);
  const stamp = (date) => date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const description = [
    "Accepted gig request for Wyeth Fertig",
    `Performance format: ${booking.eventType}`,
    `Client email: ${booking.clientEmail}`,
    `Length: ${booking.durationHours} hours`
  ].join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wyeth Fertig Jazz Piano//Accepted Booking//EN",
    "BEGIN:VEVENT",
    `UID:${booking.id}@wyethfertig.com`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    "SUMMARY:Wyeth Fertig Jazz Piano",
    `LOCATION:${booking.venue || "Venue TBD"}`,
    `DESCRIPTION:${description}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function normalizeInquiry(value) {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: String(value.name || "").trim(),
    email: String(value.email || "").trim(),
    message: String(value.message || "").trim(),
    routedTo: "wyethfertig@gmail.com"
  };
}

async function sendInquiryEmail(inquiry) {
  if (!resendApiKey) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: contactFromEmail,
      to: ["wyethfertig@gmail.com"],
      reply_to: inquiry.email,
      subject: `Website inquiry from ${inquiry.name}`,
      text: `Name: ${inquiry.name}\nEmail: ${inquiry.email}\n\n${inquiry.message}`
    })
  });
  return response.ok;
}

async function forwardInquiry(inquiry) {
  if (!contactWebhookUrl) return false;
  const response = await fetch(contactWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inquiry)
  });
  return response.ok;
}

module.exports = {
  adminPassword,
  clearSessionCookie,
  createCalendarHold,
  defaults,
  forwardInquiry,
  hasStorage,
  makeSessionCookie,
  normalizeAvailability,
  normalizeBooking,
  normalizeInquiry,
  readBody,
  readStore,
  requireAdmin,
  sendInquiryEmail,
  sendJson,
  writeStore
};
