/**
 * One-off cutover from Stripe's automatic payouts (daily, 7-day delay — which
 * counted from the payment date, so bookings made well ahead of their session
 * were paid out to the expert's bank early) back to manual payouts released by
 * jobs/processPayouts.js after the session.
 *
 * For every booking still transfer_status='pending' it checks in Stripe whether
 * the expert's share has ALREADY left in an automatic payout:
 *   • already paid out → marked 'completed' (accurate: the refund/cancel code
 *     then treats the money as gone to the bank) with the payout id recorded, so
 *     the new job never pays it a second time
 *   • still in the expert's balance → stays 'pending' and its transfer_due_at is
 *     reset to session end + PAYOUT_HOLD (it was session end + 9 days), so the
 *     new job pays it out after the session once the funds are available
 *
 * Run BEFORE any pending booking's old transfer_due_at passes, and after every
 * expert account has been switched to manual payouts in Stripe. Report-only
 * unless --confirm is passed.
 *
 * Run from the backend directory:
 *   node src/scripts/reconcileEarlyPayouts.js            # report only
 *   node src/scripts/reconcileEarlyPayouts.js --confirm  # apply
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
const { PAYOUT_HOLD_MS } = require('../constants/payouts');

const CONFIRM = process.argv.includes('--confirm');

// Map<destination-payment id, payout id> of everything an account has paid out.
const paidOutCache = new Map();
async function paidOutSources(accountId) {
  if (paidOutCache.has(accountId)) return paidOutCache.get(accountId);
  const sources = new Map();
  const payouts = await stripe.payouts.list({ limit: 100 }, { stripeAccount: accountId }).autoPagingToArray({ limit: 5000 });
  for (const po of payouts) {
    if (po.status === 'failed' || po.status === 'canceled') continue;
    const txns = await stripe.balanceTransactions
      .list({ payout: po.id, limit: 100 }, { stripeAccount: accountId })
      .autoPagingToArray({ limit: 10000 });
    for (const t of txns) if (t.source) sources.set(t.source, po.id);
  }
  paidOutCache.set(accountId, sources);
  return sources;
}

async function main() {
  console.log(CONFIRM ? 'Applying changes.\n' : 'Report-only mode — pass --confirm to apply.\n');

  const bookings = await prisma.booking.findMany({
    where: { transfer_status: 'pending', status: { in: ['CONFIRMED', 'COMPLETED'] } },
    include: { expert: { select: { stripe_account_id: true } } },
    orderBy: { scheduled_at: 'asc' },
  });
  console.log(`${bookings.length} booking(s) with transfer_status=pending\n`);

  let alreadyPaid = 0;
  let stillHeld = 0;

  for (const b of bookings) {
    const accountId = b.expert?.stripe_account_id;
    const label = `Booking ${b.id} (session ${b.scheduled_at.toISOString()})`;
    if (!accountId || !b.stripe_charge_id) {
      console.log(`${label}: SKIPPED — no Stripe account or charge id, check manually`);
      continue;
    }

    let payoutId = null;
    try {
      const charge = await stripe.charges.retrieve(b.stripe_charge_id, { expand: ['transfer'] });
      const py = charge.transfer?.destination_payment;
      if (py) payoutId = (await paidOutSources(accountId)).get(py) || null;
      else console.log(`${label}: no transfer found on charge — treating as still held`);
    } catch (err) {
      console.log(`${label}: SKIPPED — Stripe lookup failed (${err.message})`);
      continue;
    }

    const newDue = new Date(b.scheduled_at.getTime() + b.duration_minutes * 60 * 1000 + PAYOUT_HOLD_MS);

    if (payoutId) {
      alreadyPaid++;
      console.log(`${label}: ALREADY PAID OUT to bank in ${payoutId} → mark completed`);
      if (CONFIRM) {
        await prisma.booking.update({
          where: { id: b.id },
          data: {
            transfer_status:     'completed',
            stripe_payout_id:    payoutId,
            internal_admin_note: [b.internal_admin_note, `Paid out early by Stripe automatic payout ${payoutId} (before session end) — switched to manual payouts.`].filter(Boolean).join('\n'),
          },
        });
      }
    } else {
      stillHeld++;
      console.log(`${label}: still held in expert balance → payout due ${newDue.toISOString()}`);
      if (CONFIRM) {
        await prisma.booking.update({ where: { id: b.id }, data: { transfer_due_at: newDue } });
      }
    }
  }

  console.log(`\nAlready paid out: ${alreadyPaid}, still held: ${stillHeld}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
