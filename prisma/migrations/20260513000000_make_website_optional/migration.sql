-- Make website optional on BusinessInfo (was TEXT NOT NULL, now nullable)
ALTER TABLE "BusinessInfo" ALTER COLUMN "website" DROP NOT NULL;
