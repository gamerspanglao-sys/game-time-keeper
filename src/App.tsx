import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Finance from "./pages/Finance";
import MoneyFlow from "./pages/MoneyFlow";
import Activity from "./pages/Activity";
import Shift from "./pages/Shift";
import Inventory from "./pages/Inventory";
import NotFound from "./pages/NotFound";
import { Layout } from "./components/Layout";
import { AdminProvider } from "./hooks/useAdminMode";
import { AdminGuard } from "./components/AdminGuard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AdminProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/shift" element={<Layout><Shift /></Layout>} />
            <Route path="/finance" element={<Layout><Finance /></Layout>} />
            <Route path="/money-flow" element={<Layout><MoneyFlow /></Layout>} />
            {/* Admin-only routes */}
            <Route path="/activity" element={<Layout><AdminGuard><Activity /></AdminGuard></Layout>} />
            <Route path="/inventory" element={<Layout><AdminGuard><Inventory /></AdminGuard></Layout>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AdminProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
