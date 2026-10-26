import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "./styles.css";
import { AppProvider } from "./core/app-context";
import { Shell } from "./core/Shell";
import { modules } from "./modules";
import { HomePage } from "./pages/Home";
import { CustomersPage } from "./pages/Customers";
import { SettingsPage } from "./pages/Settings";
import { NotFound } from "./pages/NotFound";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "customers", element: <CustomersPage /> },
      { path: "settings", element: <SettingsPage /> },
      ...modules.flatMap((m) => m.routes),
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>,
);
