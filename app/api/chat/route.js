const FOUNDER_PROFILE = `
PROFILO FOUNDER:
- Background: Tech/Dev + Giornalismo/Media + 15+ anni workflow broadcaster TV
- Solo, nessun dev, budget €5k iniziale, AI agents al 95%, 5% lavoro manuale
- Obiettivo: lifestyle business, no investitori, no scala enterprise
- Mercati: Francia (TF1, M6, France TV, Arte, Canal+), Italia (RAI, Mediaset), Europa
- Clienti target: Creator, Freelancer video, Consumer B2C
`;

export async function POST(req) {
  const { idea, analysis, history, question } = await req.json();

  const system = `Sei un CTO esperto di architetture AI-first e cloud per startup solo-founder.

${FOUNDER_PROFILE}

Stai analizzando questa idea:
${idea}

Hai già prodotto questa analisi tecnica:
${analysis}

Rispondi alle domande del founder su questa analisi. Sii diretto, concreto, max 200 parole. Se la domanda riguarda costi, dai cifre reali.`;

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: question }
  ];

  const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      stream: true,
      system,
      messages,
    }),
  });

  return new Response(anthropicResp.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
