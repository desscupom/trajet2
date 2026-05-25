# Trajet

App de gestão de viagens — web, iOS e Android com a mesma base de código.

## Stack

- **Expo + Expo Router** — uma base, três plataformas
- **TypeScript** com tipagem fim-a-fim
- **Supabase** — Postgres, auth, storage, realtime
- **OpenStreetMap (Nominatim)** — busca de lugares grátis, sem chave

## Pré-requisitos

- Node.js 18+ ([recomendo via nvm](https://github.com/nvm-sh/nvm))
- npm
- Mobile: app **Expo Go** (Play Store / App Store) ou simulador

## Como rodar

```bash
npm install
npm start
```

No menu:
- `w` — navegador (mais rápido pra testar)
- `i` — simulador iOS (precisa Xcode)
- `a` — emulador Android (precisa Android Studio)
- Ou escaneie o QR code com o **Expo Go**

### Se o QR code não conectar (erro `127.0.0.1:8081`)

Acontece quando celular e PC estão em redes diferentes ou o firewall bloqueia.
Solução universal: rode com túnel:

```bash
npx expo start --tunnel
```

É um pouco mais lento mas funciona em qualquer rede.

## Estrutura

```
trajet/
├── app/                              # Rotas (file-based)
│   ├── _layout.tsx                   # Root + redirecionamento por sessão
│   ├── (auth)/
│   │   ├── sign-in.tsx
│   │   └── sign-up.tsx
│   └── (app)/
│       ├── index.tsx                 # Lista de viagens
│       ├── new-trip.tsx              # Criar viagem
│       └── trip/[id]/index.tsx       # Detalhe com abas
├── src/
│   ├── components/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── DateField.tsx             # Date picker nativo
│   │   ├── PlaceSearchModal.tsx      # Busca de lugares (Nominatim)
│   │   └── trip/
│   │       ├── ItineraryTab.tsx      # Aba de roteiro por dia
│   │       └── ComingSoonTab.tsx     # Placeholder das outras abas
│   ├── hooks/useAuth.ts
│   └── lib/
│       ├── supabase.ts
│       ├── database.types.ts
│       ├── theme.ts
│       ├── dates.ts                  # Formatação pt-BR
│       └── places.ts                 # Cliente Nominatim
└── .env                              # URL e chave do Supabase
```

## O que já funciona

✅ Cadastro com email + senha (perfil criado via trigger)
✅ Login persistente (AsyncStorage no mobile, localStorage no web)
✅ Lista de viagens com pull-to-refresh
✅ **Criar viagem com date picker nativo** (datas em pt-BR: "15 de out. de 2026")
✅ **Trip days criados automaticamente** ao salvar a viagem com datas
✅ **Detalhe da viagem com abas** (Roteiro / Lugares / Despesas / Tarefas)
✅ **Roteiro por dia funcional**: cada dia listado, lugares agendados, adicionar via busca
✅ **Busca de lugares pelo OpenStreetMap** (gratuito, sem chave)
✅ **Remoção de itens** do roteiro
✅ **Reordenar itens com drag-and-drop** (mobile) e setinhas (web)
✅ **Aba Lugares com mapa interativo** (Leaflet + OpenStreetMap, sem chave)
✅ **Sincronia mapa ↔ lista**: tocar no item foca o pino, e vice-versa
✅ **Convidar amigos por link** com tokens seguros, expiração e revogação
✅ **Gerenciar membros**: avatares na tela da viagem, modal pra ver/remover/sair
✅ **Roles**: dono, editor, visualizador (com permissões diferentes via RLS)
✅ **Aba Despesas multi-moeda**: registre em qualquer moeda, conversão automática via exchangerate.host
✅ **Divisão entre membros**: escolha quem pagou e entre quem dividir; saldo "quem deve a quem" calculado em tempo real
✅ **Realtime sync**: edições aparecem na hora pra todos os membros (roteiro, lugares, despesas, membros)

## Próximos passos sugeridos

1. **Aba Tarefas** com checklist colaborativo
2. **Roteiro com IA** (Claude API via edge function pra gerar sugestões de dia inteiro)
3. **Importação de e-mail** de reserva (parsing Booking/Latam/Airbnb)
4. **Modo offline** com mapas baixados (cache de tiles)
5. **Mover itens entre dias** (arrastar do Dia 2 pro Dia 3)
6. **Fotos por lugar** (Storage do Supabase)
7. **Notificações push** quando alguém edita
8. **Settle up** das despesas (algoritmo greedy — quem paga quem com menos transações)
9. **Despesas: divisão personalizada** (cada pessoa paga X em vez de igualitária)

## TODO de segurança

- [ ] Ativar **Leaked Password Protection** no Supabase Auth (HaveIBeenPwned)
  - No dashboard do projeto: Authentication → Policies → "Leaked password protection"

## Detalhes técnicos

### Como funciona o realtime

Cada aba e a Home se inscrevem em mudanças via **Supabase Realtime**, que ouve mudanças
da publicação Postgres do banco. O hook `useRealtimeTable` cuida disso — qualquer
INSERT/UPDATE/DELETE numa tabela observada dispara um refetch.

Tabelas com realtime ativo: `trips`, `trip_members`, `trip_days`, `places`,
`itinerary_items`, `expenses`, `expense_shares`, `tasks`.

Resultado prático: se você está editando o roteiro e seu amigo (membro) adiciona um
lugar do celular dele, você vê aparecer na sua tela em ~1s sem fazer nada.

### Como funciona a conversão de moedas

Toda despesa em moeda diferente da viagem dispara uma busca em **exchangerate.host**
(API gratuita, dados do European Central Bank) pra cotação do dia da despesa. Salvamos:

- Valor original (ex: €50)
- Moeda original (EUR)
- Taxa do dia (ex: 5.6234)
- Valor convertido pra moeda-base (R$ 281,17)

Salvar a taxa do dia da despesa é importante: se rolar uma cotação 6 meses depois,
o histórico não muda. Quem deve quanto continua sendo o que valia naquela hora.

### Como funciona o mapa

Usamos **Leaflet** (lib JS de mapa, gratuita) embutido em uma WebView (mobile) ou
iframe (web). Tiles vêm do **OpenStreetMap**, sem chave de API.

A comunicação entre o app e o mapa usa `postMessage`:
- App → mapa: foca um pino quando você toca em um lugar da lista
- Mapa → app: avisa quando você toca em um pino

### Como funciona o reordenamento

- **No iOS/Android:** segure um item por meio segundo e arraste
- **No navegador:** use as setinhas ▲ ▼

A nova ordem é persistida no banco (campo `position` em `itinerary_items`).

## Notas técnicas

### Como funcionam os convites

Quando você gera um convite, criamos um token aleatório seguro de 24 bytes (32 chars
em base64url). O link tem o formato `https://app/invite/<token>` no web ou
`trajet://invite/<token>` no mobile.

A pessoa que recebe abre o link, é redirecionada para login se necessário, e vê uma
prévia da viagem (nome, datas, quem convidou) antes de aceitar. Se aceitar, é
adicionada como `trip_member` com o role configurado no convite (`editor` ou `viewer`).

Convites têm:
- **Expiração** (padrão 30 dias)
- **Limite de usos** (opcional, null = ilimitado)
- **Revogação** (owner pode invalidar a qualquer momento)

A função `accept_trip_invite` no Postgres roda como `SECURITY DEFINER` para
poder inserir em `trip_members` mesmo sem o usuário ter acesso à viagem ainda.

### Nominatim — política de uso

A API do OpenStreetMap é gratuita mas tem limites:
- 1 requisição por segundo por IP
- User-Agent obrigatório (já configurado)
- Para volume alto, hospedar instância própria

A busca já tem debounce de 400ms para respeitar isso.

### Regenerar tipos do banco

Se mudar o schema no Supabase:

```bash
npx supabase gen types typescript --project-id sakwdwdqsswblwqjtqth > src/lib/database.types.ts
```
