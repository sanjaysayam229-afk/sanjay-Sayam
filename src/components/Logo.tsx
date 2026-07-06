import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  variant?: 'brand' | 'white' | 'dark' | 'currentColor';
}

export default function Logo({ className = "w-12 h-12", size, variant = 'brand' }: LogoProps) {
  // Determine color theme classes
  const colorMap = {
    brand: 'text-teal-500 dark:text-teal-400',
    white: 'text-white',
    dark: 'text-slate-900 dark:text-slate-100',
    currentColor: 'text-current'
  };

  const fillClass = colorMap[variant];

  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox="0 0 200 200"
        className={`${className} ${fillClass} transition-all duration-300`}
        style={size ? { width: size, height: size } : undefined}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        id="vsy-monogram-logo"
      >
        {/* Ambient background glow gradient */}
        <defs>
          <linearGradient id="logoGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-teal-500)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--color-emerald-600)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Precise geometric reconstruction of the interlocking 'VSY' / 'YS' monogram from user image */}
        <g stroke="currentColor" strokeWidth="16" strokeLinecap="square" strokeLinejoin="miter">
          
          {/* Stem of Y - Bottom Vertical Column */}
          <path d="M 100,105 L 100,175" />

          {/* Left Arm of Y - Top Left to Center */}
          <path d="M 45,45 L 100,105" />

          {/* Right Arm of Y - Top Right to Center (With tiny gaps for S overlap) */}
          <path d="M 155,45 L 122,81" />
          <path d="M 112,92 L 100,105" />

          {/* Interlocking 'S' path, beautifully looping and interwoven */}
          {/* Top curve of 'S' - starts at right, loops left, passes behind left arm */}
          <path d="M 115,46 C 115,46 100,41 85,53 C 71,65 83,81 95,93" />
          
          {/* Middle diagonal transition of 'S' crossing over the junction */}
          <path d="M 101,99 L 115,113 C 126,124 130,138 118,150 C 106,162 82,151 82,151" />
          
          {/* Bottom loop of 'S' - curving around to intertwine with the vertical stem */}
          <path d="M 76,112 C 76,112 84,101 100,101 C 112,101 118,109 118,109" />
          
        </g>
      </svg>
    </div>
  );
}

