import {useState, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedPress } from '@/components/AnimatedPress';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  MapPin,
  MoreVertical,
  X,
} from '@/components/Icon';
import { translateCategory } from '@/lib/categoryLabels';
import { colors, fontSize, radius, shadow, spacing } from '@/lib/theme';

import type { ItineraryItem } from './types';
import { useTheme } from '@/components/ThemeProvider';

type MobileDragProps = {
  onLongPress: () => void;
  isActive: boolean;
};

type WebControls = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

type Props = {
  item: ItineraryItem;
  onRemove: () => void;
  /** Abre modal de edição ao tocar no item */
  onPress?: () => void;
  onMoveToDay?: () => void;
  onAnalyzeSafety?: () => void;
  hasSafetyAlert?: boolean;
  safetyAlerts?: { alert_type: string; description: string; severity: number }[];
  weatherIcon?: string;
  weatherLabel?: string;
  weatherTemp?: string;       // ex: '32°/24°'
  hasWeatherAlert?: boolean;
  showTime?: boolean;
  mobileDrag?: MobileDragProps;
  webControls?: WebControls;
};

export function ItineraryRow({
  item,
  onRemove,
  onPress,
  onMoveToDay,
  onAnalyzeSafety,
  hasSafetyAlert,
  safetyAlerts,
  weatherIcon,
  weatherLabel,
  weatherTemp,
  hasWeatherAlert,
  showTime,
  mobileDrag,
  webControls,
}: Props) {
  const [safetyExpanded, setSafetyExpanded] = useState(false);
  const [weatherExpanded, setWeatherExpanded] = useState(false);
  const styles = useStyles();
  const title = item.custom_title || item.place?.name || 'Sem título';
  const address = item.place?.address;
  const notes = item.notes;
  const [menuOpen, setMenuOpen] = useState(false);

  // Cor de fundo por categoria (para o fallback sem foto)
  const CATEGORY_COLOR: Record<string, string> = {
    Restaurante: '#e8533a', Café: '#8B6F47', Bar: '#5C3D8F',
    'Fast food': '#e8533a', Hotel: '#2563EB', Hostel: '#2563EB',
    Museu: '#6B46C1', Atração: '#D97706', Mirante: '#0891B2',
    Parque: '#16A34A', Praia: '#0284C7', Monumento: '#7C3AED',
    Igreja: '#6B7280', Catedral: '#6B7280', Castelo: '#7C3AED',
    Mercado: '#B45309', Shopping: '#DB2777', Supermercado: '#B45309',
  };
  const categoryEmoji = '📍'; // mantido para compatibilidade
  const catLabel = item.place?.category ? translateCategory(item.place.category) : '';
  const fallbackColor = CATEGORY_COLOR[catLabel] ?? '#374151';

  const durationLabel = item.duration_minutes
    ? item.duration_minutes >= 60
      ? `${Math.floor(item.duration_minutes / 60)}h${item.duration_minutes % 60 ? String(item.duration_minutes % 60).padStart(2, '0') : ''}`
      : `${item.duration_minutes}min`
    : null;

  // Web: AnimatedPress com spring. Mobile: Pressable normal pra não conflitar com long-press do drag.
  const RowComp: any = mobileDrag ? Pressable : AnimatedPress;

  return (
    <View style={styles.wrapper}>
      {/* ── Coluna esquerda: linha do tempo ─────────────────── */}
      <View style={styles.timelineCol}>
        {showTime && item.start_time ? (
          <View style={styles.timeBlock}>
            <Text style={styles.timeHour}>{formatTime(item.start_time).slice(0, 5)}</Text>
          </View>
        ) : (
          <View style={styles.timeDot} />
        )}
        <View style={styles.timelineLine} />
      </View>

      {/* ── Card principal ───────────────────────────────────── */}
      <View style={styles.cardOuter}>
        <RowComp
          onPress={onPress}
          onLongPress={mobileDrag?.onLongPress}
          delayLongPress={200}
          pressScale={0.98}
          style={[styles.row, mobileDrag?.isActive && styles.rowActive]}
        >
          {mobileDrag && (
            <View style={styles.dragHandle}>
              <GripVertical size={16} color={colors.textMuted} />
            </View>
          )}

          {/* Foto grande ou emoji — estilo Lambus */}
          <View style={styles.photoBox}>
            {(item.place as any)?.photo_url ? (
              <Image
                source={{ uri: (item.place as any).photo_url }}
                style={styles.placePhoto}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.photoFallback, { backgroundColor: fallbackColor }]}>
                <Text style={styles.fallbackLetter}>
                  {(item.place?.name ?? item.custom_title ?? '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            {/* Badge de clima sobreposto na foto */}
            {weatherIcon && (
              <Pressable
                onPress={() => setWeatherExpanded((v) => !v)}
                style={[styles.weatherOverlay, hasWeatherAlert && styles.weatherOverlayAlert]}
                hitSlop={6}
              >
                <Text style={styles.weatherOverlayIcon}>{weatherIcon}</Text>
                {weatherTemp && (
                  <Text style={[styles.weatherOverlayTemp, hasWeatherAlert && { color: colors.danger }]}>
                    {weatherTemp}
                  </Text>
                )}
                {hasWeatherAlert && <View style={styles.weatherAlertDot} />}
              </Pressable>
            )}
          </View>

          {/* Conteúdo */}
          <View style={styles.content}>
            {/* Título */}
            <Text style={styles.title} numberOfLines={1}>{title}</Text>

            {/* Categoria + duração */}
            <View style={styles.metaRow}>
              <Text style={styles.categoryLabel} numberOfLines={1}>
                {categoryEmoji} {item.place?.category ? translateCategory(item.place.category) : 'Local'}
              </Text>
              {durationLabel && (
                <View style={styles.durationPill}>
                  <Clock size={10} color={colors.textMuted} />
                  <Text style={styles.durationText}>{durationLabel}</Text>
                </View>
              )}
            </View>

            {/* Endereço */}
            {!!address && (
              <Text style={styles.addressText} numberOfLines={1}>
                <MapPin size={10} color={colors.textMuted} /> {address}
              </Text>
            )}

            {/* Clima expandido */}
            {weatherExpanded && weatherLabel && (
              <View style={styles.weatherExpandedBox}>
                <Text style={[styles.weatherExpandedText, hasWeatherAlert && { color: colors.danger }]}>
                  {weatherIcon} {weatherLabel}
                  {weatherTemp ? `  ·  ${weatherTemp}` : ''}
                  {hasWeatherAlert ? '  ·  Condições severas' : ''}
                </Text>
              </View>
            )}

            {/* Notas */}
            {!!notes && (
              <Text style={styles.notesText} numberOfLines={1}>💬 {notes}</Text>
            )}

            {/* Alerta de segurança */}
            {hasSafetyAlert && (
              <Pressable
                onPress={() => setSafetyExpanded((v) => !v)}
                style={styles.safetyBadge}
                hitSlop={4}
              >
                <Text style={styles.safetyBadgeText}>
                  ⚠️ Alerta de segurança {safetyExpanded ? '▲' : '▼'}
                </Text>
              </Pressable>
            )}
            {hasSafetyAlert && safetyExpanded && safetyAlerts && safetyAlerts.length > 0 && (
              <View style={styles.safetyBox}>
                {safetyAlerts.map((alert, i) => (
                  <View key={i} style={styles.safetyItem}>
                    <Text style={[
                      styles.safetySeverity,
                      alert.severity === 3 ? styles.severityHigh :
                      alert.severity === 2 ? styles.severityMed : styles.severityLow,
                    ]}>
                      {alert.severity === 3 ? '🔴' : alert.severity === 2 ? '🟡' : '🟠'}
                    </Text>
                    <Text style={styles.safetyText}>
                      {alert.description.replace(/\*\*/g, '').replace(/\*/g, '')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Controles web de ordenação */}
          {webControls && (
            <View style={styles.webControls}>
              <Pressable onPress={webControls.onMoveUp} disabled={!webControls.canMoveUp} hitSlop={6}
                style={[styles.arrowBtn, !webControls.canMoveUp && styles.arrowDisabled]}>
                <ChevronUp size={14} color={colors.textMuted} />
              </Pressable>
              <Pressable onPress={webControls.onMoveDown} disabled={!webControls.canMoveDown} hitSlop={6}
                style={[styles.arrowBtn, !webControls.canMoveDown && styles.arrowDisabled]}>
                <ChevronDown size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          )}

          {/* Menu de ações */}
          {onMoveToDay ? (
            <Pressable onPress={() => setMenuOpen((v) => !v)} hitSlop={8} style={styles.menuBtn}>
              <MoreVertical size={16} color={colors.textMuted} />
            </Pressable>
          ) : (
            <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </RowComp>

      {menuOpen && (
        <View style={styles.menu}>
          {onAnalyzeSafety && (
            <Pressable
              onPress={() => { setMenuOpen(false); onAnalyzeSafety(); }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Text style={styles.menuItemText}>🔍 Analisar segurança do local</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => { setMenuOpen(false); onMoveToDay?.(); }}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Text style={styles.menuItemText}>Mover pra outro dia</Text>
          </Pressable>
          <Pressable
            onPress={() => { setMenuOpen(false); onRemove(); }}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Text style={[styles.menuItemText, styles.menuItemDanger]}>
              Remover do roteiro
            </Text>
          </Pressable>
        </View>
      )}
      </View>
    </View>
  );
}

/** Formata 'HH:MM:SS' ou 'HH:MM' pra 'HH:MM'. */
function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5);
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({

  // ── Layout externo: linha do tempo à esquerda ─────────────
  wrapper: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  timelineCol: {
    width: 48,
    alignItems: 'center',
    paddingTop: 2,
  },
  timeBlock: {
    alignItems: 'center',
    marginBottom: 4,
  },
  timeHour: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  timeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 6,
    marginBottom: 4,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.borderSubtle,
    minHeight: 20,
  },
  cardOuter: {
    flex: 1,
  },

  // ── Card ──────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  rowActive: {
    opacity: 0.88,
    transform: [{ scale: 1.02 }],
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderColor: colors.primary,
  },
  dragHandle: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: spacing.xs,
  },

  // ── Foto ──────────────────────────────────────────────────
  photoBox: {
    width: 72,
    height: 72,
    flexShrink: 0,
    position: 'relative',
  },
  placePhoto: {
    width: 72,
    height: 72,
  },
  photoFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  fallbackLetter: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  categoryEmoji: {
    fontSize: 28,
  },

  // ── Clima sobreposto na foto ───────────────────────────────
  weatherOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  weatherOverlayAlert: {
    backgroundColor: 'rgba(127,29,29,0.75)',
  },
  weatherOverlayIcon: {
    fontSize: 13,
  },
  weatherOverlayTemp: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  weatherAlertDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },

  // ── Conteúdo ──────────────────────────────────────────────
  content: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  categoryLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    flex: 1,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  durationText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  addressText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  notesText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },

  // ── Alertas ───────────────────────────────────────────────
  safetyBadge: {
    backgroundColor: '#7f1d1d18',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  safetyBadgeText: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  safetyBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  safetyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  safetySeverity: { fontSize: 11 },
  severityHigh: {},
  severityMed: {},
  severityLow: {},
  safetyText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    flex: 1,
    lineHeight: 16,
  },
  safetyIcon: { fontSize: 13 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subtitle: { color: colors.textMuted, fontSize: fontSize.xs, flex: 1 },

  // ── Clima expandido ───────────────────────────────────────
  weatherExpandedBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.xs,
  },
  weatherExpandedText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },

  // ── Legados (usados nos badges de clima antigos) ──────────
  weatherBadge: { display: 'none' as any },
  weatherBadgeDanger: {},
  weatherIcon: { fontSize: 16 },
  weatherTemp: { fontSize: 9, color: colors.textMuted, fontWeight: '600' },
  weatherTempAlert: { color: colors.danger },
  weatherAlertPill: { backgroundColor: colors.danger, borderRadius: 8, width: 13, height: 13, alignItems: 'center', justifyContent: 'center' },
  weatherAlertText: { color: '#fff', fontSize: 8, fontWeight: '800' },

  // ── Controles ─────────────────────────────────────────────
  menuBtn: {
    padding: spacing.sm,
  },
  removeBtn: {
    padding: spacing.sm,
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    overflow: 'hidden',
    marginLeft: 48,
  },
  menuItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  menuItemPressed: { backgroundColor: colors.surfaceAlt },
  menuItemText: { color: colors.text, fontSize: fontSize.sm },
  menuItemDanger: { color: colors.danger },
  webControls: { flexDirection: 'column', gap: 2, paddingRight: spacing.xs },
  arrowBtn: { padding: 4 },
  arrowDisabled: { opacity: 0.3 },

  // ── Pills de hora legados (mantidos por compat) ───────────
  timePill: { display: 'none' as any },
  timeText: {},
  iconBox: { display: 'none' as any },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  }), [themeVersion]);
}
