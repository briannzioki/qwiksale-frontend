"use client";

import { useCallback, useRef, useState } from "react";

type CloudinaryUploadOk = {
  secure_url: string;
  public_id: string;
};

type ApiOk = {
  ok: true;
  user: {
    id: string;
    image: string | null;
    name: string | null;
    username: string | null;
    email: string | null;
  };
  variants?: {
    avatarUrl: string;
    previewUrl: string;
    placeholderUrl: string;
  } | null;
};

type ApiErr = { error: string };

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "qwiksale_unsigned";

if (!CLOUD_NAME) {
  // Make it fail-fast during dev if env is missing.
  // (In prod this just won't run until rendered client-side.)
  // eslint-disable-next-line no-console
  console.warn(
    "[useProfilePhotoUpload] Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"
  );
}

function uploadToCloudinaryUnsigned(
  file: File,
  onProgress?: (pct: number) => void
): Promise<CloudinaryUploadOk> {
  return new Promise((resolve, reject) => {
    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;

    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      onProgress?.(pct);
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) {
          resolve({ secure_url: json.secure_url, public_id: json.public_id });
        } else {
          reject(
            new Error(
              json?.error?.message ||
                `Cloudinary upload failed with status ${xhr.status}`
            )
          );
        }
      } catch (e: any) {
        reject(new Error(e?.message || "Cloudinary response parse error"));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during Cloudinary upload"));
    };

    xhr.send(form);
  });
}

export function useProfilePhotoUpload() {
  const [progress, setProgress] = useState<number>(0);
  const [isUploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setProgress(0);
    setUploading(false);
    setError(null);
  }, []);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // 1) Upload to Cloudinary (unsigned)
      const { secure_url } = await uploadToCloudinaryUnsigned(file, setProgress);

      // 2) Save to your API (sets User.image, returns variants)
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/account/profile/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ secureUrl: secure_url }),
      });

      const data: ApiOk | ApiErr = await res.json();

      if (!res.ok) {
        throw new Error(
          (data as ApiErr)?.error || `API error ${res.status}: profile/photo`
        );
      }

      return data as ApiOk;
    } catch (e: any) {
      const msg = e?.message || "Upload failed";
      setError(msg);
      throw e;
    } finally {
      setUploading(false);
      setProgress(100);
    }
  }, []);

  const remove = useCallback(async () => {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/profile/photo", {
        method: "DELETE",
      });
      const data: ApiOk | ApiErr = await res.json();
      if (!res.ok) {
        throw new Error((data as ApiErr)?.error || "Failed to remove photo");
      }
      return data as ApiOk;
    } catch (e: any) {
      const msg = e?.message || "Remove failed";
      setError(msg);
      throw e;
    } finally {
      setUploading(false);
    }
  }, []);

  return {
    // actions
    upload,
    remove,
    reset,
    // state
    isUploading,
    progress, // 0..100
    error,
  };
}
