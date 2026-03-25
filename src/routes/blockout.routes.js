const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { createBlockout, listBlockouts, deleteBlockout } = require('../controllers/blockout.controller');

// All routes require authentication
router.use(authenticate);

// GET /blockouts?from=YYYY-MM-DD&to=YYYY-MM-DD — list block-outs in range
router.get('/', listBlockouts);

// POST /blockouts — create a block-out (full day or time slot)
router.post('/', createBlockout);

// DELETE /blockouts/:id — restore (remove the block-out; recurring schedule is untouched)
router.delete('/:id', deleteBlockout);

module.exports = router;
