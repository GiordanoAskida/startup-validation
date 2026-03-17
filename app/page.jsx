"use client";
import { useState, useRef, useEffect } from "react";

async function streamFromRoute(url, body, onChunk) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text);
  }

  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const d = JSON.parse(raw);
        if (d.type === "content_block_delta" && d.delta?.type === "text_delta" && d.delta?.text) {
          onChunk(d.delta.text);
        }
      } catch {}
    }
  }
  // flush buffer
  if (buffer.startsWith("data: ")) {
    const raw = buffer.slice(6).trim();
    if (raw && raw !== "[DONE]") {
      try {
        const d = JSON.parse(raw);
        if (d.type === "content_block_delta" && d.delta?.type === "text_delta" && d.delta?.text) {
          onChunk(d.delta.text);
        }
      } catch {}
    }
  }
}

function parseAnalysis(text) {
  const get = (label) => {
    const re = new RegExp(`${label}:[\\s]*([\\s\\S]+?)(?=\\n[A-Z_]+:|$)`, "i");
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };
  const getList = (label) => {
    const re = new RegExp(`${label}:[\\s]*\\n((?:[-•]\\s*.+\\n?)+)`, "i");
    const m = text.match(re);
    if (!m) return [];
    return m[1].split("\n").map(l => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
  };
  const getNumberedList = (label) => {
    const re = new RegExp(`${label}:[\\s]*\\n((?:\\d+\\.\\s*.+\\n?)+)`, "i");
    const m = text.match(re);
    if (!m) return [];
    return m[1].split("\n").map(l => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  };

  return {
    semaforo: get("SEMAFORO")?.trim().toUpperCase().replace(/[^A-Z\-]/g, ""),
    motivazione: get("MOTIVAZIONE_SEMAFORO"),
    toolAI: getList("TOOL_AI"),
    toolCloud: getList("TOOL_CLOUD"),
    costoTotale: get("COSTO_TOTALE_MESE"),
    costoMVP: get("COSTO_MVP_FASE"),
    limiti: getList("LIMITI_TECNICI"),
    humanLoop: getList("HUMAN_IN_LOOP"),
    architettura: get("ARCHITETTURA_CONSIGLIATA"),
    passiTecnici: getNumberedList("PROSSIMI_PASSI_TECNICI"),
  };
}

const SEMAFORO_CONFIG = {
  "GO": { color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", emoji: "🟢" },
  "ATTENZIONE": { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", emoji: "🟡" },
  "NO-GO": { color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", emoji: "🔴" },
};

const FL = ({ children }) => (
  <div style={{ fontSize: "9px", fontFamily: "monospace", color: "rgba(255,255,255,0.2)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "10px" }}>{children}</div>
);

const Section = ({ title, accent, children }) => (
  <div style={{ marginBottom: "24px" }}>
    <div style={{ fontSize: "9px", fontFamily: "monospace", color: accent, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "10px" }}>{title}</div>
    {children}
  </div>
);

const ToolItem = ({ text }) => {
  const pipeIdx = text.indexOf("|");
  const name = pipeIdx > -1 ? text.slice(0, pipeIdx).trim() : text;
  const cost = pipeIdx > -1 ? text.slice(pipeIdx + 1).trim() : null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 12px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", marginBottom: "6px", gap: "12px" }}>
      <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", lineHeight: "1.5", flex: 1 }}>{name}</span>
      {cost && <span style={{ fontSize: "11px", color: "#22c55e", fontFamily: "monospace", whiteSpace: "nowrap", background: "rgba(34,197,94,0.08)", padding: "2px 8px", borderRadius: "4px", border: "1px solid rgba(34,197,94,0.2)" }}>{cost}</span>}
    </div>
  );
};

const BulletItem = ({ text, accent }) => (
  <div style={{ display: "flex", gap: "10px", marginBottom: "6px", alignItems: "flex-start" }}>
    <span style={{ color: accent, fontSize: "10px", marginTop: "4px", flexShrink: 0 }}>▸</span>
    <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", lineHeight: "1.6" }}>{text}</span>
  </div>
);

function Chat({ idea, analysis }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [currentReply, setCurrentReply] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history, currentReply]);

  const send = async () => {
    const question = input.trim();
    if (!question || streaming) return;
    setInput("");
    setStreaming(true);
    setCurrentReply("");
    const newHistory = [...history, { role: "user", content: question }];
    setHistory(newHistory);
    let reply = "";
    try {
      await streamFromRoute("/api/validate", { idea: analysis, history, question }, chunk => {
        reply += chunk;
        setCurrentReply(reply);
      });
      setHistory([...newHistory, { role: "assistant", content: reply }]);
    } catch (e) {
      setHistory([...newHistory, { role: "assistant", content: "Errore: " + e.message }]);
    } finally {
      setStreaming(false);
      setCurrentReply("");
    }
  };

  return (
    <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: "9px", fontFamily: "monospace", color: "rgba(99,202,183,0.5)", letterSpacing: "0.14em", marginBottom: "14px" }}>💬 DOMANDE SULL'ANALISI</div>
      {history.length > 0 && (
        <div style={{ marginBottom: "14px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
          {history.map((m, i) => (
            <div key={i} style={{ padding: "10px 14px", borderRadius: "8px", background: m.role === "user" ? "rgba(234,179,8,0.06)" : "rgba(255,255,255,0.03)", border: m.role === "user" ? "1px solid rgba(234,179,8,0.15)" : "1px solid rgba(255,255,255,0.05)", alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%" }}>
              <div style={{ fontSize: "9px", fontFamily: "monospace", color: m.role === "user" ? "rgba(234,179,8,0.5)" : "rgba(99,202,183,0.5)", marginBottom: "4px" }}>{m.role === "user" ? "TU" : "CTO AI"}</div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{m.content}</div>
            </div>
          ))}
          {streaming && currentReply && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", alignSelf: "flex-start", maxWidth: "90%" }}>
              <div style={{ fontSize: "9px", fontFamily: "monospace", color: "rgba(99,202,183,0.5)", marginBottom: "4px" }}>CTO AI</div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{currentReply}<span style={{ opacity: 0.5 }}>▌</span></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Es: Come implemento il componente AI più complesso?"
          disabled={streaming}
          style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#f5f0e8", fontSize: "13px", outline: "none" }}
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          style={{ padding: "10px 18px", borderRadius: "8px", border: "none", background: streaming || !input.trim() ? "rgba(99,202,183,0.2)" : "rgba(99,202,183,0.85)", color: streaming || !input.trim() ? "rgba(0,0,0,0.3)" : "#060608", fontSize: "13px", fontFamily: "monospace", fontWeight: 700, cursor: streaming || !input.trim() ? "not-allowed" : "pointer" }}>
          {streaming ? "…" : "→"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamPreview, setStreamPreview] = useState("");
  const [rawAnalysis, setRawAnalysis] = useState("");
  const [parsed, setParsed] = useState(null);

  const validate = async () => {
    if (!idea.trim() || loading) return;
    setLoading(true);
    setStreamPreview("");
    setRawAnalysis("");
    setParsed(null);
    let full = "";
    try {
      await streamFromRoute("/api/validate", { idea }, chunk => {
        full += chunk;
        setStreamPreview(full);
      });
      setRawAnalysis(full);
      setParsed(parseAnalysis(full));
    } catch (e) {
      alert("Errore: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const semaforoConf = parsed?.semaforo ? SEMAFORO_CONFIG[parsed.semaforo] || null : null;

  return (
    <div style={{ minHeight: "100vh", background: "#060608", color: "#f5f0e8" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} } @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }`}</style>

      <div style={{ position: "fixed", top: "-100px", right: "-100px", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(99,202,183,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "780px", margin: "0 auto", padding: "48px 24px 100px" }}>

        {/* Header */}
        <div style={{ marginBottom: "48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div style={{ fontSize: "9px", fontFamily: "monospace", color: "rgba(234,179,8,0.4)", letterSpacing: "0.2em" }}>APP 1 — BRAINSTORMING</div>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.15)" }}>→</div>
            <div style={{ fontSize: "9px", fontFamily: "monospace", color: "rgba(99,202,183,0.7)", letterSpacing: "0.2em", background: "rgba(99,202,183,0.08)", padding: "3px 10px", borderRadius: "4px", border: "1px solid rgba(99,202,183,0.2)" }}>APP 2 — PRE-VALIDAZIONE TECNICA</div>
          </div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, lineHeight: "1.1", color: "#f5f0e8", letterSpacing: "-0.02em", marginBottom: "12px" }}>
            L'idea regge<br /><span style={{ color: "rgba(255,255,255,0.25)" }}>tecnicamente?</span>
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace", lineHeight: "1.6" }}>
            Incolla l'idea dall'App 1. Ottieni tool AI + cloud necessari, costi reali, limiti e verdetto GO/NO-GO.
          </p>
        </div>

        {/* Input */}
        <div style={{ marginBottom: "24px" }}>
          <FL>Incolla l'idea da validare</FL>
          <textarea
            value={idea}
            onChange={e => setIdea(e.target.value)}
            placeholder={`Es:\nNome: BroadcastBridge\nTagline: Trasforma contenuti YouTube in pacchetti pronti per broadcaster TV\nProblema: I creator non sanno come adattare i loro video agli standard tecnici broadcast\nSoluzione: AI analizza il video, lo adatta (aspect ratio, audio loudness, metadati EBU) e genera un pacchetto delivery automatico\nCliente: Freelancer video e creator con 10k+ follower\nRevenue: €49/mese SaaS`}
            rows={8}
            style={{ width: "100%", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#f5f0e8", fontSize: "13px", lineHeight: "1.7", outline: "none", resize: "vertical" }}
          />
        </div>

        <button
          onClick={validate}
          disabled={loading || !idea.trim()}
          style={{ padding: "13px 32px", borderRadius: "8px", border: "none", background: loading || !idea.trim() ? "rgba(99,202,183,0.2)" : "rgba(99,202,183,0.85)", color: loading || !idea.trim() ? "rgba(0,0,0,0.3)" : "#060608", fontSize: "14px", fontFamily: "monospace", fontWeight: 700, cursor: loading || !idea.trim() ? "not-allowed" : "pointer", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "8px", marginBottom: "40px" }}
        >
          {loading ? <><span style={{ animation: "blink 0.6s infinite" }}>▌</span> ANALISI IN CORSO…</> : "⚡ VALIDA FATTIBILITÀ TECNICA"}
        </button>

        {/* Stream preview */}
        {loading && streamPreview && (
          <div style={{ marginBottom: "28px", padding: "14px 18px", borderRadius: "8px", border: "1px solid rgba(99,202,183,0.1)", background: "rgba(99,202,183,0.02)" }}>
            <div style={{ fontSize: "9px", fontFamily: "monospace", color: "rgba(99,202,183,0.4)", marginBottom: "6px", letterSpacing: "0.15em" }}>ANALISI IN CORSO ▶</div>
            <p style={{ fontSize: "11px", fontFamily: "monospace", color: "rgba(255,255,255,0.2)", lineHeight: "1.7", whiteSpace: "pre-wrap" }}>{streamPreview}<span style={{ animation: "blink 0.5s infinite" }}>▌</span></p>
          </div>
        )}

        {/* Results */}
        {parsed && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>

            {/* Semaforo */}
            {semaforoConf && (
              <div style={{ marginBottom: "32px", padding: "24px 28px", borderRadius: "12px", background: semaforoConf.bg, border: `1px solid ${semaforoConf.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: parsed.motivazione ? "12px" : 0 }}>
                  <span style={{ fontSize: "32px" }}>{semaforoConf.emoji}</span>
                  <div>
                    <div style={{ fontSize: "9px", fontFamily: "monospace", color: semaforoConf.color, letterSpacing: "0.16em", marginBottom: "4px" }}>VERDETTO TECNICO</div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: semaforoConf.color }}>{parsed.semaforo}</div>
                  </div>
                </div>
                {parsed.motivazione && <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", lineHeight: "1.6", margin: 0 }}>{parsed.motivazione}</p>}
              </div>
            )}

            {/* Costi */}
            {(parsed.costoMVP || parsed.costoTotale) && (
              <div style={{ marginBottom: "32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {parsed.costoMVP && (
                  <div style={{ padding: "18px", borderRadius: "10px", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
                    <div style={{ fontSize: "9px", fontFamily: "monospace", color: "rgba(99,102,241,0.7)", letterSpacing: "0.14em", marginBottom: "8px" }}>COSTO MVP (0-10 utenti)</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#a5b4fc" }}>{parsed.costoMVP}</div>
                  </div>
                )}
                {parsed.costoTotale && (
                  <div style={{ padding: "18px", borderRadius: "10px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <div style={{ fontSize: "9px", fontFamily: "monospace", color: "rgba(34,197,94,0.7)", letterSpacing: "0.14em", marginBottom: "8px" }}>COSTO A REGIME (100 utenti)</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "#86efac" }}>{parsed.costoTotale}</div>
                  </div>
                )}
              </div>
            )}

            {parsed.toolAI?.length > 0 && (
              <Section title="🤖 Tool AI necessari" accent="rgba(168,85,247,0.7)">
                {parsed.toolAI.map((t, i) => <ToolItem key={i} text={t} />)}
              </Section>
            )}

            {parsed.toolCloud?.length > 0 && (
              <Section title="☁️ Tool Cloud necessari" accent="rgba(56,189,248,0.7)">
                {parsed.toolCloud.map((t, i) => <ToolItem key={i} text={t} />)}
              </Section>
            )}

            {parsed.limiti?.length > 0 && (
              <Section title="⚠️ Limiti tecnici" accent="rgba(251,146,60,0.7)">
                {parsed.limiti.map((l, i) => <BulletItem key={i} text={l} accent="rgba(251,146,60,0.6)" />)}
              </Section>
            )}

            {parsed.humanLoop?.length > 0 && (
              <Section title="🧍 Il tuo 5% — quando intervieni" accent="rgba(234,179,8,0.7)">
                {parsed.humanLoop.map((h, i) => <BulletItem key={i} text={h} accent="rgba(234,179,8,0.6)" />)}
              </Section>
            )}

            {parsed.architettura && (
              <Section title="🏗️ Architettura consigliata" accent="rgba(99,202,183,0.7)">
                <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", lineHeight: "1.8" }}>{parsed.architettura}</p>
              </Section>
            )}

            {parsed.passiTecnici?.length > 0 && (
              <Section title="🛠️ Prossimi passi tecnici" accent="rgba(99,102,241,0.7)">
                {parsed.passiTecnici.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: "12px", marginBottom: "8px", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "11px", fontFamily: "monospace", color: "rgba(99,102,241,0.6)", background: "rgba(99,102,241,0.1)", padding: "2px 7px", borderRadius: "4px", flexShrink: 0, marginTop: "2px" }}>{i + 1}</span>
                    <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", lineHeight: "1.6" }}>{p}</span>
                  </div>
                ))}
              </Section>
            )}

            <Chat idea={idea} analysis={rawAnalysis} />
          </div>
        )}
      </div>
    </div>
  );
}
