import { Suspense } from "react";
import ProfileClient from "./ProfileClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <ProfileClient />
    </Suspense>
  );
}
