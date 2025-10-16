// src/app/product/[id]/loading.tsx
import { ProductDetailSkeleton } from "@/app/components/Skeletons";

export default function Loading() {
  return (
    <main className="container-page py-6" aria-busy="true" aria-live="polite" role="status">
      <ProductDetailSkeleton />
    </main>
  );
}
