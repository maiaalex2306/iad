#!/usr/bin/env python3
"""PERF-24: check real Config > Desempenho markup across mobile/desktop."""
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = r"""
const fs=require('node:fs'),vm=require('node:vm');
const p=fs.readFileSync('src/performance.js','utf8');
const s=fs.readFileSync('src/views.js','utf8');
const w={performance:{now:()=>0},console};
vm.runInNewContext(p,{window:w,console,Date,Math,Number,JSON});
w.IADPerformance.iniciar();
for(let i=0;i<40;i++){
 w.IADPerformance.registrar('perf17.cockpit.clique-a-dois-frames',i+1);
 w.IADPerformance.registrar('perf23.rede.rest',i+3);
}
const begin=s.indexOf('  function configDesempenho() {');
const end=s.indexOf('\n  function configApp() {',begin);
if(begin<0||end<=begin)throw Error('UI PERF-24 ausente');
const result=vm.runInNewContext(s.slice(begin,end)+'\nconfigDesempenho();',{
 global:{IADPerformance:w.IADPerformance},Number,Math,Object,
 esc:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
});
if(!result.includes('Abertura das oportunidades')||!result.includes('Troca de abas do cockpit'))throw Error('Diagnóstico PERF-26 ausente');
process.stdout.write(result);
"""
html = subprocess.check_output(["node", "-e", SCRIPT], cwd=ROOT, text=True)
css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
palette = (ROOT / "assets/paleta-acp.css").read_text(encoding="utf-8")
full = (
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1">'
    '<style>' + css + '</style><style>' + palette + '</style>'
    '</head><body><div class="app"><div class="col"><main id="conteudo">'
    '<h1>Configuração</h1>' + html +
    '</main></div></div></body></html>'
)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width,height in [(390,844),(768,1024),(940,560),(1280,720),(1440,900)]:
        page = browser.new_page(viewport={"width":width,"height":height})
        page.set_content(full,wait_until="load")
        report=page.evaluate("""() => {
          const buttons=[...document.querySelectorAll('button')].map(b=>{
            const r=b.getBoundingClientRect();
            return {text:b.textContent.trim(),left:r.left,top:r.top,
                    right:r.right,bottom:r.bottom,width:r.width,height:r.height};
          });
          return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,
            buttons,rows:[...document.querySelectorAll('tbody tr')].length,
            cards:document.querySelectorAll('.card').length};
        }""")
        assert report["cards"]==4, f"{width}: quatro cartões de diagnóstico não renderizados"
        assert report["rows"]>=2, f"{width}: métricas omitidas"
        assert len(report["buttons"])==5, f"{width}: controles incompletos"
        assert report["scroll"]<=width+1, (
            f"{width}: página com scroll horizontal: {report['scroll']}")
        for i,b in enumerate(report["buttons"]):
            assert b["width"]>50 and b["height"]>20, f"{width}: botão {b['text']} ilegível"
            assert b["left"]>=-1 and b["right"]<=width+1, (
                f"{width}: botão fora do viewport: {b['text']}")
            for other in report["buttons"][:i]:
                dx=min(b["right"],other["right"])-max(b["left"],other["left"])
                dy=min(b["bottom"],other["bottom"])-max(b["top"],other["top"])
                assert dx<=1 or dy<=1, (
                    f"{width}: botões {b['text']} e {other['text']} sobrepostos")
        print(f"PERF24_UI_OK {width}x{height} controls=5 rows={report['rows']}")
        page.close()
    browser.close()
