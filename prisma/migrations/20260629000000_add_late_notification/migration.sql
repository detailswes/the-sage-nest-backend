-- CreateTable
CREATE TABLE "LateNotification" (
    "id"            SERIAL NOT NULL,
    "booking_id"    INTEGER NOT NULL,
    "parent_id"     INTEGER NOT NULL,
    "delay_minutes" INTEGER NOT NULL,
    "note"          TEXT,
    "fired_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_status"  TEXT NOT NULL,
    "sms_status"    TEXT NOT NULL,
    "email_error"   TEXT,
    "sms_error"     TEXT,

    CONSTRAINT "LateNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LateNotification_booking_id_idx" ON "LateNotification"("booking_id");

-- AddForeignKey
ALTER TABLE "LateNotification" ADD CONSTRAINT "LateNotification_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateNotification" ADD CONSTRAINT "LateNotification_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
