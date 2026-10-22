(() => {
  'use strict';
  const dialog = document.getElementById('request-dialog');
  const content = document.getElementById('request-form-content');
  const closeButton = document.getElementById('close-request');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const drafts = {reagent:{},wiki:{}};
  let currentType = '', busy = false;

  function getEndpoint() {
    try {
      const endpoint = new URL(window.WIKI_REQUEST_CONFIG?.endpoint || '');
      if (endpoint.origin === 'https://formsubmit.co' && /^\/ajax\/[^/]+$/.test(endpoint.pathname) && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password) return endpoint.href;
    } catch (_) { /* An unconfigured preview must never submit a request. */ }
    return '';
  }

  function saveDraft() {
    const form = document.getElementById('missing-request-form');
    if (form && currentType) drafts[currentType] = Object.fromEntries(new FormData(form));
  }

  function openRequest(type, suggestedTopic = '') {
    if (!['reagent','wiki'].includes(type) || busy) return;
    saveDraft();
    currentType = type;
    const reagent = type === 'reagent';
    const draft = drafts[type];
    const route = new URLSearchParams(location.hash.slice(1));
    const page = window.WIKI_CONTENT?.articles?.find(article => article.id === route.get('page'));
    const area = draft.area || page?.category || route.get('area') || '';
    const topic = Object.prototype.hasOwnProperty.call(draft, 'topic')
      ? draft.topic
      : suggestedTopic || (!reagent ? route.get('q') || page?.title || '' : '');
    const endpoint = getEndpoint();
    document.getElementById('request-title').textContent = reagent ? 'Request a reagent' : 'Request a wiki page';
    document.getElementById('request-intro').textContent = reagent ? 'Running low or missing something? Tell Carlos what needs ordering.' : 'Couldn’t find an answer? Tell Carlos what you would like added or clarified.';
    content.innerHTML = `<form id="missing-request-form">
      ${!endpoint ? '<p class="request-setup-note">Email delivery is not connected yet. You can preview this form, but requests cannot be sent.</p>' : ''}
      <label class="form-field">${reagent ? 'Reagent name' : 'Topic or page title'} <input name="topic" id="request-topic" required maxlength="160" value="${escape(topic)}" placeholder="${reagent ? 'What needs ordering?' : 'What were you looking for?'}"></label>
      ${reagent ? `<div class="form-grid"><label class="form-field">Amount needed <span class="optional">optional</span><input name="amount" maxlength="100" value="${escape(draft.amount || '')}" placeholder="e.g. 1 bottle or 2 boxes"></label><label class="form-field">Supplier / catalogue no. <span class="optional">optional</span><input name="supplier" maxlength="200" value="${escape(draft.supplier || '')}" placeholder="If you know it"></label></div>` : ''}
      <label class="form-field">${reagent ? 'Anything else?' : 'What should this page explain?'} ${reagent ? '<span class="optional">optional</span>' : ''}<textarea name="details" rows="3" maxlength="3000" ${reagent ? '' : 'required'} placeholder="${reagent ? 'A product link or other details that will help.' : 'Write your question or describe the missing instructions.'}">${escape(draft.details || '')}</textarea></label>
      <div class="form-grid"><label class="form-field">Your name <input name="requester" required maxlength="100" autocomplete="name" value="${escape(draft.requester || '')}" placeholder="So Carlos knows who to follow up with"></label><label class="form-field">Area <span class="optional">optional</span><select name="area"><option value="">Choose an area</option>${(window.WIKI_CONTENT?.categories || []).map(category => `<option value="${escape(category.id)}" ${category.id === area ? 'selected' : ''}>${escape(category.name)}</option>`).join('')}</select></label></div>
      ${reagent ? `<label class="form-field">How soon is it needed?<select name="priority">${['Routine order','Needed soon','Blocking my work'].map(priority => `<option ${draft.priority === priority ? 'selected' : ''}>${priority}</option>`).join('')}</select></label>` : ''}
      <div class="form-trap" aria-hidden="true"><label>Leave this field empty<input name="_honey" tabindex="-1" autocomplete="off"></label></div>
      <p class="request-status" id="request-status" role="status" aria-live="polite"></p>
      <div class="form-footer"><button type="submit" class="send-request" ${endpoint ? '' : 'disabled'}>Send request to Carlos <span aria-hidden="true">↗</span></button><p>${endpoint ? 'Your request is emailed via FormSubmit. No account needed.' : 'Email setup pending.'}</p></div>
    </form>`;
    if (!dialog.open) dialog.showModal();
    document.getElementById('request-topic').focus();
  }

  function setBusy(value) {
    busy = value;
    closeButton.disabled = value;
    const form = document.getElementById('missing-request-form');
    if (!form) return;
    form.setAttribute('aria-busy',String(value));
    for (const field of form.elements) field.disabled = value;
    const button = form.querySelector('[type="submit"]');
    button.textContent = value ? 'Sending…' : 'Send request to Carlos ↗';
  }

  async function submitRequest(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.target;
    const status = document.getElementById('request-status');
    const endpoint = getEndpoint();
    if (!endpoint) { status.textContent = 'Email delivery is not connected. Nothing has been sent.';return; }
    if (location.protocol === 'file:') { status.textContent = 'This saved preview cannot send email. Open the published wiki to submit your request.';return; }
    if (!form.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(form));
    if (fields._honey) { status.textContent = 'This request could not be submitted.';return; }
    for (const name of currentType === 'wiki' ? ['topic','details','requester'] : ['topic','requester']) {
      if (!String(fields[name] || '').trim()) { status.textContent = 'Please fill in the required fields.';form.elements[name].focus();return; }
    }
    saveDraft();
    const type = currentType;
    const areaName = window.WIKI_CONTENT?.categories?.find(category => category.id === fields.area)?.name || 'Not specified';
    const pageId = new URLSearchParams(location.hash.slice(1)).get('page');
    const pageUrl = new URL(location.href);pageUrl.hash = pageId ? 'page=' + encodeURIComponent(pageId) : '';
    const payload = {
      _subject: `[Carlos EMBL wiki] ${type === 'reagent' ? 'Reagent order' : 'Wiki request'}: ${fields.topic.trim()}`,
      _template: 'table',
      'Request type': type === 'reagent' ? 'Missing reagent' : 'Missing wiki content',
      'Requested by': fields.requester.trim(),
      'Topic': fields.topic.trim(),
      'Area': areaName,
      'Details': fields.details.trim() || 'Not provided',
      'Page': pageUrl.href,
      ...(type === 'reagent' ? {'Amount needed':fields.amount.trim() || 'Not specified','Supplier / catalogue':fields.supplier.trim() || 'Not specified','Priority':fields.priority} : {})
    };
    status.textContent = '';
    status.className = 'request-status';
    setBusy(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),20000);
    try {
      const response = await fetch(endpoint, {
        method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(payload),signal:controller.signal
      });
      const result = await response.json();
      const message = typeof result.message === 'string' ? result.message : '';
      if (/activat|confirm.{0,25}(email|address)|verif.{0,25}(email|address)/i.test(message)) {
        status.textContent = 'Email delivery is awaiting confirmation by Carlos. This request has not been confirmed; please contact him directly.';
        return;
      }
      if (!response.ok || !(result.success === true || result.success === 'true')) {
        status.textContent = 'The email service did not accept this request. Your details are still here; please try again or contact Carlos directly.';
        return;
      }
      drafts[type] = {};
      content.innerHTML = '<div class="request-success"><span class="success-symbol" aria-hidden="true">✓</span><h3>Request submitted.</h3><p>Thanks for flagging it. Your request has been accepted for email delivery to Carlos.</p><button type="button" class="send-request" data-close-request>Done</button></div>';
    } catch (_) {
      status.textContent = 'We couldn’t confirm that the request was received. Your details are still here. Check with Carlos before sending again to avoid a duplicate.';
    } finally {
      clearTimeout(timeout);setBusy(false);
    }
  }

  document.addEventListener('click',event => {
    const button = event.target.closest('[data-request]');
    if (button) openRequest(button.dataset.request, button.dataset.topic);
    if (event.target.closest('[data-close-request]') && !busy) dialog.close();
  });
  content.addEventListener('submit',submitRequest);
  content.addEventListener('input',saveDraft);
  content.addEventListener('change',saveDraft);
  closeButton.addEventListener('click',() => { if (!busy) { saveDraft();dialog.close(); } });
  dialog.addEventListener('cancel',event => { if (busy) event.preventDefault();else saveDraft(); });
})();
