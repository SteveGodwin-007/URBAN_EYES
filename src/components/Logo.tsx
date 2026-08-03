import React from 'react';

export default function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <img
        src="/images/urban-eyes-logo.png"
        alt="Urban Eyes Smart Chennai City Survey logo"
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
