// src/app/lib/navigation.ts
"use client";

import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

export function usePostRedirect() {
  const router = useRouter();
  return () => {
    toast.success("Listing created");
    router.push("/dashboard");
  };
}

export function useDeleteRedirect() {
  const router = useRouter();
  return () => {
    toast.success("Listing deleted");
    router.push("/");
  };
}
