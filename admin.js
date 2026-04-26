const weekdays = [
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6]
];

const loginPanel = document.querySelector("#loginPanel");
const editorPanel = document.querySelector("#editorPanel");
const loginForm = document.querySelector("#loginForm");
const loginStatus = document.querySelector("#loginStatus");
const saveStatus = document.querySelector("#saveStatus");
const weekdayChecks = document.querySelector("#weekdayChecks");
const availabilityForm = document.querySelector("#availabilityForm");
const logoutButton = document.querySelector("#logoutButton");
const requestsPanel = document.querySelector("#requestsPanel");
const requestList = document.querySelector("#requestList");
const requestStatus = document.querySelector("#requestStatus");
const refreshRequests = document.querySelector("#refreshRequests");

let extraAvailableDates = [];
let blackoutDates = [];

function showEditor() {
  loginPanel.classList.add("hidden");
  editorPanel.classList.remove("hidden");
  requestsPanel.classList.remove("hidden");
}

function showLogin() {
  editorPanel.classList.add("hidden");
  requestsPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
}

function formatDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "var(--wine)" : "var(--green)";
}

function renderWeekdayChecks(selectedDays = []) {
  weekdayChecks.innerHTML = "";
  weekdays.forEach(([label, value]) => {
    const option = document.createElement("label");
    option.innerHTML = `<input type="checkbox" value="${value}"><span>${label}</span>`;
    option.querySelector("input").checked = selectedDays.includes(value);
    weekdayChecks.append(option);
  });
}

function renderDateList(containerId, dates, removeDate) {
  const container = document.querySelector(containerId);
  container.innerHTML = "";
  dates.forEach((date) => {
    const pill = document.createElement("span");
    pill.className = "date-pill";
    pill.innerHTML = `<span>${formatDate(date)}</span>`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "×";
    button.setAttribute("aria-label", `Remove ${formatDate(date)}`);
    button.addEventListener("click", () => removeDate(date));
    pill.append(button);
    container.append(pill);
  });
}

function renderDateLists() {
  renderDateList("#extraDateList", extraAvailableDates, (date) => {
    extraAvailableDates = extraAvailableDates.filter((value) => value !== date);
    renderDateLists();
  });
  renderDateList("#blackoutDateList", blackoutDates, (date) => {
    blackoutDates = blackoutDates.filter((value) => value !== date);
    renderDateLists();
  });
}

function addDate(inputId, target) {
  const input = document.querySelector(inputId);
  const date = input.value;
  if (!date) return;
  target(date);
  input.value = "";
  renderDateLists();
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function formatRequestTime(timeSlot) {
  const [hour, minute] = timeSlot.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(2026, 0, 1, hour, minute));
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function expandDateRange(startDate, endDate = startDate) {
  if (!startDate) return [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${(endDate || startDate)}T00:00:00`);
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

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

async function loadAvailability() {
  try {
    const availability = await requestJson("/api/admin/availability");
    document.querySelector("#artistName").value = availability.artistName;
    document.querySelector("#bookingEmail").value = availability.bookingEmail;
    document.querySelector("#eventDurationHours").value = String(availability.eventDurationHours);
    extraAvailableDates = availability.extraAvailableDates || [];
    blackoutDates = availability.blackoutDates || [];
    renderWeekdayChecks(availability.availableWeekdays || []);
    renderDateLists();
    showEditor();
    await loadBookingRequests();
  } catch (error) {
    renderWeekdayChecks();
    showLogin();
  }
}

async function loadBookingRequests() {
  const requests = await requestJson("/api/admin/booking-requests");
  requestList.innerHTML = "";
  if (requests.length === 0) {
    requestList.innerHTML = '<p class="empty-state">No pending booking requests.</p>';
    return;
  }

  requests.forEach((request) => {
    const card = document.createElement("article");
    card.className = "request-card";
    card.innerHTML = `
      <div>
        <strong>${formatDate(request.date)} at ${formatRequestTime(request.timeSlot)}</strong>
        <span>${request.durationHours} hours · ${request.eventType}</span>
        <span>${request.venue || "Venue TBD"}</span>
        <a href="mailto:${request.clientEmail}">${request.clientEmail}</a>
      </div>
    `;
    const acceptButton = document.createElement("button");
    acceptButton.className = "button primary";
    acceptButton.type = "button";
    acceptButton.textContent = "Accept";
    acceptButton.addEventListener("click", async () => {
      try {
        const result = await requestJson(`/api/admin/booking-requests/${request.id}/accept`, { method: "POST" });
        setStatus(requestStatus, "Request accepted. Date is now removed from public booking.");
        downloadTextFile(`wyeth-fertig-${request.date}.ics`, result.calendarHold, "text/calendar;charset=utf-8");
        await loadBookingRequests();
      } catch (error) {
        setStatus(requestStatus, error.message, true);
      }
    });
    card.append(acceptButton);
    requestList.append(card);
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await requestJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: document.querySelector("#password").value })
    });
    setStatus(loginStatus, "");
    await loadAvailability();
  } catch (error) {
    setStatus(loginStatus, error.message, true);
  }
});

availabilityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const availableWeekdays = [...weekdayChecks.querySelectorAll("input:checked")].map((input) => Number(input.value));
  const availability = {
    artistName: document.querySelector("#artistName").value,
    bookingEmail: document.querySelector("#bookingEmail").value,
    eventDurationHours: Number(document.querySelector("#eventDurationHours").value),
    availableWeekdays,
    extraAvailableDates,
    blackoutDates
  };

  try {
    await requestJson("/api/admin/availability", {
      method: "PUT",
      body: JSON.stringify(availability)
    });
    setStatus(saveStatus, "Calendar saved. The public site will use these dates now.");
  } catch (error) {
    setStatus(saveStatus, error.message, true);
  }
});

document.querySelector("#addExtraDate").addEventListener("click", () => {
  addDate("#extraDateInput", (date) => {
    extraAvailableDates = uniqueSorted([...extraAvailableDates, date]);
    blackoutDates = blackoutDates.filter((value) => value !== date);
  });
});

document.querySelector("#addBlackoutDate").addEventListener("click", () => {
  const startInput = document.querySelector("#blackoutStartInput");
  const endInput = document.querySelector("#blackoutEndInput");
  const rangeDates = expandDateRange(startInput.value, endInput.value || startInput.value);
  blackoutDates = uniqueSorted([...blackoutDates, ...rangeDates]);
  extraAvailableDates = extraAvailableDates.filter((value) => !blackoutDates.includes(value));
  startInput.value = "";
  endInput.value = "";
  renderDateLists();
});

logoutButton.addEventListener("click", async () => {
  await requestJson("/api/admin/logout", { method: "POST" });
  showLogin();
});

refreshRequests.addEventListener("click", async () => {
  try {
    await loadBookingRequests();
    setStatus(requestStatus, "Booking requests refreshed.");
  } catch (error) {
    setStatus(requestStatus, error.message, true);
  }
});

loadAvailability();
