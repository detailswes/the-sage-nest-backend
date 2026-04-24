const express = require('express');
const router = express.Router();
const { authenticate, authenticateOptional, requireAdmin } = require('../middleware/auth.middleware');
const {
  listExperts,
  approveExpert,
  rejectExpert,
  approveLanguage,
  rejectLanguage,
  toggleApproval,
  sendPasswordReset,
  resendVerification,
  manuallyVerify,
  suspendExpert,
  reactivateExpert,
  requestChanges,
  unpublishExpert,
  republishExpert,
  exportTaxData,
  getExpertYearlySummary,
  getExpertDetail,
  listExpertBookings,
  manualRefund,
  listAllBookings,
  getBookingDetail,
  adminCancelBooking,
  markBookingDisputed,
  updateBookingNote,
  getLegalDocuments,
  bumpLegalDocument,
  getAuditLog,
  gdprDeleteExpert,
  getParentDetail,
  listParents,
  listParentBookings,
  activateParent,
  deactivateParent,
  suspendParent,
  gdprDeleteParent,
  listTransactions,
  exportTransactionsCsv,
  getRefundLog,
  retryTransfer,
  markTransferResolved,
  approveProfileDraft,
  rejectProfileDraft,
  sendParentPasswordReset,
  resendParentVerification,
  manuallyVerifyParent,
} = require('../controllers/admin.controller');

// ── Public routes (no auth required) ─────────────────────────────────────────
router.get('/experts', authenticateOptional, listExperts);

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// ── Status actions ────────────────────────────────────────────────────────────
router.post('/experts/:id/approve',              approveExpert);
router.post('/experts/:id/reject',               rejectExpert);
router.post('/experts/:id/languages/approve',    approveLanguage);
router.post('/experts/:id/languages/reject',     rejectLanguage);
router.patch('/experts/:id/toggle',    toggleApproval);
router.post('/experts/:id/suspend',    suspendExpert);
router.post('/experts/:id/reactivate', reactivateExpert);

// ── Moderation actions ────────────────────────────────────────────────────────
router.post('/experts/:id/request-changes', requestChanges);   // send revision note + set CHANGES_REQUESTED
router.post('/experts/:id/unpublish',        unpublishExpert);  // hide from parent search (APPROVED only)
router.post('/experts/:id/republish',        republishExpert);  // restore to parent search

// ── Profile draft review ──────────────────────────────────────────────────────
router.post('/experts/:id/draft/approve', approveProfileDraft);
router.post('/experts/:id/draft/reject',  rejectProfileDraft);

// ── Support tools ─────────────────────────────────────────────────────────────
router.post('/experts/:id/send-password-reset',  sendPasswordReset);
router.post('/experts/:id/resend-verification',  resendVerification);
router.post('/experts/:id/verify',               manuallyVerify);

// ── Expert detail (single) ────────────────────────────────────────────────────
router.get('/experts/:id', getExpertDetail);

// ── Tax export ────────────────────────────────────────────────────────────────
router.get('/experts/:id/tax-export',       exportTaxData);
router.get('/experts/:id/yearly-summary',   getExpertYearlySummary);

// ── GDPR ──────────────────────────────────────────────────────────────────────
router.post('/experts/:id/gdpr-delete', gdprDeleteExpert);

// ── Bookings ──────────────────────────────────────────────────────────────────
router.get('/bookings',              listExpertBookings);   // ?expertId=X  (existing — expert detail tab)
router.get('/bookings/all',          listAllBookings);      // platform-wide list with search/filter/pagination
router.get('/bookings/:id',          getBookingDetail);
router.post('/bookings/:id/refund',  manualRefund);
router.post('/bookings/:id/cancel',  adminCancelBooking);
router.post('/bookings/:id/dispute',               markBookingDisputed);
router.put('/bookings/:id/note',                   updateBookingNote);
router.post('/bookings/:id/retry-transfer',        retryTransfer);
router.post('/bookings/:id/mark-transfer-resolved', markTransferResolved);

// ── Legal documents ───────────────────────────────────────────────────────────
router.get('/legal-documents',      getLegalDocuments);
router.post('/legal-documents/bump', bumpLegalDocument);

// ── Audit log ─────────────────────────────────────────────────────────────────
router.get('/audit-log', getAuditLog);   // ?entityId=X&entityType=EXPERT&page=1

// ── Parent list ───────────────────────────────────────────────────────────────
router.get('/parents', listParents);

// ── Parent detail (single) ────────────────────────────────────────────────────
router.get('/parents/:id', getParentDetail);

// ── Parent bookings ───────────────────────────────────────────────────────────
router.get('/parents/:id/bookings', listParentBookings);

// ── Parent support tools ──────────────────────────────────────────────────────
router.post('/parents/:id/send-password-reset', sendParentPasswordReset);
router.post('/parents/:id/resend-verification', resendParentVerification);
router.post('/parents/:id/verify',              manuallyVerifyParent);

// ── Parent status actions ─────────────────────────────────────────────────────
router.post('/parents/:id/activate',   activateParent);
router.post('/parents/:id/deactivate', deactivateParent);
router.post('/parents/:id/suspend',    suspendParent);

// ── Parent GDPR ───────────────────────────────────────────────────────────────
router.post('/parents/:id/gdpr-delete', gdprDeleteParent);

// ── Transactions (Payment Overview) ──────────────────────────────────────────
router.get('/transactions',        listTransactions);
router.get('/transactions/export', exportTransactionsCsv);
router.get('/refund-log',          getRefundLog);

module.exports = router;
