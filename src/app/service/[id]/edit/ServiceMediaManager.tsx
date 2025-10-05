// src/app/service/[id]/edit/ServiceMediaManager.tsx
"use client";

import type { FC } from "react";
import EditMediaClient from "@/app/components/EditMediaClient";

export type ServiceMediaItem = {
  id: string;
  url: string;
  isCover?: boolean;
  sort?: number;
};

type Props = {
  serviceId: string;
  initial: ServiceMediaItem[];
  max?: number;
};

/**
 * Thin wrapper around EditMediaClient for services.
 * Keeps call-sites clean and lets you swap implementations later if needed.
 */
const ServiceMediaManager: FC<Props> = ({ serviceId, initial, max = 10 }) => {
  return (
    <EditMediaClient
      entity="service"
      entityId={serviceId}
      initial={initial}
      max={max}
    />
  );
};

export default ServiceMediaManager;
