import type { WebModule } from "../../core/module";
import { QuoteList } from "./QuoteList";
import { QuoteEditor } from "./QuoteEditor";
import { PrintPage } from "./PrintPage";
import { QuotesHomeWidget } from "./HomeWidget";

export const quotesModule: WebModule = {
  id: "quotes",
  name: "Quotations",
  nav: [{ label: "Quotations", path: "/quotes" }],
  newAction: { label: "New quote", path: "/quotes/new" },
  routes: [
    { path: "quotes", element: <QuoteList /> },
    { path: "quotes/new", element: <QuoteEditor key="new" /> },
    { path: "quotes/:id", element: <QuoteEditor /> },
    { path: "quotes/:id/print", element: <PrintPage /> },
  ],
  widgets: [QuotesHomeWidget],
};
