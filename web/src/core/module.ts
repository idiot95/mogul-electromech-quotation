import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

// What a front-end module provides. Adding a module = a folder under modules/ + one line in modules/index.ts.
export interface WebModule {
  id: string;
  name: string;
  nav: { label: string; path: string }[];
  routes: RouteObject[];
  widgets?: ComponentType[]; // shown on the Home page
  newAction?: { label: string; path: string }; // quick action in the sidebar
  prefetch?: () => void; // load the module's page code in the background
}
