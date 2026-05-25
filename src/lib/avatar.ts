import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Upload de avatar pro bucket "avatars" no Supabase Storage.
 * Path: <user_id>/<timestamp>.<ext>
 *
 * Cross-platform: web e mobile.
 * - Web: lê o arquivo como ArrayBuffer via fetch
 * - Mobile (RN): mesma coisa, mas com fallback via FileReader pra data URIs
 *
 * Retorna a URL pública pronta pra usar em <Image>.
 */
export async function uploadAvatar(
  userId: string,
  fileUri: string,
  mimeType: string
): Promise<{ publicUrl: string | null; error: string | null }> {
  try {
    // 1. Determina extensão e content-type
    const finalMime = normalizeMime(mimeType, fileUri);
    const ext = mimeToExt(finalMime) || 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;

    // 2. Converte uri pra ArrayBuffer
    let arrayBuffer: ArrayBuffer;
    try {
      const response = await fetch(fileUri);
      if (!response.ok && Platform.OS !== 'web') {
        throw new Error(`fetch returned ${response.status}`);
      }
      // No mobile, fetch de file:// sempre retorna ok=true
      // No web, fetch de blob: ou data: também
      const blob = await response.blob();

      // FileReader pra garantir conversão (mais portátil que blob.arrayBuffer())
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

    // 3. Upload pro Supabase Storage com upsert (sobrescreve se houver conflito)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, arrayBuffer, {
        contentType: finalMime,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Erro upload Supabase:', uploadError);
      return {
        publicUrl: null,
        error: `Storage: ${uploadError.message}`,
      };
    }

    // 4. Pega a URL pública
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    if (!data?.publicUrl) {
      return { publicUrl: null, error: 'URL pública não gerada.' };
    }

    // 5. Salva no profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_url: data.publicUrl })
      .eq('id', userId);

    if (profileError) {
      console.error('Erro update profile:', profileError);
      return {
        publicUrl: null,
        error: `Profile: ${profileError.message}`,
      };
    }

    return { publicUrl: data.publicUrl, error: null };
  } catch (err) {
    console.error('Erro inesperado uploadAvatar:', err);
    return {
      publicUrl: null,
      error: err instanceof Error ? err.message : 'Erro desconhecido.',
    };
  }
}

/** Remove o avatar atual e limpa avatar_url. */
export async function removeAvatar(userId: string, currentUrl: string | null) {
  if (currentUrl) {
    // URL pública tem formato:
    // https://<project>.supabase.co/storage/v1/object/public/avatars/<userId>/<filename>
    const match = currentUrl.match(/\/avatars\/(.+?)(?:\?|$)/);
    if (match?.[1]) {
      await supabase.storage.from('avatars').remove([match[1]]);
    }
  }
  await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
}

// =========================================
// Helpers
// =========================================

/**
 * Garante que temos um MIME type válido.
 * Se vier vazio/undefined do picker, infere pela extensão da URI.
 */
function normalizeMime(mime: string | undefined | null, uri: string): string {
  if (mime && mime.startsWith('image/')) return mime;

  const ext = extractExtFromUri(uri);
  const extMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
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
  // Para data URIs (data:image/jpeg;base64,...) extrai do mime
  const dataMatch = uri.match(/^data:image\/([a-z]+)/i);
  if (dataMatch?.[1]) return dataMatch[1].toLowerCase();
  // Para file URIs e https URIs
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Converte Blob em ArrayBuffer.
 * Usa FileReader pra ser portátil (alguns ambientes RN não têm blob.arrayBuffer()).
 */
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  // Caminho rápido: alguns ambientes têm blob.arrayBuffer()
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  // Fallback via FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader result não é ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader erro'));
    reader.readAsArrayBuffer(blob);
  });
}
