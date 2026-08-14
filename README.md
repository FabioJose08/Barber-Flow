# BarberFlow 💈

Projetado especialmente para uso móvel direto no salão, possui uma interface premium com estética clássica e escura (tons de carvão e detalhes em dourado).

Banco de dados gerenciado pelo **Firebase Firestore (Google)** — persistência em nuvem, sem servidor de banco local.

---

## 🚀 Recursos Principais

1. **Aesthetics Barberia Premium**: Design moderno, responsivo (com menu hambúrguer para celular e barra lateral para computadores), construído em CSS puro.
2. **Autenticação Segura**: Controle de acesso individual com criptografia de senhas via `bcrypt` e gerenciamento de sessões com `express-session`.
3. **Filtro de Dono (Multi-tenant simples)**: Cada barbeiro cadastrado tem acesso exclusivo apenas aos seus próprios clientes, agendamentos e faturamento.
4. **Painel de Controle Inteligente (Dashboard)**:
   *   Clientes agendados para o dia atual.
   *   Faturamento diário (soma dos atendimentos finalizados hoje).
   *   Faturamento acumulado geral.
   *   Contagem em tempo real por status (Agendado, Em Andamento, Finalizado, Cancelado).
   *   Lista dos próximos clientes com botões de ação rápida.
5. **Ações Rápidas no Celular**: Botões no painel para mudar o status do cliente com 1 toque (*"Iniciar"* para mudar para Em Andamento e *"Concluir"* para Finalizar e somar o valor no faturamento).
6. **Agenda com Filtros Avançados**: Busca por nome do cliente, filtro por status e filtro por período de tempo (Hoje, Amanhã, Semana ou Data específica).
7. **Agendamento Online (Link Público)**: Cada barbeiro possui um link exclusivo para compartilhar com clientes, que agendam seus próprios horários.

---

## 🛠️ Tecnologias Utilizadas

*   **Backend**: Node.js & Express.js
*   **Banco de Dados**: **Firebase Firestore (Google)** via `firebase-admin`
*   **Frontend / Templates**: EJS (Embedded JavaScript templates)
*   **Estilização**: CSS Puro (Vanilla CSS) com layout responsivo Mobile-First
*   **Interatividade**: JavaScript Puro (Vanilla JS)
*   **Segurança**: `bcrypt` para criptografia de senhas e `express-session` para sessões de usuário
*   **Testes**: `node:test` (built-in) + `supertest`

---

## 🧪 Testes Unitários e de Integração

Rodar a suíte completa (66 testes — helpers, repositório e rotas):

```bash
npm test
```

Os testes usam um **Firestore em memória** (`database/memory-store.js`) compatível com a API do Firestore, garantindo que rodem sem precisar de credenciais reais.

---

## 📦 Estrutura do Projeto

```
├── database/
│   ├── firebase.js           # Inicialização do Firebase Admin (ou memory-store em dev)
│   ├── memory-store.js       # Firestore em memória para desenvolvimento/testes
│   ├── helpers.js            # Serialização de dados (Timestamps, ids)
│   └── repository.js         # Camada de acesso a dados (substitui o Mongoose)
├── middleware/
│   └── auth.js               # Filtros de rotas protegidas (Session Guard)
├── routes/
│   ├── auth.js               # Rotas de Login, Registro e Logout
│   ├── appointments.js       # CRUD de agendamentos e controle de status
│   ├── booking.js            # Agendamento público via link (token)
│   ├── client.js             # Dashboard e cancelamento do cliente
│   ├── dashboard.js          # Estatísticas e renderização do painel
│   ├── financial.js          # Relatório financeiro
│   └── services.js           # Catálogo de serviços e configurações
├── tests/
│   ├── helpers.test.js       # Testes unitários dos helpers
│   ├── repository.test.js    # Testes unitários da camada de dados
│   └── routes.test.js        # Testes de integração das rotas
├── views/                    # Templates EJS
├── public/                   # CSS, JS, assets
├── .env                      # Variáveis de ambiente locais
├── .gitignore                # Arquivos ignorados pelo controle de versão
├── app.js                    # Inicialização do servidor Express
├── package.json              # Script e dependências do projeto
└── README.md                 # Manual de instalação e deploy
```

---

## ⚙️ Pré-requisitos e Instalação

### 1. Pré-requisitos
*   **Node.js**: Versão **18.0.0** ou superior (testado na v24).

### 2. Clonar ou Baixar o Projeto
Na pasta do projeto, execute o comando abaixo para instalar as dependências:
```bash
npm install
```

### 3. Configurar Variáveis de Ambiente (Firebase)
Crie/edite o arquivo `.env` na raiz do projeto:

```env
PORT=3000
SESSION_SECRET=uma_chave_secreta_e_longa_aqui

FIREBASE_PROJECT_ID=SEU_PROJECT_ID
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@SEU_PROJETO.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**Onde obter as credenciais:**
1. Acesse o [Console Firebase](https://console.firebase.google.com/).
2. Crie um projeto (ou use um existente).
3. Ative o **Cloud Firestore** em *Build > Firestore Database*.
4. Vá em *Configurações do projeto > Contas de serviço*.
5. Clique em **Gerar nova chave privada** — baixe o arquivo JSON da conta de serviço.
6. Copie `project_id`, `client_email` e `private_key` para o `.env`.

> **Modo desenvolvimento (sem credenciais):** se as variáveis `FIREBASE_*` estiverem vazias,
> o app inicia com um Firestore em memória — útil para testar sem configurar nada.

### 4. Executar em Modo de Desenvolvimento
```bash
npm run dev
```

### 5. Executar em Produção
```bash
npm start
```
Após iniciar, abra seu navegador e acesse: [http://localhost:3000](http://localhost:3000)

---

## 🔥 Coleções no Firestore

Ao usar o Firebase real, o app cria automaticamente as seguintes coleções:

| Coleção | Descrição |
|---------|-----------|
| `users` | Barbeiros e clientes (nome, e-mail, senha bcrypt, telefone, papel) |
| `appointments` | Agendamentos (cliente, serviço, preço, status, data/hora) |
| `services` | Catálogo de serviços por barbeiro (nome, preço, duração) |
| `barber_configs` | Configurações da barbearia (nome, horários, token do link público) |

---

## 🚀 Orientações para Deploy (Vercel)

O projeto já inclui `vercel.json` para deploy na Vercel.

1. Conecte o repositório GitHub na Vercel.
2. Configure as **Environment Variables** no painel da Vercel (mesmas do `.env`, incluindo `FIREBASE_*`).
3. O `vercel.json` aponta todas as rotas para `app.js`.

> Diferente do SQLite/MongoDB local, o Firestore é um banco gerenciado na nuvem — **os dados persistem
> entre deploys e reinicializações sem precisar de volumes/disk adicionais**.
