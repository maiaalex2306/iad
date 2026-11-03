#!/usr/bin/env python3
"""UI-01: validar no Chromium o painel público de login com CSS e HTML reais.

Não usa autenticação, dados comerciais, rede nem credenciais.
Roda no CI com python -m playwright install chromium.
"""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]

RENDER = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const playbook = fs.readFileSync('src/playbook.js', 'utf8');
const views = fs.readFileSync('src/views.js', 'utf8');
const global = {window:{}};
vm.runInNewContext(playbook, global, {filename:'playbook.js'});
const from = views.indexOf('  function painelAcesso() {');
const to = views.indexOf('\n  function campo(', from);
if(from < 0 || to <= from) throw Error('Componente real painelAcesso() ausente');
const snippet = views.slice(from,to);
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const panel = vm.runInNewContext(snippet + '\npainelAcesso()', {
  P:global.window.IADPlaybook,esc
}, {filename:'painel-acesso.js'});
if(!panel.includes('Oito decisões, não oito etapas'))throw Error('Markup de login inesperado');
process.stdout.write(panel);
"""

markup = subprocess.check_output(["node", "-e", RENDER], cwd=ROOT, text=True)
css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
palette = (ROOT / "assets/paleta-acp.css").read_text(encoding="utf-8")
page_html = (
    '<!doctype html><html lang="pt-BR"><head>'
    '<meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1">'
    '<style>' + css + '</style><style>' + palette + '</style>'
    '</head><body class="sem-sessao">'
    '<div class="app"><main><div class="acesso">'
    + markup +
    '<div class="acesso-forma"><div class="cartao-acesso"><h2>Entrar</h2>'
    '<label class="campo"><span>E-mail</span><input type="email"></label>'
    '</div></div></div></main></div></body></html>'
)

VIEWPORTS = [
    (940, 560), (980, 585), (1200, 585), (1280, 720),
    (1366, 768), (1440, 900), (1920, 1080), (390, 844),
]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width, height in VIEWPORTS:
        page = browser.new_page(viewport={"width": width, "height": height})
        page.set_content(page_html, wait_until="load")
        report = page.evaluate("""() => {
          const panel = document.querySelector('.acesso-painel');
          const chipBox = panel.querySelector('.chips');
          const chips = [...panel.querySelectorAll('.chips > .chip')];
          const steps = [...panel.querySelectorAll('ul > li')];
          const title = steps[0].querySelector('strong');
          const form = document.querySelector('.acesso-forma');
          const to = e => {
            const r = e.getBoundingClientRect();
            return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,
                    height:r.height,width:r.width};
          };
          return {panelVisible:getComputedStyle(panel).display !== 'none',
                  panel:to(panel),chipsBox:to(chipBox),chips:chips.map(to),
                  steps:steps.map(to),title:to(title),form:to(form),
                  countChips:chips.length,countSteps:steps.length,
                  clientHeight:panel.clientHeight,
                  scrollHeight:panel.scrollHeight,
                  contentWidth:document.documentElement.scrollWidth,
                  viewportWidth:innerWidth};
        }""")
        if width < 940:
            assert not report["panelVisible"], f"{width}: painel não deve ocultar formulário mobile"
        else:
            assert report["panelVisible"], f"{width}: painel desapareceu no desktop"
            assert report["countChips"] == 8, f"{width}: faltam decisões"
            assert report["countSteps"] == 4, f"{width}: faltam etapas explicativas"
            box = report["chipsBox"]
            chips = report["chips"]
            assert box["height"] >= 30, f"{width}: chips comprimidos a zero"
            for i, r in enumerate(chips):
                assert r["top"] >= box["top"]-1, f"{width}: chip {i} acima da caixa"
                assert r["bottom"] <= box["bottom"]+1, f"{width}: chip {i} fora da caixa"
                assert r["left"] >= box["left"]-1, f"{width}: chip {i} vaza à esquerda"
                assert r["right"] <= box["right"]+1, f"{width}: chip {i} vaza à direita"
                for j, other in enumerate(chips[:i]):
                    shared_x = min(r["right"],other["right"]) - max(r["left"],other["left"])
                    shared_y = min(r["bottom"],other["bottom"]) - max(r["top"],other["top"])
                    assert shared_x <= 1 or shared_y <= 1, (
                        f"{width}: chips {i}/{j} sobrepostos: {r} / {other}")
            assert report["steps"][0]["top"] >= box["bottom"]+8, (
                f"{width}: chips invadem primeiro título: {box} {report['steps'][0]}")
            assert report["title"]["top"] >= box["bottom"]+8, (
                f"{width}: título sobrepõe chips")
            for a, b in zip(report["steps"], report["steps"][1:]):
                assert b["top"] >= a["bottom"]+8, (
                    f"{width}: etapas explicativas sobrepostas: {a} / {b}")
            if report["scrollHeight"] > report["clientHeight"]+4:
                page.eval_on_selector(".acesso-painel", "(p) => p.scrollTop = p.scrollHeight")
                page.wait_for_timeout(30)
                end = page.eval_on_selector(".acesso-painel", """p => ({
                    visibleBottom:p.querySelector('.fecho').getBoundingClientRect().bottom,
                    panelBottom:p.getBoundingClientRect().bottom
                  })""")
                assert end["visibleBottom"] <= end["panelBottom"]+2, (
                    f"{width}: final do conteúdo inacessível ao rolar: {end}")
        assert report["contentWidth"] <= width+1, (
            f"{width}: layout cria rolagem horizontal: {report['contentWidth']}")
        print(f"LOGIN_LAYOUT_OK {width}x{height} "
              f"chips={report['countChips']} steps={report['countSteps']} "
              f"scroll={report['scrollHeight']}/{report['clientHeight']}")
        page.close()
    browser.close()
