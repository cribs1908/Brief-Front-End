import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { ClerkProvider, useAuth } from "@clerk/react-router";
import { rootAuthLoader } from "@clerk/react-router/ssr.server";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { Route } from "./+types/root";
import "./app.css";
import { Analytics } from "@vercel/analytics/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

export async function loader(args: Route.LoaderArgs) {
  return rootAuthLoader(args);
}
export const links: Route.LinksFunction = () => [
  // DNS prefetch for external services
  { rel: "dns-prefetch", href: "https://fonts.googleapis.com" },
  { rel: "dns-prefetch", href: "https://fonts.gstatic.com" },
  { rel: "dns-prefetch", href: "https://api.convex.dev" },
  { rel: "dns-prefetch", href: "https://clerk.dev" },
  
  // Preconnect to font services
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  
  // Font with display=swap for performance
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap",
  },
  
  // Preload critical assets
  {
    rel: "preload",
    href: "/rsk.png",
    as: "image",
    type: "image/png",
  },
  {
    rel: "preload",
    href: "/favicon.png", 
    as: "image",
    type: "image/png",
  },
  
  // Icon
  { rel: "icon", type: "image/png", href: "/favicon.png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Analytics />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <ClerkProvider
      loaderData={loaderData}
      signUpFallbackRedirectUrl="/"
      signInFallbackRedirectUrl="/"
      appearance={{
        variables: {
          colorPrimary: "#0B1E27",
          colorBackground: "#080A0F",
          colorText: "#DDE3EB",
          colorInputBackground: "rgba(12,18,26,0.7)",
          colorInputText: "#DDE3EB",
          fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
          borderRadius: "12px",
        },
        elements: {
          // Typography colors inside Clerk cards
          formFieldLabelRow: { color: "#DDE3EB" },
          formFieldLabel: { color: "#DDE3EB" },
          formFieldHintText: { color: "#DDE3EB" },
          identityPreviewText: { color: "#DDE3EB" },
          profileSectionTitle__connectedAccounts: { color: "#DDE3EB" },
          profileSectionTitle__account: { color: "#DDE3EB" },
          profileSectionPrimaryButton: { color: "#DDE3EB" },
          breadcrumbItem: { color: "#DDE3EB" },
          breadcrumbItem__currentPage: { color: "#DDE3EB" },
          formHeaderTitle: { color: "#DDE3EB" },
          formHeaderSubtitle: { color: "#DDE3EB" },

          // Common card/container
          card: {
            backgroundColor: "#080A0F",
            backgroundImage:
              "linear-gradient(180deg, rgba(156,199,216,0.10) 0%, rgba(122,160,177,0.08) 48%, rgba(11,30,39,0.00) 100%)",
            border: "1px solid rgba(12,18,26,0.9)",
            borderRadius: "12px",
            boxShadow: "none",
            color: "#DDE3EB",
          },
          headerTitle: { color: "#DDE3EB", fontWeight: 600, letterSpacing: "-0.02em" },
          headerSubtitle: { color: "#DDE3EB" },

          // Inputs
          formFieldInput: {
            backgroundColor: "rgba(12,18,26,0.7)",
            border: "1px solid #0C121A",
            color: "#DDE3EB",
            boxShadow: "none",
            borderRadius: "12px",
            transition: "transform 120ms ease, box-shadow 120ms ease",
          },
          formFieldInput__focused: {
            outline: "none",
            boxShadow: "0 0 0 2px rgba(11,30,39,0.4) inset",
          },

          // Primary buttons (submit)
          formButtonPrimary: {
            backgroundColor: "#0B1E27",
            color: "#DDE3EB",
            borderRadius: "12px",
            boxShadow: "none",
            transform: "translateY(0)",
            transition: "transform 150ms ease, background-color 150ms ease",
            '&:hover': {
              backgroundColor: "#0B1E27",
              transform: "translateY(-1px)",
              color: "#DDE3EB",
            },
            '&:active': {
              transform: "translateY(0)",
              color: "#DDE3EB",
            },
          },

          // Social buttons
          socialButtonsBlockButton: {
            backgroundColor: "transparent",
            border: "1px solid #0C121A",
            color: "#DDE3EB",
            borderRadius: "12px",
            boxShadow: "none",
            transition: "transform 150ms ease, background-color 150ms ease",
            '&:hover': {
              backgroundColor: "rgba(11,30,39,0.5)",
              transform: "translateY(-1px)",
              color: "#DDE3EB",
            },
          },
          // Google only: usa il verde primario dell'app (#0B1E27), testo sempre bianco
          socialButtonsBlockButton__google: {
            backgroundColor: "#0B1E27",
            border: "1px solid #0C121A",
            color: "#DDE3EB",
            '&:hover': {
              backgroundColor: "#0B1E27",
              color: "#DDE3EB",
            },
            '&:active': {
              backgroundColor: "#0B1E27",
              color: "#DDE3EB",
            },
          },
          socialButtonsBlockButtonText__google: {
            color: "#DDE3EB",
            '&:hover': { color: "#DDE3EB" },
            '&:active': { color: "#DDE3EB" },
          },
          socialButtonsProviderIcon__google: {
            color: "#DDE3EB",
            '&:hover': { color: "#DDE3EB" },
            '&:active': { color: "#DDE3EB" },
          },
          socialButtonsBlockButtonText: {
            color: "#DDE3EB",
            '&:hover': { color: "#DDE3EB" },
          },
          socialButtonsProviderIcon: { color: "#DDE3EB" },

          // Footer links / hints
          footerActionText: { color: "#DDE3EB" },
          footerActionLink: { color: "#DDE3EB", '&:hover': { color: "#DDE3EB" } },
          formFieldAction: { color: "#DDE3EB", '&:hover': { color: "#DDE3EB" } },
          dividerLine: { backgroundColor: "rgba(12,18,26,0.9)" },

          // UserButton popover (account management)
          userButtonPopoverCard: {
            backgroundColor: "#080A0F",
            backgroundImage:
              "linear-gradient(180deg, rgba(156,199,216,0.12) 0%, rgba(122,160,177,0.10) 48%, rgba(11,30,39,0.00) 100%)",
            border: "1px solid rgba(12,18,26,0.9)",
            boxShadow: "none",
            borderRadius: "12px",
            color: "#DDE3EB",
          },
          userButtonPopoverActionButton: {
            borderRadius: "10px",
            color: "#DDE3EB",
            '&:hover': { backgroundColor: "rgba(11,30,39,0.5)", color: "#DDE3EB" },
            '&:active': { backgroundColor: "rgba(11,30,39,0.65)", color: "#DDE3EB" },
          },
          userButtonPopoverActionButtonText: {
            color: "#DDE3EB",
            '&:hover': { color: "#DDE3EB" },
            '&:active': { color: "#DDE3EB" },
          },
          userButtonPopoverActionButtonIcon: {
            color: "#DDE3EB",
            '&:hover': { color: "#DDE3EB" },
            '&:active': { color: "#DDE3EB" },
          },
          userButtonPopoverFooter: { borderTop: "1px solid rgba(12,18,26,0.9)" },
          userButtonBox: { color: "#DDE3EB" },
        },
        layout: {
          shimmer: false,
          logoPlacement: "none",
        },
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <Outlet />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
