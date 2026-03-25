const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');
const documentUpload = require('../middleware/documentUpload.middleware');
const {
  listExperts,
  getMyProfile, updateMyProfile, getExpertById, uploadProfileImage,
  addQualification, updateQualification, deleteQualification,
  addCertification, updateCertification, deleteCertification,
  saveInsurance, deleteInsurance,
  saveBusinessInfo,
} = require('../controllers/expert.controller');

// ── Own profile ───────────────────────────────────────────────────────────────
router.get('/me', authenticate, getMyProfile);
router.put('/me', authenticate, updateMyProfile);
router.post('/me/profile-image', authenticate, upload.single('profile_image'), uploadProfileImage);

// ── Qualifications ────────────────────────────────────────────────────────────
router.post('/me/qualifications', authenticate, documentUpload.single('document'), addQualification);
router.put('/me/qualifications/:id', authenticate, documentUpload.single('document'), updateQualification);
router.delete('/me/qualifications/:id', authenticate, deleteQualification);

// ── Certifications ────────────────────────────────────────────────────────────
router.post('/me/certifications', authenticate, documentUpload.single('document'), addCertification);
router.put('/me/certifications/:id', authenticate, documentUpload.single('document'), updateCertification);
router.delete('/me/certifications/:id', authenticate, deleteCertification);

// ── Insurance ─────────────────────────────────────────────────────────────────
router.put('/me/insurance', authenticate, documentUpload.single('document'), saveInsurance);
router.delete('/me/insurance', authenticate, deleteInsurance);

// ── Business Information ───────────────────────────────────────────────────────
router.put('/me/business-info', authenticate, saveBusinessInfo);

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/',    listExperts);   // GET /experts        — list all approved experts
router.get('/:id', getExpertById); // GET /experts/:id    — single expert detail

module.exports = router;
