import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTenant } from '@/lib/tenant/TenantContext';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';

/**
 * Signed-in Home shell. Document Manager owns create/list UI (see Documents menu).
 *
 * ```
 * User -> HomeScreen : open Home
 * HomeScreen -> Branding : title + header image
 * note right of HomeScreen: Documents UI lives on DocumentManagerScreen
 * ```
 */
export default function HomeScreen() {
  const { tenant } = useTenant();
  const { copy, assets, headerBackground } = useTenantBranding();

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
        <ThemedText type="title">
          {tenant.displayName}
          {copy.homeTitleSuffix}
        </ThemedText>
        <HelloWave />
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
  headerImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
});
