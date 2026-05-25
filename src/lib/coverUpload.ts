import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Upload de cover photo pra uma viagem.
 * Path: <user_id>/<trip_id-timestamp>.<ext>
 *
 * Retorna a URL pública pronta pra usar em <Image>.
 *
 * NÃO atualiza trips.cover_image_url — quem chamou decide se quer salvar.
 * Útil pra o wizard de criação (ainda não tem trip.id quando faz upload).
 */
export async function uploadCoverPhoto(
  userId: string,
  fileUri: string,
  mimeType: string,
  /** Se houver tripId, usa no path. Senão usa "draft-<timestamp>". */
  tripId?: string
): Promise<{ publicUrl: string | null; error: string | null }> {
  try {
    const finalMime = normalizeMime(mimeType, fileUri);
    const ext = mimeToExt(finalMime) || 'jpg';
    const fileBase = tripId ? tripId : `draft-${Date.now()}`;
    const path = `${userId}/${fileBase}.${ext}`;

    let arrayBuffer: ArrayBuffer;
    try {
      const response = await fetch(fileUri);
      if (!response.ok && Platform.OS !== 'web') {
        throw new Error(`fetch returned ${response.status}`);
      }
      const blob = await response.blob();
      arrayBuffer = await blobToArrayBuffer(blob);
    } catch (fetchErr) {
      return {
        publicUrl: null,
        error: `Falha ao ler arquivo: ${fetchErr instanceof Error ? fetchErr.message : 'erro desconhecido'}`,
      };
    }

    if (arrayBuffer.byteLength === 0) {
      return { publicUrl: null, error: 'Arquivo vazio.' };
    }

    const { error: uploadError } = await supabase.storage
      .from('covers')
      .upload(path, arrayBuffer, {
        contentType: finalMime,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Erro upload cover:', uploadError);
      return {
        publicUrl: null,
        error: `Storage: ${uploadError.message}`,
      };
    }

    const { data } = supabase.storage.from('covers').getPublicUrl(path);
    if (!data?.publicUrl) {
      return { publicUrl: null, error: 'URL pública não gerada.' };
    }

    return { publicUrl: data.publicUrl, error: null };
  } catch (err) {
    console.error('Erro inesperado uploadCoverPhoto:', err);
    return {
      publicUrl: null,
      error: err instanceof Error ? err.message : 'Erro desconhecido.',
    };
  }
}

/** Remove a cover do storage (se for upload custom). */
export async function removeCoverPhoto(currentUrl: string | null) {
  if (!currentUrl) return;
  // Só remove se for URL do nosso bucket
  const match = currentUrl.match(/\/covers\/(.+?)(?:\?|$)/);
  if (match?.[1]) {
    await supabase.storage.from('covers').remove([match[1]]);
  }
}

// Helpers (compartilhados com avatar.ts) =====================================

function normalizeMime(mime: string | undefined | null, uri: string): string {
  if (mime && mime.startsWith('image/')) return mime;
  const ext = extractExtFromUri(uri);
  const extMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return extMap[ext ?? ''] ?? 'image/jpeg';
}

function mimeToExt(mime: string): string | null {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[mime] ?? null;
}

function extractExtFromUri(uri: string): string | null {
  const dataMatch = uri.match(/^data:image\/([a-z]+)/i);
  if (dataMatch?.[1]) return dataMatch[1].toLowerCase();
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1]?.toLowerCase() ?? null;
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('FileReader result não é ArrayBuffer'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader erro'));
    reader.readAsArrayBuffer(blob);
  });
}
