const { createCalendarHold, readStore, requireAdmin, sendJson, writeStore } = require("../_lib");

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const requestId = new URL(request.url, "https://wyeth-piano.vercel.app").searchParams.get("id");
    const bookingRequests = await readStore("bookingRequests");
    const requestIndex = bookingRequests.findIndex((item) => item.id === requestId);

    if (requestIndex === -1) {
      sendJson(response, 404, { error: "Booking request not found" });
      return;
    }

    const booking = { ...bookingRequests[requestIndex], status: "accepted", acceptedAt: new Date().toISOString() };
    const bookings = await readStore("bookings");

    if (bookings.some((existing) => existing.date === booking.date)) {
      sendJson(response, 409, { error: "That date is already accepted." });
      return;
    }

    bookings.push(booking);
    bookingRequests.splice(requestIndex, 1);
    await writeStore("bookings", bookings);
    await writeStore("bookingRequests", bookingRequests);
    sendJson(response, 200, { booking, calendarHold: createCalendarHold(booking) });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Could not accept request." });
  }
};
