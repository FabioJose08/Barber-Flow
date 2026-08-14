# BarberFlow 💈

O **BarberFlow** é um SaaS completo de gestão para barbearias desenvolvido para oferecer alta performance, controle financeiro rápido e agendamentos intuitivos. Projetado especialmente para uso móvel direto no salão, possui uma interface premium com estética clássica e escura (tons de carvão e detalhes em dourado).

Desenvolvido utilizando as tecnologias mais modernas do ecossistema Node.js, incluindo o novo módulo nativo de banco de dados do Node: **`node:sqlite`** (disponível no Node.js v22+), dispensando a instalação de drivers pesados de terceiros.

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

---

## 🛠️ Tecnologias Utilizadas

*   **Backend**: Node.js v22+ & Express.js
*   **Banco de Dados**: SQLite (nativo do Node via módulo `node:sqlite`)
*   **Frontend / Templates**: EJS (Embedded JavaScript templates)
*   **Estilização**: CSS Puro (Vanilla CSS) com layout responsivo Mobile-First
*   **Interatividade**: JavaScript Puro (Vanilla JS)
*   **Segurança**: `bcrypt` para criptografia de senhas e `express-session` para sessões de usuário

---

## 📦 Estrutura do Projeto

```
├── database/
│   ├── db.js                 # Inicialização da conexão e tabelas do SQLite
│   └── database.db           # Arquivo do banco de dados SQLite (gerado automaticamente)
├── middleware/
│   └── auth.js               # Filtros de rotas protegidas (Session Guard)
├── routes/
│   ├── auth.js               # Rotas de Login, Registro e Logout
│   ├── appointments.js       # CRUD de agendamentos e controle de status
│   └── dashboard.js          # Agregação de estatísticas e renderização do painel
├── views/
│   ├── partials/
│   │   ├── header.ejs        # Cabeçalho HTML, fontes e menu responsivo
│   │   └── footer.ejs        # Rodapé HTML e carregamento de scripts
│   ├── appointments/
│   │   ├── index.ejs         # Filtros e listagem principal de atendimentos
│   │   ├── new.ejs           # Formulário de criação de agendamento com presets rápidos
│   │   └── edit.ejs          # Formulário de edição completa
│   ├── dashboard.ejs         # Estatísticas rápidas e próximos atendimentos do dia
│   ├── login.ejs             # Tela de login da barbearia
│   ├── register.ejs          # Tela de cadastro da barbearia
│   └── error.ejs             # Tela amigável de erro do sistema
├── public/
│   ├── css/
│   │   └── style.css         # Estilização completa do sistema (Dark & Gold Theme)
│   └── js/
│       └── main.js           # Funções interativas, cliques rápidos e presets de preço
├── .env                      # Variáveis de ambiente locais
├── .gitignore                # Arquivos ignorados pelo controle de versão
├── app.js                    # Inicialização do servidor Express e Middlewares globais
├── package.json              # Script e dependências do projeto
└── README.md                 # Manual de instalação e deploy
```

---

## ⚙️ Pré-requisitos e Instalação

### 1. Pré-requisitos
*   **Node.js**: Versão **22.0.0** ou superior (Necessário devido ao suporte do módulo experimental nativo `node:sqlite`).

### 2. Clonar ou Baixar o Projeto
Na pasta do projeto, execute o comando abaixo para instalar as dependências de terceiros:
```bash
npm install
```

### 3. Configurar Variáveis de Ambiente
Crie um arquivo chamado `.env` na raiz do projeto e configure as seguintes variáveis:
```env
PORT=3000
SESSION_SECRET=uma_chave_secreta_e_longa_aqui
DB_PATH=database/database.db
```

### 4. Executar em Modo de Desenvolvimento
Para rodar a aplicação localmente com reinicialização automática ao editar arquivos (`nodemon`):
```bash
npm run dev
```

### 5. Executar em Produção
Para iniciar o servidor normalmente:
```bash
npm start
```
Após iniciar, abra seu navegador e acesse: [http://localhost:3000](http://localhost:3000)

---

## 🚀 Orientações para Deploy

Como o projeto utiliza banco de dados **SQLite integrado**, os dados são armazenados localmente em um arquivo (`database.db`). Em serviços de nuvem efêmeros, os dados serão perdidos a cada reinicialização caso não haja um volume persistente configurado.

### 1. Deploy no Render

Render é excelente para hospedar aplicações Node.js gratuitamente ou com baixo custo.

1.  **Crie um novo serviço**: No painel do Render, selecione **New > Web Service**.
2.  **Conecte seu repositório**: Conecte o repositório GitHub do BarberFlow.
3.  **Configurações do Serviço**:
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node app.js`
4.  **Variáveis de Ambiente**: Vá na aba **Env Vars** e defina:
    *   `NODE_VERSION`: `22.5.0` (ou superior, ex: `24.14.1`, para suportar o `node:sqlite`).
    *   `PORT`: `3000` (Render preenche automaticamente, mas é bom deixar explícito).
    *   `SESSION_SECRET`: Um texto aleatório e seguro para encriptar as sessões.
    *   `DB_PATH`: `/opt/render/project/src/database/database.db` (Importante para persistência!).
5.  **Persistência de Dados (Disk)**:
    *   Para não perder os agendamentos a cada deploy, vá na aba **Disks** no painel do Render e selecione **Add Disk**.
    *   **Mount Path**: `/opt/render/project/src/database`
    *   **Size**: `1 GiB` (O suficiente para milhões de agendamentos SQLite).

### 2. Deploy no Railway

O Railway oferece deploy rápido e suporte excelente a volumes persistentes.

1.  **Crie um novo projeto**: Escolha **New Project > Deploy from GitHub** e selecione o repositório.
2.  **Configuração de Variáveis de Ambiente**:
    *   `SESSION_SECRET`: Chave secreta aleatória.
    *   `NODE_VERSION`: `22.0.0` ou mais recente.
    *   `DB_PATH`: `/data/database.db`
3.  **Volume Persistente**:
    *   Após o deploy inicial, vá nas configurações do serviço criado no Railway.
    *   Clique na aba **Volumes** e adicione um novo volume.
    *   Defina o **Mount Path** do Volume para `/data`. Isso garante que o banco de dados armazenado em `/data/database.db` sobreviverá aos reinícios.
