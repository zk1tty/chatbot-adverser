import { createFileRoute } from "@tanstack/react-router";
import { Thread } from "@/components/assistant-ui/thread";
import { MyRuntimeProvider } from "@/components/MyRuntimeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OffersToolUI } from "@/components/assistant-ui/offers-tool-ui";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return (
    <TooltipProvider>
      <MyRuntimeProvider>
        <OffersToolUI />
        <main className="h-dvh">
          <Thread />
        </main>
      </MyRuntimeProvider>
    </TooltipProvider>
  );
}
