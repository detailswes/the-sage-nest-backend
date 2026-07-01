const cron = require('node-cron');
const prisma = require('../prisma/client');

// EU statutory minimum for financial / tax records (Accounting Directive, DAC7).
// Data must be kept for this period; it must not be kept beyond it without a fresh basis.
const FINANCIAL_RETENTION_YEARS = 7;

function retentionCutoff() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - FINANCIAL_RETENTION_YEARS);
  return d;
}

// ── Bookings ──────────────────────────────────────────────────────────────────
// Null out Stripe identifiers, monetary amounts, and free-text notes on bookings
// whose "last transaction date" (the latest of completed_at / refunded_at /
// cancelled_at, falling back to created_at) is beyond the statutory window.
// Records already anonymised (stripe_payment_intent_id IS NULL) are skipped.
async function purgeBookingFinancials(cutoff) {
  const result = await prisma.booking.updateMany({
    where: {
      stripe_payment_intent_id: { not: null },
      OR: [
        { completed_at: { not: null, lt: cutoff } },
        { refunded_at:  { not: null, lt: cutoff } },
        { cancelled_at: { not: null, lt: cutoff } },
        {
          completed_at: null,
          refunded_at:  null,
          cancelled_at: null,
          created_at:   { lt: cutoff },
        },
      ],
    },
    data: {
      stripe_charge_id:         null,
      stripe_payment_intent_id: null,
      stripe_transfer_id:       null,
      stripe_payout_id:         null,
      stripe_refund_id:         null,
      amount:                   null,
      platform_fee:             null,
      refund_amount:            null,
      cancellation_reason:      null,
      dispute_reason:           null,
      internal_admin_note:      null,
      expert_note:              null,
    },
  });

  return result.count;
}

// ── BusinessInfo ──────────────────────────────────────────────────────────────
// Anonymise DAC7-sensitive fields (IBAN, TIN, date of birth, VAT, company reg)
// once the expert's most recent booking is beyond the statutory window.
// Non-nullable string columns (iban, tin) receive the '[REDACTED]' sentinel
// rather than null so the schema constraint is preserved.
async function purgeBusinessInfo(cutoff) {
  const unpurged = await prisma.businessInfo.findMany({
    where: { tin: { not: '[REDACTED]' } },
    select: { expert_id: true },
  });

  let count = 0;
  for (const { expert_id } of unpurged) {
    const latestBooking = await prisma.booking.findFirst({
      where: { expert_id },
      orderBy: { created_at: 'desc' },
      select: {
        created_at:   true,
        completed_at: true,
        refunded_at:  true,
        cancelled_at: true,
      },
    });

    if (latestBooking) {
      const lastDate = new Date(Math.max(
        latestBooking.completed_at?.getTime() ?? 0,
        latestBooking.refunded_at?.getTime()  ?? 0,
        latestBooking.cancelled_at?.getTime() ?? 0,
        latestBooking.created_at.getTime(),
      ));
      if (lastDate >= cutoff) continue;
    }

    await prisma.businessInfo.update({
      where: { expert_id },
      data: {
        iban:               '[REDACTED]',
        tin:                '[REDACTED]',
        date_of_birth:      null,
        vat_number:         null,
        company_reg_number: null,
      },
    });
    count++;
  }

  return count;
}

async function runFinancialPurge() {
  const cutoff = retentionCutoff();
  console.log(`[Retention] Running financial purge — cutoff ${cutoff.toISOString()}`);

  const bookings      = await purgeBookingFinancials(cutoff);
  const businessInfos = await purgeBusinessInfo(cutoff);

  if (bookings > 0) {
    console.log(`[Retention] Anonymised financial fields on ${bookings} booking(s) past 7-year statutory period`);
  }
  if (businessInfos > 0) {
    console.log(`[Retention] Anonymised DAC7 fields on ${businessInfos} BusinessInfo record(s) past 7-year statutory period`);
  }
  if (bookings === 0 && businessInfos === 0) {
    console.log('[Retention] Financial purge: no records due for anonymisation');
  }
}

// Runs on the 1st of every month at 04:30 — low-traffic hour; monthly cadence
// is sufficient for a 7-year window.
function startFinancialPurgeJob() {
  cron.schedule('30 4 1 * *', async () => {
    try {
      await runFinancialPurge();
    } catch (err) {
      console.error('[Retention] Unexpected error in financial purge job:', err);
    }
  });

  console.log('[Retention] Financial data purge job scheduled (1st of month, 04:30)');
}

module.exports = { startFinancialPurgeJob, runFinancialPurge };
