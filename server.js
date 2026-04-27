const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
const dataPath = path.join(root, "data", "availability.json");
const bookingsPath = path.join(root, "data", "bookings.json");
const bookingRequestsPath = path.join(root, "data", "booking-requests.json");
const inquiriesPath = path.join(root, "data", "inquiries.json");
const port = Number(process.env.PORT || 3000);
const adminPassword = process.env.ADMIN_PASSWORD || "jazz-admin";
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const contactWebhookUrl = process.env.CONTACT_WEBHOOK_URL || "";
const resendApiKey = process.env.RESEND_API_KEY || "";
const contactFromEmail = process.env.CONTACT_FROM_EMAIL || "Wyeth Fertig Website <onboarding@resend.dev>";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    ...headers
  });
  response.end(body);
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(body));
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
  return `admin_session=${value}.${sign(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`;
}

function isAdmin(request) {
  const cookie = parseCookies(request.headers.cookie).admin_session;
  if (!cookie) return false;
  const [value, signature] = cookie.split(".");
  return value === "admin" && signature === sign(value);
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error("Request body is too large");
    }
  }
  return body;
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

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeDateRange(startDate, endDate = startDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) {
    return [];
  }

  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  const first = start <= end ? start : end;
  const last = start <= end ? end : start;
  const dates = [];

  for (const date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
  }

  return dates;
}

function normalizeBooking(value) {
  const date = String(value.selectedDate || value.date || "").trim();
  const timeSlot = String(value.timeSlot || "").trim();
  const durationHours = Number(value.durationHours);
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    date,
    timeSlot,
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

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/availability") {
    const availability = await readJsonFile(dataPath, {});
    const bookings = await readJsonFile(bookingsPath, []);
    sendJson(response, 200, {
      ...availability,
      bookedDates: bookings.map((booking) => booking.date).filter(Boolean)
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/booking-requests") {
    const body = JSON.parse(await readRequestBody(request));
    const bookingRequest = normalizeBooking(body);
    bookingRequest.status = "pending";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingRequest.date) || !/^\d{2}:\d{2}$/.test(bookingRequest.timeSlot)) {
      sendJson(response, 400, { error: "Choose a valid date and time." });
      return true;
    }
    const bookings = await readJsonFile(bookingsPath, []);
    if (bookings.some((existing) => existing.date === bookingRequest.date)) {
      sendJson(response, 409, { error: "That date is no longer available. Please choose another date." });
      return true;
    }
    const bookingRequests = await readJsonFile(bookingRequestsPath, []);
    bookingRequests.push(bookingRequest);
    await writeJsonFile(bookingRequestsPath, bookingRequests);
    sendJson(response, 201, bookingRequest);
    return true;
  }

  if (request.method === "POST" && pathname === "/api/inquiries") {
    const body = JSON.parse(await readRequestBody(request));
    const inquiry = normalizeInquiry(body);
    if (!inquiry.name || !inquiry.email || !inquiry.message) {
      sendJson(response, 400, { error: "Name, email, and message are required." });
      return true;
    }
    const inquiries = await readJsonFile(inquiriesPath, []);
    inquiries.push(inquiry);
    await writeJsonFile(inquiriesPath, inquiries);
    const emailed = await sendInquiryEmail(inquiry).catch(() => false);
    const forwarded = emailed || (await forwardInquiry(inquiry).catch(() => false));
    sendJson(response, 201, { ...inquiry, emailed, forwarded });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/admin/login") {
    const body = JSON.parse(await readRequestBody(request));
    if (body.password !== adminPassword) {
      sendJson(response, 401, { error: "Incorrect password" });
      return true;
    }
    sendJson(response, 200, { ok: true }, { "Set-Cookie": makeSessionCookie() });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/admin/logout") {
    sendJson(response, 200, { ok: true }, { "Set-Cookie": "admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/admin/availability") {
    if (!isAdmin(request)) {
      sendJson(response, 401, { error: "Login required" });
      return true;
    }
    const availability = await readJsonFile(dataPath, {});
    sendJson(response, 200, availability);
    return true;
  }

  if (request.method === "GET" && pathname === "/api/admin/booking-requests") {
    if (!isAdmin(request)) {
      sendJson(response, 401, { error: "Login required" });
      return true;
    }
    const bookingRequests = await readJsonFile(bookingRequestsPath, []);
    sendJson(response, 200, bookingRequests);
    return true;
  }

  if (request.method === "POST" && pathname.startsWith("/api/admin/booking-requests/") && pathname.endsWith("/accept")) {
    if (!isAdmin(request)) {
      sendJson(response, 401, { error: "Login required" });
      return true;
    }
    const requestId = pathname.split("/")[4];
    const bookingRequests = await readJsonFile(bookingRequestsPath, []);
    const requestIndex = bookingRequests.findIndex((item) => item.id === requestId);
    if (requestIndex === -1) {
      sendJson(response, 404, { error: "Booking request not found" });
      return true;
    }
    const booking = { ...bookingRequests[requestIndex], status: "accepted", acceptedAt: new Date().toISOString() };
    const bookings = await readJsonFile(bookingsPath, []);
    if (bookings.some((existing) => existing.date === booking.date)) {
      sendJson(response, 409, { error: "That date is already accepted." });
      return true;
    }
    bookings.push(booking);
    bookingRequests.splice(requestIndex, 1);
    await writeJsonFile(bookingsPath, bookings);
    await writeJsonFile(bookingRequestsPath, bookingRequests);
    sendJson(response, 200, { booking, calendarHold: createCalendarHold(booking) });
    return true;
  }

  if (request.method === "PUT" && pathname === "/api/admin/availability") {
    if (!isAdmin(request)) {
      sendJson(response, 401, { error: "Login required" });
      return true;
    }
    const body = JSON.parse(await readRequestBody(request));
    const availability = normalizeAvailability(body);
    await writeJsonFile(dataPath, availability);
    sendJson(response, 200, availability);
    return true;
  }

  if (request.method === "POST" && pathname === "/api/admin/blackout-range") {
    if (!isAdmin(request)) {
      sendJson(response, 401, { error: "Login required" });
      return true;
    }
    const body = JSON.parse(await readRequestBody(request));
    const rangeDates = normalizeDateRange(body.startDate, body.endDate || body.startDate);
    const availability = normalizeAvailability(await readJsonFile(dataPath, {}));
    availability.blackoutDates = normalizeDateList([...availability.blackoutDates, ...rangeDates]);
    availability.extraAvailableDates = availability.extraAvailableDates.filter((date) => !availability.blackoutDates.includes(date));
    await writeJsonFile(dataPath, availability);
    sendJson(response, 200, availability);
    return true;
  }

  return false;
}

async function serveStatic(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(root, safePath));
  if (!filePath.startsWith(root)) {
    send(response, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  } catch (error) {
    send(response, 404, "Not found");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (await handleApi(request, response, url.pathname)) return;
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: "Server error" });
  }
});

server.listen(port, () => {
  console.log(`Jazz piano site: http://localhost:${port}`);
  console.log(`Admin panel: http://localhost:${port}/admin.html`);
  console.log(`Admin password: ${adminPassword}`);
});
