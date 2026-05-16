import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

import { AuthProvider } from "@/contexts/auth";
import { HandoffsProvider } from "@/contexts/handoffs";
import { ChatWindowManager } from "@/components/ChatWindowManager";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AdminProtectedRoute } from "@/components/layout/AdminProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import AiSettings from "@/pages/AiSettings";
import Services from "@/pages/Services";
import Products from "@/pages/Products";
import Professionals from "@/pages/Professionals";
import Patients from "@/pages/Patients";
import Appointments from "@/pages/Appointments";
import AiLogs from "@/pages/AiLogs"
import AiChat from "@/pages/AiChat"
import ClinicSettings from "@/pages/ClinicSettings"
import Login from "@/pages/Login"
import Register from "@/pages/Register"
import AdminClinics from "@/pages/AdminClinics"
import Team from "@/pages/Team"
import LandingPage from "@/pages/LandingPage"
import NotFound from "@/pages/not-found"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/admin/clinics">
        <AdminProtectedRoute>
          <AdminClinics />
        </AdminProtectedRoute>
      </Route>
      <Route path="/" component={LandingPage} />
      <Route>
        <ProtectedRoute>
          <AppLayout>
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/settings/ai" component={AiSettings} />
              <Route path="/services" component={Services} />
              <Route path="/products" component={Products} />
              <Route path="/professionals" component={Professionals} />
              <Route path="/patients" component={Patients} />
              <Route path="/appointments" component={Appointments} />
              <Route path="/logs" component={AiLogs} />
              <Route path="/chat" component={AiChat} />
              <Route path="/team" component={Team} />
              <Route path="/settings/clinic" component={ClinicSettings} />
              <Route component={NotFound} />
            </Switch>
          </AppLayout>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <HandoffsProvider>
            <Router />
            <ChatWindowManager />
          </HandoffsProvider>
        </AuthProvider>
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
