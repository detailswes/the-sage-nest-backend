# Data Retention Schedule

Statutory basis: GDPR Art. 5(1)(e) (storage limitation), Art. 17(3)(b) (legal obligation exemption), EU Accounting Directive (Art. 30 — 7 years), DAC7 (Council Directive 2021/514/EU).

| Data category | Retention period | Expiry action | Implemented in |
|---|---|---|---|
| Refresh tokens | Until `expires_at` | Hard delete | `cleanupExpiredTokens.js` (daily 03:00) |
| Stripe dedup events (`StripeEvent`) | 30 days from `processed_at` | Hard delete | `cleanupExpiredTokens.js` (daily 03:00) |
| In-app notifications | 90 days from `created_at` | Hard delete | `cleanupExpiredTokens.js` (daily 03:00) |
| Slot locks | 60 min past `expires_at` | Hard delete | `cleanupExpiredTokens.js` (daily 03:00) |
| Pending bookings (unpaid) | Until `payment_expires_at` | Status → CANCELLED | `cleanupPendingBookings.js` (every 5 min) |
| Booking: Stripe IDs, amounts, platform fee, refund amount, notes | 7 years from last transaction date¹ | Field anonymisation (set to NULL) | `purgeFinancialRecords.js` (1st of month, 04:30) |
| BusinessInfo: IBAN, TIN, date of birth, VAT number, company reg number | 7 years from expert's last booking date¹ | Field anonymisation (set to `[REDACTED]` / NULL) | `purgeFinancialRecords.js` (1st of month, 04:30) |
| Booking skeleton (IDs, status, scheduled date, duration, format) | Indefinite — non-personal aggregate after anonymisation | — | — |
| User account data | Until deletion requested by user | `account_deleted = true` (soft delete) | User request flow |
| Expert profile data | Until deletion requested or account purged | Cascade delete on User | — |
| Legal document acceptances (T&C, Privacy Policy) | 6 years from acceptance (limitation period) | Review annually | Manual admin process |

¹ "Last transaction date" is the latest of `completed_at`, `refunded_at`, `cancelled_at`, falling back to `created_at`.

## What is anonymised vs deleted

**Booking records** after 7 years: the record row is kept for aggregate analytics (booking counts, completion rates) but all payment-identifying and free-text fields are set to NULL: `stripe_charge_id`, `stripe_payment_intent_id`, `stripe_transfer_id`, `stripe_payout_id`, `stripe_refund_id`, `amount`, `platform_fee`, `refund_amount`, `cancellation_reason`, `dispute_reason`, `internal_admin_note`, `expert_note`.

**BusinessInfo records** after 7 years: DAC7-reportable personal identifiers are anonymised in-place because `iban` and `tin` are non-nullable: they receive the sentinel value `[REDACTED]`. `date_of_birth`, `vat_number`, and `company_reg_number` are set to NULL. The rest of the business address is retained as it is not personal financial data.

## Reviewing this schedule

This schedule should be reviewed whenever:
- A new model with personal or financial data is added to the schema.
- A new regulatory requirement applies to the platform's operating jurisdictions.
- At minimum, once per year as part of the annual privacy review.
