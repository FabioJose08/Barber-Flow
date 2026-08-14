# Configuração do Firebase para Google Sign-In

## ⚠️ IMPORTANTE: Credenciais Obrigatórias

Para que o **Google Sign-In funcione**, você PRECISA configurar as credenciais do Firebase no arquivo `.env`.

## Passo 1: Obtém as Credenciais

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto: **barberflow-a5a19**
3. Clique em ⚙️ **Configurações do projeto** (canto superior esquerdo)
4. Vá para a aba **Contas de serviço**
5. Clique em **Gerar nova chave privada** (botão azul)
6. Será baixado um arquivo JSON

## Passo 2: Extrair as Informações

Abra o arquivo JSON baixado e copie estes três valores:

- `project_id`
- `client_email`
- `private_key`

## Passo 3: Adicionar ao .env

Abra o arquivo `.env` na raiz do projeto e preencha:

```env
# ============================================
# FIREBASE (Google) - Firestore Database
# ============================================

FIREBASE_PROJECT_ID=seu_project_id_aqui
FIREBASE_CLIENT_EMAIL=seu_client_email_aqui
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nConteudo\nda\nchave\naqui\n-----END PRIVATE KEY-----\n"
```

### ⚠️ Importante sobre FIREBASE_PRIVATE_KEY:

- Use aspas duplas: `"`
- Substitua as quebras de linha por `\n` (literal, dois caracteres)
- Exemplo: se a chave tem quebras de linha, coloque `\n` no lugar

## Passo 4: Reinicie o Servidor

Depois de adicionar as credenciais:

```bash
npm start
# ou
node app.js
```

## ✅ Verificar se Funcionou

- Acesse http://localhost:3000/register
- Clique em "Cadastrar com Google"
- Você deve ver o popup de login do Google (sem erros)

---

**Se ainda receber erro "Firebase não configurado":**
- Verifique se as 3 variáveis estão preenchidas no `.env`
- Confirme que não há espaços extras nas credenciais
- Reinicie o servidor

