import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Dashboard from '@/pages/Dashboard'
import Jobs from '@/pages/Jobs'
import JobDetail from '@/pages/JobDetail'
import Review from '@/pages/Review'
import ReviewDetail from '@/pages/ReviewDetail'
import Devices from '@/pages/Devices'
import DeviceDetail from '@/pages/DeviceDetail'
import Domains from '@/pages/Domains'
import Policies from '@/pages/Policies'
import Budgets from '@/pages/Budgets'
import AuditLog from '@/pages/AuditLog'
import Settings from '@/pages/Settings'
import NotFound from '@/pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:jobId" element={<JobDetail />} />
        <Route path="/review" element={<Review />} />
        <Route path="/review/:jobId" element={<ReviewDetail />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/devices/:deviceId" element={<DeviceDetail />} />
        <Route path="/domains" element={<Domains />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
