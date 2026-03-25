const express = require('express');
const router = express.Router();
const { authenticate, requireEmailVerified } = require('../middleware/auth.middleware');
const {
  createBooking,
  getBookingById,
  getMyBookings,
  cancelBooking,
  getUpcomingAppointments,
  getCalendarBookings,
  markSessionLinkSent,
} = require('../controllers/booking.controller');

router.use(authenticate);

// ── Parent routes ─────────────────────────────────────────────────────────────
router.post('/',               requireEmailVerified, createBooking); // POST   /bookings
router.get('/my',              getMyBookings);           // GET    /bookings/my
router.delete('/:id',          cancelBooking);           // DELETE /bookings/:id

// ── Expert routes ─────────────────────────────────────────────────────────────
router.get('/upcoming',        getUpcomingAppointments); // GET    /bookings/upcoming
router.get('/calendar',        getCalendarBookings);     // GET    /bookings/calendar
router.patch('/:id/link-sent', markSessionLinkSent);     // PATCH  /bookings/:id/link-sent

// ── Shared ────────────────────────────────────────────────────────────────────
router.get('/:id',             getBookingById);          // GET    /bookings/:id

module.exports = router;
