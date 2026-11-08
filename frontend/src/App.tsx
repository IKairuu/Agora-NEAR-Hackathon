import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import { Hire } from './pages/Hire';
import { Landing } from './pages/Landing';
import { Role } from './pages/Role';
import { SellerOnboarding } from './pages/SellerOnboarding';
import { Start } from './pages/Start';
import { getSession, nextPathFor } from './lib/auth';

function AppIndex() {
  return <Navigate to={nextPathFor(getSession())} replace />;
}

/** Root layout: every page starts at the top; back/forward restores where you were. */
function Root() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  );
}

const router = createBrowserRouter([{ element: <Root />, children: [
  { path: '/', element: <Landing /> },
  { path: '/start', element: <Start /> },
  { path: '/start/role', element: <Role /> },
  { path: '/app', element: <AppIndex /> },
  { path: '/app/hire', element: <Hire /> },
  // keyed so switching between the two seller types starts a fresh wizard
  { path: '/app/freelancer', element: <SellerOnboarding key="freelancer" kind="freelancer" /> },
  { path: '/app/agent', element: <SellerOnboarding key="agent" kind="agent" /> },
  { path: '*', element: <Navigate to="/" replace /> },
] }]);

export default function App() {
  return <RouterProvider router={router} />;
}
