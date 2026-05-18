const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { addAvailability, listAvailability, removeAvailability, getAvailableSlots, getAvailabilityConflicts, getAvailableDatesInMonth } = require('../controllers/availability.controller');

// ── Public routes — must be declared BEFORE router.use(authenticate) ──────────
// GET /availability/slots?expertId=X&date=YYYY-MM-DD&serviceId=Y
router.get('/slots', getAvailableSlots);
// GET /availability/available-dates?expertId=X&year=YYYY&month=M&serviceId=Y
router.get('/available-dates', getAvailableDatesInMonth);

// All routes below require authentication
router.use(authenticate);

// GET /availability — view my availability
router.get('/', listAvailability);

// POST /availability — add an availability slot
router.post('/', addAvailability);

// GET /availability/:id/conflicts — bookings affected by removing a slot
router.get('/:id/conflicts', getAvailabilityConflicts);

// DELETE /availability/:id — remove a slot
router.delete('/:id', removeAvailability);

module.exports = router;
