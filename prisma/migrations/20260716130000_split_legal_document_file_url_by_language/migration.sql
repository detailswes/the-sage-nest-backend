-- Each published LegalDocument version now carries one PDF per language
-- (EN + IT) instead of a single file_url. Safe to run whether or not the
-- prior migration (which added file_url) has been applied yet.
ALTER TABLE "LegalDocument" ADD COLUMN IF NOT EXISTS "file_url_en" TEXT;
ALTER TABLE "LegalDocument" ADD COLUMN IF NOT EXISTS "file_url_it" TEXT;
ALTER TABLE "LegalDocument" DROP COLUMN IF EXISTS "file_url";
