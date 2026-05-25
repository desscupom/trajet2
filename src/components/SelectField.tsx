/**
 * SelectField — campo de seleção unificado.
 * Exibe um botão estilo input com valor selecionado.
 * Abre uma BottomSheet com lista de opções.
 * 
 * Substitui todos os pickers ad-hoc do app.
 */
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, ChevronDown, Search } from '@/components/Icon';
import { AnimatedPress } from '@/components/AnimatedPress';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme } from '@/components/ThemeProvider';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

export type SelectOption = {
  value: string;
  label: string;
  sublabel?: string;
  icon?: string;
  rightElement?: React.ReactNode;
};

type Props = {
  label?: string;
  value: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  title?: string;
  searchable?: boolean;
  /** Slot acima das opções no sheet */
  sheetHeader?: React.ReactNode;
};

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Selecionar',
  title,
  searchable = false,
  sheetHeader,
}: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.sublabel?.toLowerCase().includes(q)
    );
  }, [options, query]);

  function pick(opt: SelectOption) {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <View>
        {label && <Text style={styles.label}>{label}</Text>}
        <AnimatedPress
          onPress={() => setOpen(true)}
          pressScale={0.98}
          style={styles.trigger}
        >
          {selected?.icon && (
            <Text style={styles.triggerIcon}>{selected.icon}</Text>
          )}
          <Text
            style={[
              styles.triggerText,
              !selected && styles.triggerPlaceholder,
            ]}
            numberOfLines={1}
          >
            {selected?.label ?? placeholder}
          </Text>
          <ChevronDown size={16} color={colors.textMuted} />
        </AnimatedPress>
      </View>

      <BottomSheet
        visible={open}
        onClose={() => { setOpen(false); setQuery(''); }}
        title={title ?? label ?? 'Selecionar'}
        scrollable={false}
      >
        {sheetHeader}

        {/* Busca */}
        {searchable && (
          <View style={styles.searchWrap}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {/* Opções */}
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.value}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const active = item.value === value;
            return (
              <Pressable
                onPress={() => pick(item)}
                style={({ pressed }) => [
                  styles.option,
                  index < filtered.length - 1 && styles.optionBorder,
                  pressed && styles.optionPressed,
                  active && styles.optionActive,
                ]}
              >
                {item.icon && (
                  <Text style={styles.optionIcon}>{item.icon}</Text>
                )}
                <View style={styles.optionText}>
                  <Text
                    style={[
                      styles.optionLabel,
                      active && styles.optionLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {item.sublabel && (
                    <Text style={styles.optionSublabel} numberOfLines={1}>
                      {item.sublabel}
                    </Text>
                  )}
                </View>
                {item.rightElement}
                {active && (
                  <Check size={16} color={colors.primary} />
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>Nenhuma opção encontrada</Text>
          }
        />
      </BottomSheet>
    </>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    label: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      fontWeight: '600',
      marginBottom: spacing.xs,
    },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      minHeight: 48,
      paddingVertical: spacing.sm,
    },
    triggerIcon: { fontSize: 18 },
    triggerText: {
      flex: 1,
      color: colors.text,
      fontSize: fontSize.md,
    },
    triggerPlaceholder: {
      color: colors.textMuted,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: fontSize.md,
      paddingVertical: 10,
    },
    list: { maxHeight: 360 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 14,
      paddingHorizontal: spacing.sm,
    },
    optionBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    optionPressed: { backgroundColor: colors.surfaceAlt },
    optionActive: { backgroundColor: colors.primarySofter },
    optionIcon: { fontSize: 20, width: 26, textAlign: 'center' },
    optionText: { flex: 1 },
    optionLabel: {
      color: colors.text,
      fontSize: fontSize.md,
      fontWeight: '500',
    },
    optionLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    optionSublabel: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      marginTop: 1,
    },
    empty: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  }), [themeVersion]);
}
