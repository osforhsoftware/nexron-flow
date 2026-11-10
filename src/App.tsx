import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { BrandLogo } from "./components/BrandLogo";
import { useApp } from "./lib/AppContext";
import { CompaniesPage } from "./pages/CompaniesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InvoicePage } from "./pages/InvoicePage";
import { ItemsPage } from "./pages/ItemsPage";
import { LoginPage } from "./pages/LoginPage";
import { PartiesPage } from "./pages/PartiesPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BusinessToolsPage } from "./pages/BusinessToolsPage";
import { PipelineDocsPage } from "./pages/PipelineDocsPage";

function Protected({ children }: { children: ReactNode }) {
  const { ready, session } = useApp();
  if (!ready) {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <BrandLogo size={64} showWordmark wordmarkSize="lg" />
          <p className="tagline" style={{ marginTop: 12 }}>
            Opening your books…
          </p>
        </div>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="parties" element={<PartiesPage />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="sales" element={<InvoicePage type="sale" />} />
        <Route path="sales/quotations" element={<PipelineDocsPage docType="quotation" />} />
        <Route path="sales/orders" element={<PipelineDocsPage docType="sale_order" />} />
        <Route path="sales/delivery" element={<PipelineDocsPage docType="delivery" />} />
        <Route path="purchases" element={<InvoicePage type="purchase" />} />
        <Route path="purchases/orders" element={<PipelineDocsPage docType="purchase_order" />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="backup" element={<BusinessToolsPage kind="backup" />} />
        <Route path="utilities" element={<BusinessToolsPage kind="utilities" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
