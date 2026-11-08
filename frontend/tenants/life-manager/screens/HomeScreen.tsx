import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTenant } from '@/lib/tenant/TenantContext';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';
import { ManagerHubTile } from '@/tenants/life-manager/components/manager-hub-tile';
import { resolveManagerTiles } from '@/tenants/life-manager/manager-registry';

/**
 * Signed-in Home hub. One job: launch managers via icon tiles.
 *
 * ```
 * User -> HomeScreen : open Home
 * HomeScreen -> Registry : resolveManagerTiles(screens)
 * alt available (screen registered)
 *   User -> HomeScreen : press Documents / Health / Cars
 *   HomeScreen -> Router : replace route
 * else Coming soon
 *   note right of HomeScreen: tile visible; no navigation
 * end
 * ```
 */
export default function HomeScreen() {
  const { tenant } = useTenant();
  const { copy, assets, headerBackground } = useTenantBranding();
  const tiles = resolveManagerTiles(tenant.screens);

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
      </ThemedView>
      <ThemedView style={styles.hubSection} accessibilityLabel="Manager hub">
        <ThemedText type="subtitle">Managers</ThemedText>
        <View style={styles.tileGrid}>
          {tiles.map((tile) => (
            <ManagerHubTile
              key={tile.id}
              tile={tile}
              onPressAvailable={(route) => {
                router.replace(route);
              }}
            />
          ))}
        </View>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  hubSection: {
    gap: 12,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
  },
  headerImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
});
