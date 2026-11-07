import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { CarDto } from '@/lib/api/types';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';
import CarChartsPanel from '@/tenants/life-manager/components/car-charts-panel';
import CarMaintenancePanel from '@/tenants/life-manager/components/car-maintenance-panel';
import CarPanel from '@/tenants/life-manager/components/car-panel';

/**
 * Car Manager screen: Cars picker, maintenance history, and charts.
 *
 * ```
 * User -> CarScreen : open Car Manager
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
  const { assets, headerBackground } = useTenantBranding();
  const [selectedCar, setSelectedCar] = useState<CarDto | null>(null);
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);

  const handleEventsChanged = useCallback(() => {
    setEventsRefreshKey((n) => n + 1);
  }, []);

  return (
    <ParallaxScrollView
      headerBackgroundColor={headerBackground}
      headerImage={
        <Image
          source={assets.headerImage}
          style={styles.headerImage}
          contentFit="cover"
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title" accessibilityRole="header">
          Car Manager
        </ThemedText>
      </ThemedView>

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
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  section: {
    gap: 8,
    marginBottom: 8,
  },
  headerImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
});
