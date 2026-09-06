import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { ApiError } from "./api/client";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/Toaster";
import { UIThemeProvider } from "./theme/UIThemeContext";
import { router } from "./routes";
import "./styles.css";
import "./styles.dense.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <UIThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AuthProvider>
      </UIThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
