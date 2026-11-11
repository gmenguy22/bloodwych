import { createFileRoute, redirect } from "@tanstack/react-router";

// Sanglune (jeu statique) est servi depuis apps/web/public/sanglune — on redirige la racine vers lui.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect is thrown, by design
    throw redirect({ href: "/sanglune/" });
  },
  component: () => null,
});
