import { Link, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { EmptyState, Logo } from "@/components/common";
import { CallManager } from "@/components/chat/CallModal";
import { useMe } from "@/lib/hooks";
import { useRealtime } from "@/lib/realtime";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import PublicLanding from "@/pages/PublicLanding";
import CustomerInbox from "@/pages/CustomerInbox";
import { EmployeeAnalytics, EmployeeCustomers, EmployeeDashboard, EmployeeDeposits, EmployeeInbox, EmployeeSettings } from "@/pages/EmployeePages";
import {
  AdminAnalytics, AdminBilling, AdminBroadcasts, AdminConversations, AdminCustomers, AdminDashboard, AdminDeposits,
  AdminEmployees, AdminLandingPages, AdminSettings,
} from "@/pages/AdminPages";
import {
  SuperAdmins, SuperAnalytics, SuperAuditLogs, SuperDashboard, SuperDomains, SuperOrganizations, SuperSettings, SuperSubscriptions,
} from "@/pages/SuperAdminPages";
import { SuperCustomers } from "@/pages/SuperCustomers";

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <EmptyState title="Page not found" text="The page you're looking for doesn't exist." action={<Link to="/" className="text-sm font-semibold text-primary underline" data-testid="not-found-home-link">Back home</Link>} />
    </div>
  );
}

function RealtimeRoot() {
  const me = useMe();
  useRealtime(!!me.data);
  return me.data && me.data.role !== "superadmin" ? <CallManager /> : null;
}

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
    <RealtimeRoot />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/demo" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/p/:org/:slug" element={<PublicLanding />} />
      <Route path="/chat" element={<CustomerInbox />} />
      <Route path="/chat/:conversationId" element={<CustomerInbox />} />
      <Route path="/employee" element={<AppShell role="employee" />}>
        <Route index element={<EmployeeDashboard />} />
        <Route path="inbox" element={<EmployeeInbox />} />
        <Route path="customers" element={<EmployeeCustomers />} />
        <Route path="deposits" element={<EmployeeDeposits />} />
        <Route path="analytics" element={<EmployeeAnalytics />} />
        <Route path="settings" element={<EmployeeSettings />} />
      </Route>
      <Route path="/admin" element={<AppShell role="admin" />}>
        <Route index element={<AdminDashboard />} />
        <Route path="employees" element={<AdminEmployees />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="landing-pages" element={<AdminLandingPages />} />
        <Route path="conversations" element={<AdminConversations />} />
        <Route path="deposits" element={<AdminDeposits />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="broadcasts" element={<AdminBroadcasts />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="billing" element={<AdminBilling />} />
      </Route>
      <Route path="/superadmin" element={<AppShell role="superadmin" />}>
        <Route index element={<SuperDashboard />} />
        <Route path="organizations" element={<SuperOrganizations />} />
        <Route path="customers" element={<SuperCustomers />} />
        <Route path="admins" element={<SuperAdmins />} />
        <Route path="subscriptions" element={<SuperSubscriptions />} />
        <Route path="domains" element={<SuperDomains />} />
        <Route path="analytics" element={<SuperAnalytics />} />
        <Route path="audit-logs" element={<SuperAuditLogs />} />
        <Route path="settings" element={<SuperSettings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  );
}
