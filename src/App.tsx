import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import DailyStats from "./pages/DailyStats";
import ActivityLog from "./pages/ActivityLog";
import Tournaments from "./pages/Tournaments";
import PaymentsReport from "./pages/PaymentsReport";
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
          <Route path="/log" element={<AdminGuard><ActivityLog /></AdminGuard>} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/payments" element={<AdminGuard><Layout><PaymentsReport /></Layout></AdminGuard>} />
          <Route path="/purchases" element={<AdminGuard><Layout><PurchaseRequests /></Layout></AdminGuard>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
