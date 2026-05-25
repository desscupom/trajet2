# Keystore Android — Trajet

⚠️ **NUNCA compartilhe este arquivo publicamente. Guarde uma cópia no Google Drive ou outro local seguro.**

## Informações do App

| Campo | Valor |
|-------|-------|
| Project | trajet |
| Application Identifier | com.trajet.mobile |
| EAS Build Config | uGPS0JbbWQ (Default) |

## Keystore

| Campo | Valor |
|-------|-------|
| Arquivo | `@andpfjr__trajet.jks` |
| Tipo | JKS |
| Key Alias | `dc60819c59ceb6d64f31649ea1b724d1` |
| Keystore Password | `591b55a0187914403ed657f63ddebc50` |
| Key Password | `0bcff69dc253337eb585916a0848a869` |

## Fingerprints (chave de upload)

| Algoritmo | Fingerprint |
|-----------|-------------|
| MD5 | `2F:BE:C8:4B:51:74:11:20:D7:56:07:1D:A8:04:8C:F7` |
| SHA-1 | `80:F6:BE:12:0D:53:D6:D6:4F:6D:B0:DD:54:7A:3D:FB:8A:80:FF:1F` |
| SHA-256 | `4A:AA:AC:00:69:D5:FB:2E:5F:78:78:02:9B:41:A1:94:69:35:56:7B:38:F5:2A:4F:53:A9:B3:47:CB:D2:71:A1` |

## Chave de assinatura do app (gerenciada pelo Google Play)

| Algoritmo | Fingerprint |
|-----------|-------------|
| MD5 | `50:3F:D9:85:31:7A:80:7E:BC:AC:7F:42:14:2F:86:0E` |
| SHA-1 | `EC:A4:4B:97:0D:1E:F6:33:00:F3:CB:EF:99:F3:BE:03:DA:C4:AF:15` |
| SHA-256 | `11:76:5B:0A:A4:96:DB:34:92:3F:08:EE:5D:C0:11:2F:0A:FA:5E:E3:61:A7:EF:7C:A0:C3:C6:56:DE:20:11:1C` |

## Localização dos arquivos

- Keystore: `C:\Users\ctran\OneDrive\Área de Trabalho\trajet\@andpfjr__trajet.jks`
- Backup antigo: `C:\Users\ctran\OneDrive\Área de Trabalho\trajet\@andpfjr__trajet_OLD_1.jks`

## Como usar em um build manual

```powershell
eas build --platform android --profile production
```

O EAS usa automaticamente o keystore salvo em `expo.dev/accounts/andpfjr/projects/trajet/credentials`.

## Recuperar keystore do EAS

```powershell
eas credentials
# Android → production → Keystore → Download Keystore
```
