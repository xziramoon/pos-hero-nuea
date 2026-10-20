// renderer/hero-sprite.js — เอนจิ้นเล่นเฟรมสไปรต์ "น้องวง" + สายต่อ event
//
// อ่านเฟรมจาก renderer/assets/sprite-hero.png (สร้างจาก build/make-hero-sprite.js)
// ครอบ window.celebrateTransaction ที่ hero-chrome.js ประกาศไว้ และฟัง
// #miniPbLed เพื่อสลับท่าพื้นฐานตามสถานะการเชื่อมต่อมือถือ (Pushbullet) — ไม่แตะ renderer/app.js

(function () {
    var SCALE = 2;
    var FRAME = 24;

    // แถว, จำนวนเฟรม, fps, วนหรือไม่ — ต้องตรงกับลำดับแถวใน build/make-hero-sprite.js
    var ANIMS = {
        idle:  { row: 0, frames: 8,  fps: 8,  loop: true },
        cheer: { row: 1, frames: 12, fps: 12, loop: false },
        nod:   { row: 2, frames: 6,  fps: 12, loop: false },
        sleep: { row: 3, frames: 4,  fps: 3,  loop: true },
        sweat: { row: 4, frames: 6,  fps: 10, loop: false },
    };
    // ลำดับความสำคัญของท่าครั้งเดียว — ยิ่งมากยิ่งสำคัญ
    var ONE_SHOT_PRIORITY = { cheer: 3, sweat: 2, nod: 1 };

    var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var baseName = 'idle';
    var currentName = 'idle';
    var currentFrame = 0;
    var timer = null;
    var running = false;

    function coinEl() {
        return document.querySelector('.mini-coin');
    }

    function paint() {
        var el = coinEl();
        if (!el) return;
        var anim = ANIMS[currentName];
        var x = -(currentFrame * FRAME * SCALE);
        var y = -(anim.row * FRAME * SCALE);
        el.style.backgroundPosition = x + 'px ' + y + 'px';
    }

    function stopTimer() {
        if (timer) { clearTimeout(timer); timer = null; }
    }

    function scheduleNext() {
        var anim = ANIMS[currentName];
        stopTimer();
        if (!running) return;
        timer = setTimeout(step, Math.round(1000 / anim.fps));
    }

    function step() {
        var anim = ANIMS[currentName];
        currentFrame++;
        if (currentFrame >= anim.frames) {
            if (anim.loop) {
                currentFrame = 0;
            } else {
                // ท่าครั้งเดียวเล่นจบ -> กลับไปท่าพื้นฐาน
                currentName = baseName;
                currentFrame = 0;
                paint();
                scheduleNext();
                return;
            }
        }
        paint();
        scheduleNext();
    }

    function stop() {
        running = false;
        stopTimer();
    }

    function isOneShot(name) {
        return Object.prototype.hasOwnProperty.call(ONE_SHOT_PRIORITY, name);
    }

    function play(name) {
        if (!ANIMS[name] || !isOneShot(name)) return;
        if (!coinEl()) return;
        // ไม่อยู่โหมดจิ๋ว (timer หยุดอยู่) — ไม่เล่นและไม่เก็บคิวไว้เล่นทีหลัง
        if (!running) return;
        if (reducedMotion) return; // แสดงเฟรมแรกของท่าพื้นฐานค้างไว้เสมอ
        if (isOneShot(currentName) && currentName !== baseName) {
            // มีท่าครั้งเดียวเล่นอยู่ — เริ่มใหม่เฉพาะเมื่อสำคัญเท่ากันหรือมากกว่า
            if (ONE_SHOT_PRIORITY[name] < ONE_SHOT_PRIORITY[currentName]) return;
        }
        currentName = name;
        currentFrame = 0;
        paint();
        scheduleNext();
    }

    function setBase(name) {
        if (!ANIMS[name] || isOneShot(name)) return;
        baseName = name;
        if (!isOneShot(currentName) || currentName === baseName) {
            currentName = baseName;
            currentFrame = 0;
            paint();
        }
    }

    function current() {
        return currentName;
    }

    window.heroSprite = {
        play: play,
        setBase: setBase,
        current: current,
    };

    // -----------------------------------------------------------
    // เปิด/ปิด timer ตาม body.mini-mode เท่านั้น — ห้ามให้ setTimeout
    // วิ่งตลอดเวลาตอนอยู่โหมดเต็มจอ เพราะ main.js ตั้ง
    // backgroundThrottling: false ไว้
    // -----------------------------------------------------------
    function inMiniMode() {
        return document.body.classList.contains('mini-mode');
    }

    function syncMiniMode() {
        if (inMiniMode()) {
            if (!coinEl()) return;
            running = true;
            currentName = baseName;
            currentFrame = 0;
            paint();
            if (!reducedMotion) scheduleNext();
        } else {
            stop();
        }
    }

    if (document.body) {
        var mo = new MutationObserver(syncMiniMode);
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        syncMiniMode();
    }

    // -----------------------------------------------------------
    // ครอบ celebrateTransaction (ของเดิมประกาศใน hero-chrome.js)
    // -----------------------------------------------------------
    function lastRecordIsExpense() {
        try {
            var raw = localStorage.getItem('posUltimateRecords');
            if (!raw) return false;
            var records = JSON.parse(raw);
            if (!Array.isArray(records) || !records.length) return false;
            return records[records.length - 1].type === 'expense';
        } catch (e) {
            return false;
        }
    }

    var orig = window.celebrateTransaction;
    if (typeof orig === 'function') {
        window.celebrateTransaction = function (amount, opts) {
            orig.apply(this, arguments);
            if (opts && opts.moneyIn) { heroSprite.play('cheer'); return; }
            heroSprite.play(lastRecordIsExpense() ? 'sweat' : 'nod');
        };
    }

    // -----------------------------------------------------------
    // สถานะการเชื่อมต่อมือถือ (Pushbullet): #miniPbLed มี class ok/warn/err — err = หลับ
    // -----------------------------------------------------------
    function syncPbState() {
        var led = document.getElementById('miniPbLed');
        var isErr = !!(led && led.classList.contains('err'));
        heroSprite.setBase(isErr ? 'sleep' : 'idle');
    }

    var led = document.getElementById('miniPbLed');
    if (led) {
        var ledObserver = new MutationObserver(syncPbState);
        ledObserver.observe(led, { attributes: true, attributeFilter: ['class'] });
    }
    syncPbState();
})();
