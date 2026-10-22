from pathlib import Path

p = Path("cardmarket-helper.js")
s = p.read_text()

repls = []
repls.append((
'  const VERSION = "5.4.31 Wants-Aware Shipping Editor";',
'  const VERSION = "5.4.32 Manual Valuation Export";'
))

repls.append((
'''      <button id="cm-edit-shipping" style="padding:7px 10px">Editar portes</button>\n      <button id="cm-smart-plan" style="padding:7px 10px;font-weight:700">Plan inteligente</button>\n      <button id="cm-compare" style="padding:7px 10px">Comparar simple</button>''',
'''      <button id="cm-edit-shipping" style="padding:7px 10px">Editar portes</button>\n      <button id="cm-smart-plan" style="padding:7px 10px;font-weight:700">Plan inteligente</button>\n      <button id="cm-export-valuation" style="padding:7px 10px">Exportar valoración</button>\n      <button id="cm-compare" style="padding:7px 10px">Comparar simple</button>'''
))

repls.append((
'''      // Full audit: every observed offer with verdict/reason\n      const aCols=["key","number","name","seller","price_eur","market_ref_eur","ceiling_eur","verdict","reason","source","url"];\n      const audit=[aCols.join(";"),...result.valuationRows.map(r=>aCols.map(c=>{\n        let v=r[c];\n        if (typeof v==="number") v=csvDec(v);\n        return csvEscape(v??"");\n      }).join(";"))].join("\\r\\n");\n      download(`cardmarket_valoracion_MULTI.csv`,audit);\n\n''',
''
))

anchor = '''  $("#cm-export").onclick = () => {\n    const sellers=Object.values(loadSellers());\n'''
handler = '''  $("#cm-export-valuation").onclick = () => {\n    const rows=lastSmartPlan?.result?.valuationRows || [];\n    if(!rows.length){\n      $("#cm-log").textContent="No hay una valoración disponible. Ejecuta primero Plan inteligente.";\n      return;\n    }\n    const cols=["key","number","name","seller","price_eur","market_ref_eur","ceiling_eur","verdict","reason","source","url"];\n    const csv=[cols.join(";"),...rows.map(r=>cols.map(c=>{\n      let v=r[c];\n      if(typeof v==="number") v=csvDec(v);\n      return csvEscape(v??"");\n    }).join(";"))].join("\\r\\n");\n    download("cardmarket_valoracion_MULTI.csv",csv);\n    $("#cm-log").textContent=`Valoración exportada: ${rows.length} ofertas analizadas.`;\n  };\n\n'''
repls.append((anchor, handler + anchor))

for old, new in repls:
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"Expected exactly 1 match, found {n}: {old[:90]!r}")
    s = s.replace(old, new, 1)

p.write_text(s)
print("Applied v5.4.32 transform")
