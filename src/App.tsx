import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import DailyStats from "./pages/DailyStats";
import Finance from "./pages/Finance";
import PurchaseRequests from "./pages/PurchaseRequests";
import NotFound from "./pages/NotFound";
import { AdminGuard } from "./components/AdminGuard";
import { Layout } from "./components/Layout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/stats" element={<AdminGuard><DailyStats /></AdminGuard>} />
          <Route path="/finance" element={<Layout><Finance /></Layout>} />
          <Route path="/purchases" element={<AdminGuard><Layout><PurchaseRequests /></Layout></AdminGuard>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
