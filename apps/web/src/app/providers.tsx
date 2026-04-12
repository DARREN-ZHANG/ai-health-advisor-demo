'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { LazyMotion, domAnimation } from 'framer-motion';
import { useState } from 'react';
import { ProfileBootstrap } from './ProfileBootstrap';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={domAnimation} strict>
          <ProfileBootstrap />
          {children}
        </LazyMotion>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
