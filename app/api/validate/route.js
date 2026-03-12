const FOUNDER_PROFILE = `
PROFILO FOUNDER:
- Background: Tech/Dev + Giornalismo/Media + 15+ anni workflow broadcaster TV
- Solo, nessun dev, budget €5k iniziale, AI agents al 95%, 5% lavoro manuale
- Obiettivo: lifestyle business, no investitori, no scala enterprise
- Mercati: Francia (TF1, M6, France TV, Arte, Canal+), Italia (RAI, Mediaset), Europa
- Clienti target: Creator, Freelancer video, Consumer B2C
`;

export async function POST(req) {
  const { idea } = await req.json();

  const prompt = `Sei un CTO esperto di architetture AI-first e cloud per startup solo-founder.

${FOUNDER_PROFILE}

Analizza questa idea di startup dal punto di vista della FATTIBILITÀ TECNICA:

IDEA:
${idea}

Produci un'analisi strutturata in questo formato ESATTO (rispetta tutti i label):

SEMAFORO: [GO / ATTENZIONE / NO-GO]
MOTIVAZIONE_SEMAFORO: [1-2 frasi che spiegano il verdetto]

TOOL_AI:
- [Nome tool]: [Uso specifico nel progetto] | Costo: [€/mese stimato per uso realistico startup early stage]
- [ripeti per ogni tool necessario]

TOOL_CLOUD:
- [Nome servizio]: [Uso specifico] | Costo: [€/mese stimato]
- [ripeti per ogni servizio necessario, es. storage S3, database, hosting, CDN, email, ecc.]

COSTO_TOTALE_MESE: [€XX-XX/mese a regime con 100 utenti attivi]
COSTO_MVP_FASE: [€XX/mese per i primi 3 mesi con 0-10 utenti test]

LIMITI_TECNICI:
- [Limite o rischio tecnico concreto]
- [ripeti per ogni limite]

HUMAN_IN_LOOP:
- [Dove e quando il founder deve intervenire manualmente, con frequenza stimata]
- [ripeti per ogni intervento]

ARCHITETTURA_CONSIGLIATA: [Descrizione in 3-4 frasi dello stack tecnico ottimale: quali agenti AI, come si collegano, quale cloud, flusso dati principale]

PROSSIMI_PASSI_TECNICI:
1. [Prima cosa da fare tecnicamente, questa settimana]
2. [Seconda]
3. [Terza]

Sii specifico con i prezzi reali (usa listini pubblici 2024-2025). No ottimismo, no vaghezze.`;

  const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  return new Response(anthropicResp.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
