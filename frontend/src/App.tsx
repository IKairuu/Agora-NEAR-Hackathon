import { useEffect } from 'react';
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration, useNavigate } from 'react-router';
import { Home } from './landing/Home';
import { setNavigate } from './store/actions';
import { SvgDefs } from './ui/icons';
import { ModalHost, Toasts, Tour } from './ui/Overlays';
import { Agents, Mandate, Wallet } from './views/agents';
import { Ask, Dash, Explore, Jobs, Ojob, Post, Saved, Svc } from './views/hire';
import { Chat, Job, Room } from './views/job';
import { Dispute, Profile, Sell, Seller } from './views/market';
import { Orders } from './views/orders';

/** Root layout: shared SVG defs, the page, and the overlays that sit above every page. */
function Root() {
  const navigate = useNavigate();
  useEffect(() => { setNavigate((to) => { void navigate(to); }); }, [navigate]);
  return (
    <>
      <SvgDefs />
      <Outlet />
      <div id="tourbox"><Tour /></div>
      <ModalHost />
      <Toasts />
      <ScrollRestoration />
    </>
  );
}

/* Route names match the prototype's screens. Unknown paths show the landing page, as the prototype does. */
const router = createBrowserRouter([{
  element: <Root />,
  children: [
    { path: '/', element: <Home /> },
    { path: '/ask', element: <Ask /> },
    { path: '/dash', element: <Dash /> },
    { path: '/jobs', element: <Jobs /> },
    { path: '/explore', element: <Explore /> },
    { path: '/openjobs', element: <Explore sell /> },
    { path: '/orders', element: <Orders /> },
    { path: '/ojob', element: <Ojob /> },
    { path: '/svc', element: <Svc /> },
    { path: '/saved', element: <Saved /> },
    { path: '/post', element: <Post /> },
    { path: '/job', element: <Job /> },
    { path: '/chat', element: <Chat /> },
    { path: '/room', element: <Room /> },
    { path: '/agents', element: <Agents /> },
    { path: '/mandate', element: <Mandate /> },
    { path: '/wallet', element: <Wallet /> },
    { path: '/profile', element: <Profile /> },
    { path: '/sell', element: <Sell /> },
    { path: '/seller', element: <Seller /> },
    { path: '/dispute', element: <Dispute /> },
    { path: '*', element: <Home /> },
  ],
}]);

export default function App() {
  return <RouterProvider router={router} />;
}
