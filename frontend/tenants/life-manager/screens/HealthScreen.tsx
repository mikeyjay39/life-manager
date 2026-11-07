import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { HealthMemberDto } from '@/lib/api/types';
import {
  loadUnitPreference,
  saveUnitPreference,
  type UnitSystem,
} from '@/lib/health/units';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';
import HealthChartsPanel from '@/tenants/life-manager/components/health-charts-panel';
import HealthMemberPanel from '@/tenants/life-manager/components/health-member-panel';
import HealthReadingPanel from '@/tenants/life-manager/components/health-reading-panel';

/**
 * Health Manager shell. Child stories fill each section.
 *
 * ```
 * User -> HealthScreen : open Health
 * HealthScreen -> PrefStore : loadUnitPreference
 * HealthScreen -> HealthMemberPanel : render; onSelectedMemberChange
 * HealthMemberPanel -> HealthScreen : selected member | null
 * HealthScreen -> HealthReadingPanel : selectedMember + shared unitSystem
 * HealthScreen -> HealthChartsPanel : healthMember + shared unitSystem + refreshKey
 * HealthReadingPanel -> API : list / create / update / delete readings
 * HealthReadingPanel -> HealthScreen : onReadingsChanged (bump refreshKey)
 * HealthChartsPanel -> API : list readings for charts
 * HealthScreen -> DoctorVisitsPlaceholder : #114
 * ```
 */
export default function HealthScreen() {
  const { assets, headerBackground } = useTenantBranding();
  const [selectedMember, setSelectedMember] = useState<HealthMemberDto | null>(
    null
  );
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [unitPreferenceReady, setUnitPreferenceReady] = useState(false);
  const [readingsRefreshKey, setReadingsRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const preferred = await loadUnitPreference();
      if (!cancelled) {
        setUnitSystem(preferred);
        setUnitPreferenceReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUnitSystemChange = useCallback(async (next: UnitSystem) => {
    setUnitSystem(next);
    try {
      await saveUnitPreference(next);
    } catch {
      // Preference write failed; keep UI mode for this session.
    }
  }, []);

  const handleReadingsChanged = useCallback(() => {
    setReadingsRefreshKey((n) => n + 1);
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
          Health Manager
        </ThemedText>
      </ThemedView>

      <ThemedView
        style={styles.section}
        accessibilityLabel="HealthMembers section">
        <ThemedText type="subtitle">HealthMembers</ThemedText>
        <HealthMemberPanel onSelectedMemberChange={setSelectedMember} />
      </ThemedView>

      <ThemedView style={styles.section} accessibilityLabel="Vitals section">
        <ThemedText type="subtitle">Vitals</ThemedText>
        <HealthReadingPanel
          selectedMember={selectedMember}
          unitSystem={unitSystem}
          onUnitSystemChange={handleUnitSystemChange}
          unitPreferenceReady={unitPreferenceReady}
          onReadingsChanged={handleReadingsChanged}
        />
      </ThemedView>

      <ThemedView style={styles.section} accessibilityLabel="Charts section">
        <ThemedText type="subtitle">Charts</ThemedText>
        <HealthChartsPanel
          healthMember={selectedMember}
          unitSystem={unitSystem}
          onUnitSystemChange={handleUnitSystemChange}
          unitPreferenceReady={unitPreferenceReady}
          refreshKey={readingsRefreshKey}
        />
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
