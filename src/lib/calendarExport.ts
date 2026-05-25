/**
 * calendarExport.ts — Salva viagem no calendário nativo do celular.
 *
 * Suporta:
 * - Calendário padrão do iOS / Android
 * - Google Calendar (via intent no Android ou URL no iOS)
 * - Outlook / iCal (download .ics)
 *
 * Usa expo-calendar para acesso nativo e Linking para calendários web.
 */

import * as Calendar from 'expo-calendar';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Linking, Platform } from 'react-native';

export type Trip = {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type CalendarOption = {
  id: 'device' | 'google' | 'outlook' | 'ical';
  label: string;
  icon: string;
  description: string;
};

export const CALENDAR_OPTIONS: CalendarOption[] = [
  { id: 'device', label: 'Calendário do celular', icon: '📱', description: 'Salva direto no app Calendário' },
  { id: 'google', label: 'Google Calendar', icon: '📅', description: 'Abre no Google Agenda' },
  { id: 'outlook', label: 'Outlook', icon: '📧', description: 'Exporta arquivo .ics para o Outlook' },
  { id: 'ical', label: 'Arquivo .ics', icon: '📆', description: 'Compatível com qualquer calendário' },
];

/** Formata data para uso no iCal (YYYYMMDD) */
function toICalDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

/** Gera o conteúdo de um arquivo .ics */
function generateICS(trip: Trip): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `trajet-${trip.id}@trajet.app`;
  const start = trip.start_date ? toICalDate(trip.start_date) : toICalDate(new Date().toISOString().split('T')[0]);
  // end_date no iCal é exclusivo (dia seguinte ao último dia)
  let end = start;
  if (trip.end_date) {
    const endDate = new Date(trip.end_date);
    endDate.setDate(endDate.getDate() + 1);
    end = toICalDate(endDate.toISOString().split('T')[0]);
  }

  const description = trip.description
    ? trip.description.replace(/\n/g, '\\n').replace(/,/g, '\\,')
    : 'Criado pelo Trajet';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trajet//Trajet//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:✈ ${trip.title}`,
    `DESCRIPTION:${description}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Salva no calendário nativo do dispositivo */
async function saveToDeviceCalendar(trip: Trip): Promise<void> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permissão negada', 'O Trajet precisa de acesso ao calendário para salvar a viagem.');
    return;
  }

  // Pega o calendário padrão
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writableCalendars = calendars.filter(
    (c) => c.allowsModifications && c.source?.isLocalAccount !== false,
  );
  const defaultCal = writableCalendars.find((c) => c.isPrimary) ?? writableCalendars[0];

  if (!defaultCal) {
    Alert.alert('Calendário não encontrado', 'Nenhum calendário editável foi encontrado no dispositivo.');
    return;
  }

  const startDate = trip.start_date ? new Date(trip.start_date) : new Date();
  // Ajusta para meia-noite local
  startDate.setHours(0, 0, 0, 0);
  const endDate = trip.end_date ? new Date(trip.end_date) : new Date(startDate);
  endDate.setHours(23, 59, 59, 0);

  await Calendar.createEventAsync(defaultCal.id, {
    title: `✈ ${trip.title}`,
    notes: trip.description ?? 'Criado pelo Trajet',
    startDate,
    endDate,
    allDay: true,
    alarms: [{ relativeOffset: -1440 }], // lembrete 1 dia antes
  });

  Alert.alert('Salvo! ✅', `"${trip.title}" foi adicionado ao seu calendário.`);
}

/** Abre no Google Calendar via URL */
async function saveToGoogleCalendar(trip: Trip): Promise<void> {
  const start = trip.start_date?.replace(/-/g, '') ?? '';
  const end = trip.end_date?.replace(/-/g, '') ?? start;
  const title = encodeURIComponent(`✈ ${trip.title}`);
  const details = encodeURIComponent(trip.description ?? 'Criado pelo Trajet');
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}`;
  await Linking.openURL(url);
}

/** Gera .ics e abre share sheet */
async function saveAsICS(trip: Trip): Promise<void> {
  const ics = generateICS(trip);
  const filename = `${trip.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  const uri = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(uri, ics);
  await Sharing.shareAsync(uri, {
    mimeType: 'text/calendar',
    dialogTitle: `Exportar "${trip.title}" para calendário`,
    UTI: 'public.calendar-event',
  });
}

/** Função principal — despacha para o método escolhido */
export async function exportTripToCalendar(
  trip: Trip,
  option: CalendarOption['id'],
): Promise<void> {
  if (!trip.start_date) {
    Alert.alert('Sem data', 'A viagem precisa ter data de início para ser salva no calendário.');
    return;
  }

  try {
    switch (option) {
      case 'device':
        await saveToDeviceCalendar(trip);
        break;
      case 'google':
        await saveToGoogleCalendar(trip);
        break;
      case 'outlook':
      case 'ical':
        await saveAsICS(trip);
        break;
    }
  } catch (err: any) {
    Alert.alert('Erro', err?.message ?? 'Não foi possível salvar no calendário.');
  }
}
