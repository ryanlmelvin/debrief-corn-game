// Documents are turned, not scrolled. All pages stay in the DOM so live controls
// (installation, updates, and delegated game actions) keep their identity.
export class DialogPager {
  constructor(dialog) {
    this.dialog = dialog;
    this.content = dialog.querySelector('#dialog-content');
    this.article = null;
    this.units = [];
    this.pages = [];
    this.index = 0;
    this.pending = 0;
    this.observer = new MutationObserver(records => {
      if (records.some(record => {
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (target?.closest('.pager-nav') && !(target.id === 'dialog-update' && record.attributeName === 'hidden')) return false;
        return record.type !== 'attributes' || (record.oldValue !== target.getAttribute(record.attributeName) && !target.classList.contains('pager-page'));
      })) this.schedule();
    });
    this.observe();
    this.resize = new ResizeObserver(() => {
      const size = `${this.dialog.clientWidth}:${this.dialog.clientHeight}:${this.body?.clientHeight}`;
      if (size !== this.size) { this.size = size; this.schedule(); }
    });
    this.resize.observe(dialog);
    window.addEventListener('resize', () => this.schedule());
    window.visualViewport?.addEventListener('resize', () => this.schedule());
    this.content.addEventListener('load', () => this.schedule(), true);
    this.dialog.addEventListener('keydown', event => {
      if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.target.matches('input,select,textarea')) return;
      if (event.key === 'ArrowRight' && this.index < this.pages.length - 1) { event.preventDefault(); this.go(this.index + 1); }
      if (event.key === 'ArrowLeft' && this.index > 0) { event.preventDefault(); this.go(this.index - 1); }
    });
  }
  observe() {
    this.observer.observe(this.content, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'open'], attributeOldValue: true });
  }
  schedule() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => { this.pending = 0; this.refresh(); });
  }
  prepare(article) {
    if (this.body) this.resize.unobserve(this.body);
    this.article = article;
    this.decision = ['debrief', 'guide-debrief', 'dungeon-debrief', 'resolution', 'encounter', 'corn', 'site-encounter', 'sighting', 'confirm', 'guide-intro', 'evidence'].includes(this.dialog.dataset.kind);
    article.classList.toggle('decision-sheet', this.decision);
    this.units = [];
    this.index = 0;
    article.classList.add('paged-sheet');
    this.dialog.classList.add('paged-dialog');
    const heading = document.createElement('header');
    heading.className = 'pager-heading';
    const title = article.querySelector('#dialog-title');
    const tag = article.querySelector('.paper-top');
    if (tag) { tag.classList.add('pager-tag'); heading.append(tag); }
    if (title) heading.append(title);
    let close = article.querySelector('.notebook-close');
    if (!close && !['briefing', 'debrief', 'guide-debrief', 'dungeon-debrief', 'resolution', 'ending', 'encounter'].includes(this.dialog.dataset.kind)) {
      close = document.createElement('button'); close.type = 'button';
      close.className = 'notebook-close'; close.dataset.action = 'close';
      close.textContent = '×'; close.setAttribute('aria-label', 'Close document');
    }
    if (close) { close.classList.add('pager-close'); heading.append(close); }
    const update = article.querySelector('#dialog-update');
    update?.remove();
    const question = article.querySelector('.question-num');
    if (question) { question.classList.add('pager-question-number'); heading.append(question); }
    // The notebook index becomes a native selector: every exhibit is reachable
    // without a horizontally scrolling strip or a second navigation footer.
    const index = article.querySelector('.notebook-index');
    const source = document.createElement('div');
    source.hidden = true;
    if (index) {
      const label = document.createElement('label');
      label.className = 'pager-notebook-select';
      label.textContent = 'EXHIBIT ';
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Choose a notebook entry');
      const entries = [...index.querySelectorAll('[data-action="notebook-page"]')];
      for (const button of entries) {
        const option = document.createElement('option');
        option.value = button.dataset.value;
        option.textContent = button.textContent.trim().replace(/^(\d{2})(?=\S)/, '$1 · ');
        option.selected = button.hasAttribute('aria-current');
        select.append(option);
      }
      select.addEventListener('change', () => entries.find(button => button.dataset.value === select.value)?.click());
      label.append(select); heading.append(label); source.append(index);
    }
    const oldPagination = article.querySelector('.notebook-pagination');
    if (oldPagination) source.append(oldPagination);
    const art = article.querySelector('.interview-scene, .encounter-image, .evidence-mount, .scene-plate');
    if (art) { art.classList.add('pager-art'); art.remove(); }
    article.classList.toggle('pager-has-art', !!art);
    let groupNumber = 0;
    const collect = (node, group = null) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.trim()) { const p = document.createElement('p'); p.append(node); this.units.push({ node: p, group }); }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || node === heading || node === art || node === source) return;
      if (node.matches('.notebook-header')) return;
      if (node.matches('.orders, .ending-collection, ul, ol')) {
        [...node.children].forEach((child, i) => {
          const list = node.cloneNode(false); list.removeAttribute('id');
          if (list.tagName === 'OL') list.start = i + 1;
          list.append(child); this.units.push({ node: list, group });
        });
      } else if (node.matches('.encounter-copy, .notebook-spread, .notebook-leaf, .notebook-testimony, .notebook-encounters, .transcript, .radio-entries, .paper-actions, .choices, .encounter-choices, .encounter-outcome, section')) {
        const nextGroup = node.matches('.paper-actions, .choices, .encounter-choices, .encounter-outcome') ? ++groupNumber : group;
        [...node.childNodes].forEach(child => collect(child, nextGroup));
      } else {
        if (node.matches('button')) node.classList.add('pager-action');
        this.units.push({ node, group });
      }
    };
    [...article.childNodes].forEach(node => collect(node));
    this.body = document.createElement('div');
    this.body.className = 'pager-body';
    this.nav = document.createElement('nav');
    this.nav.className = 'pager-nav';
    this.nav.setAttribute('aria-label', this.decision ? 'Game update' : 'Document pages');
    this.previous = document.createElement('button');
    this.previous.type = 'button'; this.previous.textContent = '← Back';
    this.previous.setAttribute('aria-label', 'Previous document page');
    this.next = document.createElement('button');
    this.next.type = 'button'; this.next.textContent = 'Next →';
    this.next.setAttribute('aria-label', 'Next document page');
    this.counter = document.createElement('span');
    this.counter.setAttribute('role', 'status');
    this.counter.setAttribute('aria-live', 'polite');
    this.previous.addEventListener('click', () => this.go(this.index - 1));
    this.next.addEventListener('click', () => this.go(this.index + 1));
    const position = document.createElement('div'); position.className = 'pager-position';
    position.append(this.counter); if (update) position.append(update);
    this.nav.append(this.previous, position, this.next);
    article.replaceChildren(heading, ...(art ? [art] : []), this.body, this.nav, source);
    this.resize.observe(this.body);
  }
  refresh() {
    if (!this.dialog.open) return;
    const article = this.content.querySelector('article');
    if (!article) return;
    this.observer.disconnect();
    try {
      this.dialog.style.setProperty('--pager-screen-height', `${window.visualViewport?.height || window.innerHeight}px`);
      if (article !== this.article) this.prepare(article);
      const focused = document.activeElement;
      const restoreFocus = this.body.contains(focused);
      const anchor = (restoreFocus ? focused.closest('[data-pager-unit]')?.dataset.pagerUnit : undefined) ?? this.pages[this.index]?.firstElementChild?.dataset.pagerUnit;
      for (const unit of this.units) if (unit.fullHTML !== undefined) unit.node.innerHTML = unit.fullHTML;
      this.body.replaceChildren(); this.pages = [];
      let page;
      const newPage = () => {
        if (page) page.hidden = true;
        page = document.createElement('section');
        page.className = 'pager-page';
        page.setAttribute('role', 'group'); page.tabIndex = -1;
        this.body.append(page); this.pages.push(page);
        return page;
      };
      newPage();
      const fits = () => page.scrollHeight <= page.clientHeight + 1;
      if (this.decision) {
        page.classList.add('decision-page');
        const context = document.createElement('div'); context.className = 'decision-context';
        const actions = document.createElement('div'); actions.className = 'decision-actions';
        actions.setAttribute('role', 'group'); actions.setAttribute('aria-label', 'Your response');
        const actionGroups = new Set(this.units.filter(unit => unit.node.matches('button')).map(unit => unit.group).filter(Boolean));
        this.units.forEach((unit, i) => {
          unit.node.dataset.pagerUnit = String(i);
          (unit.node.matches('button') || actionGroups.has(unit.group) ? actions : context).append(unit.node);
        });
        page.append(context, actions);
        // Decisions never lose their context to a page turn. Reclaim ornamental
        // space first; compact spacing is a fallback for short browser windows.
        article.classList.remove('decision-condensed', 'decision-tight');
        if (!fits()) article.classList.add('decision-condensed');
        if (!fits()) article.classList.add('decision-tight');
      } else for (let i = 0; i < this.units.length; i++) {
        const unit = this.units[i], node = unit.node;
        node.dataset.pagerUnit = String(i);
        // A response is a set of alternatives. Move the whole set to a fresh
        // leaf whenever it fits there, rather than presenting A before B/C.
        if (unit.group && this.units[i - 1]?.group !== unit.group) {
          const members = [];
          for (let j = i; j < this.units.length && this.units[j].group === unit.group; j++) {
            this.units[j].node.dataset.pagerUnit = String(j);
            members.push(this.units[j].node);
          }
          const hadContent = [...page.children].some(child => !child.hidden);
          page.append(...members);
          if (!fits() && hadContent) {
            members.forEach(member => member.remove()); newPage(); page.append(...members);
          }
          if (fits()) { i += members.length - 1; continue; }
          members.forEach(member => member.remove());
        }
        if (node.hidden) { page.append(node); continue; }
        const hadContent = [...page.children].some(child => !child.hidden);
        page.append(node);
        if (fits()) continue;
        node.remove();
        if (hadContent) newPage();
        page.append(node);
        if (fits()) continue;
        // Preserve live controls as single actions. Prose can break at any word,
        // with Range retaining inline emphasis and list semantics on each leaf.
        if (!node.matches('button,input,select,textarea,[id]') && !node.querySelector('button,input,select,textarea,[id]') && node.textContent.trim()) {
          if (unit.fullHTML === undefined) unit.fullHTML = node.innerHTML;
          const original = node.cloneNode(true);
          const textNodes = [], walker = document.createTreeWalker(original, NodeFilter.SHOW_TEXT);
          let total = 0, textNode;
          while ((textNode = walker.nextNode())) { textNodes.push({ node: textNode, start: total, end: total + textNode.length }); total += textNode.length; }
          const text = original.textContent;
          const ends = [...text.matchAll(/\S+\s*/g)].map(match => match.index + match[0].length);
          if (!ends.length) continue;
          if (ends.at(-1) < total) ends[ends.length - 1] = total;
          const fragment = (start, end) => {
            const range = document.createRange();
            const first = textNodes.find(part => part.end > start) || textNodes.at(-1);
            const last = textNodes.find(part => part.end >= end) || textNodes.at(-1);
            range.setStart(first.node, Math.max(0, start - first.start));
            range.setEnd(last.node, Math.min(last.node.length, end - last.start));
            return range.cloneContents();
          };
          node.remove();
          let start = 0, word = 0, firstPiece = true;
          while (word < ends.length) {
            const piece = firstPiece ? node : original.cloneNode(false);
            piece.removeAttribute('id'); piece.dataset.pagerUnit = String(i);
            page.append(piece);
            let low = word, high = ends.length - 1, best = word;
            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              piece.replaceChildren(fragment(start, ends[mid]));
              if (fits()) { best = mid; low = mid + 1; } else high = mid - 1;
            }
            piece.replaceChildren(fragment(start, ends[best]));
            start = ends[best]; word = best + 1; firstPiece = false;
            if (word < ends.length) newPage();
          }
        }
      }
      // Keep a live update button and every async status node connected even on
      // non-visible pages; only the current leaf participates in layout/focus.
      let index = Math.min(this.index, this.pages.length - 1);
      if (anchor !== undefined) {
        const found = this.pages.findIndex(p => p.querySelector(`[data-pager-unit="${anchor}"]`));
        if (found !== -1) index = found;
      }
      this.go(index, false);
      if (restoreFocus) {
        const target = focused.isConnected && !focused.closest('.pager-page')?.hidden ? focused : this.pages[this.index];
        target.focus({ preventScroll: true });
      }
      this.size = `${this.dialog.clientWidth}:${this.dialog.clientHeight}:${this.body.clientHeight}`;
    } finally { this.observe(); }
  }
  go(requested, announce = true) {
    if (!this.pages.length) return;
    const focused = document.activeElement;
    const leavingPage = this.pages[this.index];
    this.index = Math.max(0, Math.min(this.pages.length - 1, requested));
    this.pages.forEach((page, i) => {
      page.hidden = i !== this.index;
      page.setAttribute('aria-label', `Page ${i + 1} of ${this.pages.length}`);
    });
    this.previous.disabled = this.index === 0;
    this.next.disabled = this.index === this.pages.length - 1;
    this.counter.textContent = this.pages.length === 1 ? 'COMPLETE DOCUMENT' : `PAGE ${this.index + 1} / ${this.pages.length}`;
    this.nav.classList.toggle('single-page', this.pages.length === 1);
    if (announce) {
      this.dialog.scrollTop = 0;
      if ((focused === this.next && this.next.disabled) || (focused === this.previous && this.previous.disabled) || leavingPage?.contains(focused)) this.pages[this.index].focus({ preventScroll: true });
    }
  }
}
