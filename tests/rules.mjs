// Testa firestore.rules no emulador do Firebase, com as mesmas gravações que o app faz.
// Rodar: npx firebase-tools emulators:exec --only firestore --project demo-muscle "node tests/rules.mjs"
const HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const ROOT = "projects/demo-muscle/databases/(default)/documents", DOCS = `http://${HOST}/v1/${ROOT}`;
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
// token sem assinatura: o emulador aceita
const tok = (uid, prov) => uid ? `${b64({alg:"none", typ:"JWT"})}.${b64({sub:uid, user_id:uid, aud:"demo-muscle", iss:"https://securetoken.google.com/demo-muscle", iat:Math.floor(Date.now()/1000), exp:Math.floor(Date.now()/1000) + 3600, firebase:{sign_in_provider:prov}})}.` : null;
const ANA = tok("ana", "google.com"), BIA = tok("bia", "google.com"), CAU = tok("cau", "google.com");
const ANON1 = tok("anon1", "anonymous"), ANON2 = tok("anon2", "anonymous");

async function call(method, path, token, body){
  const h = {"Content-Type":"application/json"}; if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(`${DOCS}${path}`, {method, headers:h, body: body ? JSON.stringify(body) : undefined});
  let j = null; try{ j = await r.json(); }catch(e){}
  return {status:r.status, j};
}
const enc = v => v === null || v === undefined ? {nullValue:null} : typeof v === "boolean" ? {booleanValue:v}
  : typeof v === "number" ? (Number.isInteger(v) ? {integerValue:String(v)} : {doubleValue:v})
  : Array.isArray(v) ? {arrayValue:{values:v.map(enc)}}
  : typeof v === "object" ? {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]))}} : {stringValue:String(v)};
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
const stamp = [{fieldPath:"t", setToServerValue:"REQUEST_TIME"}];
const commit = (token, writes) => call("POST", ":commit", token, {writes});
const put = (token, path, obj, extra = {}) => commit(token, [{update:{name:`${ROOT}/${path}`, fields:fields(obj)}, updateTransforms:stamp, ...extra}]);
const query = (token, coll, field, value) => call("POST", ":runQuery", token, {structuredQuery:{from:[{collectionId:coll}], where:{fieldFilter:{field:{fieldPath:field}, op:"EQUAL", value:{stringValue:value}}}, limit:50}});

let fails = 0, passes = 0;
const expect = async (name, p, want) => {
  const r = await p, good = want === "ok" ? r.status === 200 : want === 403 ? r.status === 403 : r.status === 403 || r.status === 400;
  if (good){ passes++; console.log("  ok  " + name); } else { fails++; console.log(`  FALHOU  ${name} → ${r.status} ${JSON.stringify(r.j).slice(0, 200)}`); }
};

console.log("Comunidade");
const food = {n:"Whey teste", b:"Marca", k:400, p:80, c:8, f:6, por:30, bc:"7891234567890", u:[{n:"scoop", g:30}], fb:0, na:120.5, uid:"anon1", del:false, v:1};
await expect("publica alimento (anônimo)", put(ANON1, "foods/f1", food, {currentDocument:{exists:false}}), "ok");
await expect("qualquer um lê alimentos", call("POST", ":runQuery", null, {structuredQuery:{from:[{collectionId:"foods"}], orderBy:[{field:{fieldPath:"t"}}], limit:300}}), "ok");
await expect("sem login não publica", put(null, "foods/f2", food), "no");
await expect("não publica em nome de outro", put(ANON2, "foods/f2", food, {currentDocument:{exists:false}}), "no");
await expect("não edita alimento de outro", put(ANON2, "foods/f1", {...food, uid:"anon2"}, {currentDocument:{exists:true}}), "no");
await expect("dono edita o alimento", put(ANON1, "foods/f1", {...food, k:390}, {currentDocument:{exists:true}}), "ok");
await expect("valor absurdo é recusado", put(ANON1, "foods/f3", {...food, k:5000}, {currentDocument:{exists:false}}), "no");
await expect("dono tira da comunidade", commit(ANON1, [{update:{name:`${ROOT}/foods/f1`, fields:{del:enc(true)}}, updateMask:{fieldPaths:["del"]}, updateTransforms:stamp, currentDocument:{exists:true}}]), "ok");
await expect("outro não tira da comunidade", commit(ANON2, [{update:{name:`${ROOT}/foods/f1`, fields:{del:enc(true)}}, updateMask:{fieldPaths:["del"]}, updateTransforms:stamp, currentDocument:{exists:true}}]), "no");
const recipe = {n:"Panqueca", items:[{key:"t1", n:"Ovo", g:100, k:143, p:13, c:1, f:9.5, u:{n:"unidade", q:2, g:50}}], servings:2, unit:"porção", yieldG:0, uid:"anon1", del:false, v:1};
await expect("publica receita", put(ANON1, "recipes/r1", recipe, {currentDocument:{exists:false}}), "ok");
await expect("publica treino", put(ANON1, "workouts/w1", {n:"Treino A", ex:[{n:"Supino reto", sets:3, reps:10}, {n:"Rosca", sets:3, reps:"8-12"}], uid:"anon1", del:false, v:1}, {currentDocument:{exists:false}}), "ok");
const vote = (t, fid, uid) => commit(t, [
  {update:{name:`${ROOT}/votes/${fid}_${uid}`, fields:fields({fid, uid})}, updateTransforms:stamp, currentDocument:{exists:false}},
  {update:{name:`${ROOT}/stats/${fid}`, fields:{}}, updateMask:{fieldPaths:[]}, updateTransforms:[{fieldPath:"c", increment:{integerValue:"1"}}, {fieldPath:"t", setToServerValue:"REQUEST_TIME"}]}]);
await expect("confirma o rótulo (1º voto)", vote(ANON2, "f1", "anon2"), "ok");
await expect("2º voto de outra pessoa", vote(ANON1, "f1", "anon1"), "ok");
await expect("não vota duas vezes (403: o app entende como já votado)", vote(ANON2, "f1", "anon2"), 403);
await expect("contador não sobe sem voto", commit(ANON2, [{update:{name:`${ROOT}/stats/f1`, fields:{}}, updateMask:{fieldPaths:[]}, updateTransforms:[{fieldPath:"c", increment:{integerValue:"5"}}, {fieldPath:"t", setToServerValue:"REQUEST_TIME"}]}]), "no");
const st = await call("GET", "/stats/f1", null);
if (st.j && st.j.fields && st.j.fields.c.integerValue === "2"){ passes++; console.log("  ok  contador ficou em 2"); } else { fails++; console.log("  FALHOU  contador", JSON.stringify(st.j)); }
await expect("avisa erro num alimento", put(ANON2, "reports/x1", {fid:"f1", why:"Valores errados", uid:"anon2"}, {currentDocument:{exists:false}}), "ok");
await expect("ninguém lê os avisos", call("GET", "/reports/x1", ANON2), "no");

console.log("Lembretes");
const push = {tok:"token-fcm-123", tz:"America/Sao_Paulo", r:[{h:"07:00", k:"peso"}, {h:"20:30", k:"jantar"}]};
await expect("liga lembretes no próprio aparelho", put(ANON1, "push/anon1", push), "ok");
await expect("não grava lembrete de outro aparelho", put(ANON2, "push/anon1", push), "no");
await expect("não lê o token de outro", call("GET", "/push/anon1", ANON2), "no");
await expect("ninguém mexe no registro de envios", put(ANON1, "pushlog/anon1", {day:"2026-10-15"}), "no");
await expect("desliga lembretes", commit(ANON1, [{delete:`${ROOT}/push/anon1`}]), "ok");

console.log("Conta Google: backup");
const backup = id => ({fields:{j:{stringValue:JSON.stringify({t:1, days:{}})}, t:{integerValue:"1"}}});
await expect("faz backup na própria conta", call("PATCH", "/users/ana/data/settings", ANA, backup()), "ok");
await expect("lê o próprio backup", call("GET", "/users/ana/data?pageSize=300", ANA), "ok");
await expect("não lê backup de outra pessoa", call("GET", "/users/ana/data/settings", BIA), "no");
await expect("não grava no backup de outra pessoa", call("PATCH", "/users/ana/data/settings", BIA, backup()), "no");
await expect("login anônimo não acessa backup", call("GET", "/users/anon1/data/settings", ANON1), "no");

console.log("Conta Google: amigos");
const profile = (t, uid, n, c) => commit(t, [{update:{name:`${ROOT}/profiles/${uid}`, fields:{n:{stringValue:n}, c:{stringValue:c}}}, updateTransforms:stamp}]);
await expect("cria o próprio perfil", profile(ANA, "ana", "Ana", "ABC234"), "ok");
await expect("cria perfil da Bia", profile(BIA, "bia", "Bia", "XYZ789"), "ok");
await expect("não cria perfil de outro", profile(BIA, "ana", "Hacker", "ABC234"), "no");
await expect("lê perfil inexistente (404 tratado pelo app)", call("GET", "/profiles/cau", CAU).then(r => ({...r, status: r.status === 404 ? 200 : r.status})), "ok");
await expect("acha amigo pelo código", query(BIA, "profiles", "c", "ABC234"), "ok");
const stats = {n:"Ana", mk:"2026-10", mo:5, wk:2, dd:12, vol:12000, ln:"Treino A", lk:"2026-10-15"};
await expect("publica o próprio resumo", commit(ANA, [{update:{name:`${ROOT}/pub/ana`, fields:fields(stats)}, updateTransforms:stamp}]), "ok");
// Bia digita o código da Ana: libera a Ana para ver a Bia e manda o pedido
await expect("Bia manda pedido para Ana", commit(BIA, [
  {update:{name:`${ROOT}/users/bia/friends/ana`, fields:{}}, updateTransforms:stamp},
  {update:{name:`${ROOT}/reqs/ana_bia`, fields:fields({from:"bia", to:"ana", n:"Bia"})}, updateTransforms:stamp}]), "ok");
await expect("Bia ainda não vê o resumo da Ana", call("GET", "/pub/ana", BIA), "no");
await expect("pedido em nome de outra pessoa é recusado", commit(CAU, [{update:{name:`${ROOT}/reqs/ana_bia`, fields:fields({from:"bia", to:"ana", n:"Bia"})}, updateTransforms:stamp}]), "no");
await expect("Ana lê os pedidos para ela", query(ANA, "reqs", "to", "ana"), "ok");
await expect("Cau não lê os pedidos da Ana", query(CAU, "reqs", "to", "ana"), "no");
await expect("Ana aceita", commit(ANA, [{update:{name:`${ROOT}/users/ana/friends/bia`, fields:{}}, updateTransforms:stamp}, {delete:`${ROOT}/reqs/ana_bia`}]), "ok");
await expect("agora Bia vê o resumo da Ana", call("GET", "/pub/ana", BIA), "ok");
await expect("Cau (não amigo) não vê", call("GET", "/pub/ana", CAU), "no");
await expect("Ana lista os amigos", call("GET", "/users/ana/friends?pageSize=300&mask.fieldPaths=t", ANA), "ok");
await expect("ninguém se adiciona na lista de amigos dos outros", commit(CAU, [{update:{name:`${ROOT}/users/ana/friends/cau`, fields:{}}, updateTransforms:stamp}]), "no");
await expect("exclui a conta: apaga tudo", commit(ANA, [{delete:`${ROOT}/users/ana/data/settings`}, {delete:`${ROOT}/users/ana/friends/bia`}, {delete:`${ROOT}/profiles/ana`}, {delete:`${ROOT}/pub/ana`}]), "ok");

console.log(`\n${passes} ok, ${fails} falharam`);
process.exit(fails ? 1 : 0);
