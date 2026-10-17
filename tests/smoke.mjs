// Testes do Muscle Land: abre o app num Chromium sem internet, com dados de exemplo,
// passa por todas as abas e confere os cálculos principais.
// Rodar: node tests/smoke.mjs   (precisa do pacote playwright e do Chromium)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

let pw;
try { pw = await import("playwright"); }
catch (e) { pw = await import(pathToFileURL(path.join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs")).href); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript", ".mjs":"text/javascript", ".json":"application/json", ".webmanifest":"application/manifest+json", ".png":"image/png", ".jpg":"image/jpeg", ".woff2":"font/woff2", ".css":"text/css"};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, {"Content-Type": TYPES[path.extname(file)] || "application/octet-stream"});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

let fails = 0, passes = 0;
const ok = (cond, name, extra) => { if (cond){ passes++; console.log("  ok  " + name); } else { fails++; console.log("  FALHOU  " + name + (extra !== undefined ? "  →  " + JSON.stringify(extra) : "")); } };
const near = (a, b, tol = 0.6) => typeof a === "number" && Math.abs(a - b) <= tol;

// Dados de exemplo: perfil pronto, 3 semanas de refeições, pesos, medidas e treinos
const pad = n => String(n).padStart(2, "0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function seed(){
  const M = {}, today = new Date();
  for (let i = 20; i >= 0; i--){
    const d = new Date(today); d.setDate(d.getDate() - i);
    const k = keyOf(d), mk = k.slice(0, 7);
    M[mk] = M[mk] || {t: 1, days: {}};
    const day = {items: [
      {id:"a"+i, key:"t0", n:"Arroz, integral, cozido", g:150, k:124, p:2.6, c:25.8, f:1, m:"almoco"},
      {id:"b"+i, key:"q", n:"Adição rápida", g:100, k:900, p:60, c:80, f:30, m:"jantar"},
      {id:"c"+i, key:"rTESTE", n:"Panqueca", g:200, k:150, p:10, c:20, f:4, m:"cafe"}
    ], w: 82 - i*0.05};
    if (i % 7 === 0) day.body = {pe:40, ci:90, qu:100, br:38};
    if (i % 2 === 0) day.wo = {prog:"livre", name:"Treino livre", done:true, ex:[
      {n:"Supino reto", t:"3x10", reps:10, sets:[{kg:"40", r:"10", ok:true, w:true}, {kg:String(60 + (20 - i)), r:"8", ok:true}, {kg:"60", r:"8", ok:true}]},
      {n:"Barra fixa", t:"3x8", reps:8, sets:[{kg:"", r:"8", ok:true}]}
    ]};
    if (i === 0) day.water = 1500;
    M[mk].days[k] = day;
  }
  const S = {v:1, setup:true, sex:"m", age:30, height:178, weight:82, t:1,
    recipes:[{id:"TESTE", n:"Panqueca", servings:2, unit:"porção", items:[
      {key:"t0", n:"Arroz, integral, cozido", g:100, k:124, p:2.6, c:25.8, f:1},
      {key:"x", n:"Ovo", g:100, k:143, p:13, c:1, f:9.5}]}]};
  return {S, M};
}

const browser = await pw.chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ? {} : {});
const ctx = await browser.newContext({viewport:{width:390, height:844}, serviceWorkers:"block", locale:"pt-BR", timezoneId:"America/Sao_Paulo"});
await ctx.route(url => !String(url).startsWith(BASE), r => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });

console.log("Abrindo o app com dados de exemplo");
await page.addInitScript(data => { if (!sessionStorage.getItem("seeded")){ localStorage.setItem("cicloFerro.v1", JSON.stringify(data)); localStorage.setItem("muscleLand.rules", "3"); sessionStorage.setItem("seeded", "1"); } }, seed());
await page.goto(BASE);
await page.waitForSelector("#view .kcal-big");
ok(await page.title() === "Muscle Land", "título da página");
ok(await page.evaluate(() => typeof TACO === "object" && FOODS.length > 1500), "base de alimentos carregada", await page.evaluate(() => typeof FOODS !== "undefined" && FOODS.length));

console.log("Cálculos");
const calc = await page.evaluate(() => {
  const bm = bmr(80); // perfil: 30 anos, 178 cm, homem
  return {
    bmr: bm,
    navy: navyBF("m", 178, 40, 90),
    navyF: navyBF("f", 165, 32, 75, 100),
    rfm: rfmBF("m", 178, 90),
    e1: e1rm(100, 10), e1one: e1rm(100, 1),
    plates: plates(100, 20).out,
    platesBad: plates(10, 20),
    gpct: goalGrams({k:2000, p:30, c:40, f:30}, "pct", 80),
    ggkg: goalGrams({p:2, c:3, f:1}, "gkg", 80),
    back: goalFromGrams({p:150, c:200, f:67}, "pct", 80),
    item: itemMacros({g:150, k:124, p:2.6, c:25.8, f:1}),
    rec: recipeCalc({items:[{g:100, k:100, p:10, c:10, f:1}, {g:100, k:200, p:0, c:50, f:0}], servings:2, yieldG:150}),
    rank: [rankOf({kcal:2000, p:150, c:200, f:60}, {kcal:2000, p:150, c:200, f:60}), rankOf({kcal:1000, p:50, c:100, f:30}, {kcal:2000, p:150, c:200, f:60}), rankOf({kcal:0}, {kcal:2000})],
    unitPl: [unitName("colher de sopa", 2), unitName("unidade média", 3), unitName("pão", 2)],
    num: [num("82,4"), num("abc"), num("")],
    csvCell: csvCell("a;b"),
    plan: (() => { const p = autoPlan(80, todayKey()); return {avg:p.avg, week: S.week.reduce((a, t) => a + p[t].kcal, 0) / 7}; })()
  };
});
ok(near(calc.bmr, 1767.5, 0.01), "metabolismo basal (Mifflin-St Jeor)", calc.bmr);
ok(near(calc.navy, 18.7, 0.2), "% de gordura pela Marinha (homem)", calc.navy);
ok(calc.navyF > 20 && calc.navyF < 40, "% de gordura pela Marinha (mulher)", calc.navyF);
ok(near(calc.rfm, 24.4, 0.2), "% de gordura pelo RFM", calc.rfm);
ok(near(calc.e1, 133.3, 0.1) && calc.e1one === 100, "1RM de Epley", [calc.e1, calc.e1one]);
ok(JSON.stringify(calc.plates) === "[25,15]" && calc.platesBad === null, "calculadora de anilhas", calc.plates);
ok(near(calc.gpct.p, 150, 0.01) && near(calc.gpct.c, 200, 0.01) && near(calc.gpct.f, 66.7, 0.1), "metas em % viram gramas", calc.gpct);
ok(calc.ggkg.p === 160 && calc.ggkg.c === 240 && calc.ggkg.f === 80, "metas em g/kg viram gramas", calc.ggkg);
ok(calc.back.p + calc.back.c + calc.back.f === 100, "gramas viram % que somam 100", calc.back);
ok(near(calc.item.kcal, 186) && near(calc.item.c, 38.7), "macros de um item por gramas", calc.item);
ok(near(calc.rec.per100.k, 200) && near(calc.rec.portionG, 75) && near(calc.rec.portion.k, 150), "receita com peso pronto e porções", calc.rec.per100);
ok(calc.rank[0] === "S" && calc.rank[1] === "D" && calc.rank[2] === null, "rank do dia", calc.rank);
ok(JSON.stringify(calc.unitPl) === JSON.stringify(["colheres de sopa", "unidades médias", "pães"]), "plural das medidas caseiras", calc.unitPl);
ok(calc.num[0] === 82.4 && calc.num[1] === null && calc.num[2] === null, "números com vírgula", calc.num);
ok(calc.csvCell === '"a;b"', "célula de planilha com ponto e vírgula");
ok(near(calc.plan.week, calc.plan.avg, 8), "ciclo de carbo fecha a média semanal de calorias", calc.plan);

console.log("Planilhas e relatórios");
const csv = await page.evaluate(() => ({body: csvBody(), wo: csvWorkouts(), diet: csvDiet()}));
const bodyRow = csv.body.split("\r\n").find(l => /;90(;|$)/.test(l));
ok(!!bodyRow && /;40;90;100/.test(bodyRow), "planilha de medidas traz pescoço, cintura e quadril", bodyRow || csv.body.split("\r\n").slice(0, 3));
ok(/Braço/.test(csv.body.split("\r\n")[0]) && /;38(;|$)/.test(bodyRow || ""), "planilha de medidas traz as outras medidas", csv.body.split("\r\n")[0]);
ok(/aquecimento/.test(csv.wo) && /Supino reto/.test(csv.wo), "planilha de treinos");
ok(csv.diet.split("\r\n").length > 50, "planilha de refeições");

const lift = await page.evaluate(() => { const e = {sets:[{kg:"200", r:"5", w:true}, {kg:"100", r:"5"}]}; return exE1rm(e); });
ok(near(lift, 116.7, 0.1), "aquecimento não conta no 1RM", lift);

console.log("Abas");
for (const tab of ["treino", "corpo", "evolucao", "ajustes", "hoje"]){
  await page.click(`.tabs button[data-tab="${tab}"]`);
  await page.waitForTimeout(250);
  const h = await page.evaluate(() => document.querySelector("#view").innerText.length);
  ok(h > 200, `aba ${tab} desenha`, h);
}
await page.click('.tabs button[data-tab="evolucao"]');
await page.waitForFunction(() => window.Chart && document.querySelector("#cW"), null, {timeout:5000}).catch(() => {});
await page.waitForTimeout(300);
ok(await page.evaluate(() => !!window.Chart && charts.length >= 2), "gráficos da Evolução carregam", await page.evaluate(() => charts.length));
ok(await page.evaluate(() => /Semana em números/.test(document.querySelector("#view").innerText)), "relatório da semana (sem IA) aparece");
const wk = await page.evaluate(() => weekReport(todayKey()));
ok(wk.cur.days === 7 && wk.cur.workouts >= 3 && wk.prev.days === 7, "relatório da semana conta dias e treinos", wk.cur);

console.log("Dieta");
await page.click('.tabs button[data-tab="hoje"]');
await page.click("#shopBtn");
await page.waitForSelector("#shopList");
const shop = await page.evaluate(() => document.querySelector("#shopList").innerText);
ok(/Arroz/.test(shop) && /Ovo/.test(shop) && !/Adição rápida/.test(shop), "lista de compras junta alimentos e abre receitas em ingredientes", shop.slice(0, 200));
const shopG = await page.evaluate(() => shoppingList(7).find(x => /Arroz/.test(x.n)));
ok(shopG && near(shopG.g, 7*150 + 7*100, 1), "lista de compras soma as gramas da semana (arroz + arroz da receita)", shopG);
await page.click("#shopList input[type=checkbox]");
ok(await page.evaluate(() => (S.shop || {}).got && S.shop.got.length === 1), "item marcado na lista fica salvo");
await page.keyboard.press("Escape");
await page.waitForTimeout(100);
ok(await page.evaluate(() => !document.querySelector("#sheetRoot").innerHTML), "Esc fecha a folha");

await page.click("[data-add=cafe]");
await page.waitForSelector("#q");
ok(await page.evaluate(() => document.activeElement && !!document.activeElement.closest(".sheet")), "foco vai para dentro da folha aberta");
await page.fill("#q", "banana prata");
await page.waitForTimeout(150);
await page.click("#res [data-k]");
await page.waitForSelector("#ok");
await page.click("#ok");
await page.waitForTimeout(150);
ok(await page.evaluate(() => getDay(todayKey()).items.some(i => /Banana/i.test(i.n))), "adicionar alimento pela busca");

console.log("Relatório para imprimir");
await page.click('.tabs button[data-tab="ajustes"]');
ok(await page.evaluate(() => { rulesOk = false; render(); const hidden = !document.querySelector("#accIn") && !document.querySelector("#remOn"); rulesOk = true; render(); return hidden; }), "sem as regras publicadas, conta e lembretes ficam escondidos");
ok(await page.evaluate(() => !!document.querySelector("#accIn") && /Entrar com Google/.test(document.querySelector("#accSec").nextElementSibling.textContent)), "Ajustes mostra Entrar com Google");
ok(await page.evaluate(() => !!Reminders && /Lembretes/.test(document.querySelector("#view").innerText)), "Ajustes mostra os lembretes");
const rep = await page.evaluate(() => reportHTML(30));
ok(/Relatório/.test(rep) && /Peso/.test(rep) && /Treinos/.test(rep) && /<table/.test(rep), "relatório em PDF monta as seções");

console.log("Sincronização com a nuvem (dois aparelhos na mesma conta)");
const sync = await page.evaluate(async () => {
  const cloud = {}, keep = {S:structuredClone(S), M:structuredClone(M)};
  const col = {doc: id => ({set: async d => { cloud[id] = structuredClone(d); }, delete: async () => { delete cloud[id]; }}),
    get: async () => ({docs: Object.entries(cloud).map(([id, b]) => ({id, exists:true, data: () => structuredClone(b)}))})};
  const wait = () => new Promise(r => setTimeout(r, 50));
  const days = () => Object.values(M).reduce((a, m) => a + Object.keys(m.days).length, 0);
  Cloud.col = col; Cloud.ready = true;
  const before = days();
  await pull(); await flush();                                   // aparelho A sobe o histórico
  const A = {S:structuredClone(S), M:structuredClone(M)};
  S = mergeSettings({setup:true, t:Date.now()}); M = {};         // aparelho B: novo, só 1 alimento hoje
  const k = todayKey(); getDay(k, true).items.push({id:"novo", key:"t0", n:"Ovo", g:50, k:73, p:6, c:0.5, f:5, m:"cafe"}); touchDay(k);
  await pull(); await flush(); await wait();
  const bGot = days();
  S = A.S; M = A.M; await pull(); await flush(); await wait();   // A volta: não pode perder nada
  const aAfter = days(), hasNew = !!(getDay(k) && getDay(k).items.some(i => i.id === "novo"));
  Cloud.ready = false; Cloud.col = null; S = keep.S; M = keep.M; saveLocal();
  return {before, bGot, aAfter, hasNew};
});
ok(sync.bGot >= sync.before, "aparelho novo recebe todo o histórico da nuvem", sync);
ok(sync.aAfter >= sync.before && sync.hasNew, "um aparelho com 1 dia não apaga o mês do outro", sync);

console.log("Tela pequena");
await page.setViewportSize({width:320, height:640});
for (const tab of ["hoje", "treino", "corpo", "evolucao", "ajustes"]){
  await page.click(`.tabs button[data-tab="${tab}"]`);
  await page.waitForTimeout(150);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, `aba ${tab} sem rolagem lateral em 320 px`, over);
}

ok(!errors.length, "nenhum erro de JavaScript", errors);
await browser.close();
server.close();
console.log(`\n${passes} ok, ${fails} falharam`);
process.exit(fails ? 1 : 0);
