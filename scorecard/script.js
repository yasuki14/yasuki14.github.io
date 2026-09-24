(function(){
  const qInput = document.getElementById('q');
  const searchBtn = document.getElementById('searchBtn');
  const statusEl = document.getElementById('status');
  const resultsEl = document.getElementById('results');

  const GITHUB_SEARCH = 'https://api.github.com/search/repositories';
  const SCORECARD_BASE = 'https://api.scorecard.dev/projects/github.com';

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function fmtStars(n){
    if(n >= 1000000) return (n/1000000).toFixed(1)+'M';
    if(n >= 1000) return (n/1000).toFixed(1)+'k';
    return String(n);
  }

  function scoreColor(score){
    if(score === null || score === undefined) return 'var(--dim)';
    if(score < 3) return 'var(--bad)';
    if(score < 6) return 'var(--warn)';
    return 'var(--good)';
  }

  function setStatus(text, scanning){
    statusEl.className = 'status' + (scanning ? ' scanning' : '');
    statusEl.innerHTML = text ? (scanning ? '<span class="scanline"></span>' : '') + escapeHtml(text) : '';
  }

  async function searchGithub(query){
    const url = GITHUB_SEARCH + '?q=' + encodeURIComponent(query) + '&sort=stars&order=desc&per_page=25';
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
    if(!res.ok){
      if(res.status === 403 || res.status === 429){
        throw new Error('GitHub API のレート制限に達しました（未認証は 10 req/min）。少し時間をおいて再試行してください。');
      }
      throw new Error('GitHub 検索でエラーが発生しました (HTTP ' + res.status + ')');
    }
    const data = await res.json();
    return data.items || [];
  }

  async function fetchScorecard(fullName){
    const url = SCORECARD_BASE + '/' + fullName;
    try{
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if(!res.ok) return { status: res.status === 404 ? 'none' : 'error' };
      const data = await res.json();
      return { status: 'ok', data };
    }catch(e){
      return { status: 'error' };
    }
  }

  function renderChecks(checks){
    if(!checks || !checks.length) return '';
    return checks.map(c => {
      const s = (c.score === -1 || c.score === undefined) ? null : c.score;
      const color = s === null ? 'var(--dim)' : scoreColor(s);
      const label = s === null ? 'N/A' : s;
      return '<div class="check-row"><span class="check-name">' + escapeHtml(c.name) +
        '</span><span class="check-score" style="color:' + color + '">' + label + '</span></div>';
    }).join('');
  }

  function buildCard(repo){
    const fullName = repo.full_name;
    const [owner, name] = fullName.split('/');
    const cardId = 'card-' + fullName.replace(/[^a-zA-Z0-9]/g,'-');

    const card = document.createElement('div');
    card.className = 'card';
    card.id = cardId;

    card.innerHTML = `
      <div class="card-top">
        <div class="repo-info">
          <a class="repo-name" href="${repo.html_url}" target="_blank" rel="noopener">
            <span class="owner">${escapeHtml(owner)}/</span>${escapeHtml(name)}
          </a>
          <div class="repo-desc">${repo.description ? escapeHtml(repo.description) : '（説明なし）'}</div>
          <div class="meta-row">
            <span class="star-ico">★ ${fmtStars(repo.stargazers_count)}</span>
            <span>${repo.language ? escapeHtml(repo.language) : '—'}</span>
            <span>更新: ${repo.pushed_at ? repo.pushed_at.slice(0,10) : '—'}</span>
          </div>
        </div>
        <div class="gauge-block" data-slot="gauge">
          <div class="skeleton"></div>
        </div>
      </div>
      <div class="checks" data-slot="checks"></div>
      <div data-slot="footer"></div>
    `;
    return card;
  }

  function fillScorecard(card, fullName, result){
    const gaugeSlot = card.querySelector('[data-slot="gauge"]');
    const checksSlot = card.querySelector('[data-slot="checks"]');
    const footerSlot = card.querySelector('[data-slot="footer"]');
    const viewerUrl = 'https://scorecard.dev/viewer/?uri=github.com/' + fullName;

    if(result.status === 'ok'){
      const score = result.data.score;
      const color = scoreColor(score);
      const pct = Math.max(0, Math.min(10, score)) / 10 * 100;
      gaugeSlot.innerHTML = `
        <div class="score-num" style="color:${color}">${score.toFixed(1)}<span style="font-size:12px;color:var(--dim)">/10</span></div>
        <div class="score-label">Scorecard Score</div>
        <div class="gauge"><div class="gauge-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="gauge-ticks"><span>0</span><span>5</span><span>10</span></div>
      `;
      const checks = result.data.checks || [];
      if(checks.length){
        checksSlot.innerHTML = renderChecks(checks);
        const toggle = document.createElement('button');
        toggle.className = 'toggle-btn';
        toggle.textContent = '▸ ' + checks.length + ' 件のチェック項目を表示';
        toggle.addEventListener('click', () => {
          const open = checksSlot.classList.toggle('open');
          toggle.textContent = (open ? '▾ ' : '▸ ') + checks.length + ' 件のチェック項目を' + (open ? '閉じる' : '表示');
        });
        footerSlot.appendChild(toggle);
      }
      const link = document.createElement('a');
      link.className = 'viewer-link';
      link.href = viewerUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'scorecard.dev で詳細を見る ↗';
      footerSlot.appendChild(link);
    } else if(result.status === 'none'){
      gaugeSlot.innerHTML = `<div class="na-box">スコア未計測<br><a class="viewer-link" href="${viewerUrl}" target="_blank" rel="noopener" style="margin-top:6px">計測方法を見る ↗</a></div>`;
    } else {
      gaugeSlot.innerHTML = `<div class="na-box" style="border-color:rgba(242,73,92,.4);color:#FF8B96">取得失敗</div>`;
    }
  }

  async function runSearch(){
    const query = qInput.value.trim();
    if(!query){
      qInput.focus();
      return;
    }
    searchBtn.disabled = true;
    resultsEl.innerHTML = '';
    setStatus('リポジトリを検索中 ' + query + ' ...', true);

    let repos;
    try{
      repos = await searchGithub(query);
    }catch(e){
      setStatus('', false);
      resultsEl.innerHTML = '<div class="error-box">✕ ' + escapeHtml(e.message) + '</div>';
      searchBtn.disabled = false;
      return;
    }

    if(!repos.length){
      setStatus('', false);
      resultsEl.innerHTML = '<div class="empty">"' + escapeHtml(query) + '" に一致するリポジトリが見つかりませんでした。</div>';
      searchBtn.disabled = false;
      return;
    }

    setStatus(repos.length + ' 件のリポジトリを発見。Scorecard データを取得中 ...', true);

    const cards = repos.map(repo => {
      const card = buildCard(repo);
      resultsEl.appendChild(card);
      return { repo, card };
    });

    let done = 0;
    await Promise.all(cards.map(async ({ repo, card }) => {
      const result = await fetchScorecard(repo.full_name);
      fillScorecard(card, repo.full_name, result);
      done++;
      setStatus('Scorecard データを取得中 ... (' + done + '/' + repos.length + ')', done < repos.length);
    }));

    setStatus(repos.length + ' 件中 ' + done + ' 件のリポジトリを表示（★スター数順）', false);
    searchBtn.disabled = false;
  }

  searchBtn.addEventListener('click', runSearch);
  qInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') runSearch();
  });
})();
