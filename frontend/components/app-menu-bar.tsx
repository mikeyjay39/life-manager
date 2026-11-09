import { router, usePathname } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/lib/tenant/TenantContext';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import {
  isManagerRouteActive,
  resolveRegisteredManagerMenuItems,
  type ManagerIconName,
} from '@/tenants/life-manager/manager-registry';
import {
  MANAGER_MENU_ICON_SIZE,
  createManagerMenuItemChrome,
} from '@/tenants/life-manager/manager-nav-chrome';

type MenuIcon = 'house.fill' | ManagerIconName | 'rectangle.portrait.and.arrow.right';

type MenuItem = {
  key: string;
  label: string;
  icon: MenuIcon;
  accessibilityLabel: string;
  onPress: () => void;
  isActive?: boolean;
};

/**
 * Top app menu. Manager links come from the life-manager registry when registered.
 * Always keeps Home and Log Out. test-tenant has no optional screens → Home + Log Out only.
 *
 * Follow-up: if many managers crowd this bar, consider a compact overflow control.
 * Do not add a hamburger in MVP unless the bar is actually crowded.
 *
 * sequenceDiagram
 *   participant User
 *   participant Menu as AppMenuBar
 *   participant Registry as resolveRegisteredManagerMenuItems
 *   participant Router as expo-router
 *   User->>Menu: open menu
 *   Menu->>Registry: tenant.screens
 *   Registry-->>Menu: registered managers (Documents, Health, Cars)
 *   User->>Menu: press Home / manager / Log Out
 *   alt Home
 *     Menu->>Router: replace /(tabs)
 *   else registered manager
 *     Menu->>Router: replace entry.route
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

  const managerItems = resolveRegisteredManagerMenuItems(tenant.screens);

  const isHomeActive =
    pathname === '/' || pathname === '/(tabs)' || pathname.endsWith('/index');

  const menuChrome = useMemo(
    () => createManagerMenuItemChrome(palette),
    [palette]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: 'row',
          backgroundColor: palette.surface,
          borderBottomWidth: 1,
          borderBottomColor: palette.border,
          ...(Platform.OS === 'web'
            ? ({
                position: 'sticky',
                top: 0,
                zIndex: 10,
              } as const)
            : {}),
        },
        item: menuChrome.item,
        itemActive: menuChrome.itemActive,
        label: menuChrome.label,
        labelActive: menuChrome.labelActive,
      }),
    [palette, menuChrome]
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

  for (const entry of managerItems) {
    items.push({
      key: entry.id,
      label: entry.label,
      icon: entry.icon,
      accessibilityLabel: entry.label,
      isActive: isManagerRouteActive(pathname, entry.route),
      onPress: () => {
        router.replace(entry.route);
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
          const isActive = item.isActive === true;
          const iconColor = isActive
            ? menuChrome.iconColorActive
            : menuChrome.iconColor;
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel}
              accessibilityState={{ selected: isActive }}
              style={[styles.item, isActive ? styles.itemActive : null]}>
              <IconSymbol
                name={item.icon}
                size={MANAGER_MENU_ICON_SIZE}
                color={iconColor}
              />
              <Text style={[styles.label, isActive ? styles.labelActive : null]}>
                {item.label}
              </Text>
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
