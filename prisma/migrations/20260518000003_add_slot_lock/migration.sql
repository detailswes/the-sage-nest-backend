-- Pre-booking slot reservation table.
-- Enforces DB-level uniqueness on (expert_id, slot_start) so concurrent
-- lock attempts for the same slot result in a P2002 unique violation,
-- preventing double-booking before payment is captured.
CREATE TABLE "SlotLock" (
  "id"         SERIAL PRIMARY KEY,
  "expert_id"  INTEGER  NOT NULL,
  "slot_start" TIMESTAMP(3) NOT NULL,
  "parent_id"  INTEGER  NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SlotLock_expert_id_fkey"
    FOREIGN KEY ("expert_id") REFERENCES "Expert"("id") ON DELETE CASCADE,
  CONSTRAINT "SlotLock_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "SlotLock_expert_id_slot_start_key"
  ON "SlotLock"("expert_id", "slot_start");
