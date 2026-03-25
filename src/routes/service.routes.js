const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { createService, listServices, updateService, deleteService } = require('../controllers/service.controller');

// All routes require authentication
router.use(authenticate);

// GET /services — list my services
router.get('/', listServices);

// POST /services — create a service
router.post('/', createService);

// PUT /services/:id — edit a service
router.put('/:id', updateService);

// DELETE /services/:id — delete a service
router.delete('/:id', deleteService);

module.exports = router;
