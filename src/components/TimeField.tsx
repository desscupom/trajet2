import DateTimePicker from '@react-native-community/datetimepicker';
import {useState, useMemo } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type TimeFieldProps = {
  label?: string;
  /** Valor no formato HH:MM (ou HH:MM:SS — só usamos HH e MM) */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Se true, mostra botão pra limpar (clear) o valor */
  optional?: boolean;
};

/**
 * Converte Date pra HH:MM (string).
 */
function dateToTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Parseia HH:MM ou HH:MM:SS pra Date (com data fictícia, só hora importa).
 */
function timeToDate(time: string | null): Date {
  if (!time) {
    const d = new Date();
    d.setHours(9, 0, 0, 0); // default 9h
    return d;
  }
  const parts = (time ?? '00:00').split(':');
  const d = new Date();
  d.setHours(Number(parts[0]) || 9, Number(parts[1]) || 0, 0, 0);
  return d;
}

/**
 * Display formatado: "14:30"
 */
function formatTime(time: string | null): string {
  if (!time) return '';
  const parts = (time ?? '00:00').split(':');
  return `${parts[0]}:${parts[1]}`;
}

export function TimeField({
  label,
  value,
  onChange,
  placeholder = 'Sem hora',
  optional,
}: TimeFieldProps) {
  const styles = useStyles();
  const [showPicker, setShowPicker] = useState(false);
  const [tempTime, setTempTime] = useState<Date>(timeToDate(value));

  function open() {
    setTempTime(timeToDate(value));
    setShowPicker(true);
  }

  function handleChange(_event: unknown, selected?: Date) {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (selected) onChange(dateToTime(selected));
      return;
    }
    if (selected) setTempTime(selected);
  }

  function confirmIOS() {
    onChange(dateToTime(tempTime));
    setShowPicker(false);
  }

  function clear() {
    onChange(null);
  }

  const display = formatTime(value);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}

      {Platform.OS === 'web' ? (
        // Web: input HTML nativo time
        <View style={styles.field}>
          <input
            type="time"
            value={value ?? ''}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).value;
              onChange(v || null);
            }}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: colors.text,
              fontSize: fontSize.md,
            }}
          />
        </View>
      ) : (
        <Pressable onPress={open} style={styles.field}>
          <Text style={[styles.value, !display && styles.placeholder]}>
            {display || placeholder}
          </Text>
          {optional && value && (
            <Pressable onPress={clear} hitSlop={10} style={styles.clearBtn}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          )}
        </Pressable>
      )}

      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={tempTime}
          mode="time"
          display="default"
          onChange={handleChange}
          is24Hour
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={showPicker} animationType="slide" transparent>
          <Pressable
            style={styles.iosBackdrop}
            onPress={() => setShowPicker(false)}
          >
            <Pressable style={styles.iosSheet} onPress={() => {}}>
              <View style={styles.iosHeader}>
                <Button
                  title="Cancelar"
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowPicker(false)}
                />
                <Button title="Concluído" size="sm" onPress={confirmIOS} />
              </View>
              <DateTimePicker
                value={tempTime}
                mode="time"
                display="spinner"
                onChange={handleChange}
                is24Hour
                themeVariant="dark"
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  container: { gap: spacing.xs },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  field: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  value: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
  },
  placeholder: { color: colors.textMuted },
  clearBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    color: colors.textMuted,
    fontSize: 22,
    lineHeight: 22,
  },
  iosBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  iosSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
  },
  iosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
}), [themeVersion]);
}
