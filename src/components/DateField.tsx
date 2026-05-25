/**
 * DateField — seletor de data com calendário visual.
 * - Mostra dias da semana (Seg, Ter, Qua...)
 * - Marca feriados nacionais brasileiros em vermelho
 * - iOS: modal deslizante com calendário customizado
 * - Android: DateTimePicker nativo
 * - Web: input HTML nativo
 */
import { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Button } from '@/components/Button';
import { formatDateBR, parseDbDate, toDbDate } from '@/lib/dates';
import { getBrazilianHolidays, getHolidayName } from '@/lib/holidays';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type DateFieldProps = {
  label?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  minDate?: string | null;
  maxDate?: string | null;
  optional?: boolean;
  /** Datas a destacar (ex: intervalo de outra data) */
  rangeStart?: string | null;
  rangeEnd?: string | null;
};

export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Toque para escolher',
  minDate,
  maxDate,
  optional,
  rangeStart,
  rangeEnd,
}: DateFieldProps) {
  const styles = useStyles();
  const [showPicker, setShowPicker] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    const d = value ? parseDbDate(value) : new Date();
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = value ? parseDbDate(value) : new Date();
    return d.getMonth();
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(value);
  const [hoveredHoliday, setHoveredHoliday] = useState<string | null>(null);

  const holidays = useMemo(
    () => getBrazilianHolidays(viewYear),
    [viewYear]
  );

  function open() {
    const d = value ? parseDbDate(value) : new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(value);
    setShowPicker(true);
  }

  function confirm() {
    onChange(selectedDate);
    setShowPicker(false);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  // Gera células do calendário
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ day: number | null; dateStr: string | null }> = [];

    for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const m = String(viewMonth + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({ day: d, dateStr: `${viewYear}-${m}-${dd}` });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const minStr = minDate ?? null;
  const maxStr = maxDate ?? null;

  function isDayDisabled(dateStr: string) {
    if (minStr && dateStr < minStr) return true;
    if (maxStr && dateStr > maxStr) return true;
    return false;
  }

  function isInRange(dateStr: string) {
    if (!rangeStart || !rangeEnd) return false;
    return dateStr > rangeStart && dateStr < rangeEnd;
  }

  const display = value ? formatDateBR(value) : '';

  // Android usa picker nativo
  if (Platform.OS === 'android') {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        <Pressable onPress={open} style={styles.field}>
          <Text style={[styles.value, !display && styles.placeholder]}>
            {display || placeholder}
          </Text>
          {optional && value && (
            <Pressable onPress={() => onChange(null)} hitSlop={10} style={styles.clearBtn}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          )}
        </Pressable>
        {showPicker && (
          <DateTimePicker
            value={value ? parseDbDate(value) : new Date()}
            mode="date"
            display="default"
            minimumDate={minStr ? parseDbDate(minStr) : undefined}
            maximumDate={maxStr ? parseDbDate(maxStr) : undefined}
            onChange={(_, selected) => {
              setShowPicker(false);
              if (selected) onChange(toDbDate(selected));
            }}
          />
        )}
      </View>
    );
  }

  // Web usa input nativo
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        <WebDateInput value={value} minDate={minStr} maxDate={maxStr} placeholder={placeholder} optional={optional} onChange={onChange} />
      </View>
    );
  }

  // iOS — calendário customizado
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable onPress={open} style={styles.field}>
        <Text style={[styles.value, !display && styles.placeholder]}>
          {display || placeholder}
        </Text>
        {optional && value && (
          <Pressable onPress={() => onChange(null)} hitSlop={10} style={styles.clearBtn}>
            <Text style={styles.clearText}>×</Text>
          </Pressable>
        )}
      </Pressable>

      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>

            {/* Navegação de mês */}
            <View style={styles.monthNav}>
              <Pressable onPress={prevMonth} hitSlop={16} style={styles.navBtn}>
                <Text style={styles.navArrow}>‹</Text>
              </Pressable>
              <Text style={styles.monthTitle}>
                {MONTHS[viewMonth]} {viewYear}
              </Text>
              <Pressable onPress={nextMonth} hitSlop={16} style={styles.navBtn}>
                <Text style={styles.navArrow}>›</Text>
              </Pressable>
            </View>

            {/* Cabeçalho dias da semana */}
            <View style={styles.weekHeader}>
              {WEEK_DAYS.map((d, i) => (
                <Text key={d} style={[styles.weekDay, (i === 0 || i === 6) && styles.weekDayWeekend]}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Células do calendário */}
            <View style={styles.grid}>
              {calendarDays.map((cell, idx) => {
                if (!cell.dateStr) {
                  return <View key={`empty-${idx}`} style={styles.cell} />;
                }
                const isSelected = cell.dateStr === selectedDate;
                const isToday = cell.dateStr === toDbDate(new Date());
                const isHoliday = holidays.has(cell.dateStr);
                const disabled = isDayDisabled(cell.dateStr);
                const inRange = isInRange(cell.dateStr);
                const isWeekend = idx % 7 === 0 || idx % 7 === 6;

                return (
                  <Pressable
                    key={cell.dateStr}
                    style={[
                      styles.cell,
                      isSelected && styles.cellSelected,
                      inRange && !isSelected && styles.cellInRange,
                      isToday && !isSelected && styles.cellToday,
                    ]}
                    onPress={() => !disabled && setSelectedDate(cell.dateStr)}
                    disabled={disabled}
                  >
                    <Text style={[
                      styles.cellText,
                      isSelected && styles.cellTextSelected,
                      isHoliday && !isSelected && styles.cellTextHoliday,
                      isWeekend && !isSelected && styles.cellTextWeekend,
                      disabled && styles.cellTextDisabled,
                    ]}>
                      {cell.day}
                    </Text>
                    {isHoliday && <View style={[styles.holidayDot, isSelected && styles.holidayDotSelected]} />}
                  </Pressable>
                );
              })}
            </View>

            {/* Tooltip feriado */}
            {selectedDate && holidays.has(selectedDate) && (
              <View style={styles.holidayBadge}>
                <Text style={styles.holidayBadgeText}>
                  🇧🇷 {getHolidayName(selectedDate)}
                </Text>
              </View>
            )}

            {/* Legenda */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.legendText}>Selecionado</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
                <Text style={styles.legendText}>Feriado</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Button title="Cancelar" variant="ghost" onPress={() => setShowPicker(false)} />
              <Button title="Confirmar" onPress={confirm} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function WebDateInput({ value, minDate, maxDate, placeholder, optional, onChange }: any) {
  const React = require('react');
  return React.createElement('div', {
    style: { position: 'relative', display: 'flex', alignItems: 'center' },
    children: [
      React.createElement('input', {
        key: 'input',
        type: 'date',
        value: value ?? '',
        min: minDate ?? undefined,
        max: maxDate ?? undefined,
        placeholder,
        onChange: (e: any) => onChange(e.target.value || null),
        style: {
          flex: 1, width: '100%', padding: '12px 14px',
          backgroundColor: colors.surface, color: value ? colors.text : colors.textMuted,
          border: `1px solid ${colors.border}`, borderRadius: 10,
          fontSize: 15, fontFamily: 'inherit', colorScheme: 'dark',
          outline: 'none', boxSizing: 'border-box', minHeight: 48,
        },
      }),
    ],
  });
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    container: { width: '100%' },
    label: { color: colors.textMuted, fontSize: fontSize.sm, marginBottom: spacing.xs, fontWeight: '500' },
    field: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48,
    },
    value: { color: colors.text, fontSize: fontSize.md, flex: 1, paddingVertical: spacing.md },
    placeholder: { color: colors.textMuted },
    clearBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    clearText: { color: colors.textMuted, fontSize: 18, lineHeight: 20 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: spacing.lg, paddingBottom: 36,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    monthNav: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    navBtn: { padding: spacing.sm },
    navArrow: { color: colors.text, fontSize: 28, fontWeight: '300' },
    monthTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
    weekHeader: { flexDirection: 'row', marginBottom: spacing.xs },
    weekDay: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    weekDayWeekend: { color: colors.primary },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
      width: `${100/7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
      borderRadius: radius.sm,
    },
    cellSelected: { backgroundColor: colors.primary, borderRadius: radius.md },
    cellToday: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md },
    cellInRange: { backgroundColor: colors.primarySoft },
    cellText: { color: colors.text, fontSize: 15, fontWeight: '400' },
    cellTextSelected: { color: '#fff', fontWeight: '700' },
    cellTextHoliday: { color: colors.danger, fontWeight: '600' },
    cellTextWeekend: { color: colors.primary + 'cc' },
    cellTextDisabled: { color: colors.textMuted, opacity: 0.35 },
    holidayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.danger, marginTop: 1 },
    holidayDotSelected: { backgroundColor: '#fff' },
    holidayBadge: {
      backgroundColor: colors.danger + '20', borderRadius: radius.md,
      padding: spacing.sm, marginTop: spacing.sm, alignItems: 'center',
    },
    holidayBadgeText: { color: colors.danger, fontSize: fontSize.xs, fontWeight: '600' },
    legend: { flexDirection: 'row', gap: spacing.lg, justifyContent: 'center', marginTop: spacing.sm },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { color: colors.textMuted, fontSize: fontSize.xs },
    actions: {
      flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.lg,
    },
  }), [themeVersion]);
}
