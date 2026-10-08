const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const IconBack = () => <svg {...base}><path d="M15 18l-6-6 6-6" /></svg>;
export const IconForward = () => <svg {...base}><path d="M9 18l6-6-6-6" /></svg>;
export const IconReload = () => <svg {...base}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>;
export const IconPlus = () => <svg {...base}><path d="M12 5v14M5 12h14" /></svg>;
export const IconClose = () => <svg {...base} width={14} height={14}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IconReader = () => <svg {...base}><path d="M4 5h16M4 10h16M4 15h10M4 20h7" /></svg>;
export const IconSearch = () => <svg {...base} width={14} height={14} strokeWidth={2}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>;
export const IconLock = () => <svg {...base} width={14} height={14} strokeWidth={2} stroke="var(--np-ok)"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>;
export const IconSettings = () => <svg {...base} strokeLinejoin={undefined}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
