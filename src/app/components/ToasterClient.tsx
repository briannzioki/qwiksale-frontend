// src/app/components/ToasterClient.tsx
"use client";

import { Toaster } from "react-hot-toast";

export default function ToasterClient() {
  return (
    <Toaster
      position="top-right"
      gutter={8}
      reverseOrder={false}
      toastOptions={{
        duration: 3000,
        // Base styles applied to every toast
        className:
          "rounded-xl border shadow-lg px-3 py-2 bg-white text-gray-900 border-gray-200 " +
          "dark:bg-gray-900 dark:text-gray-100 dark:border-gray-800",
        style: {
          fontSize: "0.875rem", // 14px
          lineHeight: 1.4,
        },
        // Variants
        success: {
          duration: 2500,
          className:
            "rounded-xl border shadow-lg px-3 py-2 " +
            "bg-emerald-50 text-emerald-900 border-emerald-200 " +
            "dark:bg-emerald-900/20 dark:text-emerald-50 dark:border-emerald-800",
          iconTheme: {
            primary: "#10b981",
            secondary: "#ffffff",
          },
        },
        error: {
          duration: 4000,
          className:
            "rounded-xl border shadow-lg px-3 py-2 " +
            "bg-rose-50 text-rose-900 border-rose-200 " +
            "dark:bg-rose-900/20 dark:text-rose-50 dark:border-rose-800",
          iconTheme: {
            primary: "#ef4444",
            secondary: "#ffffff",
          },
        },
        loading: {
          className:
            "rounded-xl border shadow-lg px-3 py-2 " +
            "bg-white text-gray-900 border-gray-200 " +
            "dark:bg-gray-900 dark:text-gray-100 dark:border-gray-800",
        },
      }}
      containerStyle={{
        zIndex: 60,
        inset: 12, // breathing room from edges
      }}
    />
  );
}
