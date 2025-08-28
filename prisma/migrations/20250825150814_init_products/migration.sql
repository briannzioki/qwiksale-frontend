-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "brand" TEXT,
    "condition" TEXT,
    "price" INTEGER,
    "image" TEXT,
    "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" TEXT,
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sellerName" TEXT,
    "sellerPhone" TEXT,
    "sellerLocation" TEXT,
    "sellerMemberSince" TEXT,
    "sellerRating" DOUBLE PRECISION,
    "sellerSales" INTEGER,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
