import React from 'react';

export const SkyOpsLogo: React.FC<{ size?: number; className?: string }> = ({ size = 40, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shieldGrad" x1="0" x2="100"><stop offset="0%" stopColor="#0a192f" /><stop offset="100%" stopColor="#020617" /></linearGradient>
      <linearGradient id="eagleGrad" x1="20" y1="20" x2="80" y2="80"><stop offset="0%" stopColor="#ffffff" /><stop offset="50%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#1d4ed8" /></linearGradient>
    </defs>
    <path d="M50 5C30 5 15 15 15 40C15 65 35 85 50 95C65 85 85 65 85 40C85 15 70 5 50 5Z" fill="url(#shieldGrad)" stroke="#3b82f6" strokeWidth="2"/>
    <path d="M30 45C30 45 40 30 65 25C75 23 85 28 80 40C70 55 50 70 25 80C20 82 15 78 18 73L30 45Z" fill="url(#eagleGrad)" />
    <path d="M40 38H55M42 45H60M44 52H52" stroke="#020617" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
