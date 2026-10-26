import { createTheme, type MantineColorsTuple } from "@mantine/core";

// Brand: logo maroon (#8f1414), frame charcoal, stamp blue.
const maroon: MantineColorsTuple = ["#fbeceb", "#f2d4d2", "#e5a8a4", "#d97a74", "#ce544c", "#c63c33", "#b02a22", "#8f1414", "#7a1010", "#640b0b"];
const stamp: MantineColorsTuple = ["#eaeefd", "#d2daf7", "#a2b2ee", "#6f87e6", "#4663df", "#2d4cdb", "#1f3fae", "#18349a", "#112c8a", "#05247a"];
const charcoal: MantineColorsTuple = ["#f4f4f4", "#e6e6e6", "#cbcbcb", "#aeaeae", "#959595", "#868686", "#7e7e7e", "#6b6b6b", "#3a3a3a", "#2b2b2b"];

export const theme = createTheme({
  primaryColor: "maroon",
  primaryShade: 7,
  colors: { maroon, stamp, charcoal },
  fontFamily: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
  fontFamilyMonospace: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  headings: { fontFamily: '"Archivo", "Helvetica Neue", Arial, sans-serif', fontWeight: "700" },
  defaultRadius: "sm",
  cursorType: "pointer",
  components: {
    Paper: { defaultProps: { withBorder: true, radius: "md" } },
    Card: { defaultProps: { withBorder: true, radius: "md" } },
    Modal: { defaultProps: { centered: false, overlayProps: { backgroundOpacity: 0.45, blur: 2 } } },
    Table: { defaultProps: { verticalSpacing: "xs" } },
  },
});
