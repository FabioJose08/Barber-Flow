# Regras do Cloud Firestore — Barber Flow

> **Resumo executivo:** o Barber Flow acessa o Firestore **exclusivamente pelo backend**
> (Firebase Admin SDK — ver `database/repository.js`). O Admin SDK **ignora** as
> Security Rules. Portanto, a configuração de produção deste projeto é
> **deny-all explícito**: todo o controle de acesso é feito na aplicação
> (sessões + verificação de propriedade), nunca no Firestore.
>
> Arquivo de produção: [`firestore.rules`](../firestore.rules)

---

## 1. Arquitetura atual (produção)

| Camada | Tecnologia | Autorização |
|---|---|---|
| Cliente (browser) | Express + EJS + sessão (`express-session`) | `middleware/auth.js` |
| Backend | Node.js + `firebase-admin` | Sessão própria (bcrypt) |
| Banco | Cloud Firestore | Security Rules: **deny-all** |

Fluxo de escrita/leitura de hoje:

```
Browser ──(HTTP)──► Express (sessão) ──► routes/*.js ──► repository.js ──► Firestore (Admin SDK)
                                                              │
                                                    (Security Rules NÃO se aplicam ao Admin SDK)
```

### Coleções em uso

| Coleção | Conteúdo | Quem acessa pela API |
|---|---|---|
| `users` | Barbeiros e clientes (**hash bcrypt da senha**) | Somente backend (auth) |
| `appointments` | Agendamentos (nome/telefone, preço, status, `user_id`, `client_id`) | Backend (barbeiro), backend (cliente) |
| `services` | Catálogo de serviços por barbeiro (`user_id`) | Backend |
| `barber_configs` | Horários, intervalo de slots, **`booking_token`** | Backend (dono) |

### Por que deny-all resolve hoje?

1. **Não existe SDK de cliente** no projeto — o `firebase-admin` nunca passa pelas
   regras, então regras permissivas seriam *custo de manutenção zero* e *risco máximo*.
2. `users` guarda hashes de senha: qualquer leitura direta vazaria credenciais.
3. `barber_configs` guarda o `booking_token` (link público de agendamento): expô-lo
   permitiria forjar alterações se regras de escrita forem mal feitas.
4. Erros de regra em produção **bloqueiam o app silenciosamente**; deny-all elimina
   essa classe de incidente até que exista um caso real de acesso direto ao banco.

> ⚠️ **Deploy destas regras:** regras deny-all também protegem contra o caso de o
> service account vazar. Mantenha o deploy em dia com qualquer mudança no schema:
>
> ```bash
> firebase deploy --only firestore:rules
> ```

---

## 2. Blueprint granular — quando migrar para Firebase Auth

Se o produto evoluir para **Firebase Authentication** com SDK de cliente
(recomendado para apps mobile/PWA com login nativo), as regras abaixo substituem
o deny-all. **Não ative parcialmente**: regras híbridas (algumas coleções liberadas
por UID, outras deny) são a fonte nº 1 de vazamento em apps Firestore.

### Pré-requisitos no Firebase Console

1. Ativar **Authentication** (e-mail/senha + Google se desejado).
2. Cada `user.uid` vira o **ID do documento** em `users` (hoje o app usa IDs
   gerados pelo Admin SDK — seria necessária migração de dados).
3. Gravar `role` (`'barbeiro'` | `'cliente'`) no documento `users/{uid}`.
4. `appointments.user_id`, `services.user_id` e `barber_configs.user_id` passam a
   guardar o `uid` (padrão atual: strings — compatível).

```js
// Exemplo de escrita no cliente (futuro):
await setDoc(doc(db, 'users', auth.currentUser.uid), { role: 'cliente' }, { merge: true });
```

### Regras propostas

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ---------- USERS ----------
    // Somente o próprio usuário lê o próprio perfil.
    // A senha deve **sair** deste documento e ir para o Firebase Auth
    // (jamais manter bcrypt + Firebase Auth simultaneamente no mesmo doc).
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create: if isNewUser(uid);            // ver função abaixo
      allow update, delete: if false;             // perfil imutável via SDK
    }

    // ---------- APPOINTMENTS ----------
    match /appointments/{appointmentId} {
      allow read: if isBarberOwner() || isClientOwner();
      allow create: if true;                      // link público de agendamento
      allow update: if isBarberOwner()
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['status', 'service_type', 'price', 'notes']);
      allow delete: if isBarberOwner();
    }

    // ---------- SERVICES ----------
    match /services/{serviceId} {
      allow read: if isBarberOwner() || hasAnyBookingToken();
      allow create, update, delete: if isBarberOwner();
    }

    // ---------- BARBER CONFIGS ----------
    // O booking_token precisa virar um campo opcional em `users` OU o documento
    // config precisa ser filtrável por token sem expor campos sensíveis.
    match /barber_configs/{configId} {
      allow read: if isBarberOwner() || hasAnyBookingToken();
      allow create, update, delete: if isBarberOwner();
    }

    // ---------- CORINGA — segurança padrão ----------
    match /{document=**} {
      allow read, write: if false;
    }

    // ================= FUNÇÕES DE APOIO =================
    function isSignedIn() {
      return request.auth != null;
    }

    function isBarberOwner() {
      return isSignedIn()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'barbeiro'
        && resource.data.user_id == request.auth.uid;
    }

    function isClientOwner() {
      return isSignedIn()
        && resource.data.client_id == request.auth.uid;
    }

    // Permite a criação do próprio perfil (users/{uid}) uma única vez.
    function isNewUser(uid) {
      return request.auth != null
        && request.auth.uid == uid
        && !exists(/databases/$(database)/documents/users/$(uid));
    }

    // Cobre o link público de agendamento: qualquer visitante anônimo pode
    // ler serviços/configs SEM token se o produto permitir booking público.
    // Ajuste conforme a regra de negócio (ver §3).
    function hasAnyBookingToken() {
      return true; // placeholder — decida o critério em §3
    }
  }
}
```

> ⚠️ **Limitações que exigem mudança de modelo** (não resolvíveis só com regras):
> - **Query por telefone** (`findAppointmentsByPhone`) precisa de índice composto
>   e não pode ser filtrada por UID — risco de exposição de terceiros. Solução:
>   subcoleção `users/{uid}/appointments` como fonte de verdade do cliente.
> - **Consulta com múltiplos filtros** é limitada a um `where` + `orderBy` por
>   índice; o padrão atual (filtrar em memória) não transiciona direto para regras.

---

## 3. Decisões de negócio pendentes (link público)

O fluxo `POST /book/:token` (anônimo, sem login) cria agendamentos. Antes de
qualquer regra permissiva, responda:

- [ ] O booking público deve continuar permitido **sem login**?
      `allow create: if true` no `appointments` (com validação no backend).
- [ ] Visitantes anônimos podem **ler serviços** (preço/horários)? Necessário para
      renderizar a página de booking — hoje feito pelo backend, então **não** precisa
      de leitura pelo SDK.
- [ ] O `booking_token` deve impedir que um usuário **logue** acesse serviços de
      OUTRO barbeiro? Se sim, `hasAnyBookingToken()` precisa validar o token —
      regras não leem query params; o token teria que ser um campo no documento
      consultado (ex.: documento público `public/barbers/{token}`).

---

## 4. Checklist de segurança para mudanças futuras

- [ ] **Nunca** `allow read, write: if true` em `users` ou `barber_configs`.
- [ ] Sempre que adicionar uma coleção nova: primeiro adicione a regra explícita
      ou deixe a coringa deny-all cobrindo — nunca crie coleção "por acaso" esperando
      que o deny-all deixe de valer.
- [ ] Se um dia expor SDK de cliente: remova o hash de senha dos documentos
      (Firebase Auth cuida disso) e rode o **Firebase Rules Playground** com
      cenários: leitura de outro usuário, escrita de status por cliente, leitura
      de booking_token por anônimo.
- [ ] Teste regras com `firebase emulators:exec --only firestore` antes de publicar.
