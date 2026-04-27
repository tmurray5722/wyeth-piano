const fallbackBookingConfig = {
  artistName: "Wyeth Fertig",
  bookingEmail: "wyethfertig@gmail.com",
  eventDurationHours: 2,
  availableWeekdays: [0, 5, 6],
  extraAvailableDates: [],
  blackoutDates: [],
  bookedDates: []
};

let bookingConfig = { ...fallbackBookingConfig };

const monthLabel = document.querySelector("#monthLabel");
const calendarGrid = document.querySelector("#calendarGrid");
const prevMonth = document.querySelector("#prevMonth");
const nextMonth = document.querySelector("#nextMonth");
const selectedDateInput = document.querySelector("#selectedDate");
const dateOutput = document.querySelector("#dateOutput");
const bookingForm = document.querySelector("#bookingForm");
const formStatus = document.querySelector("#formStatus");
const contactForm = document.querySelector("#contactForm");
const contactStatus = document.querySelector("#contactStatus");

const today = new Date();
let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = "";

async function loadAvailability() {
  if (window.location.protocol === "file:") {
    return;
  }

  try {
    const response = await fetch("/api/availability");
    if (!response.ok) {
      throw new Error("Availability request failed");
    }
    bookingConfig = { ...fallbackBookingConfig, ...(await response.json()) };
  } catch (error) {
    formStatus.textContent = "Using the built-in calendar until live availability is reachable.";
  }
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isAvailable(date) {
  const key = toDateKey(date);
  const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const regularDay = bookingConfig.availableWeekdays.includes(date.getDay());
  const extraDay = bookingConfig.extraAvailableDates.includes(key);
  const blocked = bookingConfig.blackoutDates.includes(key);
  const booked = (bookingConfig.bookedDates || []).includes(key);
  return !isPast && !blocked && !booked && (regularDay || extraDay);
}

function formatDisplayDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  monthLabel.textContent = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(visibleMonth);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i += 1) {
    const blank = document.createElement("span");
    blank.className = "day-button blank";
    calendarGrid.append(blank);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const key = toDateKey(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-button";
    button.textContent = day;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", `${formatDisplayDate(key)} unavailable`);

    if (isAvailable(date)) {
      button.disabled = false;
      button.classList.add("available");
      button.setAttribute("aria-label", `${formatDisplayDate(key)} available`);
      button.addEventListener("click", () => chooseDate(key));
    } else {
      button.disabled = true;
    }

    if (selectedDate === key) {
      button.classList.add("selected");
    }

    calendarGrid.append(button);
  }
}

function chooseDate(dateKey) {
  selectedDate = dateKey;
  selectedDateInput.value = dateKey;
  dateOutput.value = formatDisplayDate(dateKey);
  formStatus.textContent = "";
  renderCalendar();
}

function getBookingDetails() {
  const timeSlot = document.querySelector("#timeSlot").value;
  const durationHours = Number(document.querySelector("#durationHours").value);
  const eventType = document.querySelector("#eventType").value;
  const clientEmail = document.querySelector("#clientEmail").value.trim();
  const venue = document.querySelector("#venue").value.trim();
  const [year, month, day] = selectedDate.split("-").map(Number);
  const [hour, minute] = timeSlot.split(":").map(Number);
  const start = new Date(year, month - 1, day, hour, minute);
  const end = new Date(start);
  end.setMinutes(start.getMinutes() + durationHours * 60);
  return { timeSlot, durationHours, eventType, clientEmail, venue, start, end };
}

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedDate) {
    formStatus.textContent = "Choose an available date first.";
    return;
  }

  const details = getBookingDetails();
  formStatus.textContent = "Sending request...";

  if (window.location.protocol !== "file:") {
    const response = await fetch("/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedDate,
        timeSlot: details.timeSlot,
        durationHours: details.durationHours,
        eventType: details.eventType,
        clientEmail: details.clientEmail,
        venue: details.venue
      })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      formStatus.textContent = body.error || "That request could not be sent.";
      await loadAvailability();
      renderCalendar();
      return;
    }
  }

  const subject = encodeURIComponent(`Gig request for ${formatDisplayDate(selectedDate)}`);
  const body = encodeURIComponent(
    `Hi ${bookingConfig.artistName},\n\nI'd like to request a jazz piano booking.\n\nDate: ${formatDisplayDate(selectedDate)}\nTime: ${details.timeSlot}\nLength: ${details.durationHours} hours\nPerformance format: ${details.eventType}\nAddress: ${details.venue}\nMy email: ${details.clientEmail}\n\nPlease let me know if this date can be confirmed.\n`
  );

  formStatus.textContent = "Request sent. Opening an email copy with the selected details.";
  window.location.href = `mailto:${bookingConfig.bookingEmail}?subject=${subject}&body=${body}`;
});

if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      name: document.querySelector("#contactName").value.trim(),
      email: document.querySelector("#contactEmail").value.trim(),
      message: document.querySelector("#contactMessage").value.trim()
    };

    contactStatus.textContent = "Sending inquiry...";

    if (window.location.protocol !== "file:") {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        contactStatus.textContent = body.error || "The inquiry could not be sent.";
        return;
      }
    }

    const subject = encodeURIComponent(`Website inquiry from ${payload.name}`);
    const body = encodeURIComponent(`Name: ${payload.name}\nEmail: ${payload.email}\n\n${payload.message}`);
    contactStatus.textContent = "Inquiry saved. Opening email addressed to Wyeth.";
    window.location.href = `mailto:${bookingConfig.bookingEmail}?subject=${subject}&body=${body}`;
    contactForm.reset();
  });
}

prevMonth.addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  renderCalendar();
});

nextMonth.addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  renderCalendar();
});

loadAvailability().then(renderCalendar);
