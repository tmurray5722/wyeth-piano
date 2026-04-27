const { normalizeBooking, readBody, readStore, sendJson, writeStore } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const bookingRequest = normalizeBooking(await readBody(request));
    bookingRequest.status = "pending";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingRequest.date) || !/^\d{2}:\d{2}$/.test(bookingRequest.timeSlot)) {
      sendJson(response, 400, { error: "Choose a valid date and time." });
      return;
    }

    const bookings = await readStore("bookings");
    if (bookings.some((booking) => booking.date === bookingRequest.date)) {
      sendJson(response, 409, { error: "That date is no longer available. Please choose another date." });
      return;
    }

    const bookingRequests = await readStore("bookingRequests");
    bookingRequests.push(bookingRequest);
    await writeStore("bookingRequests", bookingRequests);
    sendJson(response, 201, bookingRequest);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Booking request failed." });
  }
};
