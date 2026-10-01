import { Outlet, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Toaster } from "@/components/ui/sonner";

// Minimal app shell — provides only the layout frame: it owns the single
// `min-h-screen`, mounts the <Toaster/>, and plays a subtle entrance on each
// route. It deliberately ships NO navigation chrome. Decide per app what fits:
//   • a top navbar  → add a sticky <header> above <main> with <Link>s,
//   • a sidebar     → replace <main> with `SidebarInset`; never render both,
//   • or nothing    → single-screen / focused apps often need no nav at all.
// When you add nav, map over `routes` from `@/routes` so route + nav stay in sync.
// Pages fill <main flex-1> with `h-full`; never add `min-h-screen` inside a page.
export function AppShell() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col">
        {/* key on pathname → each route re-mounts and replays the entrance.
            Entrance-only (no AnimatePresence/exit): an exit animation around
            <Outlet/> would animate the NEXT route's content, not the leaving one. */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="flex-1"
        >
          <Outlet />
        </motion.div>
      </main>
      <Toaster />
    </div>
  );
}

export default AppShell;
