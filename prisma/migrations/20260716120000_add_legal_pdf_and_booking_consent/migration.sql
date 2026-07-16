-- AlterTable
ALTER TABLE "LegalDocument" ADD COLUMN     "file_url" TEXT,
ADD COLUMN     "created_by" INTEGER;

-- CreateTable
CREATE TABLE "BookingConsent" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tc_version" TEXT NOT NULL,
    "tc_accepted_at" TIMESTAMP(3) NOT NULL,
    "withdrawal_applicable" BOOLEAN NOT NULL DEFAULT false,
    "withdrawal_accepted" BOOLEAN NOT NULL DEFAULT false,
    "withdrawal_accepted_at" TIMESTAMP(3),
    "privacy_policy_version_displayed" TEXT,
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingConsent_booking_id_key" ON "BookingConsent"("booking_id");

-- AddForeignKey
ALTER TABLE "BookingConsent" ADD CONSTRAINT "BookingConsent_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingConsent" ADD CONSTRAINT "BookingConsent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
