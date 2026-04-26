# Wyeth Fertig Jazz Piano Site

This is a one-page booking website with a small built-in admin panel for calendar availability.

## Run It

```bash
npm start
```

Public site:

```text
http://localhost:3000
```

Admin panel:

```text
http://localhost:3000/admin.html
```

Default demo password:

```text
jazz-admin
```

For a real deployment, set a private password before starting the server:

```bash
ADMIN_PASSWORD="use-a-real-password" npm start
```

## Updating Availability

In the admin panel, he can:

- choose regular weekly bookable days
- add special one-off available dates
- add blackout dates that override normal availability
- update booking email and event duration
- accept booking requests, which removes that date from public availability

The saved settings live in:

```text
data/availability.json
```

The public calendar reads those settings from:

```text
/api/availability
```

Pending booking requests live in:

```text
data/booking-requests.json
```

Accepted bookings live in:

```text
data/bookings.json
```

If `index.html` is opened directly as a local file, the calendar falls back to the built-in demo availability in `script.js`. To use the admin-controlled availability, run the Node server.

## Contact Form

Contact submissions are saved in:

```text
data/inquiries.json
```

By default, the form saves the inquiry and opens an email addressed to `wyethfertig@gmail.com`. For fully automatic server-side sending on a hosted deployment, use Resend:

```bash
RESEND_API_KEY="re_..." CONTACT_FROM_EMAIL="Wyeth Fertig Website <booking@your-domain.com>" npm start
```

Or connect another form/email service webhook:

```bash
CONTACT_WEBHOOK_URL="https://your-form-service-webhook" npm start
```

Instagram is linked at `@wyeth_f_`. Showing the latest posts automatically requires Meta/Instagram API access and an access token; curated posts can be embedded by adding specific Instagram post URLs to the page.
