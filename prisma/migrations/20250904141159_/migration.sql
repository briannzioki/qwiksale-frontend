/*
  Warnings:

  - You are about to drop the `Synonym` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "public"."product_desc_trgm_idx";

-- DropIndex
DROP INDEX "public"."product_name_trgm_idx";

-- DropTable
DROP TABLE "public"."Synonym";
