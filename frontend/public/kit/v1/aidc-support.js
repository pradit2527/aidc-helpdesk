/*!
 * AIDC Support Hub — widget loader v1.0.0
 * https://<helpdesk>/kit/v1/aidc-support.js
 *
 * ไฟล์นี้ถูกโหลดเข้าไปในเว็บของทีมอื่น ซึ่งเราไม่ได้เป็นคนดูแลและอาจพังทั้งเว็บ
 * ถ้าเราทำพลาด กติกาจึงเข้มกว่าโค้ดปกติของโปรเจกต์นี้
 *
 *   1. ไม่มี build step ไม่มี dependency — ไฟล์นี้คือสิ่งที่เบราว์เซอร์รันจริง
 *   2. ไม่โยน error ออกไปหาเว็บเจ้าบ้านเด็ดขาด ความผิดพลาดทุกชนิดจบที่ console.warn
 *   3. ไม่แตะ global อื่นนอกจาก window.AIDCSupport (chatwootSettings/chatwootSDK
 *      เป็นของ SDK ของ Chatwoot เอง ซึ่งเราตั้งให้ก่อนมันโหลดตามที่มันกำหนด)
 *   4. เขียนด้วยไวยากรณ์ ES5/ES2017 ล้วน — เครื่องหน้างานบางเครื่องยังเป็นเบราว์เซอร์เก่า
 *
 * ทีมที่เอาไปใช้ต้องรู้แค่รหัสโครงการ ไม่ต้องรู้ว่าเบื้องหลังเป็น Chatwoot
 * เอกสารอยู่ที่ packages/support-kit/README.md
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var LOG_PREFIX = '[aidc-support]';

  /* เตือนซ้ำเรื่องเดิมไม่ช่วยใคร มีแต่จะกลบ log ของเว็บเจ้าบ้าน */
  var warned = {};
  function warn(code, message) {
    if (warned[code]) return;
    warned[code] = true;
    try {
      if (window.console && typeof window.console.warn === 'function') {
        window.console.warn(LOG_PREFIX + ' ' + message);
      }
    } catch (ignored) {
      /* console ถูกแทนที่ด้วยอะไรก็ไม่รู้ในเว็บเจ้าบ้าน — ปล่อยผ่าน */
    }
  }

  /* ห่อทุกอย่างที่เรียกเข้ามาจากภายนอก ไม่ให้ความผิดพลาดของเราไหลออกไป */
  function guard(code, fn) {
    try {
      fn();
    } catch (error) {
      warn(code, 'ทำงานไม่สำเร็จ: ' + (error && error.message ? error.message : error));
    }
  }

  /* ── กันรวมสองครั้ง ────────────────────────────────────────────────── */
  if (window.AIDCSupport && window.AIDCSupport.version) {
    warn('duplicate', 'สคริปต์ถูกใส่ไว้มากกว่าหนึ่งครั้งในหน้านี้ — ตัวที่สองไม่ทำงาน');
    return;
  }

  /*
   * เว็บเจ้าบ้านมีวิดเจ็ต Chatwoot ของตัวเองอยู่แล้ว
   *
   * ต้องเช็กก่อนเราจะไปตั้ง window.chatwootSettings ไม่งั้นจะเจอของตัวเองเสมอ
   * กรณีนี้ต้องถอยออกมาเงียบ ๆ การรัน SDK ซ้อนกันสองชุดทำให้ปุ่มแชทซ้อนกัน
   * และบทสนทนาเด้งไปมาระหว่างสอง inbox
   */
  var chatwootAlreadyRunning =
    typeof window.$chatwoot !== 'undefined' ||
    typeof window.chatwootSDK !== 'undefined' ||
    typeof window.chatwootSettings !== 'undefined';

  /* ── หา <script> ของตัวเอง ─────────────────────────────────────────── */
  /*
   * document.currentScript ใช้ได้กับ <script defer> ปกติ แต่เป็น null เมื่อสคริปต์
   * ถูกแทรกแบบ async ด้วยโค้ดอื่น หรือถูกเรียกจาก callback — จึงต้องมีทางค้นสำรอง
   */
  function findOwnScript() {
    var current = document.currentScript;
    if (current && current.getAttribute('data-project')) return current;

    var scripts = document.getElementsByTagName('script');
    var i;
    for (i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].getAttribute('src') || '';
      if (/\/kit\/v1\/aidc-support\.js(\?|#|$)/.test(src)) return scripts[i];
    }
    /* เว็บที่ proxy ไฟล์นี้ไว้ใต้ชื่ออื่น — เอาแท็กแรกที่ระบุโครงการไว้ */
    for (i = 0; i < scripts.length; i++) {
      if (scripts[i].getAttribute('data-project')) return scripts[i];
    }
    return current || null;
  }

  var ownScript = findOwnScript();
  var projectCode = ownScript ? (ownScript.getAttribute('data-project') || '').trim() : '';
  var localeAttr = ownScript ? (ownScript.getAttribute('data-locale') || '').trim() : '';
  var positionAttr = ownScript ? (ownScript.getAttribute('data-position') || '').trim() : '';
  var position = positionAttr === 'left' ? 'left' : 'right';

  /*
   * ที่อยู่ของ Helpdesk มาจาก src ของสคริปต์เอง ไม่ใช่ค่าคงที่ในไฟล์
   *
   * ไฟล์เดียวกันนี้จึงใช้ได้ทั้ง production และ staging โดยไม่ต้องแก้อะไร
   * และเว็บที่อยู่คนละโดเมนก็ยิงกลับมาถูกที่เสมอ
   */
  function apiOrigin() {
    if (!ownScript) return '';
    try {
      return new URL(ownScript.src, window.location.href).origin;
    } catch (error) {
      return '';
    }
  }

  var origin = apiOrigin();

  /* ── คิวคำสั่งที่ถูกเรียกก่อนวิดเจ็ตพร้อม ──────────────────────────── */
  /*
   * เว็บที่มีการล็อกอินจะเรียก identify() ทันทีที่รู้ว่าใครล็อกอินอยู่ ซึ่งมักเร็วกว่า
   * ที่ SDK ของ Chatwoot จะโหลดเสร็จมาก ถ้าไม่เก็บคิวไว้ คำสั่งนั้นจะหายเงียบ
   * แล้วเจ้าหน้าที่จะเห็นบทสนทนาของ "ผู้เข้าชมนิรนาม" ทั้งที่เว็บส่งชื่อมาแล้ว
   */
  var pending = [];
  var readyCallbacks = [];
  var isReady = false;
  var isDisabled = false;

  function run(code, fn) {
    if (isDisabled) return;
    if (isReady && window.$chatwoot) {
      guard(code, function () {
        fn(window.$chatwoot);
      });
      return;
    }
    pending.push({ code: code, fn: fn });
  }

  function flush() {
    isReady = true;
    var queued = pending;
    pending = [];
    for (var i = 0; i < queued.length; i++) {
      (function (item) {
        guard(item.code, function () {
          if (window.$chatwoot) item.fn(window.$chatwoot);
        });
      })(queued[i]);
    }

    var callbacks = readyCallbacks;
    readyCallbacks = [];
    for (var j = 0; j < callbacks.length; j++) {
      (function (callback) {
        guard('onReady', function () {
          callback();
        });
      })(callbacks[j]);
    }
  }

  /*
   * ล้มเลิกอย่างสุภาพ
   *
   * ทุกคำสั่งที่เว็บเจ้าบ้านเรียกหลังจากนี้ต้องไม่ทำอะไรและไม่พัง — เว็บของเขา
   * ต้องทำงานต่อได้เหมือนไม่เคยมีสคริปต์นี้อยู่
   */
  function disable(code, message) {
    isDisabled = true;
    pending = [];
    readyCallbacks = [];
    warn(code, message);
  }

  /* ── โหลด SDK ของ Chatwoot แล้วเปิดวิดเจ็ต ─────────────────────────── */
  function start(config) {
    var chatwoot = config && config.chatwoot ? config.chatwoot : null;
    var baseUrl = chatwoot && chatwoot.base_url ? String(chatwoot.base_url).replace(/\/+$/, '') : '';
    var websiteToken = chatwoot && chatwoot.website_token ? String(chatwoot.website_token) : '';

    if (!baseUrl || !websiteToken) {
      disable('unlinked', 'โครงการ "' + projectCode + '" ยังไม่ได้เชื่อมกับ Chatwoot — แจ้งผู้ดูแล Helpdesk');
      return;
    }

    /*
     * mixed content: หน้าเว็บเป็น https แต่ Chatwoot เป็น http
     * เบราว์เซอร์จะบล็อกสคริปต์เงียบ ๆ อาการที่ผู้ใช้เห็นคือ "ปุ่มไม่ขึ้น" เฉย ๆ
     * บอกไว้ล่วงหน้าเพื่อให้คนที่เปิด console หาสาเหตุเจอภายในสิบวินาที
     */
    if (window.location.protocol === 'https:' && baseUrl.indexOf('http://') === 0) {
      warn('mixed-content', 'หน้านี้เป็น https แต่เซิร์ฟเวอร์แชทเป็น http — เบราว์เซอร์จะบล็อกวิดเจ็ต');
    }

    /*
     * ค่าเหล่านี้ต้องตั้งก่อน sdk.js โหลดเสร็จ เป็นสัญญาของ Chatwoot เอง
     * launcherTitle ว่างไว้ตั้งใจ — ปุ่มของเว็บเจ้าบ้านควรพูดภาษาของเว็บนั้น
     * ไม่ใช่ข้อความของ Helpdesk ที่โผล่ไปทับดีไซน์ของเขา
     */
    window.chatwootSettings = {
      locale: localeAttr || (config && config.locale) || 'lo',
      position: position,
      type: 'standard',
      launcherTitle: '',
    };

    window.addEventListener('chatwoot:ready', function () {
      guard('tag-visitor', function () {
        if (window.$chatwoot && typeof window.$chatwoot.setCustomAttributes === 'function') {
          window.$chatwoot.setCustomAttributes({
            project_code: projectCode,
            page_url: window.location.href,
          });
        }
      });
      flush();
    });

    var script = document.createElement('script');
    script.src = baseUrl + '/packs/js/sdk.js';
    script.async = true;
    script.onload = function () {
      guard('sdk-run', function () {
        if (window.chatwootSDK && typeof window.chatwootSDK.run === 'function') {
          window.chatwootSDK.run({ websiteToken: websiteToken, baseUrl: baseUrl });
        } else {
          disable('sdk-missing', 'โหลดสคริปต์แชทได้แต่ไม่พบตัว SDK');
        }
      });
    };
    script.onerror = function () {
      disable('sdk-blocked', 'โหลดสคริปต์แชทจาก ' + baseUrl + ' ไม่ได้ (ตัวบล็อกโฆษณา ไฟร์วอลล์ หรือ CSP ของเว็บนี้)');
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function loadConfig() {
    var url = origin + '/api/v1/public/support-projects/' + encodeURIComponent(projectCode);

    window
      .fetch(url, { method: 'GET', credentials: 'omit', mode: 'cors' })
      .then(function (response) {
        if (response.status === 404) {
          disable('unknown-project', 'ไม่รู้จักโครงการ "' + projectCode + '" หรือโครงการถูกปิดอยู่');
          return null;
        }
        if (!response.ok) {
          disable('config-error', 'ขอค่าตั้งต้นไม่สำเร็จ (HTTP ' + response.status + ')');
          return null;
        }
        return response.json();
      })
      .then(function (payload) {
        if (payload === null || isDisabled) return;
        /*
         * API ของ Helpdesk ห่อคำตอบไว้ในซอง { success, data, ... }
         * แต่รับแบบไม่ห่อไว้ด้วย เพราะไฟล์นี้ถูกติดตั้งในเว็บของทีมอื่นไปแล้ว
         * และเราอัปเดตของเขาตามไม่ได้ถ้าฝั่งเซิร์ฟเวอร์เปลี่ยนรูปแบบภายหลัง
         */
        var config = payload && payload.data ? payload.data : payload;
        start(config);
      })
      ['catch'](function (error) {
        disable('network', 'ติดต่อ Helpdesk ไม่ได้: ' + (error && error.message ? error.message : error));
      });
  }

  /* ── หน้าตาที่เว็บเจ้าบ้านเรียกใช้ ──────────────────────────────────── */
  var AIDCSupport = {
    /**
     * บอกว่าใครกำลังใช้เว็บอยู่ — สำหรับเว็บที่มีการเข้าสู่ระบบ
     *
     * hash ต้องคำนวณที่เซิร์ฟเวอร์ของเว็บนั้นด้วยกุญแจ HMAC ของ inbox
     * ห้ามฝังกุญแจไว้ในโค้ดฝั่งหน้าเว็บเด็ดขาด (ดู README)
     */
    identify: function (user) {
      if (!user || !user.identifier) {
        warn('identify-no-id', 'identify() ต้องมี identifier');
        return;
      }
      run('identify', function (chatwoot) {
        var attributes = {};
        if (user.name) attributes.name = String(user.name);
        if (user.email) attributes.email = String(user.email);
        if (user.phone) attributes.phone_number = String(user.phone);
        if (user.company) attributes.company_name = String(user.company);
        if (user.hash) attributes.identifier_hash = String(user.hash);
        chatwoot.setUser(String(user.identifier), attributes);
      });
    },

    open: function () {
      run('open', function (chatwoot) {
        chatwoot.toggle('open');
      });
    },

    close: function () {
      run('close', function (chatwoot) {
        chatwoot.toggle('close');
      });
    },

    toggle: function () {
      run('toggle', function (chatwoot) {
        chatwoot.toggle();
      });
    },

    /** เรียกตอนผู้ใช้ออกจากระบบ — ไม่งั้นคนถัดไปที่ใช้เครื่องเดียวกันเห็นแชทของคนก่อน */
    reset: function () {
      run('reset', function (chatwoot) {
        chatwoot.reset();
      });
    },

    /** เรียกเมื่อวิดเจ็ตพร้อมแล้ว — ถ้าพร้อมอยู่แล้วจะถูกเรียกทันที */
    onReady: function (callback) {
      if (typeof callback !== 'function') return;
      if (isDisabled) return;
      if (isReady) {
        guard('onReady', function () {
          callback();
        });
        return;
      }
      readyCallbacks.push(callback);
    },
  };

  /* อ่านได้อย่างเดียว — เวอร์ชันที่ถูกเขียนทับได้ทำให้รายงานปัญหาเชื่อถือไม่ได้ */
  try {
    Object.defineProperty(AIDCSupport, 'version', {
      value: VERSION,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  } catch (error) {
    AIDCSupport.version = VERSION;
  }

  window.AIDCSupport = AIDCSupport;

  /* ── ตรวจเงื่อนไขก่อนเริ่ม ─────────────────────────────────────────── */
  if (chatwootAlreadyRunning) {
    disable('chatwoot-exists', 'หน้านี้มีวิดเจ็ตแชทของตัวเองอยู่แล้ว — ข้ามการติดตั้งของ Helpdesk');
  } else if (!ownScript) {
    disable('no-script-tag', 'หาแท็ก <script> ของตัวเองไม่พบ');
  } else if (!projectCode) {
    disable('no-project', 'ต้องระบุ data-project ในแท็ก <script>');
  } else if (!/^[A-Z0-9_]{2,40}$/.test(projectCode)) {
    disable('bad-project', 'รหัสโครงการ "' + projectCode + '" ผิดรูปแบบ (ต้องเป็น A-Z, 0-9, _ จำนวน 2-40 ตัว)');
  } else if (!origin) {
    disable('no-origin', 'อ่านที่อยู่ Helpdesk จาก src ของสคริปต์ไม่ได้');
  } else if (typeof window.fetch !== 'function') {
    disable('no-fetch', 'เบราว์เซอร์นี้เก่าเกินไป (ไม่มี fetch)');
  } else {
    guard('start', loadConfig);
  }
})();
