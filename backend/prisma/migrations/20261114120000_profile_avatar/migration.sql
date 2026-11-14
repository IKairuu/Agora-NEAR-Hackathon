-- Profile photo, shown in the account menu and on the seller profile
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_image" TEXT;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_updated_at" TIMESTAMPTZ(6);
