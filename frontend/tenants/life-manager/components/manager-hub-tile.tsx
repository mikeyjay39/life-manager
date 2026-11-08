import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import { withAlpha } from '@/lib/tenant/theme/color-utils';
import type { ResolvedManagerTile } from '@/tenants/life-manager/manager-registry';

export type ManagerHubTileProps = {
  tile: ResolvedManagerTile;
  onPressAvailable: (route: string) => void;
};

/**
 * One hub launcher tile. Available tiles navigate; Coming soon tiles stay visible.
 */
export function ManagerHubTile({ tile, onPressAvailable }: ManagerHubTileProps) {
  const palette = useColorPalette();
  const isAvailable = tile.status === 'available';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        tile: {
          width: '30%',
          minWidth: 96,
          maxWidth: 140,
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 16,
          paddingHorizontal: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: withAlpha(palette.icon, isAvailable ? 0.35 : 0.2),
          backgroundColor: isAvailable
            ? withAlpha(palette.tint, 0.08)
            : withAlpha(palette.icon, 0.06),
          gap: 8,
        },
        label: {
          fontSize: 14,
          fontWeight: '600',
          color: isAvailable ? palette.text : withAlpha(palette.text, 0.55),
          textAlign: 'center',
        },
        status: {
          fontSize: 11,
          fontWeight: '500',
          color: withAlpha(palette.icon, 0.85),
          textAlign: 'center',
        },
      }),
    [palette, isAvailable]
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
        size={36}
        color={isAvailable ? palette.tint : withAlpha(palette.icon, 0.55)}
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
