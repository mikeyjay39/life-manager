import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ManagerScrollView } from '@/components/ui/manager-scroll-view';
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
      <ThemedView style={styles.section} accessibilityLabel="Cars section">
        <ThemedText type="subtitle">Cars</ThemedText>
        <CarPanel onSelectedCarChange={setSelectedCar} />
      </ThemedView>

      <ThemedView
        style={styles.section}
        accessibilityLabel="Maintenance section">
        <ThemedText type="subtitle">Maintenance</ThemedText>
        <CarMaintenancePanel
          selectedCar={selectedCar}
          onEventsChanged={handleEventsChanged}
        />
      </ThemedView>

      <ThemedView style={styles.section} accessibilityLabel="Charts section">
        <ThemedText type="subtitle">Charts</ThemedText>
        <CarChartsPanel
          selectedCar={selectedCar}
          refreshKey={eventsRefreshKey}
        />
      </ThemedView>
    </ManagerScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
    marginBottom: 8,
  },
});
