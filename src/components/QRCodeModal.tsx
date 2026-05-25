/**
 * QRCodeModal — QR Code real e escaneável.
 * Implementação 100% TypeScript puro, zero dependências externas.
 * Encoder QR Code versão 1-10, modo byte, ECC level M.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '@/components/ThemeProvider';
import { X } from '@/components/Icon';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

// ─── GF(256) para Reed-Solomon ───────────────────────────────────
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number) {
  if (!a || !b) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function rsEncode(data: number[], n: number): number[] {
  // Gera polinômio gerador
  let g = [1];
  for (let i = 0; i < n; i++) {
    const r: number[] = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) r[j] ^= g[j];
    for (let j = 0; j < g.length; j++) r[j + 1] ^= gfMul(g[j], GF_EXP[i]);
    g = r;
  }
  const msg = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const c = msg[i];
    if (c) for (let j = 0; j < g.length; j++) msg[i + j] ^= gfMul(g[j], c);
  }
  return msg.slice(data.length);
}

// ─── Capacidades ECC M por versão ────────────────────────────────
// [totalCodewords, eccPerBlock, blocks]
const VER_INFO: [number, number, number][] = [
  [0,0,0],     // placeholder v0
  [26,10,1],   // v1
  [44,16,1],   // v2
  [70,26,1],   // v3
  [100,18,2],  // v4
  [134,24,2],  // v5
  [172,16,4],  // v6
  [196,18,4],  // v7
  [242,22,4],  // v8 (2 blocks com 2 extra)
  [292,22,5],  // v9
  [346,26,5],  // v10
];

// Capacidade de dados (bytes) por versão, ECC M
const DATA_CAP = [0,16,28,44,64,86,108,124,154,182,216];

// ─── Encoder principal ───────────────────────────────────────────
function buildQR(url: string): boolean[][] | null {
  const bytes = Array.from(new TextEncoder().encode(url));
  const len = bytes.length;

  let version = 1;
  while (version <= 10 && DATA_CAP[version] < len) version++;
  if (version > 10) version = 10; // trunca se muito longo

  const size = version * 4 + 17;
  const [totalCW, eccCW, numBlocks] = VER_INFO[version];
  const dataCW = totalCW - eccCW * numBlocks;

  // ─ Bits de dados ─
  const bits: number[] = [];
  const pushBits = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4);       // modo byte
  pushBits(len, 8);          // comprimento
  bytes.forEach(b => pushBits(b, 8));

  // Terminator + padding
  pushBits(0, Math.min(4, dataCW * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const pad = [0xEC, 0x11];
  while (bits.length < dataCW * 8) {
    bits.push(...pad[(bits.length / 8 % 2) === 0 ? 0 : 1].toString(2).padStart(8,'0').split('').map(Number));
  }

  // Bytes de dados
  const dataBytes: number[] = [];
  for (let i = 0; i < dataCW; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | (bits[i * 8 + b] ?? 0);
    dataBytes.push(v);
  }

  // ─ Reed-Solomon por bloco ─
  const blockSize = Math.floor(dataCW / numBlocks);
  const extraBlocks = dataCW % numBlocks;
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let pos = 0;
  for (let b = 0; b < numBlocks; b++) {
    const sz = b < numBlocks - extraBlocks ? blockSize : blockSize + 1;
    const block = dataBytes.slice(pos, pos + sz);
    dataBlocks.push(block);
    eccBlocks.push(rsEncode(block, eccCW));
    pos += sz;
  }

  // Intercala codewords
  const codewords: number[] = [];
  const maxDataSz = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxDataSz; i++)
    dataBlocks.forEach(b => { if (i < b.length) codewords.push(b[i]); });
  for (let i = 0; i < eccCW; i++)
    eccBlocks.forEach(b => codewords.push(b[i]));

  // ─ Constrói matrix ─
  // null = não preenchido, true = escuro, false = claro
  const mat: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isFn: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const set = (r: number, c: number, dark: boolean, fn = false) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    mat[r][c] = dark;
    if (fn) isFn[r][c] = true;
  };

  // Finder patterns
  const addFinder = (row: number, col: number) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      if (dr === -1 || dr === 7 || dc === -1 || dc === 7) { set(row+dr, col+dc, false, true); continue; }
      if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
        const dark = dr===0||dr===6||dc===0||dc===6||(dr>=2&&dr<=4&&dc>=2&&dc<=4);
        set(row+dr, col+dc, dark, true);
      }
    }
  };
  addFinder(0, 0); addFinder(0, size-7); addFinder(size-7, 0);

  // Timing
  for (let i = 8; i < size-8; i++) {
    set(6, i, i%2===0, true);
    set(i, 6, i%2===0, true);
  }

  // Dark module
  set(8, size-8, true, true);

  // Alignment patterns (v >= 2)
  const ALIGN: Record<number,number[]> = {2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],
    7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};
  for (const r of (ALIGN[version]??[])) for (const c of (ALIGN[version]??[])) {
    if (isFn[r][c]) continue;
    for (let dr=-2;dr<=2;dr++) for (let dc=-2;dc<=2;dc++)
      set(r+dr, c+dc, Math.max(Math.abs(dr),Math.abs(dc))!==1, true);
  }

  // Reserva formato
  for (let i=0;i<9;i++) { isFn[8][i]=true; isFn[i][8]=true; }
  for (let i=0;i<8;i++) { isFn[8][size-1-i]=true; isFn[size-1-i][8]=true; }

  // ─ Coloca dados em zigue-zague ─
  let cwIdx = 0, bitIdx = 7;
  let up = true;
  for (let col = size-1; col >= 1; col -= 2) {
    if (col === 6) col--;
    for (let row = 0; row < size; row++) {
      const r = up ? size-1-row : row;
      for (let dx = 0; dx <= 1; dx++) {
        const c = col - dx;
        if (!isFn[r][c] && mat[r][c] === null) {
          const bit = cwIdx < codewords.length ? (codewords[cwIdx] >> bitIdx) & 1 : 0;
          mat[r][c] = bit === 1;
          bitIdx--;
          if (bitIdx < 0) { bitIdx = 7; cwIdx++; }
        }
      }
    }
    up = !up;
  }

  // ─ Aplica máscara 0 (padrão simples) e formato ─
  const MASK = (r: number, c: number) => (r + c) % 2 === 0;
  for (let r=0;r<size;r++) for (let c=0;c<size;c++) {
    if (!isFn[r][c] && mat[r][c] !== null && MASK(r,c)) mat[r][c] = !mat[r][c];
  }

  // Format string (ECC M = 00, mask 000 → 101010000010010)
  // Pré-calculado para mask pattern 0, ECC M
  const FMT = [1,0,1,0,1,0,0,0,0,0,1,0,0,1,0];
  const setFmt = (r: number, c: number, i: number) => set(r, c, FMT[i] === 1, true);
  let fi = 0;
  for (let i=0;i<=5;i++) setFmt(8, i, fi++);
  setFmt(8, 7, fi++); setFmt(8, 8, fi++); setFmt(7, 8, fi++);
  for (let i=5;i>=0;i--) setFmt(i, 8, fi++);
  fi = 0;
  for (let i=size-1;i>=size-7;i--) setFmt(8, i, fi++);
  setFmt(8, size-8, fi++);
  for (let i=size-9;i>=0&&fi<15;i--) setFmt(i, 8, fi++);

  // Converte null → false
  return mat.map(row => row.map(v => v === true));
}

// ─── Componente ──────────────────────────────────────────────────
const CELL = 8;
const PAD  = 12;

type Props = {
  visible: boolean;
  onClose: () => void;
  url: string;
  tripTitle: string;
};

export function QRCodeModal({ visible, onClose, url, tripTitle }: Props) {
  const styles = useStyles();
  const matrix = useMemo(() => {
    if (!url) return null;
    try { return buildQR(url); } catch { return null; }
  }, [url]);

  const size = matrix?.length ?? 0;
  const svgSz = size * CELL + PAD * 2;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={e => e.stopPropagation()}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>QR Code do convite</Text>
              <Text style={styles.sub} numberOfLines={1}>{tripTitle}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}><X size={20} color={colors.textMuted}/></Pressable>
          </View>

          {matrix && size > 0 ? (
            <View style={styles.qrWrap}>
              <Svg width={svgSz} height={svgSz}>
                <Rect x={0} y={0} width={svgSz} height={svgSz} fill="#ffffff"/>
                {matrix.map((row, r) =>
                  row.map((dark, c) => dark ? (
                    <Rect key={`${r}-${c}`}
                      x={c*CELL+PAD} y={r*CELL+PAD}
                      width={CELL} height={CELL}
                      fill="#0a0a14"/>
                  ) : null)
                )}
              </Svg>
            </View>
          ) : (
            <View style={[styles.qrWrap, {alignItems:'center',justifyContent:'center',height:200}]}>
              <Text style={{color:colors.textMuted,fontSize:fontSize.sm}}>QR não disponível</Text>
            </View>
          )}

          <Text style={styles.hint}>Aponte a câmera para escanear{'\n'}ou compartilhe o link abaixo</Text>
          <Text style={styles.urlText} numberOfLines={2}>{url}</Text>

          <Pressable
            onPress={() => Share.share({ message: url, title: `Convite para ${tripTitle}` })}
            style={styles.shareBtn}
          >
            <Text style={styles.shareBtnText}>🔗 Compartilhar link</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    overlay: { flex:1, backgroundColor:'rgba(0,0,0,0.65)', justifyContent:'center', alignItems:'center', padding:spacing.xl },
    card: { backgroundColor:colors.bg, borderRadius:radius.xl, padding:spacing.lg, width:'100%', maxWidth:340, alignItems:'center' },
    header: { flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between', width:'100%', marginBottom:spacing.lg },
    title: { color:colors.text, fontSize:fontSize.lg, fontWeight:'700' },
    sub: { color:colors.textMuted, fontSize:fontSize.xs, marginTop:2 },
    qrWrap: { backgroundColor:'#fff', borderRadius:radius.md, padding:4, marginBottom:spacing.lg, borderWidth:1, borderColor:colors.border },
    hint: { color:colors.textMuted, fontSize:fontSize.xs, textAlign:'center', lineHeight:18, marginBottom:spacing.md },
    urlText: { color:colors.primary, fontSize:11, textAlign:'center', marginBottom:spacing.lg, paddingHorizontal:spacing.sm },
    shareBtn: { backgroundColor:colors.primarySoft, borderRadius:radius.md, paddingHorizontal:spacing.xl, paddingVertical:spacing.md, borderWidth:1, borderColor:colors.primary+'40' },
    shareBtnText: { color:colors.primary, fontWeight:'700', fontSize:fontSize.sm },
  }), [themeVersion]);
}
