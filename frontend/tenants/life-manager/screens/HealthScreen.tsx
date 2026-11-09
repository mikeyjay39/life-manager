import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ManagerScrollView } from '@/components/ui/manager-scroll-view';
import type { HealthMemberDto } from '@/lib/api/types';
import {
  loadUnitPreference,
  saveUnitPreference,
  type UnitSystem,
} from '@/lib/health/units';
import DoctorVisitPanel from '@/tenants/life-manager/components/doctor-visit-panel';
import HealthChartsPanel from '@/tenants/life-manager/components/health-charts-panel';
import HealthMemberPanel from '@/tenants/life-manager/components/health-member-panel';
import HealthReadingPanel from '@/tenants/life-manager/components/health-reading-panel';

/**
 * Health Manager shell. Child stories fill each section.
 *
 * ```
 * User -> HealthScreen : open Health
 * HealthScreen -> ManagerScrollView : quiet chrome (no parallax)
 * HealthScreen -> PrefStore : loadUnitPreference (saved, else locale default)
 * HealthScreen -> HealthMemberPanel : render; onSelectedMemberChange
 * HealthMemberPanel -> HealthScreen : selected member | null
 * HealthScreen -> HealthReadingPanel : selectedMember + shared unitSystem
 * HealthScreen -> HealthChartsPanel : healthMember + shared unitSystem + refreshKey
 * HealthReadingPanel -> API : list / create / update / delete readings
 * HealthReadingPanel -> HealthScreen : onReadingsChanged (bump refreshKey)
 * HealthChartsPanel -> API : list readings for charts
 * HealthScreen -> DoctorVisitPanel : selectedMember
 * DoctorVisitPanel -> API : list / create / update / delete visits
 * ```
 */
export default function HealthScreen() {
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
    <ManagerScrollView title="Health Manager">
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
        <DoctorVisitPanel selectedMember={selectedMember} />
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
