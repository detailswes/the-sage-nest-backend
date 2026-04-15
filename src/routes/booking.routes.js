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
  getCalendarBookings,
  markSessionLinkSent,
  verifyPayment,
} = require('../controllers/booking.controller');

router.use(authenticate);

// ── Parent routes ─────────────────────────────────────────────────────────────
router.post('/',               requireEmailVerified, createBooking); // POST   /bookings
router.get('/my',              getMyBookings);           // GET    /bookings/my
router.delete('/:id',          cancelBooking);           // DELETE /bookings/:id
router.patch('/:id/reschedule', rescheduleBooking);       // PATCH  /bookings/:id/reschedule

// ── Expert routes ─────────────────────────────────────────────────────────────
router.get('/upcoming',              getUpcomingAppointments); // GET    /bookings/upcoming
router.get('/calendar',              getCalendarBookings);     // GET    /bookings/calendar
router.patch('/:id/link-sent',       markSessionLinkSent);     // PATCH  /bookings/:id/link-sent
router.post('/:id/expert-cancel',    expertCancelBooking);     // POST   /bookings/:id/expert-cancel

// ── Shared ────────────────────────────────────────────────────────────────────
router.get('/:id',             getBookingById);          // GET    /bookings/:id
router.post('/:id/verify-payment', verifyPayment);       // POST   /bookings/:id/verify-payment

module.exports = router;
