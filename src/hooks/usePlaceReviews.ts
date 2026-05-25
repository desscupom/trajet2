import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type PlaceReview = {
  id: string;
  place_id: string;
  place_name: string;
  trip_id: string | null;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  visited_at: string;
  helpful_count: number;
  created_at: string;
  profile?: { full_name: string | null; avatar_url: string | null };
  my_helpful_vote?: boolean;
};

export type CreateReviewInput = {
  place_id: string;
  place_name: string;
  trip_id?: string;
  rating: number;
  title?: string;
  body?: string;
  visited_at: string;
};

export function usePlaceReviews(placeId: string, currentUserId: string | null) {
  const [reviews, setReviews] = useState<PlaceReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [avgRating, setAvgRating] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!placeId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('place_reviews')
        .select(`
          *,
          profile:profiles!user_id(full_name, avatar_url)
        `)
        .eq('place_id', placeId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!data) return;

      // Busca votos do usuário atual
      let myVotes: string[] = [];
      if (currentUserId) {
        const { data: votes } = await supabase
          .from('review_helpful_votes')
          .select('review_id')
          .eq('user_id', currentUserId)
          .in('review_id', data.map((r: any) => r.id));
        myVotes = (votes ?? []).map((v: any) => v.review_id);
      }

      const enriched = data.map((r: any) => ({
        ...r,
        my_helpful_vote: myVotes.includes(r.id),
      }));

      setReviews(enriched);
      if (enriched.length > 0) {
        const avg = enriched.reduce((s: number, r: PlaceReview) => s + r.rating, 0) / enriched.length;
        setAvgRating(Math.round(avg * 10) / 10);
      }
    } finally {
      setLoading(false);
    }
  }, [placeId, currentUserId]);

  useEffect(() => { load(); }, [load]);

  const submitReview = useCallback(async (input: CreateReviewInput): Promise<boolean> => {
    if (!currentUserId) return false;
    const { error } = await supabase.from('place_reviews').upsert({
      ...input,
      user_id: currentUserId,
    }, { onConflict: 'user_id,place_id,visited_at' });
    if (!error) await load();
    return !error;
  }, [currentUserId, load]);

  const toggleHelpful = useCallback(async (reviewId: string, currentlyVoted: boolean): Promise<void> => {
    if (!currentUserId) return;
    if (currentlyVoted) {
      await supabase.from('review_helpful_votes')
        .delete()
        .eq('review_id', reviewId)
        .eq('user_id', currentUserId);
    } else {
      await supabase.from('review_helpful_votes')
        .insert({ review_id: reviewId, user_id: currentUserId });
    }
    await load();
  }, [currentUserId, load]);

  return { reviews, loading, avgRating, submitReview, toggleHelpful, reload: load };
}
