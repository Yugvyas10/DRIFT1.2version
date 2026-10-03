-- PLAN Q12: demonstration organisations, labelled DEMO in the UI.
ALTER TABLE "Organization" ADD COLUMN "demo" BOOLEAN NOT NULL DEFAULT false;
