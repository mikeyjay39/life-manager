import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { CarDto } from '@/lib/api/types';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';
import CarPanel from '@/tenants/life-manager/components/car-panel';

/**
 * Car Manager shell. Child stories fill maintenance and charts.
 *
 * ```
 * User -> CarScreen : open Car Manager
 * CarScreen -> CarPanel : render; onSelectedCarChange
 * CarPanel -> API : GET/POST/PUT/DELETE /cars; GET /documents
 * CarPanel -> CarScreen : selected car | null
 * CarScreen -> MaintenanceSection : empty (later story; uses selected car)
 * CarScreen -> ChartsSection : empty (later story; uses selected car)
 * ```
 */
export default function CarScreen() {
  const { assets, headerBackground } = useTenantBranding();
  const [selectedCar, setSelectedCar] = useState<CarDto | null>(null);

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
        <ThemedText accessibilityLabel="Maintenance empty state">
          {selectedCar
            ? 'No maintenance history yet. Log events in a later story.'
            : 'Select a car to manage maintenance in a later story.'}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.section} accessibilityLabel="Charts section">
        <ThemedText type="subtitle">Charts</ThemedText>
        <ThemedText accessibilityLabel="Charts empty state">
          {selectedCar
            ? 'Charts appear here after you add events.'
            : 'Select a car to see charts in a later story.'}
        </ThemedText>
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
