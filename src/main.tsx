import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "jotai";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { installScenarios } from "./chaos/scenarios";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { attachQueryClient } from "./incidents/actions";
import { installDetectors } from "./incidents/detectors";
import "./index.css";
import { startMockApi } from "./mocks/browser";
import { ThemeProvider } from "./providers/ThemeProvider";
import { appStore } from "./store/store";
import { loadOutbox } from "./victim/api/outbox";
import { feedClient } from "./victim/feed/feedClient";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retries are a first-class subject here, so the app owns them rather
      // than letting the library paper over failures invisibly.
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
    mutations: { retry: false },
  },
});

async function boot(): Promise<void> {
  await startMockApi();
  installScenarios();
  installDetectors();
  attachQueryClient(queryClient);
  await loadOutbox();
  feedClient.connect();

  const container = document.getElementById("root");
  if (!container) throw new Error("Missing #root");

  createRoot(container).render(
    <StrictMode>
      <Provider store={appStore}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <TooltipProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
              <Toaster position="top-center" />
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </Provider>
    </StrictMode>,
  );
}

void boot();
