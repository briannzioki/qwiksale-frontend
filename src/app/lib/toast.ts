// src/app/lib/toast.ts
import { toast } from "@/app/components/ToasterClient";

export const notify = {
  saved: () => toast.success("Saved."),
  deleted: () => toast.success("Deleted."),
  error: (m?: string) => toast.error(m ?? "Something went wrong."),
};
