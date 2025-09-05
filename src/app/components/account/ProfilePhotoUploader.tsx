"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useProfilePhotoUpload } from "@/app/hooks/useProfilePhotoUpload";

type Props = {
  initialImage?: string | null;
};

export default function ProfilePhotoUploader({ initialImage }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [image, setImage] = useState<string | null>(initialImage ?? null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const { upload, remove, isUploading, progress, error, reset } =
    useProfilePhotoUpload();

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { user, variants } = await upload(f);
      setImage(user.image);
      setAvatarUrl(variants?.avatarUrl ?? null);
    } catch {
      // error state already set in hook
    }
  }

  async function onRemove() {
    try {
      const { user } = await remove();
      setImage(user.image); // null
      setAvatarUrl(null);
    } catch {
      // error state already set in hook
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div className="relative h-24 w-24 overflow-hidden rounded-2xl bg-gray-100">
        {avatarUrl || image ? (
          // Prefer avatarUrl (transformed) else raw image
          <Image
            src={avatarUrl || image!}
            alt="Profile"
            fill
            sizes="96px"
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
            No photo
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl px-3 py-2 text-sm font-medium shadow-sm ring-1 ring-gray-300 disabled:opacity-50"
            disabled={isUploading}
          >
            {isUploading ? "Uploading…" : "Upload photo"}
          </button>

        {image && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-2xl px-3 py-2 text-sm font-medium text-red-600 shadow-sm ring-1 ring-red-300 disabled:opacity-50"
            disabled={isUploading}
          >
            Remove
          </button>
        )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />

        {isUploading && (
          <div className="text-xs text-gray-600">
            Uploading… {progress}%
            <div className="mt-1 h-2 w-48 overflow-hidden rounded bg-gray-200">
              <div
                className="h-2 bg-gray-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600">
            {error}{" "}
            <button
              type="button"
              onClick={reset}
              className="ml-2 underline underline-offset-2"
            >
              reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
