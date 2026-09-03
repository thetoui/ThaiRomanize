(function () {
  'use strict';

  var $  = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var input      = $('#thaiInput');
  var output     = $('#romanOutput');
  var inCount    = $('#inCount');
  var outCount   = $('#outCount');
  var clearBtn   = $('#clearBtn');
  var copyBtn    = $('#copyBtn');
  var copyLabel  = $('#copyBtnLabel');
  var toneToggle = $('#toneToggle');
  var toneToggleText = $('#toneToggleText');
  var sepBtns    = $$('#sepControl button');
  var caseBtns   = $$('#caseControl button');
  var exampleBtns = $$('.example-chip');
  var navToggle  = $('#navToggle');
  var siteNav    = $('#siteNav');
  var toTopBtn   = $('#toTop');

  var withTone  = true;
  var separator = 'hyphen';
  var caseMode  = 'lower';
  var debounceId = null;
  var COPY_RESET_MS = 1800;
  var copyResetId = null;

  function convert() {
    var text = input.value;

    if (!text) {
      output.innerHTML = '<span class="output-placeholder">คำอ่านอักษรโรมันจะปรากฏที่นี่ทันทีที่คุณพิมพ์…</span>';
      outCount.textContent = '0 พยางค์';
      inCount.textContent = '0 ตัวอักษร';
      return;
    }

    inCount.textContent = text.length.toLocaleString('th-TH') + ' ตัวอักษร';

    var result;
    try {
      result = window.ThaiRomanizer.romanize(text, {
        tone: withTone,
        separator: separator,
        case: caseMode
      });
    } catch (e) {
      output.textContent = 'เกิดข้อผิดพลาดในการแปลงข้อความ กรุณาลองใหม่อีกครั้ง';
      return;
    }

    output.textContent = result.text || '';
    outCount.textContent = result.syllables.toLocaleString('th-TH') + ' พยางค์';
  }

  function scheduleConvert() {
    clearTimeout(debounceId);
    debounceId = setTimeout(convert, 120);
  }

  input.addEventListener('input', scheduleConvert);

  clearBtn.addEventListener('click', function () {
    input.value = '';
    convert();
    input.focus();
  });

  function selectSegButton(group, btn) {
    group.forEach(function (b) {
      b.classList.remove('is-active');
      b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-checked', 'true');
  }

  toneToggle.addEventListener('change', function () {
    withTone = toneToggle.checked;
    toneToggleText.textContent = withTone ? 'เปิด (sà-wàt-dii)' : 'ปิด (sa-wat-dii)';
    convert();
  });

  sepBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectSegButton(sepBtns, btn);
      separator = btn.getAttribute('data-sep');
      convert();
    });
  });

  caseBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectSegButton(caseBtns, btn);
      caseMode = btn.getAttribute('data-case');
      convert();
    });
  });

  exampleBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      input.value = btn.getAttribute('data-text') || '';
      convert();
      input.focus();
      if (window.innerWidth < 768) {
        var y = input.getBoundingClientRect().top + window.pageYOffset - 90;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  });

  copyBtn.addEventListener('click', function () {
    var text = output.textContent || '';
    if (!text.trim() || output.querySelector('.output-placeholder')) return;

    var done = function () {
      clearTimeout(copyResetId);
      copyBtn.classList.add('is-copied');
      copyLabel.textContent = 'คัดลอกแล้ว ✓';
      copyResetId = setTimeout(function () {
        copyBtn.classList.remove('is-copied');
        copyLabel.textContent = 'คัดลอก';
      }, COPY_RESET_MS);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  });

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  /* ---------------- Mobile nav ---------------- */

  navToggle.addEventListener('click', function () {
    var open = siteNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  siteNav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      siteNav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('click', function (e) {
    if (!siteNav.classList.contains('is-open')) return;
    if (siteNav.contains(e.target) || navToggle.contains(e.target)) return;
    siteNav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  });

  /* ---------------- Back to top ---------------- */

  window.addEventListener('scroll', function () {
    if (window.pageYOffset > 480) toTopBtn.classList.add('is-visible');
    else toTopBtn.classList.remove('is-visible');
  }, { passive: true });

  toTopBtn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ---------------- Misc ---------------- */

  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  convert();
})();
