# Edge Function: public-trip

Endpoint público que retorna dados completos de uma viagem via token de compartilhamento.

## Deploy

```bash
# Deploy SEM verificar JWT (queremos acesso público)
supabase functions deploy public-trip --no-verify-jwt
```

`SUPABASE_SERVICE_ROLE_KEY` já é injetada automaticamente pelo Supabase em todas as functions — não precisa setar.

## Como o cliente usa

```
GET https://sakwdwdqsswblwqjtqth.supabase.co/functions/v1/public-trip?token=<TOKEN>
```

Sem autenticação. Resposta:

```json
{
  "share": { "includeLodgings": true, "includeExpenses": false, "includeTasks": false },
  "trip": { ... },
  "days": [ ... ],
  "items": [ ... ],
  "lodgings": [ ... ],
  "expenses": [],
  "tasks": []
}
```

## Status codes

- `200` — sucesso
- `400` — token mal formado
- `404` — token não existe
- `410` — token revogado ou expirado
- `500` — erro do servidor

## Cache

A função define `Cache-Control: public, max-age=60` — links são pseudo-estáticos, 60s de cache no edge.

## Contador de views

A cada GET válido, `public_trip_shares.views` incrementa. Best-effort (não bloqueia resposta).
