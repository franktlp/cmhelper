from pathlib import Path

p=Path('cardmarket-helper.js')
s=p.read_text()

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'Missing transform target: {label}')
    s=s.replace(old,new,1)

rep('const VERSION = "5.4.32 Manual Valuation Export";','const VERSION = "5.4.33 Rich Diagnostics";','version')

rep('''        const rejectStats={
          rows:rows.length,
          noProductLink:0,
          parseFail:0,
          wrongExpansion:0,
          notWanted:0,
          condition:0,
          language:0,
          noPrice:0,
          overMax:0,
          accepted:0
        };''','''        const rejectStats={
          rows:rows.length,
          noProductLink:0,
          parseFail:0,
          wrongExpansion:0,
          notWanted:0,
          condition:0,
          language:0,
          noPrice:0,
          overMax:0,
          accepted:0,
          numberMismatch:0,
          numberMismatchSamples:[]
        };''','reject stats')

rep('''          let name="";
          let exp="";
          let number="";''','''          let name="";
          let exp="";
          let number="";
          let urlNumber="";''','url number variable')

rep('''              const urlExp=String(mm[1]||"").trim().toUpperCase();
              const urlNumber=normalizeNum(mm[2]);
              if(!exp) exp=urlExp;
              if(!number) number=urlNumber;''','''              const urlExp=String(mm[1]||"").trim().toUpperCase();
              urlNumber=normalizeNum(mm[2]);
              if(!exp) exp=urlExp;
              if(!number) number=urlNumber;''','url number capture')

rep('''          if(!exp || !number){ rejectStats.parseFail++; continue; }
          if(!expansionCodesEquivalent(exp, expansion)){''','''          if(!exp || !number){ rejectStats.parseFail++; continue; }
          if(urlNumber && number && urlNumber!==number){
            rejectStats.numberMismatch++;
            if(rejectStats.numberMismatchSamples.length<5)
              rejectStats.numberMismatchSamples.push(`${exp} visible #${number} / URL #${urlNumber}`);
          }
          if(!expansionCodesEquivalent(exp, expansion)){''','mismatch detection')

rep('''          const offer={
            name, expansion:exp, number, condition:cond, language,
            quantity:qty, price_eur:price, article_id:extractArticleId(row),
            url:new URL(a.getAttribute("href"),location.origin).href, page:pageNo
          };''','''          const offer={
            name, expansion:exp, number, condition:cond, language,
            quantity:qty, price_eur:price, article_id:extractArticleId(row),
            url:new URL(a.getAttribute("href"),location.origin).href, page:pageNo,
            url_number:urlNumber || "",
            number_mismatch:!!(urlNumber && number && urlNumber!==number)
          };''','offer diagnostics')

rep('''        if(rejectStats.wrongExpansionSamples?.length)
          log.textContent += ` · muestra exp: ${rejectStats.wrongExpansionSamples.join(", ")}`;
        log.textContent += "\\n";''','''        if(rejectStats.wrongExpansionSamples?.length)
          log.textContent += ` · muestra exp: ${rejectStats.wrongExpansionSamples.join(", ")}`;
        if(rejectStats.numberMismatch)
          log.textContent += ` · ⚠ numeración URL≠visible: ${rejectStats.numberMismatch}${rejectStats.numberMismatchSamples.length?` (${rejectStats.numberMismatchSamples.join(", ")})`:""}`;
        log.textContent += "\\n";''','scan diagnostic log')

rep('''          name:o.name,
          seller:o.seller,
          price_eur:o.price_eur,
          market_ref_eur:val.ref,
          ceiling_eur:val.ceiling,
          verdict:v.status,
          reason:v.reason,
          source:val.refSource,
          url:o.url''','''          name:o.name,
          seller:o.seller,
          country:(sellers[sellerIndex[o.seller]]?.country || ""),
          price_eur:o.price_eur,
          market_ref_eur:val.ref,
          ceiling_eur:val.ceiling,
          verdict:v.status,
          reason:v.reason,
          source:val.refSource,
          language:o.language,
          condition:o.condition,
          url_number:o.url_number || "",
          number_mismatch:o.number_mismatch ? "YES" : "",
          url:o.url''','valuation metadata')

rep('''        rejected.slice(0,8).forEach(r=>{
          log.textContent += `- ${r.name} #${r.number}: ${fmt(r.price_eur)} (ref ${fmt(r.market_ref_eur)} · techo ${fmt(r.ceiling_eur)}) · ${r.verdict}\\n`;
        });''','''        rejected.slice(0,8).forEach(r=>{
          const who=`${r.seller || "?"}${r.country?` [${r.country}]`:""}`;
          const mismatch=r.number_mismatch ? ` · ⚠ URL #${r.url_number}` : "";
          log.textContent += `- ${r.name} #${r.number} · ${who}: ${fmt(r.price_eur)} (ref ${fmt(r.market_ref_eur)} · techo ${fmt(r.ceiling_eur)}) · ${r.verdict}${mismatch}\\n  ${r.url || ""}\\n`;
        });''','rejected log')

rep('''    const cols=["key","number","name","seller","price_eur","market_ref_eur","ceiling_eur","verdict","reason","source","url"];''','''    const cols=["key","number","name","seller","country","price_eur","market_ref_eur","ceiling_eur","verdict","reason","source","language","condition","url_number","number_mismatch","url"];''','valuation export columns')

p.write_text(s)
