-- Add event-specific fields to Service
ALTER TABLE "Service"
  ADD COLUMN "event_starts_at" TIMESTAMP(3),
  ADD COLUMN "capacity" INTEGER,
  ADD COLUMN "event_location" TEXT;

-- Relax Booking slot-exclusivity: allow different parents to share a slot
-- (needed for events), while a single parent still can't double-book the
-- same slot.
DROP INDEX "Booking_expert_id_scheduled_at_key";
CREATE UNIQUE INDEX "Booking_expert_id_scheduled_at_parent_id_key" ON "Booking"("expert_id", "scheduled_at", "parent_id");

-- Same relaxation for the checkout-time slot reservation.
DROP INDEX "SlotLock_expert_id_slot_start_key";
CREATE UNIQUE INDEX "SlotLock_expert_id_slot_start_parent_id_key" ON "SlotLock"("expert_id", "slot_start", "parent_id");
