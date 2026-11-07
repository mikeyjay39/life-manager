import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';

/**
 * Car Manager shell. Child stories fill each section.
 *
 * ```
 * User -> CarScreen : open Car Manager
 * CarScreen -> CarsSection : empty state
 * CarScreen -> MaintenanceSection : empty state
 * CarScreen -> ChartsSection : empty state
 * ```
 */
export default function CarScreen() {
  const { assets, headerBackground } = useTenantBranding();

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
        <ThemedText accessibilityLabel="Cars empty state">
          No cars yet. Add a car in a later story.
        </ThemedText>
      </ThemedView>

      <ThemedView
        style={styles.section}
        accessibilityLabel="Maintenance section">
        <ThemedText type="subtitle">Maintenance</ThemedText>
        <ThemedText accessibilityLabel="Maintenance empty state">
          No maintenance history yet. Log events in a later story.
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.section} accessibilityLabel="Charts section">
        <ThemedText type="subtitle">Charts</ThemedText>
        <ThemedText accessibilityLabel="Charts empty state">
          Charts appear here after you add cars and events.
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
