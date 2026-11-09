import { useCallback, useState } from 'react';

import { ManagerScrollView } from '@/components/ui/manager-scroll-view';
import { ManagerSection } from '@/components/ui/manager-section';
import type { CarDto } from '@/lib/api/types';
import CarChartsPanel from '@/tenants/life-manager/components/car-charts-panel';
import CarMaintenancePanel from '@/tenants/life-manager/components/car-maintenance-panel';
import CarPanel from '@/tenants/life-manager/components/car-panel';

/**
 * Car Manager screen: Cars picker, maintenance history, and charts.
 *
 * ```
 * User -> CarScreen : open Car Manager
 * CarScreen -> ManagerScrollView : quiet chrome (no parallax)
 * CarScreen -> ManagerSection : Cars / Maintenance / Charts
 * CarScreen -> CarPanel : render; onSelectedCarChange
 * CarPanel -> API : GET/POST/PUT/DELETE /cars; GET /documents
 * CarPanel -> CarScreen : selected car | null
 * CarScreen -> CarMaintenancePanel : selectedCar + onEventsChanged
 * CarMaintenancePanel -> API : GET/POST/PUT/DELETE /car-maintenance-events; GET /documents
 * CarMaintenancePanel -> CarScreen : onEventsChanged (bump refreshKey)
 * CarScreen -> CarChartsPanel : selectedCar + refreshKey
 * CarChartsPanel -> API : GET /car-maintenance-events for charts
 * ```
 */
export default function CarScreen() {
  const [selectedCar, setSelectedCar] = useState<CarDto | null>(null);
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);

  const handleEventsChanged = useCallback(() => {
    setEventsRefreshKey((n) => n + 1);
  }, []);

  return (
    <ManagerScrollView title="Car Manager">
      <ManagerSection title="Cars" accessibilityLabel="Cars section">
        <CarPanel onSelectedCarChange={setSelectedCar} />
      </ManagerSection>

      <ManagerSection
        title="Maintenance"
        accessibilityLabel="Maintenance section">
        <CarMaintenancePanel
          selectedCar={selectedCar}
          onEventsChanged={handleEventsChanged}
        />
      </ManagerSection>

      <ManagerSection title="Charts" accessibilityLabel="Charts section">
        <CarChartsPanel
          selectedCar={selectedCar}
          refreshKey={eventsRefreshKey}
        />
      </ManagerSection>
    </ManagerScrollView>
  );
}
