/* Local concept and typo matching. It retrieves written content; it never invents answers. */
(() => {
  const replacements = [
    [/\b(?:fetal|foetal) bovine serum\b/g, 'serum'],[/\bfbs\b/g,'serum'],
    [/\b(?:gel powder|agarose powder)\b/g,'agarose'],
    [/\bcell food\b/g,'culture medium'],[/\b(?:media|medium)\b/g,'medium'],
    [/\brmpi\b/g,'rpmi'],[/\b(?:etoh|ethyl alcohol)\b/g,'ethanol'],
    [/\b(?:ipa|isopropyl alcohol|2 propanol)\b/g,'isopropanol'],
    [/\b(?:pipetboy|pipetteboy|pipet boy|pipette boy)\b/g,'serological pipette'],
    [/\b(?:pipet|pipets)\b/g,'pipette'],[/\b(?:big|large) pipettes?\b/g,'serological pipette'],
    [/\b(?:falcon|conical) tubes?\b/g,'conical tube'],
    [/\b(?:trash|garbage|rubbish|bin) bags?\b/g,'waste bag'],
    [/\b(?:rna seq|rna sequencing)\b/g,'rnaseq'],
    [/\b(?:clean up|cleanup|purify)\b/g,'purification'],
    [/\b(?:quantify|quantification|quantitation|measure|measuring|measurement|measurements|concentration)\b/g,'quantification'],
    [/\b(?:freeze|freezing|cryopreserve|cryopreservation)\b/g,'freezing'],
    [/\b(?:splitting|split|passage|passaging)\b/g,'passage'],
    [/\b(?:high sensitivity)\b/g,'hs'],[/\b(?:broad range)\b/g,'br'],
    [/\b(?:fridge|refrigerator)\b/g,'fridge'],[/\b(?:cupboard|cabinet)\b/g,'cabinet'],
    [/\b(?:fume hood|chemical hood)\b/g,'hood']
  ];
  const stop = new Set('a an the i we our me my us you your it its this that these those is are was were be been being can could would should do does did have has had to of for from in at on by with and or please where how what which who when find get locate looking look need needs needed want wants some any something anything there here about more much many use used using tell show help available store stored keep kept put go buy borrow'.split(' '));
  const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[−–—-]/g,' ').replace(/°/g,' ');
  function words(value, query=false) {
    let text = normalize(value);
    for (const [pattern,replacement] of replacements) text=text.replace(pattern,replacement);
    // Filter before plural reduction: "does" must not turn into a searchable "doe".
    const result = (text.match(/[\p{L}\p{N}]+/gu)||[])
      .filter(word => !query || !stop.has(word))
      .map(word => word.length>4 && word.endsWith('ies') ? word.slice(0,-3)+'y' : word.length>3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0,-1) : word);
    return [...new Set(result)];
  }
  function distance(a,b) {
    const table=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
    for(let i=0;i<=a.length;i++)table[i][0]=i;
    for(let j=0;j<=b.length;j++)table[0][j]=j;
    for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
      table[i][j]=Math.min(table[i-1][j]+1,table[i][j-1]+1,table[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])table[i][j]=Math.min(table[i][j],table[i-2][j-2]+1);
    }
    return table[a.length][b.length];
  }
  function closeness(term, candidate) {
    if(term===candidate)return 1;
    if(term.length>=3&&candidate.startsWith(term))return .8;
    if(term.length<4||candidate.length<4)return 0;
    const threshold=term.length>=8?2:1;
    if(Math.abs(term.length-candidate.length)>threshold)return 0;
    return distance(term,candidate)<=threshold?.55:0;
  }
  const cache = new WeakMap();
  function rank(doc,query) {
    if(!String(query).trim())return 0;
    const terms=words(query,true);
    if(!terms.length)return -1;
    let fields=cache.get(doc);
    if(!fields){
      fields=[
        [8,words(doc.name||doc.title)],
        [7,words((doc.aliases||doc.keywords||[]).join(' '))],
        [4,words([doc.uses,doc.field,doc.summary].filter(Boolean).join(' '))],
        [2,words([doc.location,doc.note,doc.category].filter(Boolean).join(' '))],
        [1,words(doc.bodyText||'')]
      ];cache.set(doc,fields);
    }
    let score=0,matched=0;
    for(const term of terms){
      let best=0;
      for(const [weight,candidates] of fields){
        for(const candidate of candidates)best=Math.max(best,weight*closeness(term,candidate));
      }
      if(best){matched++;score+=best;}
      // Explicit biosafety-area qualifiers must not bleed into another location.
      else if(term==='s1'||term==='s2')return -1;
    }
    // Every meaningful term must match. Dropping an unmatched substance name
    // can otherwise return an unrelated reagent merely sharing a room or area.
    if(matched<terms.length)return -1;
    return score/terms.length+matched*.1;
  }
  const api={rank,terms:query=>words(query,true)};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.WIKI_SEARCH=api;
})();
