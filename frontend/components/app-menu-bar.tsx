import { router, usePathname } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/lib/tenant/TenantContext';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import { withAlpha } from '@/lib/tenant/theme/color-utils';

type MenuIcon = 'house.fill' | 'heart.fill' | 'rectangle.portrait.and.arrow.right';

type MenuItem = {
  key: string;
  label: string;
  icon: MenuIcon;
  accessibilityLabel: string;
  onPress: () => void;
  isActive?: boolean;
};

/**
 * Top app menu. Shows Health only when the tenant registers screens.Health.
 *
 * sequenceDiagram
 *   participant User
 *   participant Menu as AppMenuBar
 *   participant Router as expo-router
 *   User->>Menu: press Home / Health / Log Out
 *   alt Home
 *     Menu->>Router: replace /(tabs)
 *   else Health (when registered)
 *     Menu->>Router: replace /(tabs)/health
 *   else Log Out
 *     Menu->>Menu: confirm then logout
 *   end
 */
export default function AppMenuBar() {
  const palette = useColorPalette();
  const pathname = usePathname();
  const { logout } = useAuth();
  const { tenant } = useTenant();
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);

  const hasHealth = Boolean(tenant.screens.Health);

  const isHomeActive =
    pathname === '/' || pathname === '/(tabs)' || pathname.endsWith('/index');
  const isHealthActive =
    pathname === '/health' ||
    pathname === '/(tabs)/health' ||
    pathname.endsWith('/health');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: 'row',
          backgroundColor: palette.background,
          borderBottomWidth: 1,
          borderBottomColor: withAlpha(palette.icon, 0.35),
          ...(Platform.OS === 'web'
            ? ({
                position: 'sticky',
                top: 0,
                zIndex: 10,
              } as const)
            : {}),
        },
        item: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10,
          gap: 4,
        },
        label: {
          fontSize: 12,
          fontWeight: '500',
        },
      }),
    [palette]
  );

  const handleConfirmLogout = () => {
    setLogoutDialogVisible(false);
    void (async () => {
      await logout();
      router.replace('/login');
    })();
  };

  const items: MenuItem[] = [
    {
      key: 'home',
      label: 'Home',
      icon: 'house.fill',
      accessibilityLabel: 'Home',
      isActive: isHomeActive,
      onPress: () => {
        router.replace('/(tabs)');
      },
    },
  ];

  if (hasHealth) {
    items.push({
      key: 'health',
      label: 'Health',
      icon: 'heart.fill',
      accessibilityLabel: 'Health',
      isActive: isHealthActive,
      onPress: () => {
        router.replace('/(tabs)/health');
      },
    });
  }

  items.push({
    key: 'logout',
    label: 'Log Out',
    icon: 'rectangle.portrait.and.arrow.right',
    accessibilityLabel: 'Log out',
    onPress: () => setLogoutDialogVisible(true),
  });

  return (
    <>
      <View style={styles.container}>
        {items.map((item) => {
          const color = item.isActive ? palette.tint : palette.icon;
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel}
              accessibilityState={{ selected: item.isActive === true }}
              style={styles.item}>
              <IconSymbol name={item.icon} size={24} color={color} />
              <Text style={[styles.label, { color }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ConfirmDialog
        visible={logoutDialogVisible}
        title="Log Out"
        message="Are you sure you want to log out?"
        confirmLabel="Log Out"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setLogoutDialogVisible(false)}
        onConfirm={handleConfirmLogout}
      />
    </>
  );
}
