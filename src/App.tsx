import { Route, Routes } from "react-router";
import { AppShell } from "@/components/AppShell";
import { Chart } from "@/pages/Chart";
import { NotFound } from "@/pages/NotFound";
import { LiveFeed } from "@/victim/pages/LiveFeed";
import { NewShipment } from "@/victim/pages/NewShipment";
import { Overview } from "@/victim/pages/Overview";
import { Settings } from "@/victim/pages/Settings";
import { ShipmentDetail } from "@/victim/pages/ShipmentDetail";
import { Shipments } from "@/victim/pages/Shipments";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="shipments" element={<Shipments />} />
        <Route path="shipments/new" element={<NewShipment />} />
        <Route path="shipments/:id" element={<ShipmentDetail />} />
        <Route path="feed" element={<LiveFeed />} />
        <Route path="chart" element={<Chart />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
