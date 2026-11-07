import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { HealthMemberDto } from '@/lib/api/types';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';
import HealthChartsPanel from '@/tenants/life-manager/components/health-charts-panel';
import HealthMemberPanel from '@/tenants/life-manager/components/health-member-panel';
import HealthReadingPanel from '@/tenants/life-manager/components/health-reading-panel';

/**
 * Health Manager shell. Child stories fill each section.
 *
 * ```
 * User -> HealthScreen : open Health
 * HealthScreen -> HealthMemberPanel : render; onSelectedMemberChange
 * HealthMemberPanel -> HealthScreen : selected member | null
 * HealthScreen -> HealthReadingPanel : selectedMember (#109)
 * HealthScreen -> HealthChartsPanel : healthMember (#110)
 * HealthReadingPanel -> API : list / create readings for member
 * HealthChartsPanel -> API : list readings for charts
 * HealthScreen -> DoctorVisitsPlaceholder : #114
 * ```
 */
export default function HealthScreen() {
  const { assets, headerBackground } = useTenantBranding();
  const [selectedMember, setSelectedMember] = useState<HealthMemberDto | null>(
    null
  );

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
        <HealthReadingPanel selectedMember={selectedMember} />
      </ThemedView>

      <ThemedView style={styles.section} accessibilityLabel="Charts section">
        <ThemedText type="subtitle">Charts</ThemedText>
        <HealthChartsPanel healthMember={selectedMember} />
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
