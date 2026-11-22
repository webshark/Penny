"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // A 4xx answer will not change on retry (a bad id, a locked app, a missing
            // record), so only a dropped connection or a server fault is worth repeating.
            retry: (failureCount, error) => {
              const status = error instanceof ApiError ? error.status : undefined;
              if (status !== undefined && status !== "network" && status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
