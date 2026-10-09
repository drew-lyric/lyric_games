(function (root) {
  'use strict';
  const LD = root.LyricDefense = root.LyricDefense || {};
  const $ = function (id) { return document.getElementById(id); };
  const tierNames = ['Easy', 'Medium', 'Hard', 'Expert'];
  const bankInfo = LD.TriviaBankInfo || {};
  const sourceInfo = new Map();
  const declaredSources = Array.isArray(bankInfo.sources) ? bankInfo.sources : [];
  declaredSources.forEach(function (source) {
    if (typeof source === 'string') sourceInfo.set(source, source);
    else if (source && typeof source === 'object') {
      const id = String(source.id || source.key || source.name || source.title || '');
      if (id) sourceInfo.set(id, String(source.name || source.title || id));
    }
  });
  function sourceLabel(row) {
    const source = row.source;
    if (row.sourceName) return String(row.sourceName);
    if (source && typeof source === 'object') return String(source.name || source.title || sourceInfo.get(String(source.id)) || source.id || 'Unspecified source');
    const id = String(source || row.sourceId || '');
    return sourceInfo.get(id) || id || 'Unspecified source';
  }
  const rows = (Array.isArray(LD.TriviaBank) ? LD.TriviaBank : []).filter(function (row) {
    return row && typeof row.id === 'string' && typeof row.text === 'string' && typeof row.answer === 'string' && Number.isInteger(row.tier) && row.tier >= 1 && row.tier <= 4;
  }).map(function (row, index) {
    return Object.assign({}, row, { category: String(row.category || 'General knowledge'), sourceLabel: sourceLabel(row), order: index });
  }).sort(function (a, b) { return a.tier - b.tier || a.order - b.order; });
  const review = LD.triviaReview = {
    rows: rows, tier: 'all', category: 'all', search: '', showAll: false, opened: new Set(),
    page: 1, pageSize: 50, matchingCount: 0, pageCount: 0, visibleRows: []
  };
  const number = function (value) { return value.toLocaleString('en-US'); };

  function make(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }
  function matches(row) {
    return (review.tier === 'all' || row.tier === Number(review.tier)) && (review.category === 'all' || row.category === review.category) && (!review.search || (row.id + ' ' + row.text + ' ' + row.category + ' ' + row.sourceLabel).toLocaleLowerCase().includes(review.search));
  }
  function questionCard(row) {
    const card = make('article', 'question-card tier-' + row.tier);
    card.dataset.questionId = row.id;
    card.dataset.tier = row.tier;
    const metadata = make('div', 'question-meta');
    metadata.append(make('span', 'question-id', row.id), make('span', 'question-tier', 'Tier ' + row.tier + ' · ' + tierNames[row.tier - 1]), make('span', 'question-category', row.category));
    const source = make('span', 'question-source', row.sourceLabel);
    source.title = 'Question source: ' + row.sourceLabel;
    metadata.appendChild(source);
    const content = make('div', 'question-content');
    const title = make('h3', '', row.text);
    const details = make('details', 'answer-details');
    details.open = review.showAll || review.opened.has(row.id);
    const summary = make('summary', '', details.open ? 'Hide answer' : 'Show answer');
    summary.setAttribute('aria-label', 'Show or hide the answer for ' + row.id);
    const answer = make('div', 'answer-box');
    answer.append(make('span', 'answer-label', 'ANSWER'), make('div', 'answer-text', row.answer));
    const aliases = Array.from(new Set((Array.isArray(row.acceptedAnswers) ? row.acceptedAnswers : []).filter(function (value) {
      return typeof value === 'string' && value.trim() && value.trim().toLocaleLowerCase() !== row.answer.trim().toLocaleLowerCase();
    })));
    if (aliases.length) answer.appendChild(make('p', 'answer-aliases', 'Also accepted: ' + aliases.join(' · ')));
    details.append(summary, answer);
    details.addEventListener('toggle', function () {
      if (!details.isConnected) return;
      summary.textContent = details.open ? 'Hide answer' : 'Show answer';
      if (details.open) review.opened.add(row.id);
      else {
        review.opened.delete(row.id);
        if (review.showAll) {
          review.showAll = false;
          $('show-all-answers').checked = false;
          document.querySelectorAll('.question-card').forEach(function (current) {
            if (current.querySelector('.answer-details').open) review.opened.add(current.dataset.questionId);
          });
        }
      }
    });
    content.append(title, details);
    card.append(metadata, content);
    return card;
  }
  function render() {
    const matching = rows.filter(matches);
    review.matchingCount = matching.length;
    review.pageCount = Math.ceil(matching.length / review.pageSize);
    review.page = Math.max(1, Math.min(review.page, review.pageCount || 1));
    const start = (review.page - 1) * review.pageSize;
    review.visibleRows = matching.slice(start, start + review.pageSize);
    const fragment = document.createDocumentFragment();
    review.visibleRows.forEach(function (row) { fragment.appendChild(questionCard(row)); });
    $('review-questions').replaceChildren(fragment);
    $('review-empty').hidden = matching.length !== 0;
    const end = start + review.visibleRows.length;
    const filtered = review.tier !== 'all' || review.category !== 'all' || review.search;
    const range = matching.length ? number(start + 1) + '–' + number(end) : '0';
    $('result-count').replaceChildren(make('strong', '', range + ' of ' + number(matching.length)), document.createTextNode(filtered ? ' matching questions · ' + number(rows.length) + ' in the bank' : ' questions'));
    const pageLabel = review.pageCount ? 'Page ' + number(review.page) + ' of ' + number(review.pageCount) : 'No pages';
    $('review-page').textContent = pageLabel;
    $('review-page-bottom').textContent = pageLabel;
    document.querySelectorAll('[data-page-action]').forEach(function (button) {
      button.disabled = button.dataset.pageAction === 'prev' ? review.page <= 1 : review.page >= review.pageCount;
    });
    document.querySelectorAll('.tier-filter [data-tier]').forEach(function (button) {
      const active = button.dataset.tier === review.tier;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function resetPage() { review.page = 1; render(); }

  $('sample-count').textContent = number(rows.length);
  if (rows.length) $('feedback-example').textContent = '“' + rows[Math.min(24, rows.length - 1)].id + ' should be Medium.”';
  for (let tier = 1; tier <= 4; tier++) $('tier-count-' + tier).textContent = number(rows.filter(function (row) { return row.tier === tier; }).length) + ' questions';
  const categories = Array.from(new Set(rows.map(function (row) { return row.category; }))).sort(function (a, b) { return a.localeCompare(b); });
  categories.forEach(function (category) {
    const option = make('option', '', category); option.value = category; $('review-category').appendChild(option);
  });
  const sourceCounts = new Map();
  rows.forEach(function (row) { sourceCounts.set(row.sourceLabel, (sourceCounts.get(row.sourceLabel) || 0) + 1); });
  $('bank-category-count').textContent = number(categories.length) + ' topics';
  $('bank-source-count').textContent = number(sourceCounts.size) + (sourceCounts.size === 1 ? ' source' : ' sources');
  Array.from(sourceCounts.entries()).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); }).forEach(function (entry) {
    const item = make('li', 'source-chip');
    item.append(make('span', '', entry[0]), make('span', 'source-count', number(entry[1])));
    $('bank-sources').appendChild(item);
  });
  const version = bankInfo.version ? ' · ' + bankInfo.version : '';
  $('bank-version').textContent = 'ACTIVE QUESTION BANK' + version;
  document.querySelectorAll('.tier-filter [data-tier]').forEach(function (button) { button.addEventListener('click', function () { review.tier = button.dataset.tier; resetPage(); }); });
  $('review-search').addEventListener('input', function () { review.search = $('review-search').value.trim().toLocaleLowerCase(); resetPage(); });
  $('review-category').addEventListener('change', function () { review.category = $('review-category').value; resetPage(); });
  document.querySelectorAll('[data-page-action]').forEach(function (button) {
    button.addEventListener('click', function () {
      review.page += button.dataset.pageAction === 'prev' ? -1 : 1;
      render();
      $('review-page').focus({ preventScroll: true });
      $('review-pagination').scrollIntoView({ block: 'start' });
    });
  });
  $('show-all-answers').addEventListener('change', function () {
    review.showAll = $('show-all-answers').checked;
    review.opened.clear();
    document.querySelectorAll('.answer-details').forEach(function (details) {
      details.open = review.showAll;
      details.querySelector('summary').textContent = details.open ? 'Hide answer' : 'Show answer';
    });
  });
  if (!rows.length) {
    $('empty-title').textContent = 'The question bank is unavailable.';
    $('empty-description').textContent = 'Keep this page beside its js folder and reload when trivia-expanded-bank.js is available.';
  }
  render();
})(typeof globalThis !== 'undefined' ? globalThis : window);
