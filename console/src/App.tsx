import { Routes, Route } from 'react-router-dom'
import Landing from '@/pages/Landing'
import Layout from '@/components/layout/Layout'
import Dashboard from '@/pages/Dashboard'
import Jobs from '@/pages/Jobs'
import JobDetail from '@/pages/JobDetail'
import Review from '@/pages/Review'
import ReviewDetail from '@/pages/ReviewDetail'
import Devices from '@/pages/Devices'
import DeviceDetail from '@/pages/DeviceDetail'
import Domains from '@/pages/Domains'
import DomainDetail from '@/pages/DomainDetail'
import Policies from '@/pages/Policies'
import PolicyDetail from '@/pages/PolicyDetail'
import Budgets from '@/pages/Budgets'
import BudgetDetail from '@/pages/BudgetDetail'
import AuditLog from '@/pages/AuditLog'
import Settings from '@/pages/Settings'
import NotFound from '@/pages/NotFound'
import ToastContainer from '@/components/shared/Toast'

export default function App() {
  return (
    <>
      <Routes>
        {/* Landing — no sidebar */}
        <Route path="/" element={<Landing />} />
        <Route path="/landing" element={<Landing />} />

        {/* All console pages share one Layout instance (sidebar persists) */}
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:jobId" element={<JobDetail />} />
          <Route path="/review" element={<Review />} />
          <Route path="/review/:jobId" element={<ReviewDetail />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/devices/:deviceId" element={<DeviceDetail />} />
          <Route path="/domains" element={<Domains />} />
          <Route path="/domains/:domainId" element={<DomainDetail />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/policies/:policyId" element={<PolicyDetail />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/budgets/:budgetId" element={<BudgetDetail />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/settings/*" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <ToastContainer />
    </>
  )
}
