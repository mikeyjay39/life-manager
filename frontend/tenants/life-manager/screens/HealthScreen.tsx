import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';

/**
 * Health Manager shell. Child stories fill each section.
 *
 * activityDiagram
 *   [*] --> ShowShell
 *   ShowShell --> HealthMembersPlaceholder : #115
 *   ShowShell --> VitalsPlaceholder : #109-#111
 *   ShowShell --> DoctorVisitsPlaceholder : #114
 *   HealthMembersPlaceholder --> [*]
 *   VitalsPlaceholder --> [*]
 *   DoctorVisitsPlaceholder --> [*]
 */
export default function HealthScreen() {
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
          Health Manager
        </ThemedText>
      </ThemedView>

      <ThemedView
        style={styles.section}
        accessibilityLabel="HealthMembers section">
        <ThemedText type="subtitle">HealthMembers</ThemedText>
        <ThemedText>
          Placeholder: create, update, and deactivate HealthMembers (#115).
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.section} accessibilityLabel="Vitals section">
        <ThemedText type="subtitle">Vitals</ThemedText>
        <ThemedText>
          Placeholder: vitals form, history, and charts (#109–#111).
        </ThemedText>
      </ThemedView>

      <ThemedView
        style={styles.section}
        accessibilityLabel="Doctor visits section">
        <ThemedText type="subtitle">Doctor visits</ThemedText>
        <ThemedText>
          Placeholder: doctor visit diary (#114).
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
