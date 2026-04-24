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
  getMyProfileDraft,
} = require('../controllers/expert.controller');

// ── Own profile ───────────────────────────────────────────────────────────────
router.get('/me', authenticate, getMyProfile);
router.get('/me/draft', authenticate, getMyProfileDraft);
router.put('/me', authenticate, updateMyProfile);
router.post('/me/profile-image', authenticate, (req, res, next) => {
  upload.single('profile_image')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 5 MB.' });
    }
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }
    next();
  });
}, uploadProfileImage);

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
