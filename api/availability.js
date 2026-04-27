const { readStore, sendJson } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const availability = await readStore("availability");
  const bookings = await readStore("bookings");
  sendJson(response, 200, {
    ...availability,
    bookedDates: bookings.map((booking) => booking.date).filter(Boolean)
  });
};
