const express = require('express');
const router = express.Router();
const { authenticate, requireEmailVerified } = require('../middleware/auth.middleware');
const {
  createBooking,
  getBookingById,
  getMyBookings,
  cancelBooking,
  rescheduleBooking,
  expertCancelBooking,
  getUpcomingAppointments,
  getPastAppointments,
  getCalendarBookings,
  markSessionLinkSent,
  markBookingComplete,
  saveExpertNote,
  verifyPayment,
  getCurrentTcVersion,
} = require('../controllers/booking.controller');

router.use(authenticate);

// ── Parent routes ─────────────────────────────────────────────────────────────
router.get('/tc-version',      getCurrentTcVersion);     // GET    /bookings/tc-version
router.post('/',               requireEmailVerified, createBooking); // POST   /bookings
router.get('/my',              getMyBookings);           // GET    /bookings/my
router.delete('/:id',          cancelBooking);           // DELETE /bookings/:id
router.patch('/:id/reschedule', rescheduleBooking);       // PATCH  /bookings/:id/reschedule

// ── Expert routes ─────────────────────────────────────────────────────────────
router.get('/upcoming',              getUpcomingAppointments); // GET    /bookings/upcoming
router.get('/past',                  getPastAppointments);     // GET    /bookings/past
router.get('/calendar',              getCalendarBookings);     // GET    /bookings/calendar
router.patch('/:id/link-sent',       markSessionLinkSent);     // PATCH  /bookings/:id/link-sent
router.patch('/:id/complete',        markBookingComplete);     // PATCH  /bookings/:id/complete
router.patch('/:id/expert-note',     saveExpertNote);          // PATCH  /bookings/:id/expert-note
router.post('/:id/expert-cancel',    expertCancelBooking);     // POST   /bookings/:id/expert-cancel

// ── Shared ────────────────────────────────────────────────────────────────────
router.get('/:id',             getBookingById);          // GET    /bookings/:id
router.post('/:id/verify-payment', verifyPayment);       // POST   /bookings/:id/verify-payment

module.exports = router;
