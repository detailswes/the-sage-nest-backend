const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { addAvailability, listAvailability, removeAvailability, getAvailableSlots } = require('../controllers/availability.controller');

// ── Public route — must be declared BEFORE router.use(authenticate) ───────────
// GET /availability/slots?expertId=X&date=YYYY-MM-DD&serviceId=Y
router.get('/slots', getAvailableSlots);

// All routes below require authentication
router.use(authenticate);

// GET /availability — view my availability
router.get('/', listAvailability);

// POST /availability — add an availability slot
router.post('/', addAvailability);

// DELETE /availability/:id — remove a slot
router.delete('/:id', removeAvailability);

module.exports = router;
