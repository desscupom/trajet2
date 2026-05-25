/**
 * TripAssistantModal — Assistente de viagem com IA.
 *
 * Chat flutuante que conhece TODA a viagem: destino, datas, roteiro,
 * hospedagem, despesas e tarefas. Responde perguntas contextuais como:
 * - "Qual o melhor horário para visitar o Cemitério Recoleta?"
 * - "Tem algo para fazer no segundo dia à noite?"
 * - "Quanto ainda tenho de orçamento para restaurantes?"
 * - "Adiciona uma visita ao MALBA na quarta"
 */

import { appendSafetyRules } from '@/lib/contentSafety';
import { useAIConsent } from '@/components/AIConsentModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Camera, Send, Sparkles, X } from '@/components/Icon';
import { callOpenAI, type ChatMessage } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import type { Message } from '@/types/assistant';
export type { Message } from '@/types/assistant';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useAuth } from '@/hooks/useAuth';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripTitle: string;
};

const QUICK_QUESTIONS_GROUP = [
  'Tem conflito de horários no roteiro?',
  'Quem gastou mais até agora?',
  'O que falta decidir para a viagem?',
  'Divida as tarefas pendentes entre os membros',
  'Resuma o roteiro completo',
];

const QUICK_QUESTIONS_PERSONAL = [
  'Quanto gastei até agora?',
  'O que não posso esquecer de fazer?',
  'Quais as melhores dicas para economizar no destino?',
  'Qual o melhor horário para visitar cada lugar?',
  'Crie uma lista de bagagem para essa viagem',
];

export function TripAssistantModal({ visible, onClose, tripId, tripTitle }: Props) {
  const styles = useStyles();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ uri: string; base64: string } | null>(null);
  const { requestConsent, consentModal } = useAIConsent();
  const { user } = useAuth();
  const { context, contextLoading, buildContext } = useAssistantContext({
    tripId,
    userId: user?.id,
    setMessages,
  });
  const listRef = useRef<FlatList>(null);
  const [scope, setScope] = useState<'personal' | 'group'>('group');
  const historyKey = `trajet:assistant:${tripId}:${scope}`;

  // Salva histórico sempre que messages muda
  useEffect(() => {
    if (messages.length > 0 && !contextLoading) {
      const toSave = messages.filter((m) => !m.loading);
      AsyncStorage.setItem(historyKey, JSON.stringify(toSave)).catch(() => {});
    }
  }, [messages, historyKey, contextLoading]);

  // Carrega histórico do banco ao mudar scope ou abrir
  useEffect(() => {
    if (!visible) return;
    loadHistory();
    if (context === '') buildContext();
  }, [visible, tripId, scope]);

  async function loadHistory() {
    try {
      if (scope === 'group') {
        // Carrega do banco — histórico compartilhado
        const { data } = await (supabase as any)
          .from('trip_assistant_messages')
          .select('id, role, content, profile_id, created_at, profile:profiles(full_name, avatar_url)')
          .eq('trip_id', tripId)
          .eq('scope', 'group')
          .order('created_at', { ascending: true })
          .limit(100);

        if (data && data.length > 0) {
          setMessages(data.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            scope: 'group',
            senderName: m.role === 'user' ? (m.profile?.full_name ?? 'Alguém') : null,
            senderAvatar: m.role === 'user' ? (m.profile?.avatar_url ?? null) : null,
          })));
          return;
        }
      } else {
        // Pessoal — do banco filtrado pelo usuário
        const { data } = await (supabase as any)
          .from('trip_assistant_messages')
          .select('id, role, content, created_at')
          .eq('trip_id', tripId)
          .eq('scope', 'personal')
          .eq('profile_id', user?.id)
          .order('created_at', { ascending: true })
          .limit(100);

        if (data && data.length > 0) {
          setMessages(data.map((m: any) => ({ id: m.id, role: m.role, content: m.content, scope: 'personal' })));
          return;
        }
      }
      // Sem histórico — mensagem de boas-vindas
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: scope === 'group'
          ? `Olá! Sou o assistente da viagem **${tripTitle}**. Aqui o histórico é compartilhado com todos os viajantes. Como posso ajudar?`
          : `Olá! Esta é sua conversa pessoal sobre a viagem **${tripTitle}**. Só você vê este histórico. Como posso ajudar?`,
      }]);
    } catch {
      setMessages([]);
    }
  }


  async function sendMessage(text: string, imageOverride?: { uri: string; base64: string } | null) {
    const userText = text.trim();
    const imageToSend = imageOverride !== undefined ? imageOverride : pendingImage;
    if ((!userText && !imageToSend) || loading) return;
    setInput('');
    setPendingImage(null);

    const displayText = userText || (imageToSend ? '📷 Imagem enviada' : '');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: displayText, scope };
    const loadingMsg: Message = { id: 'loading', role: 'assistant', content: '', loading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setLoading(true);

    // Salva mensagem do usuário no banco
    if (user?.id) {
      (supabase as any).from('trip_assistant_messages').insert({
        trip_id: tripId,
        profile_id: user.id,
        scope,
        role: 'user',
        content: userText,
      }).catch(() => {});
    }

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const history: ChatMessage[] = messages
        .filter((m) => !m.loading && m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }));

      const basePrompt = `Você é um assistente de viagens integrado ao app Trajet, especialista e prestativo.
Você conhece todos os detalhes desta viagem:

${context}

REGRAS IMPORTANTES:
1. Interprete sempre a intenção do usuário, mesmo com erros de digitação, abreviações ou frases informais em português. Exemplos: "estou na franca" = França, "add" = adicionar, "tbm" = também.
2. Responda SEMPRE em português brasileiro, de forma direta e útil.
3. Use bullet points ao listar itens. Máximo 4 parágrafos.

AÇÕES QUE VOCÊ PODE EXECUTAR — use o formato exato abaixo quando o usuário pedir:

A) ADICIONAR lugar ao roteiro:
   [AÇÃO: ADICIONAR_LUGAR | dia: "DD/MM" | nome: "Nome do lugar" | tipo: "categoria" | horario: "HH:MM"]
   Peça dia e horário se não informados.

B) REMOVER lugar do roteiro:
   [AÇÃO: REMOVER_LUGAR | nome: "Nome exato do lugar" | dia: "DD/MM"]
   Confirme com o usuário antes de usar este formato. Ex: "Quer que eu remova X do dia DD/MM?"

C) MOVER lugar para outro dia:
   [AÇÃO: MOVER_LUGAR | nome: "Nome do lugar" | dia_atual: "DD/MM" | dia_novo: "DD/MM" | horario: "HH:MM"]
   Pergunte o dia novo e horário se não informados.

D) EDITAR horário de um lugar:
   [AÇÃO: EDITAR_HORARIO | nome: "Nome do lugar" | dia: "DD/MM" | horario_novo: "HH:MM"]

E) CRIAR tarefa:
   [AÇÃO: ADICIONAR_TAREFA | titulo: "Título" | descricao: "Detalhes" | prazo: "YYYY-MM-DD" | prioridade: "high|normal|low"]
   SEMPRE pergunte o prazo antes de criar. Se o usuário disser "sem prazo", omita o campo.

F) MARCAR tarefa como concluída:
   [AÇÃO: CONCLUIR_TAREFA | titulo: "Título ou parte do título da tarefa"]
   Confirme qual tarefa antes de usar este formato.

G) REGISTRAR despesa:
   [AÇÃO: ADICIONAR_DESPESA | descricao: "Descrição" | valor: "99.90" | moeda: "BRL" | categoria: "categoria" | data: "YYYY-MM-DD" | pago_por: "nome ou id"]
   Pergunte valor e quem pagou se não informados.

H) CALCULAR divisão de conta:
   Não usa formato especial — calcule e exiba a divisão em texto, considerando os membros da viagem.

OUTRAS REGRAS:
- Analise conflitos de horário se perguntado.
- Use os dados de despesas para responder sobre orçamento.
- Para viagens de CARRO: calcule combustível e pedágios, sugira paradas a cada 2-3h.
- Para viagens de ÔNIBUS/TREM: informe conexões, tempo de viagem, bagagem.
- Nunca recuse interpretar mensagens por erros de digitação — sempre tente entender.`;

      const systemPrompt = appendSafetyRules(basePrompt);

      // Monta mensagem do usuário (texto + imagem opcional)
      const userContent: any[] = [];
      if (imageToSend?.base64) {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${imageToSend.base64}` },
        });
      }
      if (userText) userContent.push({ type: 'text', text: userText });
      else if (imageToSend) userContent.push({ type: 'text', text: 'Analise esta imagem no contexto da viagem. Se for uma nota fiscal ou conta, registre a despesa. Se for um documento (passaporte, voucher, ingresso), descreva o que vê.' });

      const response = await callOpenAI({
        messages: [
          { role: 'user', content: systemPrompt + '\n\nHistórico da conversa acima. Pergunta atual: ' + (userText || '[imagem enviada]') },
          ...history.slice(-8),
          { role: 'user', content: userContent.length === 1 && !imageToSend ? userText : userContent },
        ],
        model: imageToSend ? 'gpt-4o' : undefined, // gpt-4o para visão
        temperature: 0.7,
        max_tokens: 800,
      });

      let cleanResponse = response;

      // ── Utilitário: extrai campo de uma string de ação ─────────────
      const extractField = (str: string, key: string) => {
        const m = str.match(new RegExp(key + ':\\s*"([^"]+)"', 'i'));
        return m?.[1] ?? null;
      };

      // ── Utilitário: encontra trip_day por "DD/MM" ───────────────────
      const findDay = async (ddmm: string) => {
        const { data: days } = await supabase
          .from('trip_days').select('id, day_date').eq('trip_id', tripId).order('day_date');
        return days?.find((d: any) => {
          const dt = new Date(d.day_date + 'T12:00:00');
          return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}` === ddmm;
        }) ?? null;
      };

      // ── A) ADICIONAR_LUGAR ──────────────────────────────────────────
      const addLugarMatch = response.match(/\[AÇÃO:\s*ADICIONAR_LUGAR[^\]]+\]/i);
      if (addLugarMatch) {
        const s = addLugarMatch[0];
        cleanResponse = cleanResponse.replace(s, '').trim();
        const nome = extractField(s, 'nome');
        const dia  = extractField(s, 'dia');
        const tipo = extractField(s, 'tipo');
        const horario = extractField(s, 'horario');
        if (nome && dia) {
          const targetDay = await findDay(dia);
          if (targetDay) {
            const { data: existing } = await supabase.from('places').select('id')
              .eq('name', nome).eq('trip_id', tripId).maybeSingle();
            let placeId = existing?.id;
            if (!placeId) {
              const { data: np } = await supabase.from('places')
                .insert({ trip_id: tripId, name: nome, category: tipo ?? 'other' })
                .select('id').single();
              placeId = np?.id;
            }
            if (placeId) {
              const { count } = await supabase.from('itinerary_items')
                .select('id', { count: 'exact' }).eq('trip_day_id', targetDay.id);
              await supabase.from('itinerary_items').insert({
                trip_day_id: targetDay.id, place_id: placeId,
                position: count ?? 0, start_time: horario ?? null,
              });
              cleanResponse += `\n\n✅ **${nome}** adicionado ao dia ${dia}${horario ? ` às ${horario}` : ''}.`;
            }
          } else {
            cleanResponse += `\n\n⚠️ Dia ${dia} não encontrado no roteiro.`;
          }
        }
      }

      // ── B) REMOVER_LUGAR ────────────────────────────────────────────
      const remLugarMatch = cleanResponse.match(/\[AÇÃO:\s*REMOVER_LUGAR[^\]]+\]/i);
      if (remLugarMatch) {
        const s = remLugarMatch[0];
        cleanResponse = cleanResponse.replace(s, '').trim();
        const nome = extractField(s, 'nome');
        const dia  = extractField(s, 'dia');
        if (nome) {
          const { data: place } = await supabase.from('places').select('id')
            .eq('trip_id', tripId).ilike('name', `%${nome}%`).maybeSingle();
          if (place) {
            let itemsQuery = (supabase as any).from('itinerary_items').delete().eq('place_id', place.id);
            if (dia) {
              const targetDay = await findDay(dia);
              if (targetDay) itemsQuery = itemsQuery.eq('trip_day_id', targetDay.id);
            }
            const { error } = await itemsQuery;
            if (!error) {
              cleanResponse += `\n\n🗑️ **${nome}** removido do roteiro.`;
            } else {
              cleanResponse += `\n\n⚠️ Não consegui remover. Tente pelo roteiro diretamente.`;
            }
          } else {
            cleanResponse += `\n\n⚠️ Não encontrei "${nome}" no roteiro.`;
          }
        }
      }

      // ── C) MOVER_LUGAR ──────────────────────────────────────────────
      const moveLugarMatch = cleanResponse.match(/\[AÇÃO:\s*MOVER_LUGAR[^\]]+\]/i);
      if (moveLugarMatch) {
        const s = moveLugarMatch[0];
        cleanResponse = cleanResponse.replace(s, '').trim();
        const nome     = extractField(s, 'nome');
        const diaAtual = extractField(s, 'dia_atual');
        const diaNovo  = extractField(s, 'dia_novo');
        const horario  = extractField(s, 'horario');
        if (nome && diaNovo) {
          const novoDia = await findDay(diaNovo);
          const { data: place } = await supabase.from('places').select('id')
            .eq('trip_id', tripId).ilike('name', `%${nome}%`).maybeSingle();
          if (place && novoDia) {
            const { count } = await supabase.from('itinerary_items')
              .select('id', { count: 'exact' }).eq('trip_day_id', novoDia.id);
            const updateData: any = { trip_day_id: novoDia.id, position: count ?? 0 };
            if (horario) updateData.start_time = horario;
            let itemQ = (supabase as any).from('itinerary_items')
              .update(updateData).eq('place_id', place.id);
            if (diaAtual) {
              const diaAtualDay = await findDay(diaAtual);
              if (diaAtualDay) itemQ = itemQ.eq('trip_day_id', diaAtualDay.id);
            }
            const { error } = await itemQ;
            if (!error) {
              cleanResponse += `\n\n✅ **${nome}** movido para o dia ${diaNovo}${horario ? ` às ${horario}` : ''}.`;
            } else {
              cleanResponse += `\n\n⚠️ Não consegui mover. Tente pelo roteiro diretamente.`;
            }
          } else {
            cleanResponse += `\n\n⚠️ Não encontrei "${nome}" ou o dia ${diaNovo}.`;
          }
        }
      }

      // ── D) EDITAR_HORARIO ───────────────────────────────────────────
      const editHorarioMatch = cleanResponse.match(/\[AÇÃO:\s*EDITAR_HORARIO[^\]]+\]/i);
      if (editHorarioMatch) {
        const s = editHorarioMatch[0];
        cleanResponse = cleanResponse.replace(s, '').trim();
        const nome        = extractField(s, 'nome');
        const dia         = extractField(s, 'dia');
        const horarioNovo = extractField(s, 'horario_novo');
        if (nome && horarioNovo) {
          const { data: place } = await supabase.from('places').select('id')
            .eq('trip_id', tripId).ilike('name', `%${nome}%`).maybeSingle();
          if (place) {
            let itemQ = (supabase as any).from('itinerary_items')
              .update({ start_time: horarioNovo }).eq('place_id', place.id);
            if (dia) {
              const targetDay = await findDay(dia);
              if (targetDay) itemQ = itemQ.eq('trip_day_id', targetDay.id);
            }
            const { error } = await itemQ;
            if (!error) {
              cleanResponse += `\n\n✅ Horário de **${nome}** atualizado para ${horarioNovo}.`;
            } else {
              cleanResponse += `\n\n⚠️ Não consegui atualizar o horário.`;
            }
          } else {
            cleanResponse += `\n\n⚠️ Não encontrei "${nome}" no roteiro.`;
          }
        }
      }

      // ── E) ADICIONAR_TAREFA ─────────────────────────────────────────
      const addTarefaMatch = cleanResponse.match(/\[AÇÃO:\s*ADICIONAR_TAREFA[^\]]+\]/i);
      if (addTarefaMatch) {
        const s = addTarefaMatch[0];
        cleanResponse = cleanResponse.replace(s, '').trim();
        const titulo     = extractField(s, 'titulo');
        const descricao  = extractField(s, 'descricao');
        const prazo      = extractField(s, 'prazo');
        const prioridade = extractField(s, 'prioridade');
        if (titulo) {
          const { count } = await supabase.from('tasks')
            .select('id', { count: 'exact' }).eq('trip_id', tripId).eq('done', false);
          const validPriority = ['high','normal','low','urgent'].includes(prioridade ?? '') ? prioridade : 'normal';
          const { data: insertedTask, error: taskError } = await supabase.from('tasks')
            .insert({
              trip_id: tripId, title: titulo, description: descricao ?? null,
              due_date: prazo ?? null, priority: validPriority,
              done: false, position: count ?? 0, assigned_to: user?.id ?? null,
            }).select('id').single();
          if (!taskError && insertedTask) {
            if (prazo) {
              try {
                const { scheduleTaskReminder } = await import('@/lib/taskNotifications');
                await scheduleTaskReminder(insertedTask.id, titulo, prazo, 60);
              } catch (_) {}
            }
            const prazoFmt = prazo
              ? ` com prazo em ${new Date(prazo+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}`
              : '';
            cleanResponse += `\n\n✅ Tarefa **"${titulo}"** criada${prazoFmt}.`;
          } else {
            cleanResponse += `\n\n⚠️ Não consegui criar a tarefa. Tente pela aba de Tarefas.`;
          }
        }
      }

      // ── F) CONCLUIR_TAREFA ──────────────────────────────────────────
      const concluirMatch = cleanResponse.match(/\[AÇÃO:\s*CONCLUIR_TAREFA[^\]]+\]/i);
      if (concluirMatch) {
        const s = concluirMatch[0];
        cleanResponse = cleanResponse.replace(s, '').trim();
        const titulo = extractField(s, 'titulo');
        if (titulo) {
          const { data: tarefas } = await supabase.from('tasks')
            .select('id, title').eq('trip_id', tripId).eq('done', false)
            .ilike('title', `%${titulo}%`).limit(1);
          const tarefa = tarefas?.[0] as any;
          if (tarefa) {
            const { error } = await supabase.from('tasks').update({ done: true }).eq('id', tarefa.id);
            if (!error) {
              try {
                const { cancelTaskReminder } = await import('@/lib/taskNotifications');
                await cancelTaskReminder(tarefa.id);
              } catch (_) {}
              cleanResponse += `\n\n✅ Tarefa **"${tarefa.title}"** marcada como concluída.`;
            } else {
              cleanResponse += `\n\n⚠️ Não consegui concluir a tarefa.`;
            }
          } else {
            cleanResponse += `\n\n⚠️ Não encontrei a tarefa "${titulo}" nos pendentes.`;
          }
        }
      }

      // ── G) ADICIONAR_DESPESA ────────────────────────────────────────
      const addDespesaMatch = cleanResponse.match(/\[AÇÃO:\s*ADICIONAR_DESPESA[^\]]+\]/i);
      if (addDespesaMatch) {
        const s = addDespesaMatch[0];
        cleanResponse = cleanResponse.replace(s, '').trim();
        const descricao = extractField(s, 'descricao');
        const valorStr  = extractField(s, 'valor');
        const moeda     = extractField(s, 'moeda') ?? 'BRL';
        const categoria = extractField(s, 'categoria') ?? 'outros';
        const dataExp   = extractField(s, 'data') ?? new Date().toISOString().slice(0,10);
        const pagoPor   = extractField(s, 'pago_por');
        const valor     = valorStr ? parseFloat(valorStr.replace(',','.')) : null;
        if (descricao && valor && !isNaN(valor)) {
          let paidBy = user?.id ?? null;
          if (pagoPor && !['eu','você','voce'].includes(pagoPor.toLowerCase())) {
            const { data: membros } = await supabase.from('trip_members')
              .select('profile_id, profiles:profile_id(full_name, email)').eq('trip_id', tripId);
            const found = (membros as any[])?.find((m: any) =>
              (m.profiles?.full_name ?? '').toLowerCase().includes(pagoPor.toLowerCase()) ||
              (m.profiles?.email ?? '').toLowerCase().includes(pagoPor.toLowerCase())
            );
            if (found) paidBy = found.profile_id;
          }
          const { error } = await (supabase as any).from('expenses').insert({
            trip_id: tripId, description: descricao,
            amount: valor, amount_in_base: valor,
            currency: moeda, exchange_rate: 1,
            category: categoria, expense_date: dataExp,
            paid_by: paidBy ?? '', payment_type: 'avista',
          });
          if (!error) {
            cleanResponse += `\n\n✅ Despesa **"${descricao}"** de ${moeda} ${valor.toFixed(2)} registrada.`;
          } else {
            cleanResponse += `\n\n⚠️ Não consegui registrar. Tente pela aba de Despesas.`;
          }
        }
      }

      const assistantId = Date.now().toString();
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== 'loading')
          .concat({ id: assistantId, role: 'assistant', content: cleanResponse, scope })
      );

      // Salva resposta no banco
      if (user?.id) {
        (supabase as any).from('trip_assistant_messages').insert({
          trip_id: tripId,
          profile_id: user.id,
          scope,
          role: 'assistant',
          content: cleanResponse,
        }).catch(() => {});
      }
    } catch {
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== 'loading')
          .concat({ id: 'err', role: 'assistant', content: 'Não consegui responder agora. Verifique sua conexão.' })
      );
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  function renderMessage({ item }: { item: Message }) {
    if (item.loading) {
      return (
        <View style={[styles.bubble, styles.bubbleAI]}>
          <View style={styles.typingDots}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.dot, { opacity: 0.4 + i * 0.2 }]} />
            ))}
          </View>
        </View>
      );
    }
    const isUser = item.role === 'user';

    // Renderiza markdown simples: **bold** → Text bold
    const renderContent = (text: string, baseStyle: any) => {
      const parts = (text ?? '').split(/(\*\*[^*]+\*\*)/g);
      return (
        <Text style={baseStyle}>
          {parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <Text key={i} style={{ fontWeight: '700' }}>
                  {part.slice(2, -2)}
                </Text>
              );
            }
            return part;
          })}
        </Text>
      );
    };

    return (
      <View style={[styles.bubbleWrap, isUser && styles.bubbleWrapUser]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Sparkles size={12} color={colors.primary} />
          </View>
        )}
        <View style={styles.bubbleColumn}>
          {/* Nome do remetente no chat do grupo */}
          {scope === 'group' && isUser && item.senderName && (
            <Text style={styles.senderName}>{item.senderName}</Text>
          )}
          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
            {renderContent(item.content, isUser ? styles.bubbleTextUser : styles.bubbleTextAI)}
          </View>
        </View>
      </View>
    );
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7, base64: true, allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingImage({ uri: asset.uri, base64: asset.base64 ?? '' });
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7, base64: true, allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingImage({ uri: asset.uri, base64: asset.base64 ?? '' });
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarWrap}>
              <Sparkles size={18} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Assistente de viagem</Text>
              <Text style={styles.headerSub} numberOfLines={1}>{tripTitle}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Abas: Grupo e Pessoal */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, scope === 'group' && styles.tabActive]}
            onPress={() => { setScope('group'); setMessages([]); }}
          >
            <Text style={[styles.tabText, scope === 'group' && styles.tabTextActive]}>
              👥 Grupo
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, scope === 'personal' && styles.tabActive]}
            onPress={() => { setScope('personal'); setMessages([]); }}
          >
            <Text style={[styles.tabText, scope === 'personal' && styles.tabTextActive]}>
              🔒 Pessoal
            </Text>
          </Pressable>
        </View>

        {contextLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Carregando dados da viagem...</Text>
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
          >
            {/* Mensagens */}
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />

            {/* Quick questions */}
            {messages.length <= 1 && (
              <View style={styles.quickWrap}>
                <Text style={styles.quickLabel}>Perguntas rápidas</Text>
                <View style={styles.quickRow}>
                  {(scope === 'group' ? QUICK_QUESTIONS_GROUP : QUICK_QUESTIONS_PERSONAL).map((q) => (
                    <AnimatedPress
                      key={q}
                      onPress={() => requestConsent(() => sendMessage(q))}
                      pressScale={0.96}
                      style={styles.quickChip}
                    >
                      <Text style={styles.quickChipText}>{q}</Text>
                    </AnimatedPress>
                  ))}
                </View>
              </View>
            )}

            {/* Preview de imagem pendente */}
            {pendingImage && (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: pendingImage.uri }} style={styles.imagePreview} />
                <Pressable onPress={() => setPendingImage(null)} style={styles.imagePreviewRemove} hitSlop={8}>
                  <X size={14} color="#fff" />
                </Pressable>
                <Text style={styles.imagePreviewLabel}>📷 Pronta para enviar</Text>
              </View>
            )}

            {/* Input */}
            <View style={styles.inputWrap}>
              <Pressable onPress={() => {
                Alert.alert('Adicionar imagem', 'Como deseja adicionar?', [
                  { text: 'Câmera', onPress: takePhoto },
                  { text: 'Galeria', onPress: pickImage },
                  { text: 'Cancelar', style: 'cancel' },
                ]);
              }} style={styles.cameraBtn}>
                <Camera size={20} color={colors.textMuted} />
              </Pressable>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={pendingImage ? "Descreva a imagem ou envie assim..." : "Pergunte algo sobre a viagem..."}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                multiline
                maxLength={400}
                returnKeyType="send"
                onSubmitEditing={() => requestConsent(() => sendMessage(input))}
                blurOnSubmit={false}
              />
              <Pressable
                onPress={() => requestConsent(() => sendMessage(input))}
                disabled={(!input.trim() && !pendingImage) || loading}
                style={[styles.sendBtn, ((!input.trim() && !pendingImage) || loading) && styles.sendBtnDisabled]}
              >
                {loading
                  ? <ActivityIndicator size="small" color={colors.primaryTextOnSolid} />
                  : <Send size={18} color={colors.primaryTextOnSolid} />
                }
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
      {consentModal}
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatarWrap: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: colors.primarySoft,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
    headerSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 },
    tabRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: spacing.md,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
    },
    tabActive: {
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
    },
    tabText: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      fontWeight: '500',
    },
    tabTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    bubbleColumn: {
      flex: 1,
      maxWidth: '80%',
    },
    senderName: {
      color: colors.textMuted,
      fontSize: 10,
      marginBottom: 2,
      fontWeight: '600',
      textAlign: 'right',
    },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    loadingText: { color: colors.textMuted, fontSize: fontSize.sm },
    messagesList: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm },
    bubbleWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, marginBottom: spacing.sm },
    bubbleWrapUser: { flexDirection: 'row-reverse' },
    aiAvatar: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: colors.primarySoft,
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    },
    bubble: {
      maxWidth: '80%',
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    bubbleAI: {
      backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border,
      borderBottomLeftRadius: 4,
    },
    bubbleUser: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    bubbleTextAI: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
    bubbleTextUser: { color: '#ffffff', fontSize: fontSize.sm, lineHeight: 20 },
    typingDots: { flexDirection: 'row', gap: 4, padding: 4 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
    quickWrap: { padding: spacing.lg, paddingTop: 0 },
    quickLabel: {
      color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm,
    },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    quickChip: {
      backgroundColor: colors.surface, borderRadius: radius.pill,
      paddingHorizontal: spacing.md, paddingVertical: 7,
      borderWidth: 1, borderColor: colors.border,
    },
    quickChipText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '500' },
    cameraBtn: {
      padding: spacing.sm,
      borderRadius: radius.md,
    },
    imagePreviewWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xs,
    },
    imagePreview: {
      width: 48,
      height: 48,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceAlt,
    },
    imagePreviewRemove: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -14,
      marginTop: -36,
    },
    imagePreviewLabel: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      flex: 1,
    },
    inputWrap: {
      flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
      padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
    },
    input: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: spacing.md, paddingVertical: 10,
      color: colors.text, fontSize: fontSize.sm,
      maxHeight: 100,
    },
    sendBtn: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: colors.primarySoft },
  }), [themeVersion]);
}
