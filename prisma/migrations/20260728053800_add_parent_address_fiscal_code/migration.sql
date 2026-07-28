-- Address + fiscal code, collected at registration for PARENT accounts so
-- experts have the invoicing details they need without re-asking on every booking.
ALTER TABLE "User" ADD COLUMN "address_street" TEXT;
ALTER TABLE "User" ADD COLUMN "address_postal_code" TEXT;
ALTER TABLE "User" ADD COLUMN "address_country" TEXT;
ALTER TABLE "User" ADD COLUMN "fiscal_code" TEXT;
