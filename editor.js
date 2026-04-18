/* =========================================================================
   掛號單共用編輯器
   - 從 <template id="form-body"> 複製內容到兩個 .form-page（A4 雙拼時兩份都顯示）
   - 讓每個 [data-k] 的 <span.editable> 可點選編輯
   - 修改會自動存到 localStorage，兩份副本即時同步
   - A5 / A4 切換會動態更換 @page 尺寸
   ========================================================================= */

function initForm({ formId }) {
  const STORAGE_PREFIX = `clinic-form:${formId}:`;
  const tpl = document.getElementById('form-body');

  // 1) 預設文字備份（之後還原時要用）
  const defaults = {};
  tpl.content.querySelectorAll('[data-k]').forEach(el => {
    defaults[el.dataset.k] = el.textContent;
  });

  // 2) 渲染兩份 form-page
  document.querySelectorAll('[data-form]').forEach(host => {
    host.innerHTML = '';
    host.appendChild(tpl.content.cloneNode(true));
  });

  // 3) 套用 localStorage 中已儲存的自訂文字
  function applySaved() {
    document.querySelectorAll('[data-k]').forEach(el => {
      const saved = localStorage.getItem(STORAGE_PREFIX + el.dataset.k);
      if (saved !== null) el.textContent = saved;
    });
  }
  applySaved();

  // 4) 讓每個 .editable 變成可編輯
  document.querySelectorAll('.editable').forEach(el => {
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
  });

  // 5) 編輯後：存 localStorage + 同步到另一份副本
  document.addEventListener('input', e => {
    const el = e.target.closest('[data-k]');
    if (!el) return;
    const key = el.dataset.k;
    const text = el.textContent;
    localStorage.setItem(STORAGE_PREFIX + key, text);
    // 同步其他副本
    document.querySelectorAll(`[data-k="${CSS.escape(key)}"]`).forEach(other => {
      if (other !== el && other.textContent !== text) {
        other.textContent = text;
      }
    });
  });

  // 6) 防止在編輯中按 Enter 多插一行（退化為空白）
  document.addEventListener('keydown', e => {
    const el = e.target.closest('.editable');
    if (!el) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      el.blur();
    }
  });

  // 7) 還原預設內容
  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('確定要把所有項目還原成預設內容嗎？（僅影響本瀏覽器的自訂版）')) return;
      Object.keys(defaults).forEach(k => {
        localStorage.removeItem(STORAGE_PREFIX + k);
      });
      document.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;
        if (defaults[k] !== undefined) el.textContent = defaults[k];
      });
    });
  }

  // 8) A5 / A4 模式切換（動態抽換 @page 規則）
  const pageStyle = document.getElementById('page-size');
  function setMode(mode) {
    document.body.className = mode;
    pageStyle.textContent = (mode === 'a4-duo')
      ? '@page { size: A4 portrait; margin: 0; }'
      : '@page { size: A5 landscape; margin: 0; }';
    document.querySelectorAll('[data-mode]').forEach(b => {
      b.classList.toggle('primary', b.dataset.mode === mode);
    });
  }
  document.querySelectorAll('[data-mode]').forEach(b => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  // 9) 支援 ?mode=a4-duo / ?mode=a5 直接進入指定模式
  const urlMode = new URLSearchParams(location.search).get('mode');
  if (urlMode === 'a4-duo' || urlMode === 'a5') setMode(urlMode);

  // 10) 「下載 PDF」按鈕：直接輸出 PDF 檔，不開列印對話框
  const pdfBtn = document.getElementById('btn-pdf');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      if (typeof html2pdf === 'undefined') {
        alert('PDF 函式庫尚未載入完成，請稍候再試。');
        return;
      }
      const mode = document.body.className; // 'a5' or 'a4-duo'
      const target = (mode === 'a4-duo')
        ? document.querySelector('.a4-sheet')
        : document.querySelector('.a4-sheet .form-page');

      const filename = `${formId === 'internal' ? '內科' : '婦產科'}掛號單_${mode}_${new Date().toISOString().slice(0,10)}.pdf`;

      // 捕捉前暫時移除螢幕用的外框樣式（margin / box-shadow），
      // 避免 html2canvas 把 margin 計入高度、讓輸出 canvas 比實際頁面高。
      const prevInline = {
        margin: target.style.margin,
        boxShadow: target.style.boxShadow,
      };
      target.style.margin = '0';
      target.style.boxShadow = 'none';

      // 紙張實際尺寸（mm）
      const paper = (mode === 'a4-duo') ? { w: 210, h: 297 } : { w: 210, h: 148 };

      // 明確指定 html2canvas 的 width/height，避免：
      //   (1) html2canvas 把元素 margin 算進去造成 canvas 偏高
      //   (2) page-break-after: always 被當成分頁訊號造成 canvas 偏高
      //   (3) 1~2 px 的 rounding 讓 html2pdf 以為還有第二頁而切成兩頁
      // 高度取 floor(w * paperH / paperW)，保證 canvas 在 html2pdf
      // 內部算 pxPageHeight=floor(canvasW * ratio) 後 canvasH ≤ pxPageHeight。
      const rect = target.getBoundingClientRect();
      const capW = Math.floor(rect.width);
      const capH = Math.floor(capW * paper.h / paper.w);

      const opt = {
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 3,
          useCORS: true,
          letterRendering: true,
          backgroundColor: '#ffffff',
          width: capW,
          height: capH
        },
        // 用明確的 [width, height] 陣列避免 jsPDF 對 'a5' 字串的解讀差異
        jsPDF: (mode === 'a4-duo')
          ? { unit: 'mm', format: [paper.w, paper.h], orientation: 'portrait' }
          : { unit: 'mm', format: [paper.w, paper.h], orientation: 'landscape' },
        // 目標元素帶 page-break-after: always（為了 ⌘P 列印），
        // 但 html2pdf 預設會把它當成分頁訊號、在 canvas 底部額外塞空白。
        // avoid-all 關掉分頁處理，保證單頁輸出。
        pagebreak: { mode: 'avoid-all' }
      };

      pdfBtn.disabled = true;
      const originalText = pdfBtn.textContent;
      pdfBtn.textContent = '生成中...';

      const restoreStyles = () => {
        target.style.margin = prevInline.margin;
        target.style.boxShadow = prevInline.boxShadow;
      };

      html2pdf().set(opt).from(target).save().then(() => {
        restoreStyles();
        pdfBtn.disabled = false;
        pdfBtn.textContent = originalText;
      }).catch(err => {
        console.error(err);
        restoreStyles();
        alert('產生 PDF 失敗，請改用 ⌘P 列印。');
        pdfBtn.disabled = false;
        pdfBtn.textContent = originalText;
      });
    });
  }
}
