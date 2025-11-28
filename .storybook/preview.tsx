import type { Preview } from "@storybook/react";
import { withThemeByClassName } from "@storybook/addon-themes";
import "../src/index.css";
import { SettingsProvider } from "../src/context/SettingsContext";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../src/lib/queryClient";
import { BrowserRouter } from "react-router-dom";

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: "light",
        dark: "dark",
      },
      defaultTheme: "light",
    }),
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-background p-4">
              <Story />
            </div>
          </BrowserRouter>
        </SettingsProvider>
      </QueryClientProvider>
    ),
  ],
};

export default preview;
