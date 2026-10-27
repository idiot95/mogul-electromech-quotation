import { lazy } from "react";
import type { WebModule } from "../../core/module";
import { QuotesHomeWidget } from "./HomeWidget";

// Pages load on first use (and are fetched in the background once the app is idle, see prefetch).
const load = {
  list: () => import("./QuoteList"),
  editor: () => import("./QuoteEditor"),
  print: () => import("./PrintPage"),
};
const QuoteList = lazy(() => load.list().then((m) => ({ default: m.QuoteList })));
const QuoteEditor = lazy(() => load.editor().then((m) => ({ default: m.QuoteEditor })));
const PrintPage = lazy(() => load.print().then((m) => ({ default: m.PrintPage })));

export const quotesModule: WebModule = {
  id: "quotes",
  name: "Quotations",
  nav: [{ label: "Quotations", path: "/quotes" }],
  newAction: { label: "New Quotation", path: "/quotes/new" },
  routes: [
    { path: "quotes", element: <QuoteList /> },
    { path: "quotes/new", element: <QuoteEditor key="new" /> },
    { path: "quotes/:id", element: <QuoteEditor /> },
    { path: "quotes/:id/print", element: <PrintPage /> },
  ],
  widgets: [QuotesHomeWidget],
  prefetch: () => Object.values(load).forEach((f) => f()),
};
