-- Unused: the Codice Fiscale flow's billing-address substitute only ever
-- collects street + city + country (see mockup), never a separate postal code.
ALTER TABLE "User" DROP COLUMN "address_postal_code";
