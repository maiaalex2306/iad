# Release candidate v286.83 — RI-08 + PERF-39 + PERF-40
Base atual: `bef067f64460ee3a84b305096b0f3d34c24d9dd4`; RI-08: `ee2b197266ca78a0c1143e4c62d215b6b44e2d1a`; PERF-40: `9a699a925f51abd6262154e901c60596b7b4f53a`.
Pacote de integração em branch separada. Sem merge na branch de produção.
Inclui RI-08, preserva o Kanban PERF-39, inclui telemetria PERF-40 (sem mudar sync) e adiciona conversation-intent.mjs no precache PWA.
Versão coerente entre sw.js e src/config.js: v286.83.

**Gate para produção (ainda bloqueado):** credenciais OpenAI/Claude e E2E autenticado no staging; importação real do LinkedHelper; 2 tenants/gestores/vendedores; P50/P95 medidos em amostras reais; teste offline ativando Service Worker; CI completa do commit integrado e rollback coordenado.
CI verde não substitui esses gates; não publicar automaticamente.