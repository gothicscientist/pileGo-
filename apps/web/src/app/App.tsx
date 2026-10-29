import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Spinner } from '~/components/ui';
import { useAuth } from '~/lib/auth';
import { isConfigured } from '~/lib/supabase';
import { ExtensionPage } from '~/routes/ExtensionPage';
import { Pile } from '~/routes/Pile';
import { Privacy } from '~/routes/Privacy';
import { SetupNeeded } from '~/routes/SetupNeeded';
import { SignIn } from '~/routes/SignIn';
import { Shell } from './Shell';

const Closet = lazy(() => import('~/routes/Closet').then(m => ({ default: m.Closet })));
const Scan = lazy(() => import('~/routes/Scan').then(m => ({ default: m.Scan })));
const ItemPage = lazy(() => import('~/routes/ItemPage').then(m => ({ default: m.ItemPage })));
const OutThere = lazy(() => import('~/routes/OutThere').then(m => ({ default: m.OutThere })));
const Insights = lazy(() => import('~/routes/Insights').then(m => ({ default: m.Insights })));
const SettingsPage = lazy(() => import('~/routes/Settings').then(m => ({ default: m.SettingsPage })));
const PhoneCapture = lazy(() => import('~/routes/PhoneCapture').then(m => ({ default: m.PhoneCapture })));
const NotFound = lazy(() => import('~/routes/NotFound').then(m => ({ default: m.NotFound })));

function Loading() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Spinner />
    </div>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (!isConfigured) return <SetupNeeded />;
  if (loading) return <Loading />;
  if (!session) return <SignIn />;
  return <>{children}</>;
}

const page = (node: ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>;

const router = createBrowserRouter([
  { path: '/privacy', element: <Privacy /> },
  { path: '/extension', element: <ExtensionPage /> },
  // Opened from the scan's QR code on a phone that is not signed in.
  { path: '/phone/:session', element: page(<PhoneCapture />) },
  { path: '/signin', element: <Navigate to="/" replace /> },
  {
    element: (
      <Gate>
        <Shell />
      </Gate>
    ),
    children: [
      { index: true, element: <Pile /> },
      { path: 'closet', element: page(<Closet />) },
      { path: 'scan', element: page(<Scan />) },
      { path: 'item/:id', element: page(<ItemPage />) },
      { path: 'out', element: page(<OutThere />) },
      { path: 'insights', element: page(<Insights />) },
      { path: 'settings', element: page(<SettingsPage />) },
      { path: '*', element: page(<NotFound />) },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
