import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import {
  ChevronRight,
  KeyRound,
  LogOut,
  Navigation,
  Plus,
  Route,
  Sparkles,
  Sunrise,
  Sunset,
  Moon,
} from '@/components/Icon';
import { LODGING_KIND_ICONS } from '@/components/lodgingIcons';
import { useToast } from '@/components/Toast';
import { formatDateLongBR } from '@/lib/dates';
import type { DayLodgingEvents, Lodging, LodgingKind } from '@/lib/lodgings';
import { extractRoutePoints, openRouteInMaps } from '@/lib/mapsLink';
import { colors, fontSize, letterSpacing, radius, spacing } from '@/lib/theme';

import type { ItineraryItem } from './types';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Vista alternativa do dia em formato timeline, agrupando lugares por período:
 * - 🌅 Manhã (00:00 às 11:59)
 * - 🌞 Tarde (12:00 às 17:59)
 * - 🌙 Noite (18:00 às 23:59)
 *
 * Lugares **sem horário** ficam num bloco "Sem horário" no fim.
 *
 * Diferenças vs. DayBlock (lista):
 * - Sem drag-and-drop (a ordem é determinada pelo horário automaticamente)
 * - Sem botões "mover" / setas — usa Pressable simples
 * - Mais visual, menos denso
 * - Bom pra leitura rápida ("o que tenho de noite?")
 */
type Props = {
  dayDate: string;
  dayNumber: number;
  items: ItineraryItem[];
  lodgingEvents?: DayLodgingEvents;
  onAddPlace: () => void;
  onSuggestMore: () => void;
  onRemoveItem: (itemId: string) => void;
  onMoveItem: (itemId: string) => void;
  onOpenDay: () => void;
  onReordered: () => void;
  /** Click no item — mostra detalhes/edita */
  onItemPress?: (item: ItineraryItem) => void;
};

type Period = 'morning' | 'afternoon' | 'evening' | 'unscheduled';

type PeriodInfo = {
  key: Period;
  label: string;
  hint: string;
  IconComponent: typeof Sunrise;
  color: string;
};

const PERIODS: PeriodInfo[] = [
  {
    key: 'morning',
    label: 'Manhã',
    hint: '00:00 – 12:00',
    IconComponent: Sunrise,
    color: '#f59e0b', // âmbar
  },
  {
    key: 'afternoon',
    label: 'Tarde',
    hint: '12:00 – 18:00',
    IconComponent: Sunset,
    color: '#f97316', // laranja
  },
  {
    key: 'evening',
    label: 'Noite',
    hint: '18:00 – 00:00',
    IconComponent: Moon,
    color: '#6366f1', // indigo
  },
];

const UNSCHEDULED: PeriodInfo = {
  key: 'unscheduled',
  label: 'Sem horário',
  hint: '',
  IconComponent: Plus,
  color: colors.textMuted,
};

/**
 * Classifica um item pelo seu horário em uma das 4 categorias.
 */
function classifyItem(item: ItineraryItem): Period {
  if (!item.start_time) return 'unscheduled';
  const [h] = (item.start_time ?? '00:00').split(':').map(Number);
  if (isNaN(h)) return 'unscheduled';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export function DayBlockTimeline({
  dayDate,
  dayNumber,
  items,
  lodgingEvents,
  onAddPlace,
  onSuggestMore,
  onRemoveItem,
  onOpenDay,
  onItemPress,
}: Props) {
  const styles = useStyles();
  // Agrupa items por período, mantendo ordem por horário dentro de cada um
  const grouped = useMemo(() => {
    const map = new Map<Period, ItineraryItem[]>();
    PERIODS.forEach((p) => map.set(p.key, []));
    map.set('unscheduled', []);

    for (const item of items) {
      const period = classifyItem(item);
      map.get(period)!.push(item);
    }

    // Ordena cada grupo por horário (depois posição)
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.start_time && b.start_time)
          return a.start_time.localeCompare(b.start_time);
        if (a.start_time) return -1;
        if (b.start_time) return 1;
        return a.position - b.position;
      });
    }

    return map;
  }, [items]);

  const totalItems = items.length;

  return (
    <View style={styles.dayBlock}>
      {/* Header do dia */}
      <Pressable onPress={onOpenDay} style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayNumber}>DIA {dayNumber}</Text>
          <Text style={styles.dayDate}>{formatDateLongBR(dayDate)}</Text>
        </View>
        <ChevronRight size={18} color={colors.textMuted} />
      </Pressable>

      {/* Eventos de hospedagem do dia */}
      {lodgingEvents &&
        (lodgingEvents.checkIn.length > 0 ||
          lodgingEvents.checkOut.length > 0 ||
          lodgingEvents.staying.length > 0) && (
          <View style={styles.lodgingEvents}>
            {lodgingEvents.checkIn.map((l) => (
              <LodgingEventChip key={'in-' + l.id} type="check_in" lodging={l} />
            ))}
            {lodgingEvents.checkOut.map((l) => (
              <LodgingEventChip key={'out-' + l.id} type="check_out" lodging={l} />
            ))}
            {lodgingEvents.staying.map((l) => (
              <LodgingEventChip key={'stay-' + l.id} type="staying" lodging={l} />
            ))}
          </View>
        )}

      {/* Iniciar roteiro no Maps */}
      {(() => {
        const routePoints = extractRoutePoints(items);
        if (routePoints.length < 2) return null;
        return (
          <Pressable
            onPress={async () => {
              await openRouteInMaps(routePoints, 'walking');
            }}
            style={styles.startRouteBtn}
          >
            <Navigation size={14} color={colors.primary} />
            <Text style={styles.startRouteBtnText}>
              Iniciar roteiro no Maps
            </Text>
            <Text style={styles.startRouteHint}>
              {routePoints.length} {routePoints.length === 1 ? 'parada' : 'paradas'}
            </Text>
          </Pressable>
        );
      })()}

      {/* Períodos */}
      {totalItems === 0 ? (
        <View style={styles.emptyHint}>
          <Text style={styles.emptyText}>Nenhum lugar planejado pra este dia.</Text>
        </View>
      ) : (
        <View style={styles.periods}>
          {PERIODS.map((period) => {
            const periodItems = grouped.get(period.key) ?? [];
            if (periodItems.length === 0) return null;
            return (
              <PeriodBlock
                key={period.key}
                period={period}
                items={periodItems}
                onItemPress={onItemPress}
                onRemoveItem={onRemoveItem}
              />
            );
          })}

          {/* Sem horário sempre por último, se houver */}
          {(grouped.get('unscheduled')?.length ?? 0) > 0 && (
            <PeriodBlock
              period={UNSCHEDULED}
              items={grouped.get('unscheduled')!}
              onItemPress={onItemPress}
              onRemoveItem={onRemoveItem}
            />
          )}
        </View>
      )}

      {/* Ações */}
      <Button
        title="Adicionar lugar"
        variant="secondary"
        size="sm"
        leftIcon={<Plus size={16} color={colors.text} />}
        onPress={onAddPlace}
        style={styles.addButton}
      />

      {items.length >= 1 && (
        <View style={styles.aiActionsRow}>
          <Button
            title="Sugerir mais"
            variant="ghost"
            size="sm"
            leftIcon={<Sparkles size={14} color={colors.primary} />}
            onPress={onSuggestMore}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  );
}

/**
 * Bloco de um período (Manhã/Tarde/Noite/Sem horário) com seus items.
 */
function PeriodBlock({
  period,
  items,
  onItemPress,
  onRemoveItem,
}: {
  period: PeriodInfo;
  items: ItineraryItem[];
  onItemPress?: (item: ItineraryItem) => void;
  onRemoveItem: (id: string) => void;
}) {
  const styles = useStyles();
  const Icon = period.IconComponent;
  return (
    <View style={styles.periodBlock}>
      <View style={styles.periodHeader}>
        <View
          style={[
            styles.periodIconWrap,
            { backgroundColor: hexWithAlpha(period.color, 0.15) },
          ]}
        >
          <Icon size={14} color={period.color} />
        </View>
        <Text style={styles.periodLabel}>{period.label}</Text>
        {period.hint && (
          <Text style={styles.periodHint}>{period.hint}</Text>
        )}
        <Text style={styles.periodCount}>
          {items.length} {items.length === 1 ? 'lugar' : 'lugares'}
        </Text>
      </View>

      <View style={styles.periodItems}>
        {items.map((item, idx) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.timelineGutter}>
              {/* Linha vertical conectando items do mesmo período */}
              {idx > 0 && <View style={styles.timelineLineTop} />}
              <View
                style={[
                  styles.timelineDot,
                  { backgroundColor: period.color },
                ]}
              />
              {idx < items.length - 1 && <View style={styles.timelineLineBottom} />}
            </View>

            <AnimatedPress
              onPress={() => onItemPress?.(item)}
              style={styles.itemContent}
              pressScale={0.99}
            >
              <View style={styles.itemHeader}>
                {item.start_time && (
                  <Text style={styles.itemTime}>{item.start_time}</Text>
                )}
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.place?.name ?? item.custom_title ?? 'Sem nome'}
                </Text>
              </View>
              {item.place?.address && (
                <Text style={styles.itemAddress} numberOfLines={1}>
                  {item.place.address}
                </Text>
              )}
              {item.notes && (
                <Text style={styles.itemNotes} numberOfLines={2}>
                  {item.notes}
                </Text>
              )}
            </AnimatedPress>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Chip mostrando evento de hospedagem (check-in / check-out / hospedado).
 */
function LodgingEventChip({
  type,
  lodging,
}: {
  type: 'check_in' | 'check_out' | 'staying';
  lodging: Lodging;
}) {
  const styles = useStyles();
  const IconForKind =
    LODGING_KIND_ICONS[lodging.kind as LodgingKind] ?? KeyRound;
  const isCheckOut = type === 'check_out';

  return (
    <View style={[styles.lodgingChip, isCheckOut && styles.lodgingChipOut]}>
      {type === 'check_in' ? (
        <KeyRound size={12} color={colors.primary} />
      ) : type === 'check_out' ? (
        <LogOut size={12} color={colors.textMuted} />
      ) : (
        <IconForKind size={12} color={colors.textMuted} />
      )}
      <Text style={styles.lodgingChipText} numberOfLines={1}>
        {type === 'check_in' && 'Check-in: '}
        {type === 'check_out' && 'Check-out: '}
        {lodging.name}
      </Text>
    </View>
  );
}

/** Adiciona alpha a uma cor hex tipo #abcdef. */
function hexWithAlpha(hex: string, alpha: number): string {
  // Aceita #rrggbb. Converte alpha (0-1) pra hex (00-FF).
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  dayBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  dayNumber: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
  },
  dayDate: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: 2,
  },
  lodgingEvents: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  lodgingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    maxWidth: '100%',
  },
  lodgingChipOut: {
    backgroundColor: colors.surfaceAlt,
  },
  lodgingChipText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '500',
    flexShrink: 1,
  },
  startRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.primarySofter,
    borderWidth: 1,
    borderColor: colors.primary + '25',
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  startRouteBtnText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  startRouteHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginLeft: spacing.xs,
  },
  emptyHint: {
    paddingVertical: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  periods: {
    gap: spacing.md,
  },
  periodBlock: {
    gap: spacing.xs,
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  periodIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  periodHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginLeft: 2,
  },
  periodCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginLeft: 'auto',
  },
  periodItems: {
    // Items + timeline gutter
  },
  itemRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 50,
  },
  timelineGutter: {
    width: 16,
    alignItems: 'center',
    paddingTop: 6,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 2,
  },
  timelineLineTop: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 12,
    backgroundColor: colors.borderSubtle,
    zIndex: 1,
  },
  timelineLineBottom: {
    position: 'absolute',
    top: 16,
    width: 2,
    bottom: -spacing.xs,
    backgroundColor: colors.borderSubtle,
    zIndex: 1,
  },
  itemContent: {
    flex: 1,
    paddingBottom: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  itemTime: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  itemName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  itemAddress: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  itemNotes: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    marginTop: 2,
  },
  addButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  aiActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
}), [themeVersion]);
}
