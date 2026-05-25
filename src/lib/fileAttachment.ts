import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Helpers pra picker de arquivos (imagem ou PDF) e leitura em base64,
 * pronto pra mandar pra Vision API da OpenAI.
 *
 * Suporta:
 * - Imagens (JPG, PNG, HEIC) — vão direto pra Vision API
 * - PDFs — também aceitos pelo gpt-4o (mas com limite de tamanho)
 */

export type AttachedFile = {
  /** Nome amigável (ex: "reserva.pdf") */
  name: string;
  /** MIME type (image/jpeg, image/png, application/pdf, etc) */
  mimeType: string;
  /** Conteúdo em base64 puro (sem prefixo data:) */
  base64: string;
  /** Tamanho aproximado em bytes (pra alertar usuário se enorme) */
  sizeBytes: number;
};

/** Limite máximo de arquivo: 10MB (OpenAI Vision suporta até ~20MB, mas reduzimos pra segurança) */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Abre o picker de imagens. Suporta câmera + galeria (user escolhe).
 * Retorna null se user cancelou.
 */
export async function pickImage(): Promise<AttachedFile | null> {
  // Permissão de biblioteca de fotos
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permissão de acesso a fotos negada.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8, // compressão leve pra reduzir tamanho
    base64: false, // lemos depois via FileSystem (mais eficiente)
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const uri = asset.uri;
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const name = asset.fileName ?? `imagem_${Date.now()}.jpg`;

  return readAsBase64({ uri, mimeType, name });
}

/**
 * Abre o picker de documento (PDF principalmente).
 * Retorna null se user cancelou.
 */
export async function pickDocument(): Promise<AttachedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return readAsBase64({
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'application/pdf',
    name: asset.name ?? `documento_${Date.now()}`,
  });
}

/**
 * Lê arquivo em base64 e valida tamanho.
 */
async function readAsBase64(input: {
  uri: string;
  mimeType: string;
  name: string;
}): Promise<AttachedFile> {
  const { uri, mimeType, name } = input;

  // Pega tamanho antes pra evitar carregar arquivo enorme na memória
  const info = await FileSystem.getInfoAsync(uri);
  const sizeBytes = (info as any).size ?? 0;

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Arquivo muito grande (${Math.round(sizeBytes / 1024 / 1024)}MB). Máximo 10MB.`,
    );
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });

  return { name, mimeType, base64, sizeBytes };
}

/**
 * Constrói uma data URL "data:image/png;base64,..." a partir de um AttachedFile.
 * Usado pra mandar pra OpenAI Vision API.
 */
export function toDataUrl(file: AttachedFile): string {
  return `data:${file.mimeType};base64,${file.base64}`;
}
