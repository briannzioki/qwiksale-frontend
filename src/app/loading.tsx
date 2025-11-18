// src/app/loading.tsx
import { HomePageSkeleton } from "@/app/components/Skeletons";

export default function Loading() {
  return (
    <main className="container-page py-6" aria-busy="true" aria-live="polite" role="status">
      <HomePageSkeleton gridCount={12} />
    </main>
  );
}

