-- AlterTable
-- Postal codes / areas an expert covers for a HOME_VISIT service. Multiple
-- values per service (the expert may cover several neighborhoods/postcodes).
-- Free text rather than a validated postcode format since coverage isn't
-- limited to a single country's postal code shape.
ALTER TABLE "Service" ADD COLUMN "home_visit_areas" TEXT[] NOT NULL DEFAULT '{}';
