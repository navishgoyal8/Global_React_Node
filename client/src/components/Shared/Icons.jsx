import React from 'react';

export const MenuIcon = () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>;
export const SearchIcon = ({ className, size=24 }) => <svg className={className} width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
export const UserIcon = ({ className }) => <svg className={className} width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8z" /></svg>;
export const CartIcon = ({ size = 24, className = "" }) => <svg className={className} width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.2 9.3a1 1 0 001 1.2h13.4a1 1 0 00.9-1.2L17 13M9 21h.01M15 21h.01" /></svg>;
export const ShieldIcon = () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
export const CheckIcon = () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3" /></svg>;
export const TruckIcon = () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17h14m-9 0V7m0 10H3a2 2 0 01-2-2v-4a2 2 0 012-2h7v8zm9 0h2a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" /></svg>;
export const SupportIcon = () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
export const BusIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14v3m16-3v3M4 10h16M4 6h16M2 14h20M2 10a2 2 0 012-2h16a2 2 0 012 2v4H2v-4z" /></svg>;
export const VanIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17h14m-9 0V7m0 10H3a2 2 0 01-2-2v-4a2 2 0 012-2h7v8z" /></svg>;
export const FilterIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>;
export const CheckCircleIcon = () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3" /></svg>;
export const HeartIcon = ({ filled, size = 18, strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
  </svg>
);export const XIcon = ({ size = 20 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>;
export const ArrowLeftIcon = ({ size = 20 }) => <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>;