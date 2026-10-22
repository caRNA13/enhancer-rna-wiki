(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const data = window.WIKI_CONTENT;
  if (!data || !Array.isArray(data.articles)) {
    $('results').textContent = 'The handbook content could not be loaded. Please reload this page.';
    return;
  }
  const icons = {
    'lab-practice': '<path d="M12 4h8M14 4v9L7 26c-.6 1 .2 2 1.2 2h15.6c1 0 1.8-1 1.2-2l-7-13V4M11 20h10M13 24h.1M18 23h.1"/>',
    'cell-culture': '<circle cx="16" cy="16" r="11"/><circle cx="16" cy="15" r="4"/><path d="M9 11h.1M22 18h.1M12 23h.1M21 10h.1M8 18h.1"/>',
    'genomic-libraries': '<path d="M9 4c0 12 14 12 14 24M23 4C23 16 9 16 9 28M10 7h12M12 11h8M12 21h8M10 25h12"/>'
  };
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tokens = value => normalize(value).match(/[\p{L}\p{N}]+/gu) || [];
  const categoryById = id => data.categories.find(category => category.id === id);
  let route = { query: '', category: '', article: '', view: '' };

  function urlFor(next) {
    const params = new URLSearchParams();
    if (next.view === 'locations') params.set('view','locations');
    if (next.query) params.set('q', next.query);
    if (next.category) params.set('area', next.category);
    if (next.article) params.set('page', next.article);
    return params.size ? '#' + params.toString() : '#';
  }

  function readRoute() {
    const params = new URLSearchParams(location.hash.slice(1));
    return {
      query: (params.get('q') || '').slice(0, 300),
      view: params.get('view') === 'locations' ? 'locations' : '',
      category: categoryById(params.get('area')) ? params.get('area') : '',
      article: params.get('page') || ''
    };
  }

  function highlight(text, query) {
    const terms = window.WIKI_SEARCH.terms(query).filter(term => term.length > 1).sort((a,b) => b.length-a.length);
    if (!terms.length) return escape(text);
    // Map normalized search positions back to the original characters.
    let plain = '', starts = [], ends = [];
    let offset = 0;
    for (const char of String(text)) {
      const fragment = normalize(char);
      for (let i=0; i<fragment.length; i++) { starts.push(offset); ends.push(offset+char.length); }
      plain += fragment;
      offset += char.length;
    }
    const pattern = new RegExp(terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    let result = '', cursor = 0;
    for (const match of plain.matchAll(pattern)) {
      const start = starts[match.index], end = ends[match.index + match[0].length - 1];
      if (start < cursor) continue;
      result += escape(String(text).slice(cursor, start)) + '<mark>' + escape(String(text).slice(start,end)) + '</mark>';
      cursor = end;
    }
    return result + escape(String(text).slice(cursor));
  }

  function snippet(article, query) {
    const term = window.WIKI_SEARCH.terms(query).find(word => normalize(article.bodyText).includes(word));
    if (!term) return '';
    const position = normalize(article.bodyText).indexOf(term);
    const start = Math.max(0, position - 42);
    const end = Math.min(article.bodyText.length, start + 170);
    return (start ? '…' : '') + article.bodyText.slice(start, end) + (end < article.bodyText.length ? '…' : '');
  }

  function matches(article, query) {
    return window.WIKI_SEARCH.rank(article,query);
  }

  function locationCards(items) {
    return '<div class="location-grid">'+items.map(item => `<article class="location-card">
      <div class="location-card-top"><span class="category-label" data-category="${escape(item.category)}">${escape(item.field)}</span>${item.needsReview ? '<span class="draft-label">Check location</span>' : ''}</div>
      <h3>${highlight(item.name,route.query)}</h3>
      <p class="location-address"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>${highlight(item.location,route.query)}</span></p>
      ${item.note ? `<p class="location-note ${item.needsReview ? 'needs-review' : ''}">${escape(item.note)}</p>` : ''}
      <p class="location-aliases">${item.aliases.slice(0,3).map(alias=>highlight(alias,route.query)).join(' · ')}</p>
      <button class="text-button" type="button" data-request="reagent" data-topic="${escape(item.name)}">Report this item missing <span aria-hidden="true">↗</span></button>
    </article>`).join('')+'</div>';
  }

  function renderCategories() {
    $('categories').innerHTML = data.categories.map(category => {
      const count = data.articles.filter(article => article.category === category.id).length;
      return `<button type="button" class="category-card" data-category="${escape(category.id)}" aria-pressed="${route.category === category.id}">
        <svg class="category-icon" viewBox="0 0 32 32" aria-hidden="true">${icons[category.id] || ''}</svg>
        <strong>${escape(category.name)}</strong><span class="category-description">${escape(category.description)}</span>
        <span class="category-bottom"><span>${count} ${count === 1 ? 'page' : 'pages'}</span><span aria-hidden="true">↗</span></span>
      </button>`;
    }).join('');
  }

  function renderResults() {
    const locationMode = route.view === 'locations';
    $('handbook-tab').href = urlFor({...route,view:'',category:'',article:''});
    $('locations-tab').href = urlFor({...route,view:'locations',category:'',article:''});
    const scored = locationMode ? [] : data.articles.filter(article => !route.category || article.category === route.category)
      .map(article => ({article, score: matches(article, route.query)}))
      .filter(item => item.score >= 0).sort((a,b) => b.score - a.score);
    const locations = (locationMode || route.query.trim()) ? (data.locations || [])
      .filter(item => !route.category || item.category === route.category)
      .map(item=>({item,score:window.WIKI_SEARCH.rank(item,route.query)}))
      .filter(match=>match.score>=0).sort((a,b)=>b.score-a.score).map(match=>match.item) : [];
    const total = scored.length+locations.length;
    const category = categoryById(route.category);
    $('results-heading').textContent = locationMode ? (route.query ? 'Matching locations' : 'All locations') : route.query ? 'Search results' : category ? category.name : 'All pages';
    $('results-count').textContent = locationMode ? `${locations.length} ${locations.length === 1 ? 'item' : 'items'}` : route.query ? `${total} matches` : `${scored.length} pages`;
    $('show-all').hidden = !route.category;
    $('clear-search').hidden = !route.query;
    $('search-shortcut').hidden = !!route.query;
    $('draft-note').hidden = total === 0;
    $('draft-note').textContent = locationMode ? 'Locations from Carlos’s notes. Stock levels are not tracked here.' : 'From Carlos’s lab notes. “Check details” marks a point that still needs clarification.';
    $('location-results').innerHTML = locations.length ?
      (locationMode ? '' : '<h3 class="result-section-title">Where to find</h3>') + locationCards(locationMode ? locations : locations.slice(0,6)) +
      (!locationMode && locations.length>6 ? `<a class="all-locations-link" href="${escape(urlFor({...route,view:'locations',category:'',article:''}))}">See all ${locations.length} matching locations ↗</a>` : '') : '';
    if (!total) {
      const otherArea = route.category && [...data.articles,...(data.locations||[])].some(article => matches(article,route.query) >= 0);
      $('results').innerHTML = `<div class="empty-state"><h3>No matching ${locationMode ? 'items' : 'pages'}${route.category ? ' in this area' : ''}.</h3><p>${otherArea ? 'There may be a match in another area.' : 'Try a different name or related term, or ask Carlos to add the missing information.'}</p><button type="button" class="text-button" data-reset>${otherArea ? 'Search all areas' : 'Clear search'} <span aria-hidden="true">↗</span></button><br><button type="button" class="request-button" data-request="wiki">Request a wiki page <span aria-hidden="true">↗</span></button></div>`;
      return;
    }
    $('results').innerHTML = (scored.length && locations.length ? '<h3 class="result-section-title">Handbook pages</h3>' : '') + scored.map(({article}) => {
      const category = categoryById(article.category);
      const preview = route.query ? snippet(article,route.query) : '';
      const badge = article.status === 'draft' ? 'Draft' : article.status === 'needs-review' ? 'Check details' : '';
      return `<a class="article-row" href="${escape(urlFor({...route,article:article.id}))}">
        <span class="category-label" data-category="${escape(category.id)}">${escape(category.name)}</span>
        <div class="row-content"><h3>${highlight(article.title,route.query)}${badge ? ` <span class="draft-label">${badge}</span>` : ''}</h3><p>${highlight(article.summary,route.query)}</p>${preview ? `<p class="match-preview">${highlight(preview,route.query)}</p>` : ''}</div><span class="row-arrow" aria-hidden="true">↗</span>
      </a>`;
    }).join('');
  }

  function renderArticle() {
    const article = data.articles.find(article => article.id === route.article);
    const back = urlFor({...route,article:''});
    if (!article) {
      document.title = 'Page not found · Carlos students at EMBL wiki';
      $('article-view').innerHTML = `<a class="back-link" href="${escape(back)}">← Back to the handbook</a><div class="empty-state"><h1>Page not found.</h1><p>This page may have been renamed. Browse the handbook to find it.</p></div>`;
      return;
    }
    const category = categoryById(article.category);
    const related = data.articles.filter(item => item.id !== article.id && item.category === article.category).slice(0,3);
    document.title = article.title + ' · Carlos students at EMBL wiki';
    $('article-view').innerHTML = `<a class="back-link" href="${escape(back)}"><span aria-hidden="true">←</span> ${route.query ? 'Back to search results' : 'Back to the handbook'}</a>
      <div class="article-layout"><article><header class="article-header"><span class="category-label" data-category="${escape(category.id)}">${escape(category.name)}</span><h1 tabindex="-1">${escape(article.title)}</h1><p class="article-summary">${escape(article.summary)}</p></header>
      ${article.status === 'draft' ? '<div class="draft-alert"><strong>Draft template — protocol not added yet.</strong>This page outlines what to document.</div>' : article.review_note ? `<div class="draft-alert"><strong>A detail to clarify</strong>${escape(article.review_note)}</div>` : ''}
      <div class="article-body">${article.html}</div>
      ${related.length ? `<section class="related"><h2>Also in ${escape(category.name)}</h2>${related.map(item => `<a href="${escape(urlFor({...route,article:item.id}))}">${escape(item.title)} <span aria-hidden="true">↗</span></a>`).join('')}</section>` : ''}</article>
      <aside class="article-aside" aria-label="Page details"><p class="meta-heading">ABOUT THIS PAGE</p><dl class="meta-list"><dt>Status</dt><dd>${article.status === 'draft' ? 'Awaiting protocol' : article.status === 'needs-review' ? 'Check details' : article.status === 'reference' ? 'From Carlos’s notes' : 'Published'}</dd><dt>Maintainer</dt><dd>${escape(article.maintainer || 'Not assigned')}</dd><dt>Version</dt><dd>${escape(article.version || 'Not set')}</dd><dt>Last reviewed</dt><dd>${escape(article.reviewed || 'Not recorded')}</dd><dt>Source</dt><dd>${escape(article.source || 'Not specified')}</dd></dl><button type="button" class="copy-button" id="copy-link"><span aria-hidden="true">↗</span> Copy page link</button><p class="copy-status" id="copy-status" role="status" aria-live="polite"></p><button type="button" class="request-button article-request" data-request="wiki">Request an addition to this page</button><p class="meta-heading" style="margin-top:30px;margin-bottom:10px">KEYWORDS</p><ul class="tag-list">${article.keywords.map(word => `<li>${escape(word)}</li>`).join('')}</ul></aside></div>`;
  }

  function render(focusArticle = false) {
    route = readRoute();
    $('browse-view').hidden = !!route.article;
    $('article-view').hidden = !route.article;
    if (route.article) {
      renderArticle();
      if (focusArticle) { window.scrollTo(0,0); $('article-view').querySelector('h1')?.focus({preventScroll:true}); }
    } else {
      document.title = 'Carlos students at EMBL wiki';
      $('search').value = route.query;
      const locations = route.view === 'locations';
      $('hero-title').textContent = locations ? 'Where to find it.' : 'Find what you need.';
      $('hero-intro').innerHTML = locations ? 'Reagents, supplies, and equipment.<br>Find the right place before you go looking.' : 'Protocols, practical answers, and shared knowledge.<br>One place to come back to.';
      $('search').placeholder = locations ? 'Try serum, gel powder, pipette boy…' : 'Search protocols, equipment, library QC…';
      $('search-hint').textContent = locations ? 'Search by item, purpose, nickname, or location. Common typos are okay.' : 'Search by name, a related term, or a question. Common typos are okay.';
      $('handbook-tab').href = urlFor({...route,view:'',category:'',article:''});
      $('locations-tab').href = urlFor({...route,view:'locations',category:'',article:''});
      $('handbook-tab').setAttribute('aria-current',locations ? 'false' : 'page');
      $('locations-tab').setAttribute('aria-current',locations ? 'page' : 'false');
      $('categories').hidden = locations;
      document.title = (locations ? 'Where to find? · ' : '') + 'Carlos students at EMBL wiki';
      renderCategories();
      renderResults();
    }
  }

  $('search-form').addEventListener('submit',event => event.preventDefault());
  document.querySelector('.skip-link').addEventListener('click',event => {
    event.preventDefault(); $('main').focus();
  });
  $('search').addEventListener('input',event => {
    route.query = event.target.value.slice(0,300);
    history.replaceState(null,'',urlFor(route));
    renderResults();
  });
  $('clear-search').addEventListener('click',() => {
    route.query = ''; $('search').value = '';
    history.replaceState(null,'',urlFor(route));
    renderResults(); $('search').focus();
  });
  $('categories').addEventListener('click',event => {
    const card = event.target.closest('[data-category]');
    if (!card) return;
    const selected = card.dataset.category;
    history.pushState(null,'',urlFor({...route,category:route.category === selected ? '' : selected}));
    render();
    $('categories').querySelector(`[data-category="${selected}"]`).focus();
  });
  $('show-all').addEventListener('click',() => {
    history.pushState(null,'',urlFor({...route,category:''}));render();$('search').focus();
  });
  $('results').addEventListener('click',event => {
    if (event.target.closest('[data-reset]')) {
      const keepQuery = route.category && data.articles.some(article => matches(article,route.query) >= 0);
      history.pushState(null,'',urlFor({query:keepQuery ? route.query : '',category:'',article:'',view:route.view}));
      render();$('search').focus();
    }
  });
  $('article-view').addEventListener('click',async event => {
    if (!event.target.closest('#copy-link')) return;
    const url = new URL(location.href);url.hash = urlFor({article:route.article});
    if (location.protocol === 'file:') {
      $('copy-status').textContent = 'This is a local preview. Shareable links will work after publishing.';return;
    }
    try {
      await navigator.clipboard.writeText(url.href);
      $('copy-link').textContent = '✓ Link copied';
      $('copy-status').textContent = 'Ready to paste into a message.';
    } catch (_) {
      $('copy-status').textContent = 'Copy this address: ' + url.href;
    }
  });
  document.addEventListener('keydown',event => {
    if (event.key === '/' && !document.querySelector('dialog[open]') && !event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
      event.preventDefault();
      if (route.article) { history.pushState(null,'',urlFor({...route,article:''}));render(); }
      $('search').focus();
    }
    if (event.key === 'Escape' && document.activeElement === $('search')) $('clear-search').click();
  });
  window.addEventListener('hashchange',() => render(true));
  window.addEventListener('popstate',() => render());
  render();
})();
