# Encryption Documentation — Trajet
## App Store Compliance — Export Regulations (ERN)

**App Name:** Trajet  
**Bundle ID:** com.trajet.mobile  
**Version:** 1.0.0  
**Date:** May 2026  

---

## 1. Encryption Usage Declaration

The Trajet app uses **standard encryption** that qualifies for the Encryption Registration Number (ERN) exemption under U.S. Export Administration Regulations (EAR), Category 5, Part 2.

**The app does NOT use:**
- Proprietary or non-standard encryption algorithms
- Custom cryptographic implementations
- Encryption for purposes other than protecting user data in transit and at rest

---

## 2. Encryption Methods Used

### 2.1 HTTPS / TLS (Transport Layer Security)
- **Purpose:** All network communication between the app and backend servers (Supabase)
- **Algorithm:** TLS 1.2 and TLS 1.3 (industry standard)
- **Implementation:** iOS built-in NSURLSession / React Native fetch API
- **Qualifies for exemption:** Yes — standard protocol (IETF RFC 8446)

### 2.2 AES-256 (Data at Rest)
- **Purpose:** User data stored in the Supabase database (hosted on AWS)
- **Algorithm:** AES-256 (FIPS 197 standard)
- **Implementation:** Managed entirely by Supabase/AWS infrastructure — NOT implemented by the app itself
- **Qualifies for exemption:** Yes — handled by Apple iOS platform and third-party infrastructure

### 2.3 Keychain (iOS)
- **Purpose:** Secure storage of authentication tokens on device
- **Implementation:** Apple iOS Keychain Services (platform API)
- **Qualifies for exemption:** Yes — Apple platform encryption

### 2.4 JWT (JSON Web Tokens)
- **Purpose:** Authentication session management (Supabase Auth)
- **Algorithm:** HMAC-SHA256 for signature verification
- **Implementation:** Supabase JS SDK (standard library)
- **Qualifies for exemption:** Yes — standard algorithm (IETF RFC 7519)

---

## 3. Exemption Claim

This app qualifies for the **ERN exemption** under:

> **EAR §740.17(b)(3)** — Unrestricted encryption source code  
> **EAR §742.15(b)** — Encryption items using key lengths ≤ 56 bits OR standard algorithms in categories below

Specifically, the app falls under the **"Publicly Available"** and **"Standard Cryptography"** exemptions because:

1. All cryptographic functions are implemented via **Apple iOS platform APIs** (exempt per Apple's own ERN)
2. All server-side encryption is handled by **AWS/Supabase** (they hold their own ERN)  
3. No custom encryption algorithms are implemented in the app codebase
4. The app uses encryption **solely to protect the confidentiality of user data** — not for offensive or restrictive purposes

---

## 4. Info.plist Declaration

The following key is declared in the app's `Info.plist`:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

**Justification:** The app uses only standard, platform-provided encryption (TLS via NSURLSession, iOS Keychain) which is explicitly exempt from export compliance documentation requirements per Apple's guidelines.

---

## 5. Third-Party Libraries Using Encryption

| Library | Purpose | Encryption | ERN Status |
|---------|---------|------------|------------|
| Supabase JS SDK | Backend communication | TLS 1.2+ | Exempt (standard) |
| React Native | Framework | None | N/A |
| expo-secure-store | Token storage | iOS Keychain | Exempt (Apple platform) |
| @supabase/auth-js | Authentication | JWT / HTTPS | Exempt (standard) |

---

## 6. Contact

For questions regarding this encryption documentation:  
**Email:** contato@thedesk.com.br  
**App:** Trajet — com.trajet.mobile
