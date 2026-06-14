/* ============================================
   WhatsApp Memory Viewer - Premium JS
   ============================================ */

'use strict';

// ============ CONFIG ============
const CONFIG = {
  MY_NAME: 'andreas',
  CONTACT_NAME: 'Andini',
  CONTACT_PHONE: '+62 812-8018-8314',
  CONTACT_EMOJI: '💫',
  CHUNK_SIZE: 80,         // messages per render chunk
  SCROLL_THRESHOLD: 800, // px from top to show scroll-up btn
  VN_FOLDER: 'voice_notes/', // folder for voice note files
};

// ============ STATE ============
let allMessages = [];
let filteredIndices = []; // for search
let searchQuery = '';
let currentSearchIdx = -1;
let isSearchMode = false;
let isDark = false;

// Virtual render state
let renderedStart = 0;
let renderedEnd = 0;
let isRendering = false;
let dateIndexMap = {}; // date -> first message index

// Cached DOM refs
const dom = {};

// ============ INIT ============
window.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  loadChatData();
});

function cacheDom() {
  dom.app = document.getElementById('app');
  dom.loading = document.getElementById('loading-screen');
  dom.loadingBar = document.getElementById('loading-bar');
  dom.loadingStatus = document.getElementById('loading-status');
  dom.container = document.getElementById('messages-container');
  dom.wrapper = document.getElementById('messages-wrapper');
  dom.searchBar = document.getElementById('search-bar');
  dom.searchInput = document.getElementById('search-input');
  dom.searchCount = document.getElementById('search-count');
  dom.darkToggle = document.getElementById('dark-toggle');
  dom.dateModal = document.getElementById('date-modal');
  dom.dateList = document.getElementById('date-list');
  dom.statsPanel = document.getElementById('stats-panel');
  dom.memoryToast = document.getElementById('memory-toast');
  dom.memoryText = document.getElementById('memory-text');
  dom.memorySender = document.getElementById('memory-sender');
  dom.memoryDate = document.getElementById('memory-date');
}

// ============ LOAD DATA ============
function loadChatData() {
  try {
    setLoadingStatus('Membuka kenangan...', 10);

    // Data sudah di-embed via chat_data.js (window.CHAT_DATA)
    // Tidak perlu fetch — berfungsi 100% offline tanpa server
    if (!window.CHAT_DATA || !Array.isArray(window.CHAT_DATA)) {
      throw new Error('chat_data.js tidak ditemukan atau tidak valid. Pastikan file chat_data.js ada di folder yang sama dengan index.html.');
    }

    setLoadingStatus('Memproses chat...', 40);

    // Use setTimeout to allow the loading UI to paint first
    setTimeout(() => {
      try {
        setLoadingStatus('Menyusun pesan...', 65);
        allMessages = processMessages(window.CHAT_DATA);

        setLoadingStatus('Membangun tampilan...', 85);
        buildDateIndex();

        setLoadingStatus('Siap! 💫', 100);

        setTimeout(() => {
          dom.loading.style.opacity = '0';
          dom.loading.style.transition = 'opacity 0.4s ease';
          setTimeout(() => {
            dom.loading.style.display = 'none';
            initUI();
            renderInitialMessages();
          }, 400);
        }, 300);
      } catch(innerErr) {
        console.error('Error processing chat data:', innerErr);
        dom.loadingStatus.textContent = 'Error: ' + innerErr.message;
        dom.loadingStatus.style.color = '#ff6b6b';
      }
    }, 50);

  } catch(err) {
    console.error('Error loading chat data:', err);
    dom.loadingStatus.textContent = 'Error: ' + err.message;
    dom.loadingStatus.style.color = '#ff6b6b';
  }
}

function setLoadingStatus(text, pct) {
  if (dom.loadingStatus) dom.loadingStatus.textContent = text;
  if (dom.loadingBar) dom.loadingBar.style.width = pct + '%';
}

// ============ PROCESS MESSAGES ============
function processMessages(raw) {
  const processed = [];
  let vnCounter = 1;
  
  for (let i = 0; i < raw.length; i++) {
    const msg = raw[i];
    const isMe = msg.sender === CONFIG.MY_NAME;
    const isSystem = msg.sender === 'system';
    
    // Detect media type
    let mediaType = null;
    let text = msg.text || '';
    let isDeleted = false;
    let isEdited = false;
    
    if (text.includes('<Media tidak disertakan>') || text.includes('Media omitted')) {
      mediaType = 'media';
      text = '';
    } else if (text.includes('Anda menghapus pesan ini') || text.includes('You deleted this message')) {
      isDeleted = true;
    } else if (text.includes('menghapus pesan ini') || text.includes('deleted this message')) {
      isDeleted = true;
    }
    
    if (text.includes('<Pesan ini diedit>') || text.includes('This message was edited')) {
      text = text.replace(/<Pesan ini diedit>/g, '').replace(/This message was edited/g, '').trim();
      isEdited = true;
    }
    
    // Detect if probably voice note (media, may refine later)
    let vnIndex = null;
    if (mediaType === 'media') {
      // We'll render all as photo placeholder; VNs can be changed manually via HTML
      vnIndex = null;
    }
    
    // Check if pure emoji
    const emojiOnly = isEmojiOnly(text);
    
    // Group with previous same sender
    const prevMsg = processed[processed.length - 1];
    const grouped = prevMsg && !isSystem &&
      prevMsg.sender === msg.sender &&
      prevMsg.date === msg.date &&
      !prevMsg.isDateSep;
    
    processed.push({
      id: i,
      date: msg.date,
      date_raw: msg.date_raw,
      time: msg.time,
      sender: msg.sender,
      text: text,
      type: msg.type,
      isMe: isMe,
      isSystem: isSystem,
      mediaType: mediaType,
      isDeleted: isDeleted,
      isEdited: isEdited,
      emojiOnly: emojiOnly,
      grouped: grouped,
      vnIndex: vnIndex,
    });
  }
  
  return processed;
}

function isEmojiOnly(text) {
  if (!text || text.length === 0) return false;
  const stripped = text.replace(/\s/g, '');
  if (stripped.length === 0) return false;
  // Simple check: if text is 1-5 chars and all emoji-like
  if (stripped.length <= 10) {
    const textChars = stripped.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}❤️💕💓💗💖💝💘💟☺️😀-😿🙀🙁🤣🤠🤩🤯🤪🤫🤭🧐🤓😎😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🫡🤭🫢🫣🤫🤥😶🫥😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🫠🤐🥴🤢🤮🤧🥰😍🤩😘😗☺😚😙🥲😋😛😜🤪😝🤑🤗🫂🤡🤠🥸😎🤓🧐😕🫤😟☹😮‍💨😤🤯🤬😡😠😈👿👹👺💀☠️💩🤡👻👽👾🤖🎃😺😸😹😻😼😽🙀😿😾🙈🙉🙊]/gu, '');
    if (textChars.length === 0) return true;
  }
  return false;
}

// ============ BUILD DATE INDEX ============
function buildDateIndex() {
  dateIndexMap = {};
  allMessages.forEach((msg, i) => {
    if (!dateIndexMap[msg.date]) {
      dateIndexMap[msg.date] = i;
    }
  });
}

// ============ INIT UI ============
function initUI() {
  // Dark mode from localStorage
  const savedDark = localStorage.getItem('wa-dark-mode');
  if (savedDark === 'true') {
    isDark = true;
    document.body.classList.add('dark');
    dom.darkToggle.textContent = '☀️';
  }
  
  setupEventListeners();
  setupScrollListener();
  populateDateList();
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
  // Dark toggle
  dom.darkToggle.addEventListener('click', toggleDark);
  
  // Search icon
  document.getElementById('search-icon').addEventListener('click', toggleSearch);
  
  // Search input
  dom.searchInput.addEventListener('input', debounce(handleSearch, 200));
  dom.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigateSearch(1);
    if (e.key === 'Escape') closeSearch();
  });
  
  // Search navigation
  document.getElementById('search-prev').addEventListener('click', () => navigateSearch(-1));
  document.getElementById('search-next').addEventListener('click', () => navigateSearch(1));
  document.getElementById('search-close').addEventListener('click', closeSearch);
  
  // FAB buttons
  document.getElementById('fab-top').addEventListener('click', scrollToTop);
  document.getElementById('fab-bottom').addEventListener('click', scrollToBottom);
  document.getElementById('fab-date').addEventListener('click', showDateModal);
  document.getElementById('fab-memory').addEventListener('click', showRandomMemory);
  document.getElementById('fab-stats').addEventListener('click', showStats);
  
  // Date modal
  document.getElementById('close-date-modal').addEventListener('click', () => dom.dateModal.classList.remove('visible'));
  dom.dateModal.addEventListener('click', (e) => { if (e.target === dom.dateModal) dom.dateModal.classList.remove('visible'); });
  
  // Stats panel
  document.getElementById('close-stats').addEventListener('click', () => dom.statsPanel.classList.remove('visible'));
  dom.statsPanel.addEventListener('click', (e) => { if (e.target === dom.statsPanel) dom.statsPanel.classList.remove('visible'); });
  
  // Memory toast
  document.getElementById('memory-close').addEventListener('click', () => dom.memoryToast.classList.remove('visible'));
  document.getElementById('memory-again').addEventListener('click', showRandomMemory);
  document.getElementById('memory-goto').addEventListener('click', gotoMemoryMessage);
  dom.memoryToast.addEventListener('click', (e) => { if (e.target === dom.memoryToast) dom.memoryToast.classList.remove('visible'); });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dom.dateModal.classList.remove('visible');
      dom.statsPanel.classList.remove('visible');
      dom.memoryToast.classList.remove('visible');
      if (isSearchMode) closeSearch();
    }
  });
}

// ============ SCROLL LISTENER ============
function setupScrollListener() {
  let lastScrollY = 0;
  let ticking = false;
  
  dom.wrapper.addEventListener('scroll', () => {
    lastScrollY = dom.wrapper.scrollTop;
    if (!ticking) {
      requestAnimationFrame(() => {
        handleScroll(lastScrollY);
        ticking = false;
      });
      ticking = true;
    }
  });
}

function handleScroll(scrollY) {
  const scrollHeight = dom.wrapper.scrollHeight;
  const clientHeight = dom.wrapper.clientHeight;
  
  // Near bottom: load more if needed (infinite scroll down)
  if (scrollY + clientHeight > scrollHeight - 300) {
    maybeRenderMore('down');
  }
  
  // Near top: load more up
  if (scrollY < 300) {
    maybeRenderMore('up');
  }
}

// ============ VIRTUAL RENDERING ============
function renderInitialMessages() {
  // Render last CHUNK_SIZE*2 messages to start at the beginning
  renderedStart = 0;
  renderedEnd = 0;
  dom.container.innerHTML = '';
  
  // Render first batch
  const end = Math.min(CONFIG.CHUNK_SIZE * 3, allMessages.length);
  renderRange(0, end);
  
  // Scroll to top
  dom.wrapper.scrollTop = 0;
}

function renderRange(start, end) {
  const frag = document.createDocumentFragment();
  let lastDate = start > 0 ? allMessages[start - 1]?.date : null;
  
  for (let i = start; i < end && i < allMessages.length; i++) {
    const msg = allMessages[i];
    
    // Date separator
    if (msg.date !== lastDate) {
      frag.appendChild(createDateSeparator(msg.date));
      lastDate = msg.date;
    }
    
    const el = createMessageElement(msg);
    el.dataset.msgIndex = i;
    frag.appendChild(el);
  }
  
  if (start === renderedEnd) {
    dom.container.appendChild(frag);
    renderedEnd = end;
  } else if (end === renderedStart) {
    dom.container.insertBefore(frag, dom.container.firstChild);
    renderedStart = start;
  }
}

function maybeRenderMore(dir) {
  if (isRendering) return;
  
  if (dir === 'down' && renderedEnd < allMessages.length) {
    isRendering = true;
    const newEnd = Math.min(renderedEnd + CONFIG.CHUNK_SIZE, allMessages.length);
    renderRange(renderedEnd, newEnd);
    isRendering = false;
  }
  
  if (dir === 'up' && renderedStart > 0) {
    isRendering = true;
    const prevScrollHeight = dom.wrapper.scrollHeight;
    const prevScrollTop = dom.wrapper.scrollTop;
    
    const newStart = Math.max(0, renderedStart - CONFIG.CHUNK_SIZE);
    renderRange(newStart, renderedStart);
    
    // Maintain scroll position
    const newScrollHeight = dom.wrapper.scrollHeight;
    dom.wrapper.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
    isRendering = false;
  }
}

// ============ CREATE DATE SEPARATOR ============
function createDateSeparator(date) {
  const div = document.createElement('div');
  div.className = 'date-separator';
  div.dataset.date = date;
  div.innerHTML = `<div class="date-separator-inner">${formatDateFull(date)}</div>`;
  return div;
}

// ============ CREATE MESSAGE ELEMENT ============
function createMessageElement(msg) {
  if (msg.isSystem) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerHTML = `<div class="system-message-inner">${escapeHtml(msg.text)}</div>`;
    return div;
  }
  
  const row = document.createElement('div');
  row.className = `message-row ${msg.isMe ? 'right' : 'left'}${msg.grouped ? ' grouped' : ''}`;
  
  const bubble = document.createElement('div');
  const isFirstInGroup = !msg.grouped;
  bubble.className = `bubble${isFirstInGroup ? ' first-in-group' : ''}`;
  
  let innerHtml = '';
  
  // Media card
  if (msg.mediaType === 'media') {
    innerHtml += renderMediaCard(msg);
  } else if (msg.isDeleted) {
    innerHtml += `<div class="bubble-text deleted">🚫 Pesan ini telah dihapus</div>`;
  } else {
    let textClass = 'bubble-text';
    if (msg.emojiOnly) {
      const emojiCount = [...msg.text.replace(/\s/g, '')].length;
      textClass += emojiCount <= 3 ? ' emoji-only' : ' emoji-only-small';
    }
    const formatted = formatText(msg.text);
    innerHtml += `<div class="${textClass}">${formatted}${msg.isEdited ? '<span class="edited-tag">✎ diedit</span>' : ''}</div>`;
  }
  
  // Timestamp
  innerHtml += `
    <div class="bubble-meta">
      <span class="bubble-time">${msg.time.replace('.', ':')}</span>
      ${msg.isMe ? '<span class="bubble-tick">✓✓</span>' : ''}
    </div>`;
  
  bubble.innerHTML = innerHtml;
  row.appendChild(bubble);
  return row;
}

// ============ MEDIA CARD ============
function renderMediaCard(msg) {
  // Check if voice note file exists (naming convention: vn_INDEX.opus)
  // We render a placeholder; user can swap to audio element manually
  const vnId = `vn_${msg.id}`;
  
  // Default: photo placeholder
  return `
    <div class="media-card">
      <div class="media-icon">📷</div>
      <div class="media-info">
        <div class="media-label">Foto tidak tersedia</div>
        <div class="media-sublabel">File media tidak disertakan dalam ekspor</div>
      </div>
    </div>`;
}

/* 
  CARA MENGGANTI MEDIA DENGAN VOICE NOTE:
  Jika sebuah pesan adalah voice note, ubah renderMediaCard agar menghasilkan:

  <div class="vn-card">
    <div class="vn-placeholder">
      <span style="font-size:20px">🎤</span>
      <div class="vn-waveform">
        <div class="vn-bar"></div><div class="vn-bar"></div>
        <div class="vn-bar"></div><div class="vn-bar"></div>
        <div class="vn-bar"></div><div class="vn-bar"></div>
        <div class="vn-bar"></div><div class="vn-bar"></div>
        <div class="vn-bar"></div><div class="vn-bar"></div>
      </div>
    </div>
    <audio controls>
      <source src="voice_notes/vn001.opus" type="audio/ogg; codecs=opus">
      <source src="voice_notes/vn001.mp3" type="audio/mpeg">
      Voice Note tidak dapat diputar
    </audio>
  </div>

  Jika file belum ada, tampilkan:
  <div class="vn-card">
    <div class="vn-placeholder">
      <span style="font-size:20px">🎤</span>
      <span class="vn-label">Voice Note belum ditambahkan</span>
    </div>
  </div>
*/

// ============ TEXT FORMATTER ============
function formatText(text) {
  if (!text) return '';
  
  let html = escapeHtml(text);
  
  // Links
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  
  // WhatsApp formatting
  // Bold: *text*
  html = html.replace(/\*([^*\n]+)\*/g, '<span class="bold">$1</span>');
  // Italic: _text_
  html = html.replace(/_([^_\n]+)_/g, '<span class="italic">$1</span>');
  // Strikethrough: ~text~
  html = html.replace(/~([^~\n]+)~/g, '<span class="strike">$1</span>');
  // Monospace: ```text```
  html = html.replace(/```([^`]+)```/g, '<span class="mono">$1</span>');
  
  // Newlines
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============ DATE FORMATTING ============
function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(+y, +m - 1, +d);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  if (dateStr === today.toISOString().split('T')[0]) return 'Hari ini';
  if (dateStr === yesterday.toISOString().split('T')[0]) return 'Kemarin';
  
  return `${days[date.getDay()]}, ${d} ${months[+m - 1]} ${y}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d} ${months[+m - 1]} 20${String(y).slice(-2)}`;
}

// ============ SCROLL FUNCTIONS ============
function scrollToTop() {
  if (renderedStart > 0) {
    // Need to render from beginning
    dom.container.innerHTML = '';
    renderedStart = 0;
    renderedEnd = 0;
    const end = Math.min(CONFIG.CHUNK_SIZE * 3, allMessages.length);
    renderRange(0, end);
  }
  dom.wrapper.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
  // Render all remaining messages up to end
  if (renderedEnd < allMessages.length) {
    const end = allMessages.length;
    renderRange(renderedEnd, end);
  }
  dom.wrapper.scrollTo({ top: dom.wrapper.scrollHeight, behavior: 'smooth' });
}

function scrollToMessageIndex(msgIndex) {
  // Ensure the message is rendered
  ensureRendered(msgIndex, () => {
    const el = dom.container.querySelector(`[data-msg-index="${msgIndex}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background 0.3s ease';
      const bubble = el.querySelector('.bubble');
      if (bubble) {
        const orig = bubble.style.background;
        bubble.style.background = 'rgba(37, 211, 102, 0.3)';
        setTimeout(() => { bubble.style.background = ''; }, 1500);
      }
    }
  });
}

function ensureRendered(msgIndex, callback) {
  if (msgIndex >= renderedStart && msgIndex < renderedEnd) {
    callback();
    return;
  }
  
  // Re-render around this index
  dom.container.innerHTML = '';
  renderedStart = 0;
  renderedEnd = 0;
  
  const start = Math.max(0, msgIndex - CONFIG.CHUNK_SIZE);
  const end = Math.min(allMessages.length, msgIndex + CONFIG.CHUNK_SIZE);
  renderRange(start, end);
  
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

// ============ DARK MODE ============
function toggleDark() {
  isDark = !isDark;
  document.body.classList.toggle('dark', isDark);
  dom.darkToggle.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('wa-dark-mode', isDark);
}

// ============ SEARCH ============
function toggleSearch() {
  isSearchMode = !isSearchMode;
  dom.searchBar.classList.toggle('visible', isSearchMode);
  if (isSearchMode) {
    dom.searchInput.focus();
  } else {
    closeSearch();
  }
}

function closeSearch() {
  isSearchMode = false;
  dom.searchBar.classList.remove('visible');
  dom.searchInput.value = '';
  searchQuery = '';
  filteredIndices = [];
  currentSearchIdx = -1;
  dom.searchCount.textContent = '';
  clearSearchHighlights();
}

function handleSearch() {
  searchQuery = dom.searchInput.value.trim().toLowerCase();
  if (!searchQuery) {
    filteredIndices = [];
    currentSearchIdx = -1;
    dom.searchCount.textContent = '';
    clearSearchHighlights();
    return;
  }
  
  filteredIndices = [];
  allMessages.forEach((msg, i) => {
    if (msg.text && msg.text.toLowerCase().includes(searchQuery)) {
      filteredIndices.push(i);
    }
  });
  
  if (filteredIndices.length === 0) {
    dom.searchCount.textContent = 'Tidak ditemukan';
    currentSearchIdx = -1;
    return;
  }
  
  currentSearchIdx = 0;
  dom.searchCount.textContent = `1 / ${filteredIndices.length}`;
  gotoSearchResult(0);
}

function navigateSearch(dir) {
  if (filteredIndices.length === 0) return;
  currentSearchIdx = (currentSearchIdx + dir + filteredIndices.length) % filteredIndices.length;
  dom.searchCount.textContent = `${currentSearchIdx + 1} / ${filteredIndices.length}`;
  gotoSearchResult(currentSearchIdx);
}

function gotoSearchResult(idx) {
  const msgIndex = filteredIndices[idx];
  
  ensureRendered(msgIndex, () => {
    clearSearchHighlights();
    const el = dom.container.querySelector(`[data-msg-index="${msgIndex}"]`);
    if (!el) return;
    
    // Highlight
    const textEl = el.querySelector('.bubble-text');
    if (textEl) {
      highlightText(textEl, searchQuery, true);
    }
    
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function clearSearchHighlights() {
  dom.container.querySelectorAll('.highlight').forEach(el => {
    const parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
}

function highlightText(el, query, isActive) {
  // Re-render the text element with highlights
  // We work on innerHTML carefully
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  
  nodes.forEach(textNode => {
    const text = textNode.textContent;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx === -1) return;
    
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    
    const span = document.createElement('span');
    span.className = `highlight${isActive ? ' active' : ''}`;
    span.textContent = match;
    
    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(span);
    if (after) frag.appendChild(document.createTextNode(after));
    
    textNode.parentNode.replaceChild(frag, textNode);
  });
}

// ============ DATE NAVIGATION ============
function populateDateList() {
  const dates = Object.keys(dateIndexMap).sort();
  dom.dateList.innerHTML = '';
  
  dates.forEach(date => {
    const div = document.createElement('div');
    div.className = 'date-item';
    div.textContent = formatDateShort(date);
    div.addEventListener('click', () => {
      dom.dateModal.classList.remove('visible');
      const msgIndex = dateIndexMap[date];
      scrollToMessageIndex(msgIndex);
    });
    dom.dateList.appendChild(div);
  });
}

function showDateModal() {
  dom.dateModal.classList.add('visible');
}

// ============ STATISTICS ============
function showStats() {
  const stats = computeStats();
  renderStats(stats);
  dom.statsPanel.classList.add('visible');
}

function computeStats() {
  const msgs = allMessages.filter(m => !m.isSystem);
  const myMsgs = msgs.filter(m => m.isMe);
  const theirMsgs = msgs.filter(m => !m.isMe);
  
  // Date range
  const dates = [...new Set(msgs.map(m => m.date))].sort();
  
  // Hour distribution
  const hourDist = new Array(24).fill(0);
  msgs.forEach(m => {
    const h = parseInt(m.time.split('.')[0]);
    if (!isNaN(h)) hourDist[h]++;
  });
  
  // Most active hour
  const peakHour = hourDist.indexOf(Math.max(...hourDist));
  
  // Word frequency (ignore short words and system texts)
  const stopWords = new Set(['yang', 'dan', 'di', 'ke', 'ya', 'iya', 'gak', 'ga', 'si', 'tu', 'ini', 'itu', 'ada', 'kak', 'la', 'lah', 'aja', 'deh', 'nih', 'sih', 'tapi', 'udah', 'udh', 'juga', 'bisa', 'aku', 'kamu', 'aku', 'kau', 'ku', 'mu', 'nya', 'klo', 'kalo', 'bang', 'bg', 'dini', 'andreas', 'oke', 'ok', 'wkwk', 'haha', 'hehe', 'hh', 'eh', 'oh', 'ah', 'ih', 'mau', 'buat', 'apa', 'itu', 'sama', 'jadi', 'kalau', 'sudah', 'belum', 'tidak', 'bukan', 'atau', 'untuk', 'dari', 'dengan', 'pada', 'dalam', 'oleh', 'pun', 'lagi', 'lah', 'pula', 'tuh', 'trus', 'terus', 'cuma', 'cmn', 'emang', 'emg', 'kayak', 'kan', 'tau', 'tahu', 'nanti', 'nnti', 'nnt', 'besok', 'bsok', 'hari', 'malam', 'pagi', 'siang']);
  
  const wordFreq = {};
  msgs.forEach(m => {
    if (!m.text || m.isDeleted || m.mediaType) return;
    m.text.toLowerCase().split(/\s+/).forEach(w => {
      const clean = w.replace(/[^a-z]/g, '');
      if (clean.length > 2 && !stopWords.has(clean)) {
        wordFreq[clean] = (wordFreq[clean] || 0) + 1;
      }
    });
  });
  
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  // Emoji frequency
  const emojiFreq = {};
  const emojiRegex = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}❤️💕💓💗💖💝💘💟]/gu;
  msgs.forEach(m => {
    if (!m.text) return;
    const matches = m.text.match(emojiRegex) || [];
    matches.forEach(e => {
      emojiFreq[e] = (emojiFreq[e] || 0) + 1;
    });
  });
  
  const topEmojis = Object.entries(emojiFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  
  return {
    total: msgs.length,
    myCount: myMsgs.length,
    theirCount: theirMsgs.length,
    days: dates.length,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    hourDist,
    peakHour,
    topWords,
    topEmojis,
    mediaCount: msgs.filter(m => m.mediaType).length,
  };
}

function renderStats(stats) {
  const pct = (n, t) => Math.round(n / t * 100);
  const maxHour = Math.max(...stats.hourDist);
  
  document.getElementById('stats-content').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${stats.total.toLocaleString()}</div>
        <div class="stat-label">Total Pesan</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.days}</div>
        <div class="stat-label">Hari Ngobrol</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${formatDateShort(stats.firstDate)}</div>
        <div class="stat-label">Pesan Pertama</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${formatDateShort(stats.lastDate)}</div>
        <div class="stat-label">Pesan Terakhir</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.mediaCount.toLocaleString()}</div>
        <div class="stat-label">Foto/Media</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.peakHour}:00</div>
        <div class="stat-label">Jam Paling Aktif</div>
      </div>
    </div>

    <div class="stats-section">
      <div class="stats-section-title">Pesan per Orang</div>
      <div class="sender-bar-wrap">
        <div class="sender-bar-label">
          <span>Andreas</span>
          <span>${stats.myCount.toLocaleString()} (${pct(stats.myCount, stats.total)}%)</span>
        </div>
        <div class="sender-bar-track">
          <div class="sender-bar-fill right" style="width:${pct(stats.myCount, stats.total)}%"></div>
        </div>
      </div>
      <div class="sender-bar-wrap">
        <div class="sender-bar-label">
          <span>${CONFIG.CONTACT_NAME}</span>
          <span>${stats.theirCount.toLocaleString()} (${pct(stats.theirCount, stats.total)}%)</span>
        </div>
        <div class="sender-bar-track">
          <div class="sender-bar-fill left" style="width:${pct(stats.theirCount, stats.total)}%"></div>
        </div>
      </div>
    </div>

    <div class="stats-section">
      <div class="stats-section-title">Kata Sering Dipakai</div>
      <div class="top-list">
        ${stats.topWords.map(([w, c]) => `
          <div class="top-tag">${w} <span class="count">${c}x</span></div>
        `).join('')}
      </div>
    </div>

    <div class="stats-section">
      <div class="stats-section-title">Emoji Favorit</div>
      <div class="top-list">
        ${stats.topEmojis.map(([e, c]) => `
          <div class="top-tag">${e} <span class="count">${c}x</span></div>
        `).join('')}
      </div>
    </div>

    <div class="stats-section">
      <div class="stats-section-title">Aktivitas per Jam</div>
      <div class="hour-chart">
        ${stats.hourDist.map((count, h) => `
          <div class="hour-bar-wrap">
            <div class="hour-bar" style="height:${maxHour > 0 ? Math.round(count / maxHour * 56) + 4 : 4}px" title="${h}:00 - ${count} pesan"></div>
            ${h % 6 === 0 ? `<div class="hour-label">${h}</div>` : '<div class="hour-label">&nbsp;</div>'}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============ RANDOM MEMORY ============
let currentMemoryIndex = -1;

function showRandomMemory() {
  const textMsgs = allMessages.filter(m => !m.isSystem && !m.mediaType && !m.isDeleted && m.text && m.text.length > 5);
  if (textMsgs.length === 0) return;
  
  const msg = textMsgs[Math.floor(Math.random() * textMsgs.length)];
  currentMemoryIndex = msg.id;
  
  const memoryEmojis = ['💫', '✨', '🌙', '💝', '🌸', '☀️', '🎯', '💭', '🌟', '💌'];
  const emoji = memoryEmojis[Math.floor(Math.random() * memoryEmojis.length)];
  
  document.getElementById('memory-emoji').textContent = emoji;
  dom.memoryDate.textContent = `${formatDateFull(msg.date)} · ${msg.time.replace('.', ':')}`;
  dom.memorySender.textContent = msg.isMe ? 'Andreas' : CONFIG.CONTACT_NAME;
  dom.memoryText.textContent = msg.text;
  
  dom.memoryToast.classList.add('visible');
}

function gotoMemoryMessage() {
  if (currentMemoryIndex < 0) return;
  dom.memoryToast.classList.remove('visible');
  scrollToMessageIndex(currentMemoryIndex);
}

// ============ UTILITY ============
function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
