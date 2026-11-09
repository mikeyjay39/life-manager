import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingFn,
  type SortingState,
} from '@tanstack/react-table';
import type { DocumentDto } from '@/lib/api/types';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  MANAGER_DATA_CELL_GAP,
  MANAGER_DATA_ROW_PADDING_X,
  MANAGER_DATA_ROW_PADDING_Y,
} from '@/components/ui/manager-layout';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import { withAlpha } from '@/lib/tenant/theme/color-utils';
import { createDocumentSortingFns, formatDocumentCellValue } from './document-grid-utils';

const PRIMARY_DOCUMENT_COLUMNS = new Set(['title']);

export type DocumentGridProps = {
  documents: DocumentDto[];
  onRowPress: (doc: DocumentDto) => void;
};

const DOCUMENT_GRID_COLUMN_SIZES = {
  title: 160,
  content: 240,
  tags: 180,
  created_at: 110,
  issued_date: 110,
  expire_date: 110,
  storage: 160,
} as const;

export const DOCUMENT_GRID_WIDTH = Object.values(DOCUMENT_GRID_COLUMN_SIZES).reduce(
  (sum, width) => sum + width,
  0
);

const columnHelper = createColumnHelper<DocumentDto>();

function buildColumns(sortingFns: Record<string, SortingFn<DocumentDto>>) {
  return [
    columnHelper.accessor('title', {
      header: 'Title',
      size: DOCUMENT_GRID_COLUMN_SIZES.title,
      sortingFn: sortingFns.title,
      cell: (info) => formatDocumentCellValue(info.row.original, 'title'),
    }),
    columnHelper.accessor('content', {
      header: 'Content',
      size: DOCUMENT_GRID_COLUMN_SIZES.content,
      sortingFn: sortingFns.content,
      cell: (info) => formatDocumentCellValue(info.row.original, 'content'),
    }),
    columnHelper.accessor('tags', {
      header: 'Tags',
      size: DOCUMENT_GRID_COLUMN_SIZES.tags,
      sortingFn: sortingFns.tags,
      cell: (info) => formatDocumentCellValue(info.row.original, 'tags'),
    }),
    columnHelper.accessor('created_at', {
      header: 'Created',
      size: DOCUMENT_GRID_COLUMN_SIZES.created_at,
      sortingFn: sortingFns.created_at,
      cell: (info) => formatDocumentCellValue(info.row.original, 'created_at'),
    }),
    columnHelper.accessor('issued_date', {
      header: 'Issued',
      size: DOCUMENT_GRID_COLUMN_SIZES.issued_date,
      sortingFn: sortingFns.issued_date,
      cell: (info) => formatDocumentCellValue(info.row.original, 'issued_date'),
    }),
    columnHelper.accessor('expire_date', {
      header: 'Expires',
      size: DOCUMENT_GRID_COLUMN_SIZES.expire_date,
      sortingFn: sortingFns.expire_date,
      cell: (info) => formatDocumentCellValue(info.row.original, 'expire_date'),
    }),
    columnHelper.accessor('storage', {
      header: 'File',
      size: DOCUMENT_GRID_COLUMN_SIZES.storage,
      sortingFn: sortingFns.storage,
      cell: (info) => formatDocumentCellValue(info.row.original, 'storage'),
    }),
  ];
}

function sortAccessibilityLabel(headerLabel: string, sortDirection: false | 'asc' | 'desc'): string {
  if (sortDirection === 'asc') {
    return `Sort by ${headerLabel}, ascending`;
  }
  if (sortDirection === 'desc') {
    return `Sort by ${headerLabel}, descending`;
  }
  return `Sort by ${headerLabel}`;
}

export default function DocumentGrid({ documents, onRowPress }: DocumentGridProps) {
  const palette = useColorPalette();
  const [sorting, setSorting] = useState<SortingState>([]);
  const sortingRef = useRef(sorting);
  sortingRef.current = sorting;

  const sortingFns = useMemo(
    () => createDocumentSortingFns(() => sortingRef.current),
    []
  );

  const columns = useMemo(() => buildColumns(sortingFns), [sortingFns]);

  const table = useReactTable({
    data: documents,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
    sortDescFirst: false,
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        grid: {
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: 4,
          overflow: 'hidden',
        },
        headerRow: {
          flexDirection: 'row',
          backgroundColor: withAlpha(palette.tint, 0.15),
        },
        dataRow: {
          flexDirection: 'row',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.icon,
        },
        dataRowAlt: {
          backgroundColor: withAlpha(palette.icon, 0.06),
        },
        headerCell: {
          paddingVertical: MANAGER_DATA_ROW_PADDING_Y,
          paddingHorizontal: MANAGER_DATA_ROW_PADDING_X,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: palette.icon,
          flexShrink: 0,
        },
        headerCellContent: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: MANAGER_DATA_CELL_GAP / 2,
        },
        sortIcon: {
          flexShrink: 0,
        },
        cell: {
          paddingVertical: MANAGER_DATA_ROW_PADDING_Y,
          paddingHorizontal: MANAGER_DATA_ROW_PADDING_X,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: palette.icon,
          flexShrink: 0,
        },
      }),
    [palette]
  );

  return (
    <View style={styles.grid}>
      {table.getHeaderGroups().map((headerGroup) => (
          <View key={headerGroup.id} style={styles.headerRow}>
            {headerGroup.headers.map((header) => {
              const headerLabel =
                typeof header.column.columnDef.header === 'string'
                  ? header.column.columnDef.header
                  : header.column.id;
              const sortDirection = header.column.getIsSorted();

              return (
                <Pressable
                  key={header.id}
                  style={[styles.headerCell, { width: header.getSize() }]}
                  onPress={() => header.column.toggleSorting()}
                  accessibilityRole="button"
                  accessibilityLabel={sortAccessibilityLabel(headerLabel, sortDirection)}
                >
                  <View style={styles.headerCellContent}>
                    <ThemedText type="meta" style={{ fontWeight: '700', color: palette.text }}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </ThemedText>
                    {sortDirection === 'asc' ? (
                      <IconSymbol
                        name="arrow.up"
                        size={14}
                        color={palette.tint}
                        style={styles.sortIcon}
                      />
                    ) : null}
                    {sortDirection === 'desc' ? (
                      <IconSymbol
                        name="arrow.down"
                        size={14}
                        color={palette.tint}
                        style={styles.sortIcon}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
      ))}
      {table.getSortedRowModel().rows.map((row, rowIndex) => (
          <TouchableOpacity
            key={row.id}
            style={[styles.dataRow, rowIndex % 2 === 1 && styles.dataRowAlt]}
            onPress={() => onRowPress(row.original)}
            accessibilityRole="button"
            accessibilityLabel={`Open document ${row.original.title || '(Untitled)'}`}
          >
            {row.getVisibleCells().map((cell) => {
              const isPrimary = PRIMARY_DOCUMENT_COLUMNS.has(cell.column.id);
              const cellValue = flexRender(
                cell.column.columnDef.cell,
                cell.getContext()
              );
              return (
                <View
                  key={cell.id}
                  style={[styles.cell, { width: cell.column.getSize() }]}
                >
                  <ThemedText
                    type={isPrimary ? 'body' : 'meta'}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    accessibilityLabel={
                      typeof cellValue === 'string' || typeof cellValue === 'number'
                        ? String(cellValue)
                        : undefined
                    }
                  >
                    {cellValue}
                  </ThemedText>
                </View>
              );
            })}
          </TouchableOpacity>
        ))}
      </View>
  );
}
