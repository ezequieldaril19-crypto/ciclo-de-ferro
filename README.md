# Muscle Land

App pessoal de dieta e treino: macros com a tabela TACO, ciclo de carboidratos, código de barras (Open Food Facts), treinos old school, percentual de gordura e gráficos de evolução.

Funciona como app instalável (PWA) e offline. Os dados ficam salvos só no aparelho; use o backup em Ajustes.

## Arquivos

- `index.html`: o app inteiro (telas, estilo e lógica).
- `data/taco.js`: base de alimentos (TACO e IBGE), separada para ficar no cache do celular.
- `sw.js`: service worker (funcionar offline). Ao mudar qualquer arquivo do app, troque o nome em `CACHE` para os celulares baixarem a versão nova.
- `tests/smoke.mjs`: testes automáticos. Rodam no GitHub a cada envio.

## Testes

```
npm install --no-save playwright@1.56.1
npx playwright install chromium
node tests/smoke.mjs
```

Abrem o app num navegador sem internet, com dados de exemplo, passam por todas as abas e conferem os cálculos (metabolismo, % de gordura, metas, receitas, 1RM, anilhas, planilhas, lista de compras e relatórios).
