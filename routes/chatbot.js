// ==========================================================================
// SAS Barber - Rota de Proxy para o Agente de IA (Gemini)
// A chave de API fica segura no servidor (variável de ambiente)
// ==========================================================================

const express = require('express');
const router = express.Router();

const SYSTEM_PROMPT = `Você é o assistente virtual da SAS Barber, uma barbearia premium de alta qualidade.
Seu nome é "SAS Bot" e você fala em português brasileiro de forma amigável, profissional e descontraída.

Informações da barbearia SAS Barber:
- Nome: SAS Barber
- Especialidade: Cortes masculinos modernos e clássicos, barba, pigmentação
- Serviços e preços:
  • Corte: R$ 40,00
  • Barba: R$ 30,00
  • Pigmentação: R$ 25,00
  • Corte & Barba: R$ 65,00
- Horário de funcionamento: Segunda a Sábado, das 9h às 20h
- Agendamentos: feitos diretamente na barbearia ou pelo sistema online
- Estilo: ambiente premium, atendimento personalizado

Seu objetivo é:
1. Responder dúvidas sobre serviços, preços e horários
2. Ajudar o cliente a escolher o melhor serviço
3. Esclarecer como funciona o agendamento
4. Passar uma experiência acolhedora e premium

Mantenha as respostas curtas (máx 3 parágrafos), objetivas e amigáveis.
Use emojis com moderação para tornar a conversa mais agradável. 💈`;

// POST /api/chat  – recebe { history: [...], message: "..." }
router.post('/api/chat', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: 'API key não configurada. Configure GEMINI_API_KEY no arquivo .env.',
      offline: true
    });
  }

  const { history = [], message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Mensagem inválida.' });
  }

  // Build conversation context (max last 20 turns)
  const recentHistory = history.slice(-20);
  const contents = [
    ...recentHistory,
    { role: 'user', parts: [{ text: message.trim() }] }
  ];

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.75,
          maxOutputTokens: 400,
          topP: 0.9
        }
      })
    });

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      console.error('[SAS Bot] Gemini API error:', errData);
      return res.status(geminiRes.status).json({
        error: errData?.error?.message || 'Erro na API do Gemini.',
        offline: true
      });
    }

    const data = await geminiRes.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Desculpe, não consegui processar sua mensagem. Tente novamente!';

    return res.json({ reply });

  } catch (err) {
    console.error('[SAS Bot] Erro de conexão:', err.message);
    return res.status(500).json({
      error: 'Erro de conexão com a IA.',
      offline: true
    });
  }
});

module.exports = router;
