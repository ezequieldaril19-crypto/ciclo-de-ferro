// Envia os lembretes do Muscle Land. Roda a cada 15 minutos no GitHub Actions.
// Lê push/{id} (token + fuso + horários), manda o que venceu nos últimos 45 min e anota em pushlog/{id} para não repetir no dia.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const EMU = process.env.FIRESTORE_EMULATOR_HOST, DRY = !!process.env.DRY; // testes locais: emulador e sem envio real
const sa = JSON.parse(process.env.FIREBASE_SA || "{}");
if (!sa.project_id && !EMU){ console.log("FIREBASE_SA não configurado; nada a fazer."); process.exit(0); }
initializeApp(EMU ? {projectId: "demo-muscle"} : {credential: cert(sa)});
const db = getFirestore(), fcm = getMessaging();

const TEXTS = {
  peso:   ["Bom dia! ⚖️", "Suba na balança em jejum e registre o peso no Muscle Land."],
  cafe:   ["Café da manhã ☕", "Já registrou o café? Leva 10 segundos."],
  almoco: ["Almoço 🍛", "Registre o almoço enquanto ainda lembra das quantidades."],
  agua:   ["Hora da água 💧", "Bebe um copo e marca no app."],
  treino: ["Hora do treino 🏋️", "O treino de hoje te espera. Bora?"],
  jantar: ["Jantar 🍽️", "Registre o jantar e feche o dia."],
};
const WINDOW_MIN = 45;
const now = new Date();
function local(tz){
  const f = new Intl.DateTimeFormat("en-CA", {timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23"});
  const p = Object.fromEntries(f.formatToParts(now).map(x => [x.type, x.value]));
  return {day:`${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute)};
}
let sent = 0, removed = 0, checked = 0;
const snap = await db.collection("push").get();
for (const doc of snap.docs){
  checked++;
  const d = doc.data(); if (!d.tok || !Array.isArray(d.r)) continue;
  let tz = d.tz || "America/Sao_Paulo"; try{ local(tz); }catch(e){ tz = "America/Sao_Paulo"; }
  const L = local(tz), logRef = db.collection("pushlog").doc(doc.id);
  const log = (await logRef.get()).data() || {};
  const done = log.day === L.day ? (log.sent || []) : [];
  const due = d.r.filter(r => {
    const m = /^(\d\d):(\d\d)$/.exec(r.h || ""); if (!m || !TEXTS[r.k]) return false;
    const at = Number(m[1]) * 60 + Number(m[2]), diff = L.min - at;
    return diff >= 0 && diff < WINDOW_MIN && !done.includes(`${r.k}@${r.h}`);
  });
  if (!due.length) continue;
  let gone = false;
  for (const r of due){
    const [title, body] = TEXTS[r.k];
    try{
      const msg = {token: d.tok, webpush: {headers: {TTL: "3600", Urgency: "high"}, data: {title, body, url: "./", tag: r.k}}};
      if (DRY) console.log("enviaria", doc.id, r.k, r.h, "->", title); else await fcm.send(msg);
      done.push(`${r.k}@${r.h}`); sent++;
    }catch(e){
      const code = (e && e.code) || "";
      if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)){ gone = true; break; }
      console.log("falha", doc.id, code);
    }
  }
  if (gone){ await doc.ref.delete(); await logRef.delete().catch(() => {}); removed++; continue; }
  await logRef.set({day: L.day, sent: done});
}
console.log(`aparelhos: ${checked} · enviados: ${sent} · tokens vencidos removidos: ${removed}`);
