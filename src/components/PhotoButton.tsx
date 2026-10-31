"use client";

import { useRef } from "react";

type PhotoButtonProps = {
  onFile: (file: File) => void;
  disabled?: boolean;
  label: string;
  className?: string;
  children?: React.ReactNode;
};

/** Bouton qui ouvre le sélecteur de photo (appareil photo sur téléphone). */
export default function PhotoButton({
  onFile,
  disabled,
  label,
  className,
  children,
}: PhotoButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        title={label}
        onClick={() => inputRef.current?.click()}
        className={className}
      >
        {children ?? label}
      </button>
    </>
  );
}
