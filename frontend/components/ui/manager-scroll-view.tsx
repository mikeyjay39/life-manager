import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import AppMenuBar from '@/components/app-menu-bar';
import { ThemedView } from '@/components/themed-view';
import { ManagerPageContent } from '@/components/ui/manager-page-content';
import { ManagerPageHeader } from '@/components/ui/manager-page-header';
import { MANAGER_PAGE_PADDING_Y } from '@/components/ui/manager-layout';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ManagerScrollViewProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  testID?: string;
}>;

/**
 * Quiet manager page shell: sticky menu, compact title, no parallax header image.
 *
 * ```
 * User -> ManagerScrollView : open manager screen
 * ManagerScrollView -> AppMenuBar : sticky under scroll top
 * ManagerScrollView -> ManagerPageHeader : title [+ subtitle]
 * ManagerScrollView -> ManagerPageContent : constrain body width
 * ManagerPageContent -> children : manager sections / sticky filter chrome
 * note page body overflow visible so web CSS sticky filters can pin
 * ```
 */
export function ManagerScrollView({
  title,
  subtitle,
  children,
  testID,
}: ManagerScrollViewProps) {
  const backgroundColor = useThemeColor({}, 'background');

  return (
    <ScrollView
      style={{ backgroundColor, flex: 1 }}
      stickyHeaderIndices={[0]}
      testID={testID}
      accessibilityLabel={`${title} page`}>
      <AppMenuBar />
      <ThemedView style={styles.content}>
        <ManagerPageContent testID="manager-page-content">
          <ManagerPageHeader title={title} subtitle={subtitle} />
          {children}
        </ManagerPageContent>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingVertical: MANAGER_PAGE_PADDING_Y,
    // Keep visible so ManagerStickyFilterChrome CSS sticky can stick under AppMenuBar.
    overflow: 'visible',
  },
});
