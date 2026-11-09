import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { FieldLabel } from '@/components/ui/field-label';
import { ManagerSection } from '@/components/ui/manager-section';
import { TextInput } from '@/components/ui/text-input';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type {
  CreateHealthMemberCommand,
  HealthMemberDto,
  UpdateHealthMemberCommand,
} from '@/lib/api/types';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

const DISPLAY_NAME_MAX_LEN = 100;
const NOTES_MAX_LEN = 2000;
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Count Unicode scalars (matches Rust `chars().count()`). */
export function unicodeScalarLength(value: string): number {
  return [...value].length;
}

export function parseHealthMemberDto(item: unknown): HealthMemberDto {
  const m = item as Record<string, unknown>;
  return {
    id: String(m.id ?? ''),
    display_name: String(m.display_name ?? ''),
    birth_date: m.birth_date != null ? String(m.birth_date) : null,
    notes: m.notes != null ? String(m.notes) : null,
    active: Boolean(m.active),
    created_at: String(m.created_at ?? ''),
    updated_at: String(m.updated_at ?? ''),
    deactivated_at: m.deactivated_at != null ? String(m.deactivated_at) : null,
  };
}

function formatBirthDateForInput(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) {
    return '';
  }
  return isoOrDate.slice(0, 10);
}

type ParseOptionalYmdResult = { ok: true; value: string | null } | { ok: false };

function parseOptionalYmd(value: string): ParseOptionalYmdResult {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (!DATE_INPUT_PATTERN.test(trimmed)) {
    return { ok: false };
  }
  const [year, month, day] = trimmed.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return { ok: false };
  }
  return { ok: true, value: trimmed };
}

type HealthMemberPanelProps = {
  onSelectedMemberChange?: (member: HealthMemberDto | null) => void;
};

/**
 * Manage HealthMembers on the Health Manager screen.
 *
 * ```
 * User -> Panel : open create / edit / deactivate / reactivate
 * Panel -> API : GET /health-members(?include_inactive=true)
 * alt create
 *   Panel -> API : POST /health-members
 * else update
 *   Panel -> API : PUT /health-members/{id}
 * else deactivate
 *   Panel -> ConfirmDialog : show
 *   User -> ConfirmDialog : confirm | cancel
 *   opt confirm
 *     Panel -> API : POST /health-members/{id}/deactivate
 *     Panel -> Panel : clear selection if deactivated was selected
 * end
 * else reactivate
 *   Panel -> API : PUT /health-members/{id} (active=true)
 * end
 * Panel -> Panel : refresh picker
 * ```
 */
export default function HealthMemberPanel({
  onSelectedMemberChange,
}: HealthMemberPanelProps) {
  const { token, handleUnauthorized } = useAuth();
  const palette = useColorPalette();

  const [members, setMembers] = useState<HealthMemberDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  selectedIdRef.current = selectedId;

  const [createVisible, setCreateVisible] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createBirthDate, setCreateBirthDate] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<HealthMemberDto | null>(
    null
  );
  const [deactivating, setDeactivating] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: 12,
        },
        headerRow: {
          gap: 4,
        },
        selectedName: {
          fontSize: 18,
          fontWeight: '600',
          color: palette.text,
        },
        hint: {
          fontSize: 14,
          color: palette.icon,
        },
        errorText: {
          fontSize: 14,
          color: '#c62828',
        },
        includeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        includeLabel: {
          fontSize: 14,
          color: palette.text,
        },
        picker: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        pickerChip: {
          borderWidth: 1,
          borderColor: palette.icon,
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 12,
          backgroundColor: palette.background,
        },
        pickerChipSelected: {
          borderColor: palette.tint,
          backgroundColor: palette.tint,
        },
        pickerChipInactive: {
          opacity: 0.7,
          borderStyle: 'dashed',
        },
        pickerChipText: {
          color: palette.text,
          fontSize: 15,
        },
        pickerChipTextSelected: {
          color: palette.onTint,
          fontWeight: '600',
        },
        detailCard: {
          gap: 8,
          paddingTop: 4,
        },
        detailRow: {
          gap: 2,
        },
        detailLabel: {
          fontSize: 13,
          color: palette.icon,
        },
        detailValue: {
          fontSize: 15,
          color: palette.text,
        },
        actionRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 4,
        },
        actionButton: {
          paddingVertical: 10,
          paddingHorizontal: 14,
        },
        label: {
          fontSize: 16,
          marginBottom: 4,
          color: palette.text,
        },
        input: {
          borderWidth: 1,
          borderColor: palette.icon,
          borderRadius: 8,
          padding: 10,
          marginBottom: 8,
          color: palette.text,
          backgroundColor: palette.background,
        },
        inputMultiline: {
          minHeight: 80,
        },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          padding: 24,
        },
        modalCard: {
          backgroundColor: palette.background,
          borderRadius: 12,
          maxHeight: '85%',
          overflow: 'hidden',
        },
        modalScroll: {
          padding: 16,
        },
        modalTitle: {
          fontSize: 20,
          fontWeight: '700',
          marginBottom: 12,
          color: palette.text,
        },
        modalActions: {
          flexDirection: 'row',
          gap: 12,
          padding: 14,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.icon,
        },
        modalActionButton: {
          flex: 1,
          paddingVertical: 12,
        },
        errorBanner: {
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 4,
          gap: 6,
        },
      }),
    [palette]
  );

  const selected = useMemo(
    () => members.find((m) => m.id === selectedId) ?? null,
    [members, selectedId]
  );

  const activeMembers = useMemo(
    () => members.filter((m) => m.active),
    [members]
  );

  const notifySelection = useCallback(
    (member: HealthMemberDto | null) => {
      onSelectedMemberChange?.(member);
    },
    [onSelectedMemberChange]
  );

  const selectMember = useCallback(
    (member: HealthMemberDto | null) => {
      setSelectedId(member?.id ?? null);
      setEditing(false);
      setEditError(null);
      notifySelection(member);
    },
    [notifySelection]
  );

  const syncSelectionToList = useCallback(
    (list: HealthMemberDto[]) => {
      const prev = selectedIdRef.current;
      if (!prev) {
        return;
      }
      const stillPresent = list.find((m) => m.id === prev);
      if (!stillPresent || (!includeInactive && !stillPresent.active)) {
        setSelectedId(null);
        notifySelection(null);
        return;
      }
      notifySelection(stillPresent);
    },
    [includeInactive, notifySelection]
  );

  const upsertMemberLocally = useCallback((member: HealthMemberDto) => {
    setMembers((prev) => {
      const without = prev.filter((m) => m.id !== member.id);
      return [...without, member];
    });
  }, []);

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!token) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setMembers([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const path = includeInactive
        ? '/health-members?include_inactive=true'
        : '/health-members';
      const response = await authenticatedFetch(path, {
        method: 'GET',
        token,
        onUnauthorized: handleUnauthorized,
      });
      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      const raw = (await response.json()) as unknown;
      const list = Array.isArray(raw) ? raw.map(parseHealthMemberDto) : [];
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setMembers(list);
      syncSelectionToList(list);
    } catch (err: unknown) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to load HealthMembers';
      setError(msg);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [token, includeInactive, handleUnauthorized, syncSelectionToList]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateBirthDate('');
    setCreateNotes('');
    setCreateError(null);
  };

  const closeCreateModal = () => {
    setCreateVisible(false);
    resetCreateForm();
  };

  const startEdit = () => {
    if (!selected) {
      return;
    }
    setEditName(selected.display_name);
    setEditBirthDate(formatBirthDateForInput(selected.birth_date));
    setEditNotes(selected.notes ?? '');
    setEditError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError(null);
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!token) {
      setCreateError('No authentication token available.');
      return;
    }
    const name = createName.trim();
    if (!name) {
      setCreateError('Display name is required.');
      return;
    }
    if (unicodeScalarLength(name) > DISPLAY_NAME_MAX_LEN) {
      setCreateError(`Display name must be at most ${DISPLAY_NAME_MAX_LEN} characters.`);
      return;
    }
    const birth = parseOptionalYmd(createBirthDate);
    if (!birth.ok) {
      setCreateError('Birth date must be in YYYY-MM-DD format.');
      return;
    }
    const notesTrimmed = createNotes.trim();
    if (unicodeScalarLength(notesTrimmed) > NOTES_MAX_LEN) {
      setCreateError(`Notes must be at most ${NOTES_MAX_LEN} characters.`);
      return;
    }

    const payload: CreateHealthMemberCommand = {
      display_name: name,
      birth_date: birth.value,
      notes: notesTrimmed === '' ? null : notesTrimmed,
    };

    setCreating(true);
    try {
      const response = await authenticatedFetch('/health-members', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        onUnauthorized: handleUnauthorized,
      });
      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      let created: HealthMemberDto | null = null;
      try {
        created = parseHealthMemberDto(JSON.parse(bodyText));
      } catch {
        // refresh will pick up the new member
      }
      closeCreateModal();
      if (created?.id) {
        upsertMemberLocally(created);
        selectMember(created);
      }
      await load();
      if (created?.id) {
        selectMember(created);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to create HealthMember';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async () => {
    setEditError(null);
    if (!token || !selected) {
      setEditError('No authentication token available.');
      return;
    }
    const name = editName.trim();
    if (!name) {
      setEditError('Display name is required.');
      return;
    }
    if (unicodeScalarLength(name) > DISPLAY_NAME_MAX_LEN) {
      setEditError(`Display name must be at most ${DISPLAY_NAME_MAX_LEN} characters.`);
      return;
    }
    const birth = parseOptionalYmd(editBirthDate);
    if (!birth.ok) {
      setEditError('Birth date must be in YYYY-MM-DD format.');
      return;
    }
    const notesTrimmed = editNotes.trim();
    if (unicodeScalarLength(notesTrimmed) > NOTES_MAX_LEN) {
      setEditError(`Notes must be at most ${NOTES_MAX_LEN} characters.`);
      return;
    }

    const payload: UpdateHealthMemberCommand = {
      display_name: name,
      birth_date: birth.value,
      notes: notesTrimmed === '' ? null : notesTrimmed,
      active: null,
    };

    setSaving(true);
    try {
      const response = await authenticatedFetch(`/health-members/${selected.id}`, {
        method: 'PUT',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        onUnauthorized: handleUnauthorized,
      });
      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      let updated: HealthMemberDto | null = null;
      try {
        updated = parseHealthMemberDto(JSON.parse(bodyText));
      } catch {
        // refresh will sync
      }
      setEditing(false);
      if (updated?.id) {
        upsertMemberLocally(updated);
        selectMember(updated);
      }
      await load();
      if (updated?.id) {
        selectMember(updated);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to update HealthMember';
      setEditError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivateConfirm = async () => {
    if (!token || !deactivateTarget || deactivating) {
      return;
    }
    const target = deactivateTarget;
    setDeactivating(true);
    try {
      const response = await authenticatedFetch(
        `/health-members/${target.id}/deactivate`,
        {
          method: 'POST',
          token,
          onUnauthorized: handleUnauthorized,
        }
      );
      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      setDeactivateTarget(null);
      if (selectedId === target.id) {
        selectMember(null);
      }
      setMembers((prev) => {
        if (includeInactive) {
          return prev.map((m) =>
            m.id === target.id
              ? {
                  ...m,
                  active: false,
                  deactivated_at: m.deactivated_at ?? new Date().toISOString(),
                }
              : m
          );
        }
        return prev.filter((m) => m.id !== target.id);
      });
      await load();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to deactivate HealthMember';
      setError(msg);
      setDeactivateTarget(null);
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivate = async (member: HealthMemberDto) => {
    if (!token || reactivatingId) {
      return;
    }
    setReactivatingId(member.id);
    setError(null);
    try {
      const payload: UpdateHealthMemberCommand = {
        display_name: member.display_name,
        active: true,
      };
      const response = await authenticatedFetch(`/health-members/${member.id}`, {
        method: 'PUT',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        onUnauthorized: handleUnauthorized,
      });
      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      let reactivated: HealthMemberDto | null = null;
      try {
        reactivated = parseHealthMemberDto(JSON.parse(bodyText));
      } catch {
        reactivated = { ...member, active: true, deactivated_at: null };
      }
      upsertMemberLocally(reactivated);
      await load();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to reactivate HealthMember';
      setError(msg);
    } finally {
      setReactivatingId(null);
    }
  };

  if (!token) {
    return (
      <ManagerSection title="HealthMembers" accessibilityLabel="HealthMembers section">
        <ThemedText style={styles.hint}>
          Sign in to manage HealthMembers.
        </ThemedText>
      </ManagerSection>
    );
  }

  return (
    <ManagerSection
      title="HealthMembers"
      accessibilityLabel="HealthMembers section"
      primaryAction={{
        label: 'Create HealthMember',
        onPress: () => setCreateVisible(true),
        accessibilityLabel: 'Create HealthMember',
      }}
      secondaryActions={[
        {
          label: loading ? 'Refreshing…' : 'Refresh',
          onPress: () => void load(),
          disabled: loading,
          accessibilityLabel: 'Refresh HealthMembers',
        },
      ]}
      toolbarExtra={
        <View style={styles.includeRow}>
          <Text style={styles.includeLabel}>Include inactive</Text>
          <Switch
            value={includeInactive}
            onValueChange={setIncludeInactive}
            accessibilityLabel="Include inactive HealthMembers"
          />
        </View>
      }
    >
      <View style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText
          style={styles.selectedName}
          accessibilityLabel={
            selected
              ? `Selected HealthMember ${selected.display_name}`
              : 'No HealthMember selected'
          }>
          {selected
            ? selected.display_name
            : 'No member selected'}
        </ThemedText>
        {!selected && activeMembers.length === 0 ? (
          <ThemedText style={styles.hint}>
            Create a HealthMember to manage vitals and visits.
          </ThemedText>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {loading && members.length === 0 ? (
        <ActivityIndicator color={palette.tint} accessibilityLabel="Loading HealthMembers" />
      ) : members.length === 0 ? (
        <ThemedText style={styles.hint}>
          {includeInactive
            ? 'No HealthMembers yet.'
            : 'No active HealthMembers. Create one, or include inactive to reactivate.'}
        </ThemedText>
      ) : (
        <View
          style={styles.picker}
          accessibilityLabel="HealthMember picker">
          {members.map((member) => {
            const isSelected = member.id === selectedId;
            return (
              <Pressable
                key={member.id}
                onPress={() => selectMember(member)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={
                  member.active
                    ? `Select HealthMember ${member.display_name}`
                    : `Select inactive HealthMember ${member.display_name}`
                }
                style={[
                  styles.pickerChip,
                  isSelected && styles.pickerChipSelected,
                  !member.active && styles.pickerChipInactive,
                ]}>
                <Text
                  style={[
                    styles.pickerChipText,
                    isSelected && styles.pickerChipTextSelected,
                  ]}>
                  {member.active
                    ? member.display_name
                    : `${member.display_name} (inactive)`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {selected ? (
        <View style={styles.detailCard} accessibilityLabel="HealthMember details">
          {editing ? (
            <>
              <FieldLabel label="Display name" required style={styles.label} />
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Display name"
                placeholderTextColor={palette.icon}
                aria-required
                accessibilityLabel="Edit display name"
              />
              <FieldLabel label="Birth date" style={styles.label} />
              <DatePicker
                value={editBirthDate}
                onChange={setEditBirthDate}
                accessibilityLabel="Edit birth date"
                placeholder="YYYY-MM-DD"
              />
              <FieldLabel label="Notes" style={styles.label} />
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Notes (optional)"
                placeholderTextColor={palette.icon}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Edit notes"
              />
              {editError ? (
                <Text style={styles.errorText} accessibilityRole="alert">
                  {editError}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                <Button
                  label={saving ? 'Saving…' : 'Save'}
                  onPress={() => void handleSaveEdit()}
                  disabled={saving}
                  loading={saving}
                  accessibilityLabel="Save HealthMember"
                  style={styles.actionButton}
                />
                <Button
                  variant="outline"
                  label="Cancel"
                  onPress={cancelEdit}
                  disabled={saving}
                  accessibilityLabel="Cancel edit HealthMember"
                  style={styles.actionButton}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Birth date</Text>
                <Text style={styles.detailValue}>
                  {formatBirthDateForInput(selected.birth_date) || '—'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Notes</Text>
                <Text style={styles.detailValue}>{selected.notes || '—'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={styles.detailValue}>
                  {selected.active ? 'Active' : 'Inactive'}
                </Text>
              </View>
              <View style={styles.actionRow}>
                {selected.active ? (
                  <>
                    <Button
                      variant="secondary"
                      label="Edit"
                      onPress={startEdit}
                      accessibilityLabel="Edit HealthMember"
                      style={styles.actionButton}
                    />
                    <Button
                      variant="destructive"
                      label="Deactivate"
                      onPress={() => setDeactivateTarget(selected)}
                      accessibilityLabel="Deactivate HealthMember"
                      style={styles.actionButton}
                    />
                  </>
                ) : (
                  <Button
                    label={
                      reactivatingId === selected.id ? 'Reactivating…' : 'Reactivate'
                    }
                    onPress={() => void handleReactivate(selected)}
                    disabled={reactivatingId === selected.id}
                    loading={reactivatingId === selected.id}
                    accessibilityLabel="Reactivate HealthMember"
                    style={styles.actionButton}
                  />
                )}
              </View>
            </>
          )}
        </View>
      ) : null}

      <Modal
        visible={createVisible}
        animationType="fade"
        transparent
        onRequestClose={closeCreateModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Create HealthMember</Text>
              <FieldLabel label="Display name" required style={styles.label} />
              <TextInput
                style={styles.input}
                value={createName}
                onChangeText={setCreateName}
                placeholder="Display name"
                placeholderTextColor={palette.icon}
                aria-required
                accessibilityLabel="Create display name"
              />
              <FieldLabel label="Birth date" style={styles.label} />
              <DatePicker
                value={createBirthDate}
                onChange={setCreateBirthDate}
                accessibilityLabel="Create birth date"
                placeholder="YYYY-MM-DD"
              />
              <FieldLabel label="Notes" style={styles.label} />
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={createNotes}
                onChangeText={setCreateNotes}
                placeholder="Notes (optional)"
                placeholderTextColor={palette.icon}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Create notes"
              />
            </ScrollView>
            {createError ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>{createError}</Text>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Button
                label={creating ? 'Creating…' : 'Create'}
                onPress={() => void handleCreate()}
                disabled={creating}
                loading={creating}
                accessibilityLabel="Submit create HealthMember"
                style={styles.modalActionButton}
              />
              <Button
                variant="outline"
                label="Cancel"
                onPress={closeCreateModal}
                disabled={creating}
                accessibilityLabel="Cancel create HealthMember"
                style={styles.modalActionButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={deactivateTarget != null}
        title="Deactivate HealthMember?"
        message={
          deactivateTarget
            ? `Deactivate "${deactivateTarget.display_name}"? They leave the active picker. You can reactivate later.`
            : ''
        }
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (!deactivating) {
            setDeactivateTarget(null);
          }
        }}
        onConfirm={() => void handleDeactivateConfirm()}
      />
      </View>
    </ManagerSection>
  );
}
