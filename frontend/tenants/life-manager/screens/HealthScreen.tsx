import { useCallback, useEffect, useState } from 'react';

import { ManagerScrollView } from '@/components/ui/manager-scroll-view';
import { ManagerSection } from '@/components/ui/manager-section';
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
 * Health Manager shell. Child panels own each section body.
 *
 * ```
 * User -> HealthScreen : open Health
 * HealthScreen -> ManagerScrollView : quiet chrome (no parallax)
 * HealthScreen -> PrefStore : loadUnitPreference (saved, else locale default)
 * HealthScreen -> HealthMemberPanel : ManagerSection + Create/Refresh toolbar
 * HealthMemberPanel -> HealthScreen : selected member | null
 * HealthScreen -> ManagerSection : Vitals / Charts / Doctor visits chrome
 * HealthScreen -> HealthReadingPanel : selectedMember + shared unitSystem
 * HealthReadingPanel -> ManagerFormVsResults : collapsed create; Add reading on demand
 * HealthScreen -> HealthChartsPanel : healthMember + shared unitSystem + refreshKey
 * HealthReadingPanel -> API : list / create / update / delete readings
 * HealthReadingPanel -> HealthScreen : onReadingsChanged (bump refreshKey)
 * HealthChartsPanel -> API : list readings for charts
 * HealthScreen -> DoctorVisitPanel : selectedMember
 * DoctorVisitPanel -> ManagerFormVsResults : collapsed create; Add visit on demand
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
      <HealthMemberPanel onSelectedMemberChange={setSelectedMember} />

      <ManagerSection title="Vitals" accessibilityLabel="Vitals section">
        <HealthReadingPanel
          selectedMember={selectedMember}
          unitSystem={unitSystem}
          onUnitSystemChange={handleUnitSystemChange}
          unitPreferenceReady={unitPreferenceReady}
          onReadingsChanged={handleReadingsChanged}
        />
      </ManagerSection>

      <ManagerSection title="Charts" accessibilityLabel="Charts section">
        <HealthChartsPanel
          healthMember={selectedMember}
          unitSystem={unitSystem}
          onUnitSystemChange={handleUnitSystemChange}
          unitPreferenceReady={unitPreferenceReady}
          refreshKey={readingsRefreshKey}
        />
      </ManagerSection>

      <ManagerSection
        title="Doctor visits"
        accessibilityLabel="Doctor visits section"
      >
        <DoctorVisitPanel selectedMember={selectedMember} />
      </ManagerSection>
    </ManagerScrollView>
  );
}
