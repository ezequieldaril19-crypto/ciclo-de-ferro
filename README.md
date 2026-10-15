# Muscle Land

App pessoal de dieta e treino: macros com a tabela TACO, ciclo de carboidratos, código de barras (Open Food Facts), treinos old school, percentual de gordura e gráficos de evolução.

Funciona como app instalável (PWA) e offline. Os dados ficam salvos só no aparelho; use o backup em Ajustes.

## Arquivos

- `index.html`: o app inteiro (telas, estilo e lógica).
- `data/taco.js`: base de alimentos (TACO e IBGE), separada para ficar no cache do celular.
- `sw.js`: service worker (funcionar offline). Ao mudar qualquer arquivo do app, troque o nome em `CACHE` para os celulares baixarem a versão nova.
- `tests/smoke.mjs`: testes automáticos. Rodam no GitHub a cada envio.
- `firestore.rules`: regras de segurança do Firebase (comunidade, conta Google, amigos e lembretes), testadas por `tests/rules.mjs`.
- `.github/scripts/lembretes.mjs`: envia os lembretes; roda a cada 15 minutos no GitHub (segredo `FIREBASE_SA`).

## Testes

```
npm install --no-save playwright@1.56.1
npx playwright install chromium
node tests/smoke.mjs
```

Abrem o app num navegador sem internet, com dados de exemplo, passam por todas as abas e conferem os cálculos (metabolismo, % de gordura, metas, receitas, 1RM, anilhas, planilhas, lista de compras e relatórios).

Regras do Firebase (precisa de Java):

```
npx firebase-tools emulators:exec --only firestore --project demo-muscle "node tests/rules.mjs"
```

## Conta Google e lembretes: configuração no Firebase

1. **Regras:** Firebase Console > Firestore Database > Regras > colar `firestore.rules` > Publicar.
2. **Login com Google:** Authentication > Método de login > Google > Ativar.
3. **Domínios:** Authentication > Configurações > Domínios autorizados > adicionar `ezequieldaril19-crypto.github.io` (e o endereço do Netlify, se usar).
4. **Lembretes:** o segredo `FIREBASE_SA` (chave JSON de conta de serviço, em Configurações do projeto > Contas de serviço) precisa estar em GitHub > Settings > Secrets and variables > Actions.
