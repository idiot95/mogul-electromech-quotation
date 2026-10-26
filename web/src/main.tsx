import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { DatesProvider } from "@mantine/dates";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dropzone/styles.css";
import "@mantine/dates/styles.css";
import "./styles.css";
import { theme } from "./theme";
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
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ firstDayOfWeek: 1 }}>
        <ModalsProvider>
          <Notifications position="bottom-right" />
          <AppProvider>
            <RouterProvider router={router} />
          </AppProvider>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>,
);
