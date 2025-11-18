// src/app/components/ProductActionsClient.tsx
'use client';

import { useCallback } from 'react';

type BaseClientProps = {
  id: string;
  /** Optional; with exactOptionalPropertyTypes you must allow undefined explicitly if you pass it through */
  isAuthed?: boolean | undefined;
  className?: string;
  /** present for parity with server wrapper; harmless if unused */
  withinCard?: boolean | undefined;
};

export type ClientProps =
  | (BaseClientProps & { kind: 'product' })
  | (BaseClientProps & { kind: 'service' });

export default function ProductActionsClient({
  kind,
  id,
  isAuthed,
  className,
}: ClientProps) {
  const onMessage = useCallback(() => {
    // Keep behavior minimal & side-effect free:
    // if you have a real dialog, listen for this event elsewhere
    const eventName = isAuthed ? 'qs:message:open' : 'qs:auth:prompt';
    window.dispatchEvent(new CustomEvent(eventName, { detail: { kind, id } }));
  }, [kind, id, isAuthed]);

  return (
    <button
      type="button"
      onClick={onMessage}
      data-testid={kind === 'product' ? 'message-seller' : 'message-provider'}
      aria-label={kind === 'product' ? 'Message seller' : 'Message provider'}
      className={[
        'rounded-lg border px-3 py-2 text-sm hover:bg-gray-50',
        'dark:border-slate-700 dark:hover:bg-slate-800',
        className || '',
      ].join(' ')}
    >
      {kind === 'product' ? 'Message seller' : 'Message provider'}
    </button>
  );
}
