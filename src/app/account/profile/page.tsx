// src/app/account/profile/page.tsx
export const dynamic = "force-dynamic";

import ProfileClient from "./ProfileClient";

// Page components must not accept arbitrary props.
// Just render the client component; it will fetch /api/me itself.
export default function Page() {
  return <ProfileClient />;
}
