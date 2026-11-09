import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import type { ResolvedManagerTile } from '@/tenants/life-manager/manager-registry';
import {
  MANAGER_HUB_ICON_SIZE,
  createManagerHubTileChrome,
} from '@/tenants/life-manager/manager-nav-chrome';

export type ManagerHubTileProps = {
  tile: ResolvedManagerTile;
  onPressAvailable: (route: string) => void;
};

/**
 * One hub launcher tile. Available tiles navigate; Coming soon tiles stay visible.
 * Icons and labels come from manager-registry; sizes from manager-nav-chrome.
 */
export function ManagerHubTile({ tile, onPressAvailable }: ManagerHubTileProps) {
  const palette = useColorPalette();
  const isAvailable = tile.status === 'available';

  const chrome = useMemo(
    () => createManagerHubTileChrome(palette, isAvailable),
    [palette, isAvailable]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        tile: chrome.tile,
        label: chrome.label,
        status: chrome.status,
      }),
    [chrome]
  );

  const accessibilityLabel = isAvailable
    ? tile.label
    : `${tile.label}, ${tile.disabledReason}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !isAvailable }}
      disabled={!isAvailable}
      onPress={() => {
        if (tile.status === 'available') {
          onPressAvailable(tile.route);
        }
      }}
      style={({ pressed }) => [
        styles.tile,
        isAvailable && pressed ? { opacity: 0.75 } : null,
      ]}>
      <IconSymbol
        name={tile.icon}
        size={MANAGER_HUB_ICON_SIZE}
        color={chrome.iconColor}
      />
      <Text style={styles.label}>{tile.label}</Text>
      {!isAvailable ? (
        <Text style={styles.status}>{tile.disabledReason}</Text>
      ) : (
        <View style={{ height: 14 }} />
      )}
    </Pressable>
  );
}
