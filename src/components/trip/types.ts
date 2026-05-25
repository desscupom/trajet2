export type ItineraryItem = {
  id: string;
  trip_day_id: string;
  custom_title: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  position: number;
  place: {
    id: string;
    name: string;
    address: string | null;
    category: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
};

export type TripDay = {
  id: string;
  day_date: string;
  position: number;
  notes: string | null;
};
