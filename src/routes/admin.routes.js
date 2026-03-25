const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const {
  listExperts,
  approveExpert,
  rejectExpert,
  toggleApproval,
  sendPasswordReset,
  resendVerification,
  manuallyVerify,
  suspendExpert,
  reactivateExpert,
  exportTaxData,
  listExpertBookings,
  manualRefund,
  getLegalDocuments,
  bumpLegalDocument,
} = require('../controllers/admin.controller');

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// GET /admin/experts — list all experts
router.get('/experts', listExperts);

// POST /admin/experts/:id/approve — approve an expert
router.post('/experts/:id/approve', approveExpert);

// POST /admin/experts/:id/reject — reject an expert
router.post('/experts/:id/reject', rejectExpert);

// PATCH /admin/experts/:id/toggle — toggle bookable state
router.patch('/experts/:id/toggle', toggleApproval);

// POST /admin/experts/:id/send-password-reset — trigger password reset email
router.post('/experts/:id/send-password-reset', sendPasswordReset);

// POST /admin/experts/:id/resend-verification — resend verification email
router.post('/experts/:id/resend-verification', resendVerification);

// POST /admin/experts/:id/verify — manually verify expert email
router.post('/experts/:id/verify', manuallyVerify);

// POST /admin/experts/:id/suspend — suspend an expert account
router.post('/experts/:id/suspend', suspendExpert);

// POST /admin/experts/:id/reactivate — reactivate a suspended expert
router.post('/experts/:id/reactivate', reactivateExpert);

// GET /admin/experts/:id/tax-export?year=YYYY — download tax data CSV
router.get('/experts/:id/tax-export', exportTaxData);

// GET /admin/bookings?expertId=X — list recent bookings for an expert
router.get('/bookings', listExpertBookings);

// POST /admin/bookings/:id/refund — manual refund override (bypasses 24h rule)
router.post('/bookings/:id/refund', manualRefund);

// GET /admin/legal-documents — current active versions of PP and T&Cs
router.get('/legal-documents', getLegalDocuments);

// POST /admin/legal-documents/bump — publish a new version
router.post('/legal-documents/bump', bumpLegalDocument);

module.exports = router;
