import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PublicDataProvider } from '../lib/public-data';
import { ToastProvider } from '../components/ui/toast';
import { PublicLayout } from '../components/layout/PublicLayout';
import { SkeletonLines } from '../components/ui/states';
import { HomePage } from '../features/home/HomePage';
import { NotFoundPage } from './NotFoundPage';
import { ErrorBoundary } from './ErrorBoundary';
import { UpdatePrompt } from './UpdatePrompt';

// Route-level code splitting: the homepage ships in the main bundle, everything else on demand.
const ProgramPage = lazy(() => import('../features/schedule/ProgramPage'));
const DisplayPage = lazy(() => import('../features/schedule/DisplayPage'));
const LeaguePage = lazy(() => import('../features/league/LeaguePage'));
const BagrutPage = lazy(() => import('../features/bagrut/BagrutPage'));
const BenefitsPage = lazy(() => import('../features/benefits/BenefitsPage'));
const ServicesPage = lazy(() => import('../features/services/ServicesPage'));
const ActivitiesPage = lazy(() => import('../features/activities/ActivitiesPage'));
const VerifyPage = lazy(() => import('../features/certificates/VerifyPage'));
const AdminApp = lazy(() => import('../features/admin/AdminApp'));

function PageFallback() {
  return (
    <div className="container" style={{ paddingTop: 'var(--s7)' }}>
      <SkeletonLines count={4} height={90} />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <PublicDataProvider>
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/display" element={<DisplayPage />} />
                <Route path="/admin/*" element={<AdminApp />} />
                <Route element={<PublicLayout />}>
                  <Route index element={<HomePage />} />
                  <Route path="program" element={<ProgramPage />} />
                  <Route path="league/*" element={<LeaguePage />} />
                  <Route path="bagrut" element={<BagrutPage />} />
                  <Route path="benefits" element={<BenefitsPage />} />
                  <Route path="services" element={<ServicesPage />} />
                  <Route path="activities" element={<ActivitiesPage />} />
                  <Route path="activities/:id" element={<ActivitiesPage />} />
                  <Route path="verify" element={<VerifyPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
          <UpdatePrompt />
        </PublicDataProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
