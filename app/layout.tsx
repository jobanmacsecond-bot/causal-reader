import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Causal — News in context', description: 'Read global headlines from curated newsrooms and explore earlier events that may explain them.' };
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
