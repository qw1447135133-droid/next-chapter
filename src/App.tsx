import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Home from "./pages/Home";
import Modules from "./pages/Modules";
import Workspace from "./pages/Workspace";
import ScriptCreator from "./pages/ScriptCreator";
import ComplianceReview from "./pages/ComplianceReview";
import Settings from "./pages/Settings";
import History from "./pages/History";
import Recharge from "./pages/Recharge";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const isFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";
const Router = isFileProtocol ? HashRouter : BrowserRouter;

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" storageKey="storyforge-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/modules" element={<Modules />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/script-creator" element={<ScriptCreator />} />
            <Route path="/compliance-review" element={<ComplianceReview />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/history" element={<History />} />
            <Route path="/recharge" element={<Recharge />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
