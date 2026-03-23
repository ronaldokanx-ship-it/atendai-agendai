import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import AiSettings from "@/pages/AiSettings";
import Services from "@/pages/Services";
import Appointments from "@/pages/Appointments";
import AiLogs from "@/pages/AiLogs";
import NotFound from "@/pages/not-found";

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
    <AppLayout>
      <Switch>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/settings/ai" component={AiSettings} />
        <Route path="/services" component={Services} />
        <Route path="/appointments" component={Appointments} />
        <Route path="/logs" component={AiLogs} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
