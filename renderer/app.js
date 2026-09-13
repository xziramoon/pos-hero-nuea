        // ================================================================
        // [FIX #1] ลบสคริปต์ซ้ำซ้อน — รวมโค้ดทุกอย่างไว้ใน script เดียว
        // ================================================================

        // ==========================================
        // ส่วนที่ 1: Global Event Listeners (ไม่เปลี่ยนแปลง)
        // ==========================================
        document.addEventListener('wheel', function(event) {
            if (document.activeElement.type === 'number') document.activeElement.blur();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const activeElem = document.activeElement;
                if (activeElem && activeElem.classList.contains('num-input')) {
                    e.preventDefault();
                    const currentModal = activeElem.closest('.modal-content');
                    if (currentModal) {
                        const inputs = Array.from(currentModal.querySelectorAll('.num-input'));
                        const currentIndex = inputs.indexOf(activeElem);
                        if (currentIndex > -1 && currentIndex < inputs.length - 1) inputs[currentIndex + 1].focus();
                        else activeElem.blur();
                    }
                }
            }
        });

        // Escape key closes all modals
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
        });

        // ==========================================
        // ส่วนที่ 2: ตัวแปร Global และ localStorage
        // ==========================================
        let records = [];
        let currentFilter = 'all';
        try { let rawData = JSON.parse(localStorage.getItem('posUltimateRecords')); records = Array.isArray(rawData) ? rawData : []; } catch(e) { records = []; }
        let headerData = {};
        try { headerData = JSON.parse(localStorage.getItem('posUltimateHeader')) || {}; } catch(e) { headerData = {}; }

        document.getElementById('headDate').innerText = new Date().toLocaleDateString('th-TH');
        document.getElementById('headPos').value = headerData.pos || '';
        document.getElementById('headCashier').value = headerData.cashier || '';

        // ✨ v5: ตรวจจับข้อมูลค้างจากวันก่อน (New Day Guard)
        (function newDayGuard() {
            const todayKey = new Date().toLocaleDateString('th-TH');
            const savedDate = localStorage.getItem('posUltimateDate') || '';
            if (records.length > 0 && savedDate && savedDate !== todayKey) {
                if (confirm('⚠️ พบข้อมูลของวันก่อน (' + savedDate + ') ค้างอยู่ ' + records.length + ' รายการ\n\nกด OK = สำรองเป็นไฟล์ + เริ่มวันใหม่\nกด Cancel = ใช้ข้อมูลเดิมต่อ')) {
                    backupData(savedDate);
                    records = [];
                    localStorage.removeItem('posUltimateRecords');
                }
            }
            localStorage.setItem('posUltimateDate', todayKey);
        })();

        function saveHeader() { localStorage.setItem('posUltimateHeader', JSON.stringify({ pos: document.getElementById('headPos').value, cashier: document.getElementById('headCashier').value })); }
        function escapeHTML(str) { return (str||'-').toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }

        // ==========================================
        // ส่วนที่ 3: handleTypeChange — [FIX] รวมจาก Override Patch
        // [FIX #2] ช่องกรอกชื่อไม่หายเมื่อเลือก "โอน" + โฟกัสถูกช่อง
        // ==========================================
        function handleTypeChange() {
            const type = document.querySelector('input[name="payType"]:checked').value;
            const nameInput = document.getElementById('inputName');
            const amtInput = document.getElementById('inputAmount');

            // [FIX] บังคับให้ช่องกรอกชื่อแสดงผลเสมอ (เดิมโค้ดเก่าซ่อนตอนเลือก "โอน")
            nameInput.style.display = 'block';

            if (type === 'transfer') {
                nameInput.value = '';
                nameInput.placeholder = "ชื่อผู้โอน / รายการ...";
                amtInput.placeholder = "ยอดเงินโอน...";
            } else if (type === 'thaiplus') {
                nameInput.value = '';
                nameInput.placeholder = "ชื่อลูกค้า (ถ้ามี)...";
                amtInput.placeholder = "ยอดสแกน...";
            } else {
                nameInput.value = '';
                nameInput.placeholder = "ระบุรายการ...";
                amtInput.placeholder = "0";
            }

            // [FIX] โฟกัสไปที่ช่องกรอกชื่อเสมอเพื่อความลื่นไหล
            nameInput.focus();
        }

        document.getElementById('inputAmount').addEventListener("keypress", function(e) { if (e.key === "Enter" && !e.target.classList.contains('num-input')) saveRecord(); });
        document.getElementById('inputName').addEventListener("keypress", function(e) { if (e.key === "Enter" && this.value.trim() !== "") document.getElementById('inputAmount').focus(); });

        // ==========================================
        // ส่วนที่ 4: saveRecord — [FIX] รวมจาก Override Patch
        // [FIX #3] ไม่แทรก Tag "(ไทยพลัส)" ซ้ำในชื่อ + ชื่อสั้นกระชับ
        // ==========================================
        function saveRecord() {
            const amtIn = document.getElementById('inputAmount');
            const nameIn = document.getElementById('inputName');
            const type = document.querySelector('input[name="payType"]:checked').value;
            const amount = parseFloat(amtIn.value);
            let rawName = nameIn.value.trim();

            if (isNaN(amount) || amount <= 0) return;

            // [FIX] ตั้งชื่อรายการให้สั้นกระชับ ไม่ต่อท้ายประเภท
            let finalName = rawName !== "" ? rawName : (type === 'transfer' ? "ลูกค้าโอนเงิน" : "ลูกค้าทั่วไป");

            records.push({
                time: new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}),
                type: type,
                name: finalName,
                amount: amount,
                isEdited: false
            });

            localStorage.setItem('posUltimateDate', new Date().toLocaleDateString('th-TH'));
            localStorage.setItem('posUltimateRecords', JSON.stringify(records));
            renderTable();
            if (typeof celebrateTransaction === 'function') celebrateTransaction(amount, { moneyIn: false });

            amtIn.value = '';
            nameIn.value = '';
            nameIn.focus();
        }

        // ==========================================
        // ส่วนที่ 5: Undo / Delete / Edit
        // ==========================================
        let undoStack = [];
        let undoTimer = null;
        function deleteRecord(index) {
            const removed = records.splice(index, 1)[0];
            if (!removed) return;
            undoStack.push({ record: removed, index: index });
            localStorage.setItem('posUltimateRecords', JSON.stringify(records));
            renderTable();
            document.getElementById('undoToastMsg').innerText = 'ลบ "' + (removed.name || '-') + '" ' + (parseFloat(removed.amount)||0).toLocaleString('en-US') + ' ฿ แล้ว';
            document.getElementById('undoToast').classList.add('show');
            clearTimeout(undoTimer);
            undoTimer = setTimeout(hideUndoToast, 6000);
        }
        function hideUndoToast() { document.getElementById('undoToast').classList.remove('show'); undoStack = []; }
        function undoDelete() {
            const last = undoStack.pop();
            if (last) {
                records.splice(Math.min(last.index, records.length), 0, last.record);
                localStorage.setItem('posUltimateRecords', JSON.stringify(records));
                renderTable();
            }
            clearTimeout(undoTimer);
            hideUndoToast();
        }

        function editAmount(index) {
            const r = records[index];
            if (!r) return;
            const input = prompt('✏️ แก้ไขยอดเงินของ "' + (r.name || '-') + '"', r.amount);
            if (input === null) return;
            const val = parseFloat(input);
            if (isNaN(val) || val <= 0) { alert('⚠️ ยอดเงินไม่ถูกต้อง'); return; }
            r.amount = val;
            r.isEdited = true;
            localStorage.setItem('posUltimateRecords', JSON.stringify(records));
            renderTable();
        }

        function editName(index) {
            const r = records[index];
            if (!r) return;
            const input = prompt('✏️ แก้ไขชื่อรายการ', r.name || '-');
            if (input === null) return;
            let newName = input.trim();
            if (newName === '') newName = '-';
            r.name = newName;
            r.isEdited = true;
            localStorage.setItem('posUltimateRecords', JSON.stringify(records));
            renderTable();
        }

        function resetAll() {
            if (!confirm('⚠️ ล้างข้อมูลเริ่มกะใหม่?')) return;
            if (records.length > 0 && confirm('💾 ต้องการสำรองข้อมูลเป็นไฟล์ก่อนล้างหรือไม่?')) backupData();
            records = [];
            localStorage.removeItem('posUltimateRecords');
            localStorage.removeItem('posUltimateRecon');
            hideUndoToast();
            renderTable();
        }

        // ==========================================
        // ส่วนที่ 6: สำรอง / กู้คืนข้อมูล
        // ==========================================
        function backupData(labelDate) {
            if (records.length === 0) { alert('⚠️ ไม่มีข้อมูลสำหรับสำรอง'); return; }
            const dateLabel = labelDate || document.getElementById('headDate').innerText;
            const payload = {
                app: 'POS-Reconciliations',
                date: dateLabel,
                exportedAt: new Date().toISOString(),
                header: { pos: document.getElementById('headPos').value, cashier: document.getElementById('headCashier').value },
                records: records
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'POS_Backup_' + dateLabel.replace(/\//g, '-') + '_' + new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}).replace(':','') + '.json';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        function restoreData(ev) {
            const file = ev.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    const recs = Array.isArray(data) ? data : data.records;
                    if (!Array.isArray(recs)) throw new Error('invalid');
                    if (!confirm('📂 พบ ' + recs.length + ' รายการในไฟล์สำรอง\nต้องการแทนที่ข้อมูลปัจจุบัน (' + records.length + ' รายการ) หรือไม่?')) { ev.target.value = ''; return; }
                    records = recs;
                    localStorage.setItem('posUltimateRecords', JSON.stringify(records));
                    if (data.header) {
                        if (data.header.pos) document.getElementById('headPos').value = data.header.pos;
                        if (data.header.cashier) document.getElementById('headCashier').value = data.header.cashier;
                        saveHeader();
                    }
                    renderTable();
                    alert('✅ กู้คืนข้อมูลสำเร็จ ' + records.length + ' รายการ');
                } catch (err) { alert('❌ ไฟล์สำรองไม่ถูกต้อง'); }
                ev.target.value = '';
            };
            reader.readAsText(file);
        }

        // ==========================================
        // ส่วนที่ 7: Filter + Render Table
        // ==========================================
        function setFilter(type) {
            currentFilter = type;
            document.querySelectorAll('.filter-tab').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + type).classList.add('active');
            renderTable();
        }

        function renderTable() {
            const tbody = document.getElementById('tableBody');
            let t=0, w=0, tp=0, e=0, cT=0, cW=0, cP=0, cE=0;

            records.forEach(r => {
                const amt = Math.round((parseFloat(r.amount) || 0) * 100);
                if (r.type === 'transfer') { t += amt; cT++; }
                else if (r.type === 'welfare') { w += amt; cW++; }
                else if (r.type === 'thaiplus') { tp += amt; cP++; }
                else { e += amt; cE++; }
            });

            tbody.innerHTML = records.map((r, i) => { return {...r, originalIndex: i}; })
                .filter(r => currentFilter === 'all' || r.type === currentFilter)
                .map((r) => {
                    let badge = r.type==='transfer' ? '<span class="badge bg-tr">โอน</span>' : r.type==='welfare' ? '<span class="badge bg-wel">บัตร</span>' : r.type==='thaiplus' ? '<span class="badge bg-thaiplus">ไทยพลัส</span>' : '<span class="badge bg-exp">จ่าย</span>';
                    let cls = r.type==='transfer' ? 'row-transfer' : r.type==='welfare' ? 'row-welfare' : r.type==='thaiplus' ? 'row-thaiplus' : 'row-expense';
                    let editedMark = r.isEdited ? '<span class="edited-mark">✎</span>' : '';
                    return '<tr class="' + cls + '"><td style="text-align:center; color:#ccc;">' + (r.originalIndex+1) + '</td><td style="font-size:12px; color:#666;">' + r.time + '</td><td style="text-align:center;">' + badge + '</td><td class="name-editable" onclick="editName(' + r.originalIndex + ')" title="แตะเพื่อแก้ไขชื่อ">' + escapeHTML(r.name) + editedMark + '</td><td class="amt-editable" style="text-align:right; font-weight:bold;" onclick="editAmount(' + r.originalIndex + ')" title="แตะเพื่อแก้ไขยอด">' + (parseFloat(r.amount)||0).toLocaleString('en-US') + '</td><td class="no-print" style="text-align:center;"><span class="action-btn" style="color:red;" onclick="deleteRecord(' + r.originalIndex + ')">×</span></td></tr>';
                }).join('');

            document.getElementById('sumTransfer').innerText = (t/100).toLocaleString('en-US');
            document.getElementById('sumWelfare').innerText = (w/100).toLocaleString('en-US');
            document.getElementById('sumThaiPlus').innerText = (tp/100).toLocaleString('en-US');
            document.getElementById('sumExpense').innerText = (e/100).toLocaleString('en-US');
            document.getElementById('sumNet').innerText = ((t+w+tp)/100).toLocaleString('en-US');
            updateTabCounts(cT, cW, cP, cE);
            updateMiniWidget(records, (t+w+tp)/100);
        }

        // เติมข้อมูลให้วิดเจ็ตจิ๋ว (โหมดย่อ) ไม่ว่าจะกำลังโชว์อยู่หรือไม่ก็ตาม
        // เพื่อให้พร้อมข้อมูลล่าสุดทันทีที่ผู้ใช้กดย่อหน้าจอ
        function updateMiniWidget(recs, netTotal) {
            var miniSum = document.getElementById('miniSumNet');
            var miniLast = document.getElementById('miniLastTx');
            if (!miniSum || !miniLast) return;
            miniSum.textContent = netTotal.toLocaleString('en-US');
            if (recs && recs.length > 0) {
                var last = recs[recs.length - 1];
                var amt = (parseFloat(last.amount) || 0).toLocaleString('en-US');
                miniLast.textContent = '+' + amt + ' ฿ ' + escapeHTML(last.name || '-');
            } else {
                miniLast.textContent = '— ยังไม่มีรายการ —';
            }
        }

        function setTabLabel(id, text, count) {
            document.getElementById(id).innerHTML = count > 0 ? text + '<span class="tab-count">' + count + '</span>' : text;
        }
        function updateTabCounts(cT, cW, cP, cE) {
            setTabLabel('tab-all', 'ทั้งหมด', cT + cW + cP + cE);
            setTabLabel('tab-transfer', 'โอน', cT);
            setTabLabel('tab-welfare', 'บัตรรัฐ', cW);
            setTabLabel('tab-thaiplus', 'ไทยพลัส', cP);
            setTabLabel('tab-expense', 'ค่าใช้จ่าย', cE);
        }

        // ==========================================
        // ส่วนที่ 8: นับลิ้นชัก + แลกเงิน + Export
        // ==========================================
        const denoms = [ { val: 1000, label: 'แบงก์ 1000', exLabel: '1000' }, { val: 500, label: 'แบงก์ 500', exLabel: '500' }, { val: 100, label: 'แบงก์ 100', exLabel: '100' }, { val: 50, label: 'แบงก์ 50', exLabel: '50' }, { val: 20, label: 'แบงก์ 20', exLabel: '20' }, { val: 10, label: 'เหรียญ 10', exLabel: 'เหรียญ 10' }, { val: 5, label: 'เหรียญ 5', exLabel: 'เหรียญ 5' }, { val: 2, label: 'เหรียญ 2', exLabel: 'เหรียญ 2' }, { val: 1, label: 'เหรียญ 1', exLabel: 'เหรียญ 1' } ];

        function openManualModal() { document.getElementById('manualModal').style.display = 'flex'; }
        function closeManualModal() { document.getElementById('manualModal').style.display = 'none'; }

        const STARTING_FLOAT = 7000;
        function initDrawerTable() { document.getElementById('drawerTableBody').innerHTML = denoms.map(d => '<tr><td>' + d.label + '</td><td style="text-align:center;"><input type="number" id="dr_qty_' + d.val + '" class="num-input" min="0" oninput="calcDrawer()"></td><td class="val-display" id="dr_val_' + d.val + '">0</td></tr>').join(''); }
        function openDrawerModal() { let totalExpense = 0; records.forEach(r => { if(r.type === 'expense') totalExpense += (parseFloat(r.amount)||0); }); document.getElementById('dsExpense').innerText = '-' + totalExpense.toLocaleString('en-US'); document.getElementById('drawerModal').dataset.expense = totalExpense; document.getElementById('dsCashSales').value = ''; document.getElementById('dsOffBill').value = ''; denoms.forEach(d => { document.getElementById('dr_qty_' + d.val).value = ''; document.getElementById('dr_val_' + d.val).innerText = '0'; }); calcDrawer(); document.getElementById('drawerModal').style.display = 'flex'; }
        function closeDrawerModal() { document.getElementById('drawerModal').style.display = 'none'; }

        function calcDrawer() {
            let actualCash = 0;
            denoms.forEach(d => { let qty = parseInt(document.getElementById('dr_qty_' + d.val).value) || 0; let val = qty * d.val; document.getElementById('dr_val_' + d.val).innerText = val.toLocaleString('en-US'); actualCash += val; });
            document.getElementById('dsActual').innerText = actualCash.toLocaleString('en-US');
            let totalExpense = parseFloat(document.getElementById('drawerModal').dataset.expense) || 0;
            let cashSales = parseFloat(document.getElementById('dsCashSales').value) || 0;
            let offBillSales = parseFloat(document.getElementById('dsOffBill').value) || 0;
            let expectedCash = STARTING_FLOAT + cashSales - totalExpense - offBillSales;
            document.getElementById('dsExpected').innerText = expectedCash.toLocaleString('en-US');
            let diff = actualCash - expectedCash;
            let diffBox = document.getElementById('dsDiffBox');
            let btn = document.getElementById('btnDrSubmit');
            if (actualCash === 0 && cashSales === 0 && offBillSales === 0) { diffBox.className = 'ds-diff status-short'; diffBox.innerText = 'รอการนับเงิน...'; btn.disabled = true; }
            else { btn.disabled = false; if (diff === 0) { diffBox.className = 'ds-diff status-ok'; diffBox.innerHTML = '✅ ยอดเงินตรงเป๊ะ (Match)'; } else if (diff > 0) { diffBox.className = 'ds-diff status-over'; diffBox.innerHTML = '🟡 เงินเกิน: +' + diff.toLocaleString('en-US') + ' บาท'; } else { diffBox.className = 'ds-diff status-short'; diffBox.innerHTML = '🔴 เงินขาด: ' + diff.toLocaleString('en-US') + ' บาท'; } }
        }

        function clearPrintClasses() { document.body.classList.remove('printing-drawer', 'printing-exchange', 'print-summary-only', 'printing-recon'); }
        function printMain() { clearPrintClasses(); heroPrint(); }

        function executePrintDrawer() {
            clearPrintClasses();
            const now = new Date();
            document.getElementById('slipDrDate').innerText = document.getElementById('headDate').innerText;
            document.getElementById('slipDrTime').innerText = now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            document.getElementById('slipDrCashier').innerText = document.getElementById('headCashier').value || 'ไม่ระบุชื่อ';
            let tbody = '';
            denoms.forEach(d => { let qty = parseInt(document.getElementById('dr_qty_' + d.val).value) || 0; if(qty > 0) tbody += '<tr><td>' + d.label + '</td><td>' + qty + '</td><td>' + (qty * d.val).toLocaleString('en-US') + '</td></tr>'; });
            document.getElementById('slipDrBody').innerHTML = tbody;
            let cashSales = parseFloat(document.getElementById('dsCashSales').value) || 0;
            document.getElementById('slipDrSales').innerText = cashSales.toLocaleString('en-US');
            let offBillSales = parseFloat(document.getElementById('dsOffBill').value) || 0;
            document.getElementById('slipDrOffBill').innerText = '-' + offBillSales.toLocaleString('en-US');
            document.getElementById('slipDrExpense').innerText = document.getElementById('dsExpense').innerText;
            document.getElementById('slipDrExpected').innerText = document.getElementById('dsExpected').innerText;
            document.getElementById('slipDrActual').innerText = document.getElementById('dsActual').innerText;
            document.getElementById('slipDrDiff').innerText = document.getElementById('dsDiffBox').innerText.replace(/[✅🟡🔴]/g, '').trim();
            document.body.classList.add('printing-drawer');
            closeDrawerModal();
            heroPrint();
        }

        function initExchangeTable() { document.getElementById('exchangeTableBody').innerHTML = denoms.filter(d=>d.val<1000).map(d => '<tr><td>' + d.exLabel + '</td><td style="text-align:right;"><input type="number" id="ex_' + d.val + '" class="num-input" style="width: 100px; text-align:right;" placeholder="0" oninput="calcExchange()"></td></tr>').join(''); }
        function openExchangeModal() { denoms.filter(d=>d.val<1000).forEach(d => document.getElementById('ex_' + d.val).value = ''); calcExchange(); document.getElementById('exchangeModal').style.display = 'flex'; }
        function closeExchangeModal() { document.getElementById('exchangeModal').style.display = 'none'; }
        function calcExchange() { let total = 0; denoms.filter(d=>d.val<1000).forEach(d => { total += parseFloat(document.getElementById('ex_' + d.val).value) || 0; }); document.getElementById('exTotalTxt').innerText = total.toLocaleString('en-US'); document.getElementById('btnExSubmit').disabled = (total <= 0); }

        function executePrintExchange() {
            clearPrintClasses();
            const now = new Date();
            document.getElementById('slipExDate').innerText = document.getElementById('headDate').innerText;
            document.getElementById('slipExTime').innerText = now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            document.getElementById('slipExCashier').innerText = document.getElementById('headCashier').value || 'ไม่ระบุชื่อ';
            let tbody = ''; let totalAmount = 0;
            denoms.filter(d=>d.val<1000).forEach(d => { let val = parseFloat(document.getElementById('ex_' + d.val).value) || 0; if(val > 0) { tbody += '<tr><td>' + d.exLabel + '</td><td style="text-align:right;">' + val.toLocaleString('en-US') + '</td></tr>'; totalAmount += val; } });
            document.getElementById('slipExBody').innerHTML = tbody;
            document.getElementById('slipExTotalVal').innerText = totalAmount.toLocaleString('en-US');
            document.body.classList.add('printing-exchange');
            closeExchangeModal();
            heroPrint();
        }

        function exportToExcel() {
            if(records.length === 0) { alert('⚠️ ไม่มีข้อมูลสำหรับ Export'); return; }
            let t = 0, w = 0, tp = 0, e = 0;
            records.forEach(r => { let amt = Math.round((parseFloat(r.amount) || 0) * 100); if(r.type === 'transfer') t += amt; else if(r.type === 'welfare') w += amt; else if(r.type === 'thaiplus') tp += amt; else e += amt; });
            let dateStr = document.getElementById('headDate').innerText, cashier = document.getElementById('headCashier').value || 'ไม่ระบุชื่อ';
            let html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>table{border-collapse:collapse;}th{background:#eee;border:1px solid #000;}td{border:1px solid #ccc;padding:5px;}.bg-g{background:#d1fae5;}.bg-b{background:#e0f2fe;}.bg-tp{background:#E4F4EC;}.bg-r{background:#fee2e2;}</style></head><body><h3>รายงานยอดขาย ' + dateStr + ' (แคชเชียร์: ' + escapeHTML(cashier) + ')</h3><table><thead><tr><th>เวลา</th><th>ประเภท</th><th>รายการ</th><th>ยอดเงิน</th></tr></thead><tbody>';
            records.forEach(rec => { let bg = rec.type === 'transfer' ? 'bg-g' : (rec.type === 'welfare' ? 'bg-b' : (rec.type === 'thaiplus' ? 'bg-tp' : 'bg-r')); let typeText = rec.type === 'thaiplus' ? 'ไทยพลัส' : rec.type; html += '<tr><td class="' + bg + '">' + rec.time + '</td><td class="' + bg + '">' + typeText + '</td><td class="' + bg + '">' + escapeHTML(rec.name) + '</td><td class="' + bg + '" style="text-align:right;">' + (parseFloat(rec.amount) || 0).toLocaleString('en-US') + '</td></tr>'; });
            html += '</tbody></table><br><table border="1"><tr><td>โอน:</td><td>' + (t/100).toLocaleString('en-US') + '</td></tr><tr><td>บัตร:</td><td>' + (w/100).toLocaleString('en-US') + '</td></tr><tr><td>ไทยพลัส:</td><td>' + (tp/100).toLocaleString('en-US') + '</td></tr><tr><td>ค่าใช้จ่าย:</td><td>' + (e/100).toLocaleString('en-US') + '</td></tr><tr><td>สุทธิ:</td><td>' + ((t+w+tp)/100).toLocaleString('en-US') + '</td></tr></table></body></html>';
            const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'POS_Report_' + dateStr.replace(/\//g, '-') + '.xls';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }

        // ==========================================
        // ส่วนที่ 9: กระทบยอดเงินดิจิทัล (Reconciliation)
        // ==========================================
        // [FIX #12] ค่าที่กรอกในช่องกระทบยอด (รวมถึงยอดที่ Pushbullet เติมให้อัตโนมัติ)
        // ไม่เคยถูกบันทึกไว้ที่ไหนเลย พอปิด/เปิด Modal ใหม่ค่าที่เคยเติมไว้เลยหายหมด
        // → บันทึกลง localStorage ทุกครั้งที่มีการคำนวณ แล้วโหลดกลับมาตอนเปิด Modal (เฉพาะวันเดียวกัน)
        function saveReconInputs() {
            localStorage.setItem('posUltimateRecon', JSON.stringify({
                date: new Date().toLocaleDateString('th-TH'),
                pos2: document.getElementById('reconPos2').value,
                bank1: document.getElementById('reconBank1').value,
                bank2: document.getElementById('reconBank2').value,
                paotang: document.getElementById('reconPaotang').value
            }));
        }
        function loadReconInputs() {
            try {
                const data = JSON.parse(localStorage.getItem('posUltimateRecon'));
                if (data && data.date === new Date().toLocaleDateString('th-TH')) return data;
            } catch(e) {}
            return null;
        }

        function openReconModal() {
            let t = 0;
            records.forEach(r => { if(r.type === 'transfer') { t += Math.round((parseFloat(r.amount) || 0) * 100); } });
            let currentPosTransfer = t / 100;
            document.getElementById('reconPos1Transfer').value = currentPosTransfer > 0 ? currentPosTransfer : '';
            const saved = loadReconInputs();
            document.getElementById('reconPos2').value = saved ? saved.pos2 : '';
            document.getElementById('reconBank1').value = saved ? saved.bank1 : '';
            document.getElementById('reconBank2').value = saved ? saved.bank2 : '';
            document.getElementById('reconPaotang').value = saved ? saved.paotang : '';
            calcRecon();
            document.getElementById('reconModal').style.display = 'flex';
            // [FIX #5] ออโต้คอนเน็กต์ WebSocket เมื่อเปิด Modal กระทบยอด
            if (pbToken && !pbWs) { setTimeout(connectPushbullet, 400); }
        }
        function closeReconModal() { document.getElementById('reconModal').style.display = 'none'; }

        function calcRecon() {
            saveReconInputs();
            let p1 = parseFloat(document.getElementById('reconPos1Transfer').value) || 0;
            let p2 = parseFloat(document.getElementById('reconPos2').value) || 0;
            let totalPos = p1 + p2;
            document.getElementById('reconPosTotal').innerText = totalPos.toLocaleString('en-US');
            let b1 = parseFloat(document.getElementById('reconBank1').value) || 0;
            let b2 = parseFloat(document.getElementById('reconBank2').value) || 0;
            let pt = parseFloat(document.getElementById('reconPaotang').value) || 0;
            let totalBank = b1 + b2 + pt;
            document.getElementById('reconBankTotal').innerText = totalBank.toLocaleString('en-US');
            let diff = totalBank - totalPos;
            let diffBox = document.getElementById('reconDiffBox');
            let btn = document.getElementById('btnReconSubmit');
            if (totalPos === 0 && totalBank === 0) { diffBox.className = 'ds-diff status-short'; diffBox.innerText = 'รอป้อนข้อมูล...'; btn.disabled = true; }
            else { btn.disabled = false; if (diff === 0) { diffBox.className = 'ds-diff status-ok'; diffBox.innerHTML = '✅ ยอดเงินเข้าบัญชี <b>ตรงเป๊ะ</b> (Match)'; } else if (diff > 0) { diffBox.className = 'ds-diff status-over'; diffBox.innerHTML = '🟡 เงินเข้าเกิน: เข้าบัญชีมากกว่า POS <b>+' + diff.toLocaleString('en-US') + '</b> บาท'; } else { diffBox.className = 'ds-diff status-short'; diffBox.innerHTML = '🔴 เงินเข้าขาด: เข้าบัญชีน้อยกว่า POS <b>' + diff.toLocaleString('en-US') + '</b> บาท'; } }
        }

        function executePrintRecon() {
            clearPrintClasses();
            const now = new Date();
            document.getElementById('slipRcDate').innerText = document.getElementById('headDate').innerText;
            document.getElementById('slipRcTime').innerText = now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            document.getElementById('slipRcCashier').innerText = document.getElementById('headCashier').value || 'ไม่ระบุชื่อ';
            document.getElementById('slipRcPos1Transfer').innerText = (parseFloat(document.getElementById('reconPos1Transfer').value) || 0).toLocaleString('en-US');
            document.getElementById('slipRcPos2').innerText = (parseFloat(document.getElementById('reconPos2').value) || 0).toLocaleString('en-US');
            document.getElementById('slipRcPosTotal').innerText = document.getElementById('reconPosTotal').innerText;
            document.getElementById('slipRcBank1').innerText = (parseFloat(document.getElementById('reconBank1').value) || 0).toLocaleString('en-US');
            document.getElementById('slipRcBank2').innerText = (parseFloat(document.getElementById('reconBank2').value) || 0).toLocaleString('en-US');
            document.getElementById('slipRcPaotang').innerText = (parseFloat(document.getElementById('reconPaotang').value) || 0).toLocaleString('en-US');
            document.getElementById('slipRcBankTotal').innerText = document.getElementById('reconBankTotal').innerText;
            document.getElementById('slipRcDiff').innerText = document.getElementById('reconDiffBox').innerText.replace(/[✅🟡🔴]/g, '').trim();
            document.body.classList.add('printing-recon');
            closeReconModal();
            heroPrint();
        }

        function printSummaryOnly() {
            clearPrintClasses();
            const now = new Date();
            document.getElementById('slipSumDate').innerText = document.getElementById('headDate').innerText;
            document.getElementById('slipSumTime').innerText = now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
            document.getElementById('slipSumPos').innerText = document.getElementById('headPos').value || '01';
            document.getElementById('slipSumCashier').innerText = document.getElementById('headCashier').value || 'ไม่ระบุชื่อ';
            document.getElementById('slipSumCount').innerText = records.length;
            document.getElementById('slipSumTransfer').innerText = document.getElementById('sumTransfer').innerText;
            document.getElementById('slipSumWelfare').innerText = document.getElementById('sumWelfare').innerText;
            document.getElementById('slipSumThaiplus').innerText = document.getElementById('sumThaiPlus').innerText;
            document.getElementById('slipSumNet').innerText = document.getElementById('sumNet').innerText;
            document.getElementById('slipSumExpense').innerText = document.getElementById('sumExpense').innerText;
            document.body.classList.add('print-summary-only');
            heroPrint();
        }

        window.addEventListener('afterprint', function() { clearPrintClasses(); });

        // ==========================================
        // ส่วนที่ 10: คำนวณ 60:40 ไทยพลัส
        // ==========================================
        var currentMode60 = 'price';
        function open6040Modal() {
            document.getElementById('calc6040Modal').style.display = 'flex';
            document.getElementById('c60Price').value = '';
            document.getElementById('c60Used').value = '';
            document.getElementById('c60Remaining').value = '';
            document.getElementById('c60Wallet').value = '';
            document.getElementById('c60WantPrice').value = '';
            document.getElementById('c60HavePrice').value = '';
            document.getElementById('c60TopupAmt').textContent = '0.00 ฿';
            document.getElementById('c60TopupSub').textContent = 'กรอกเงินตัวเองในกระเป๋าตังก่อน';
            setMode60('price');
            calc60();
            setTimeout(function(){ document.getElementById('c60Price').focus(); }, 150);
        }
        function close6040Modal() { document.getElementById('calc6040Modal').style.display = 'none'; }
        function toggleEg60() { var head = document.getElementById('eg60Head'), body = document.getElementById('eg60Body'); head.classList.toggle('open'); body.classList.toggle('open'); }
        function setRemaining60(val) { document.getElementById('c60Remaining').value = val; document.getElementById('c60Used').value = 200 - val; recalc60(); }
        function setUsed60(val) { document.getElementById('c60Used').value = val; document.getElementById('c60Remaining').value = 200 - val; recalc60(); }
        function setWallet60(val) { document.getElementById('c60Wallet').value = val; recalc60(); }
        function fmt60(n) { return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
        function setMode60(mode) {
            currentMode60 = mode;
            document.getElementById('m60-price').classList.toggle('active', mode === 'price');
            document.getElementById('m60-money').classList.toggle('active', mode === 'money');
            document.getElementById('m60-topup').classList.toggle('active', mode === 'topup');
            document.querySelectorAll('.mode60-field').forEach(function(el) { el.classList.toggle('show', el.getAttribute('data-field') === mode); });
            var oldPanel = document.querySelector('#calc6040Modal .calc-result-panel');
            if (oldPanel) oldPanel.style.display = (mode === 'price') ? 'block' : 'none';
            var btn = document.getElementById('btnSave6040');
            btn.style.display = (mode === 'price') ? 'block' : 'none';
            recalc60();
            setTimeout(function() { var focusId = mode === 'price' ? 'c60Price' : mode === 'money' ? 'c60Wallet' : 'c60WantPrice'; var el = document.getElementById(focusId); if (el) el.focus(); }, 100);
        }
        function recalc60() {
            var remaining = parseFloat(document.getElementById('c60Remaining').value);
            if (!isNaN(remaining) && remaining >= 0 && remaining <= 200) { document.getElementById('c60Used').value = 200 - remaining; }
            if (currentMode60 === 'price') calc60(); else if (currentMode60 === 'money') calcMoney60(); else if (currentMode60 === 'topup') calcTopup60();
            updateQuotaBar60();
        }
        function updateQuotaBar60() {
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var remaining = 200 - used;
            var pct = Math.min(100, (used / 200) * 100);
            document.getElementById('c60Bar').style.width = pct + '%';
            document.getElementById('c60Bar').className = 'bar-fill-sm' + (remaining <= 0 ? ' empty' : remaining <= 60 ? ' low' : '');
            document.getElementById('c60UsedLbl').textContent = fmt60(used);
            var remLbl = document.getElementById('c60RemLbl');
            if (remaining <= 0) { remLbl.textContent = 'หมดสิทธิวันนี้'; remLbl.className = 'qrem empty'; }
            else { remLbl.textContent = 'สิทธิคงเหลือ ' + fmt60(remaining) + ' ฿'; remLbl.className = 'qrem' + (remaining <= 60 ? ' low' : ''); }
        }
        function calcMoney60() {
            var W = Math.max(0, parseFloat(document.getElementById('c60Wallet').value) || 0);
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var Q = 200 - used;
            var alertBox = document.getElementById('c60Alert'), alertMsg = document.getElementById('c60AlertMsg'), alertIcon = document.getElementById('c60AlertIcon');
            if (W <= 0) { document.getElementById('c60MaxBuy').textContent = '0.00 ฿'; document.getElementById('c60MoneySub').textContent = 'กรอกเงินตัวเองในกระเป๋าตังก่อน'; document.getElementById('c60TopupAmt').textContent = '0.00 ฿'; document.getElementById('c60TopupSub').textContent = 'กรอกเงินตัวเองในกระเป๋าตังก่อน'; alertBox.className = 'alert60'; return; }
            var needToCap = (0.6 / 0.4) * W;
            if (needToCap <= Q) { var Pmax = W + needToCap; var govUsed = needToCap; }
            else { var Pmax = W + Q; var govUsed = Q; }
            document.getElementById('c60MaxBuy').textContent = fmt60(Pmax) + ' ฿';
            document.getElementById('c60MoneySub').textContent = 'เงินตัวเอง ' + fmt60(W) + ' + รัฐช่วย ' + fmt60(govUsed) + ' = ของได้สูงสุด ' + fmt60(Pmax) + ' บาท';
            document.getElementById('c60TopupAmt').textContent = fmt60(Pmax - W) + ' ฿';
            document.getElementById('c60TopupSub').textContent = 'ยอดที่ต้องเติม พช = ของที่ซื้อได้สูงสุด - เงินตัวเอง';
            if (Pmax <= 200) { alertBox.className = 'alert60 ok show'; alertIcon.textContent = '✅'; alertMsg.textContent = 'ยังอยู่ในสิทธิ 200 บาท/วัน ไม่มีปัญหา'; }
            else if (govUsed >= Q) { alertBox.className = 'alert60 warn show'; alertIcon.textContent = '⚠️'; alertMsg.textContent = 'สิทธิตันแล้ว! ใช้สิทธิครบ ' + fmt60(used + govUsed) + ' บาท จากวงเงิน 200 บาท'; }
            else { alertBox.className = 'alert60'; }
        }
        function calcTopup60() {
            var wantPrice = Math.max(0, parseFloat(document.getElementById('c60WantPrice').value) || 0);
            var havePrice = Math.max(0, parseFloat(document.getElementById('c60HavePrice').value) || 0);
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var Q = 200 - used;
            var alertBox = document.getElementById('c60Alert'), alertMsg = document.getElementById('c60AlertMsg'), alertIcon = document.getElementById('c60AlertIcon');
            if (wantPrice <= 0) { document.getElementById('c60TopupAmt2').textContent = '0.00 ฿'; document.getElementById('c60TopupSub2').textContent = 'กรอกราคาสินค้าก่อน'; alertBox.className = 'alert60'; return; }
            var govHelp = Math.min(wantPrice * 0.6, Q);
            var custPay = wantPrice - govHelp;
            var topupNeed = Math.max(0, custPay - havePrice);
            document.getElementById('c60TopupAmt2').textContent = fmt60(topupNeed) + ' ฿';
            document.getElementById('c60TopupSub2').textContent = 'ราคา ' + fmt60(wantPrice) + ' - รัฐช่วย ' + fmt60(govHelp) + ' - มีอยู่แล้ว ' + fmt60(havePrice) + ' = ต้องเติมอีก ' + fmt60(topupNeed) + ' บาท';
            if (topupNeed <= 0) { alertBox.className = 'alert60 ok show'; alertIcon.textContent = '✅'; alertMsg.textContent = 'ไม่ต้องเติมเพิ่ม! เงินที่มีพอจ่ายแล้ว'; }
            else if (govHelp >= Q) { alertBox.className = 'alert60 warn show'; alertIcon.textContent = '⚠️'; alertMsg.textContent = 'สิทธิตันแล้ว รัฐช่วยได้แค่ ' + fmt60(govHelp) + ' บาท'; }
            else { alertBox.className = 'alert60'; }
        }
        function calc60() {
            var price = parseFloat(document.getElementById('c60Price').value) || 0;
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var Q = 200 - used;
            var govHelp = Math.min(price * 0.6, Q);
            var custPay = price - govHelp;
            var remainingAfter = Q - govHelp;
            document.getElementById('c60CustPay').textContent = fmt60(custPay) + ' ฿';
            document.getElementById('c60RemAfter').textContent = fmt60(remainingAfter) + ' ฿';
            document.getElementById('c60RPrice').textContent = fmt60(price) + ' ฿';
            document.getElementById('c60RGov').textContent = fmt60(govHelp) + ' ฿';
            document.getElementById('c60RCust').textContent = fmt60(custPay) + ' ฿';
            document.getElementById('c60GovNote').textContent = govHelp < price * 0.6 ? '(สิทธิตัน) เหลือ ' + fmt60(remainingAfter) + ' บาท' : '';
            document.getElementById('c60TopupPanel').textContent = fmt60(custPay) + ' ฿';
            var btn = document.getElementById('btnSave6040');
            if (btn) btn.disabled = (price <= 0);
            var formulaBox = document.getElementById('c60Formula');
            if (formulaBox) { if (price > 0) { formulaBox.className = 'formula60 show'; } else { formulaBox.className = 'formula60'; } }
            var alertBox = document.getElementById('c60Alert'), alertMsg = document.getElementById('c60AlertMsg'), alertIcon = document.getElementById('c60AlertIcon');
            if (price <= 0) { alertBox.className = 'alert60'; return; }
            if (govHelp >= Q) { alertBox.className = 'alert60 warn show'; alertIcon.textContent = '⚠️'; alertMsg.textContent = 'สิทธิตันแล้ว! รัฐช่วยได้แค่ ' + fmt60(govHelp) + ' บาท จากวงเงิน 200 บาท (ใช้ไป ' + fmt60(used) + ' บาทแล้ว)'; }
            else { alertBox.className = 'alert60'; }
        }
        function apply6040ToPOS() {
            var price = parseFloat(document.getElementById('c60Price').value) || 0;
            if (price <= 0) { alert('⚠️ กรุณากรอกราคาสินค้าก่อน'); return; }
            var used = Math.max(0, Math.min(200, parseFloat(document.getElementById('c60Used').value) || 0));
            var Q = 200 - used;
            var govHelp = Math.min(price * 0.6, Q);
            var custPay = price - govHelp;
            records.push({ time: new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}), type: 'thaiplus', name: 'ลูกค้า (ไทยพลัส)', amount: price, isEdited: false });
            localStorage.setItem('posUltimateRecords', JSON.stringify(records));
            localStorage.setItem('posUltimateDate', new Date().toLocaleDateString('th-TH'));
            document.getElementById('c60Used').value = used + govHelp;
            document.getElementById('c60Remaining').value = 200 - (used + govHelp);
            renderTable();
            if (typeof celebrateTransaction === 'function') celebrateTransaction(price, { moneyIn: false });
            close6040Modal();
        }

        // ==========================================
        // ส่วนที่ 11: 🛡️ PUSHBULLET WEBSOCKET — Fixed Version
        // [FIX #6] รวมระบบทั้งหมดในที่เดียว + แก้ WebSocket heartbeat + reconnect เร็วขึ้น
        // ==========================================
        let pbWs = null;
        let pbToken = localStorage.getItem('pbToken') || '';
        let pbReconnectTimer = null;
        let pbDisconnectStart = 0; // [FIX] บันทึกเวลาที่ disconnect
        let pbLastActivity = 0; // [FIX #13] เวลาล่าสุดที่ได้รับข้อความใดๆ จาก Pushbullet (รวม nop)
        let pbLastWarnAt = 0; // เวลาล่าสุดที่เด้ง notification เตือนหลุดการเชื่อมต่อ (กันสแปม)

        // [BACKFILL] dedup ถาวรด้วย push.iden — กันนับซ้ำระหว่าง realtime WS กับ poll backfill
        // (ต่างจาก signature 3 วิใน pbInject ที่ออกแบบมากันแค่ push/mirror เด้งซ้อนกันตอนเดียว)
        var _pbProcessedIdens = (function() {
            try { return JSON.parse(localStorage.getItem('pbProcessedIdens')) || []; } catch(e) { return []; }
        })();
        function isPushProcessed(iden) { return !!iden && _pbProcessedIdens.indexOf(iden) > -1; }
        function markPushProcessed(iden) {
            if (!iden) return;
            _pbProcessedIdens.push(iden);
            if (_pbProcessedIdens.length > 500) _pbProcessedIdens = _pbProcessedIdens.slice(-500);
            localStorage.setItem('pbProcessedIdens', JSON.stringify(_pbProcessedIdens));
        }

        // [FIX #6] ตัวแปรสำหรับ debounce + dedup
        let _pbInjectQueue = [];
        let _pbInjectProcessing = false;
        window._lastPbSig = "";
        window._lastPbTime = 0;

        // โหลด token + config ที่เคยบันทึกไว้ + auto-connect ทันทีถ้ามี token
        // (เดิมเชื่อมต่อก็ต่อเมื่อเปิด Modal กระทบยอดครั้งแรกของเซสชันเท่านั้น —
        // ทำให้ไฟสถานะ Pushbullet ค้างเทาไปเรื่อยๆ ถ้าไม่เคยเปิด modal นั้นเลย)
        document.addEventListener('DOMContentLoaded', function() {
            const t = document.getElementById('pbToken');
            if (t && pbToken) t.value = pbToken;
            loadPbConfig();
            if (pbToken) connectPushbullet();
        });

        function setPbStatus(html, cls) {
            const el = document.getElementById('pbStatus');
            if (el) {
                el.innerHTML = html;
                el.className = 'pb-status ' + (cls || '');
            }
            // Glanceable LED echoing the same state — one in the full titlebar,
            // one in the mini HUD — so the connection can be read without
            // opening the reconciliation modal that #pbStatus lives in.
            const plainText = html.replace(/<[^>]*>/g, '');
            const led = document.getElementById('pbLed');
            if (led) { led.className = 'pb-led ' + (cls || ''); led.title = 'Pushbullet: ' + plainText; }
            const miniLed = document.getElementById('miniPbLed');
            if (miniLed) { miniLed.className = 'mini-pb-led ' + (cls || ''); miniLed.title = 'Pushbullet: ' + plainText; }
        }

        function pbLog(msg, type) {
            const box = document.getElementById('pbLog');
            if (!box) return;
            const now = new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            const div = document.createElement('div');
            div.className = type ? 'pb-' + type : 'pb-i';
            div.innerHTML = '<span style="color:#bbb;">[' + now + ']</span> ' + msg;
            if (box.children.length === 1 && box.children[0].textContent.indexOf('รอการ') > -1) box.innerHTML = '';
            box.insertBefore(div, box.firstChild);
            if (box.children.length > 30) box.removeChild(box.lastChild);
        }

        // ==========================================
        // ⚙️ CONFIG: ปรับแต่ง mapping แหล่งที่มา → ประเภท POS
        // ==========================================
        function savePbConfig() {
            const cfg = {
                bank:     document.getElementById('pbMapBank')     ? document.getElementById('pbMapBank').value     : 'transfer',
                paotang:  document.getElementById('pbMapPaotang')  ? document.getElementById('pbMapPaotang').value  : 'thaiplus',
                maemanee: document.getElementById('pbMapMaemanee') ? document.getElementById('pbMapMaemanee').value : 'transfer',
                fallback: document.getElementById('pbMapFallback') ? document.getElementById('pbMapFallback').value : 'transfer',
                reconBank:     document.getElementById('pbReconBank')     ? document.getElementById('pbReconBank').checked     : true,
                reconPaotang:  document.getElementById('pbReconPaotang')  ? document.getElementById('pbReconPaotang').checked  : false,
                reconMaemanee: document.getElementById('pbReconMaemanee') ? document.getElementById('pbReconMaemanee').checked : false,
                reconFallback: document.getElementById('pbReconFallback') ? document.getElementById('pbReconFallback').checked : true
            };
            localStorage.setItem('pbConfig', JSON.stringify(cfg));
        }

        function loadPbConfig() {
            try {
                const cfg = JSON.parse(localStorage.getItem('pbConfig'));
                if (!cfg) return;
                if (document.getElementById('pbMapBank')     && cfg.bank)     document.getElementById('pbMapBank').value     = cfg.bank;
                if (document.getElementById('pbMapPaotang')  && cfg.paotang)  document.getElementById('pbMapPaotang').value  = cfg.paotang;
                if (document.getElementById('pbMapMaemanee') && cfg.maemanee) document.getElementById('pbMapMaemanee').value = cfg.maemanee;
                if (document.getElementById('pbMapFallback') && cfg.fallback) document.getElementById('pbMapFallback').value = cfg.fallback;
                if (document.getElementById('pbReconBank')     && cfg.reconBank !== undefined)     document.getElementById('pbReconBank').checked     = cfg.reconBank;
                if (document.getElementById('pbReconPaotang')  && cfg.reconPaotang !== undefined)  document.getElementById('pbReconPaotang').checked  = cfg.reconPaotang;
                if (document.getElementById('pbReconMaemanee') && cfg.reconMaemanee !== undefined) document.getElementById('pbReconMaemanee').checked = cfg.reconMaemanee;
                if (document.getElementById('pbReconFallback') && cfg.reconFallback !== undefined) document.getElementById('pbReconFallback').checked = cfg.reconFallback;
            } catch(e) {}
        }

        function getPbConfig() {
            try { const saved = JSON.parse(localStorage.getItem('pbConfig')); if (saved) return saved; } catch(e) {}
            return { bank: 'transfer', paotang: 'thaiplus', maemanee: 'transfer', fallback: 'transfer', reconBank: true, reconPaotang: false, reconMaemanee: false, reconFallback: true };
        }

        // ==========================================
        // [FIX #6] WebSocket Connection + Heartbeat + Reconnect
        // ==========================================
        function connectPushbullet() {
            const input = document.getElementById('pbToken');
            pbToken = (input ? input.value : '').trim();
            if (!pbToken) { alert('⚠️ กรุณาใส่ Pushbullet Access Token'); return; }
            if (!pbToken.startsWith('o.')) { alert('⚠️ Token ต้องขึ้นต้นด้วย o.'); return; }
            localStorage.setItem('pbToken', pbToken);
            disconnectPushbullet();
            setPbStatus('🟡 กำลังเชื่อมต่อ...', 'warn');

            try {
                pbWs = new WebSocket('wss://stream.pushbullet.com/websocket/' + pbToken);

                pbWs.onopen = function() {
                    pbDisconnectStart = 0; // [FIX] รีเซ็ตเวลา disconnect
                    pbLastWarnAt = 0;
                    pbLastActivity = Date.now();
                    setPbStatus('🟢 เชื่อมต่อแล้ว (รอแจ้งเตือน)', 'ok');
                    pbLog('เชื่อมต่อสำเร็จ รอรับ push...', 'i');
                    // [BACKFILL] จังหวะเพิ่งต่อ WS สำเร็จ มักตรงกับตอนมือถือเพิ่งตื่นจาก
                    // Doze/background throttling แล้ว flush queue แจ้งเตือนที่ค้างไป Pushbullet
                    // พอดี → เช็คย้อนหลังทันทีแทนที่จะรอรอบ interval ถัดไป
                    pollMissedPushes();
                };

                pbWs.onmessage = function(ev) {
                    pbLastActivity = Date.now(); // [FIX #13] ทุกข้อความที่เข้ามา (รวม nop) คือสัญญาณว่า socket ยังมีชีวิต
                    try {
                        const data = JSON.parse(ev.data);
                        if (data.type) { pbLog('[RAW] type=' + data.type, 'i'); }
                        let pushObj = null;
                        if (data.type === 'push' && data.push) { pushObj = data.push; }
                        else if (data.type === 'mirror' && data.push) { pushObj = data.push; }
                        else if (data.title || data.body) { pushObj = data; }
                        if (pushObj) {
                            pbLog('[RECV] ' + (pushObj.title || '').substring(0,30) + '...', 'i');
                            handlePbPush(pushObj);
                        }
                    } catch(e) { pbLog('[ERR] parse: ' + e.message, 'e'); }
                };

                pbWs.onclose = function() {
                    pbWs = null;
                    pbDisconnectStart = Date.now(); // [FIX] บันทึกเวลาตัดการเชื่อมต่อ
                    setPbStatus('🔴 ตัดการเชื่อมต่อ', 'err');
                    schedulePbReconnect();
                };

                pbWs.onerror = function(err) {
                    setPbStatus('❌ เชื่อมต่อล้มเหลว', 'err');
                    pbLog('ตรวจสอบ Token หรือเน็ต', 'e');
                    pbWs = null;
                    pbDisconnectStart = Date.now(); // [FIX] บันทึกเวลาตัดการเชื่อมต่อ
                    schedulePbReconnect();
                };

            } catch(e) { alert('เชื่อมต่อไม่ได้: ' + e.message); }
        }

        function disconnectPushbullet() {
            if (pbReconnectTimer) { clearTimeout(pbReconnectTimer); pbReconnectTimer = null; }
            if (pbWs) { pbWs.close(); pbWs = null; }
            setPbStatus('⏸️ ยังไม่เชื่อมต่อ', '');
            pbLog('ตัดการเชื่อมต่อแล้ว', 'i');
        }

        function schedulePbReconnect() {
            if (pbReconnectTimer) clearTimeout(pbReconnectTimer);
            pbReconnectTimer = setTimeout(function() {
                if (!pbWs && pbToken) {
                    pbLog('🔄 พยายามเชื่อมต่อใหม่...', 'w');
                    connectPushbullet();
                }
            }, 3000); // [FIX] ลดจาก 8 วินาที → 3 วินาที เพื่อ reconnect เร็วขึ้น
        }

        // [FIX #13] Pushbullet Realtime Event Stream เป็นช่องทางเดียว (server → client เท่านั้น)
        // ไม่มี client protocol ให้ส่งอะไรกลับ — เซิร์ฟเวอร์เองส่ง nop คงสถานะทุก ~30 วิอยู่แล้ว
        // เดิมโค้ดยิง send() เฟรมที่ไม่ตรงสเปกทุก 25 วิ ("heartbeat") ซึ่งไม่ช่วยอะไรและเสี่ยงโดน
        // เซิร์ฟเวอร์ตัดการเชื่อมต่อเองเพราะได้รับข้อมูลที่ไม่รู้จัก → เอาออก ใช้ nop ที่เซิร์ฟเวอร์ส่งมา
        // (จับเวลาไว้ใน pbLastActivity ทุกครั้งที่ onmessage ทำงาน) เป็นตัวจับชีพจรแทน

        // [FIX #6/#13] ตรวจสอบสถานะ WebSocket ทุก 10 วินาที
        setInterval(function() {
            if (pbWs && pbWs.readyState === WebSocket.OPEN && pbLastActivity && (Date.now() - pbLastActivity) > 35000) {
                // readyState ยังโชว์ OPEN แต่ไม่มีสัญญาณ (แม้แต่ nop) เข้ามาเลยเกิน 35 วิ = socket ค้างเงียบๆ
                pbLog('🔴 ไม่มีสัญญาณจาก Pushbullet นานเกิน 35 วินาที → ตัดแล้วเชื่อมต่อใหม่', 'e');
                pbWs.close();
            } else if (pbToken && !pbWs && pbDisconnectStart && (Date.now() - pbDisconnectStart) > 30000) {
                pbLog('🔴 Warning: ไม่ได้ยินเตือนนานเกิน 30 วินาที! ตรวจสอบ Pushbullet', 'e');
                // เด้ง native notification เตือน (ซ้ำได้ทุก 5 นาทีถ้ายังหลุดต่อเนื่อง) เพราะ pbLog
                // จะไม่มีใครเห็นเลยตอนหน้าต่างถูกย่อ/ซ่อนอยู่ใน tray
                if (window.heroWindow && window.heroWindow.notifyPbDisconnected && (Date.now() - pbLastWarnAt) > 5 * 60 * 1000) {
                    pbLastWarnAt = Date.now();
                    window.heroWindow.notifyPbDisconnected(Math.round((Date.now() - pbDisconnectStart) / 60000));
                }
            }
        }, 10000);

        // [FIX #11] มือถือ/แท็บเล็ตจะ "หรี่" ปิด setInterval/WebSocket เมื่อสลับแอปหรือดับหน้าจอ
        // ทำให้การเชื่อมต่อหลุดเงียบๆ โดยไม่มี event onclose มาสั่ง reconnect
        // → บังคับเชื่อมต่อใหม่ทันทีเมื่อกลับมาเปิดหน้าจอ/สลับกลับมาที่แท็บนี้
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible' && pbToken) {
                if (!pbWs || pbWs.readyState !== WebSocket.OPEN) {
                    pbLog('👁️ กลับมาที่หน้าจอ → เชื่อมต่อ Pushbullet ใหม่', 'w');
                    connectPushbullet();
                }
            }
        });

        // เครื่องหลับ/ล็อกหน้าจอเป็นจุดที่ WebSocket หลุดเงียบๆ บ่อยที่สุด (บางครั้ง onclose
        // ไม่ยิงทันทีตอนตื่นเครื่อง) → main process จะสั่งบังคับเชื่อมต่อใหม่ทันทีที่ตื่น/ปลดล็อก
        if (window.heroWindow && window.heroWindow.onForceReconnect) {
            window.heroWindow.onForceReconnect(function() {
                if (!pbToken) return;
                pbLog('🔌 เครื่องกลับมาทำงาน (resume/unlock) → บังคับเชื่อมต่อ Pushbullet ใหม่', 'w');
                disconnectPushbullet();
                connectPushbullet();
                // [BACKFILL] เผื่อมีแจ้งเตือนเข้ามาระหว่างที่เครื่องหลับ/ล็อกอยู่
                pollMissedPushes();
            });
        }

        // เน็ตหลุด-กลับมา (WiFi สะดุด) ก็เป็นอีกจุดที่ทำให้ socket ค้าง
        window.addEventListener('online', function() {
            if (pbToken && (!pbWs || pbWs.readyState !== WebSocket.OPEN)) {
                pbLog('🌐 อินเทอร์เน็ตกลับมา → เชื่อมต่อ Pushbullet ใหม่', 'w');
                connectPushbullet();
            }
        });

        // ==========================================
        // [FIX #7] extractMoney — ดึงตัวเลขอัจฉริยะ
        // [FIX] ใช้ท่าไม้ตาย 1-2 ก่อน + return ตัวที่ใหญ่ที่สุดเสมอ
        // ==========================================
        function extractMoney(text) {
            if (!text) return null;
            const t = text;
            pbLog('[PARSE] "' + t.substring(0,60).replace(/\n/g,' ') + '"', 'i');

            // ท่าไม้ตาย 1: จับคู่คำว่า "บาท" หรือ "฿" โดยตรง (เช่น "69 บาท")
            let match1 = t.match(/([\d,]+(?:\.\d+)?)\s*(?:บาท|฿|thb)/i);
            if (match1 && match1[1]) {
                let num = parseFloat(match1[1].replace(/,/g, ''));
                if (num > 0 && num <= 999999) { pbLog('[FOUND] เจอคำว่าบาท: ' + num, 'i'); return num; }
            }

            // ท่าไม้ตาย 2: จับหลังคำแอคชัน (เช่น "เงินเข้า 69")
            let match2 = t.match(/(?:เงินเข้า|รับโอน|ยอดเงิน|โอนเงินเข้า|จำนวน|ได้รับ|จำนวนเงิน)\s*([\d,]+(?:\.\d+)?)/i);
            if (match2 && match2[1]) {
                let num = parseFloat(match2[1].replace(/,/g, ''));
                if (num > 0 && num <= 999999) { pbLog('[FOUND] เจอคำสั่งเงินเข้า: ' + num, 'i'); return num; }
            }

            // ท่าไม้ตาย 3: ของเดิม (เผื่อรูปแบบแปลก)
            let clean = t.replace(/฿/g, '').replace(/บาท/g, '').replace(/บ\./g, '').replace(/B\./g, '').replace(/THB/gi, '');

            let m3 = clean.match(/(\d{1,3}(?:,\d{3})+\.\d{2})/g);
            if (m3) {
                const nums = m3.map(s => parseFloat(s.replace(/,/g,''))).filter(n => n > 0 && n <= 999999);
                if (nums.length) { pbLog('[FOUND] comma-decimal: ' + Math.max.apply(null,nums), 'i'); return Math.max.apply(null,nums); }
            }

            m3 = clean.match(/(\d{1,3}(?:,\d{3})+)/g);
            if (m3) {
                const nums = m3.map(s => parseFloat(s.replace(/,/g,''))).filter(n => n > 0 && n <= 999999);
                if (nums.length) { pbLog('[FOUND] comma: ' + Math.max.apply(null,nums), 'i'); return Math.max.apply(null,nums); }
            }

            m3 = clean.match(/(\d+\.\d{2})/g);
            if (m3) {
                const nums = m3.map(s => parseFloat(s)).filter(n => n > 0 && n <= 999999);
                if (nums.length) { pbLog('[FOUND] decimal: ' + Math.max.apply(null,nums), 'i'); return Math.max.apply(null,nums); }
            }

            // [FIX] ท่าไม้ตาย 4: ใช้ Math.max เสมอ (ไม่ใช่ nums[0]) + filter ปี/เวลา
            let m4 = clean.match(/(\d{4,})/g);
            if (m4) {
                const nums = m4.map(s => parseFloat(s)).filter(n => n > 0 && n <= 999999 && !(n >= 2500 && n <= 2600) && !(n >= 2020 && n <= 2030));
                if (nums.length) { pbLog('[FOUND] plain: ' + Math.max.apply(null,nums), 'i'); return Math.max.apply(null,nums); }
            }

            if (/เงิน|โอน|รับ|เข้า|received|transfer|incoming/i.test(t)) {
                m4 = clean.match(/(\d{3,})/g);
                if (m4) {
                    const nums = m4.map(s => parseFloat(s)).filter(n => n > 0 && n <= 999999 && !(n >= 2500 && n <= 2600) && !(n >= 2020 && n <= 2030));
                    if (nums.length) { pbLog('[FOUND] keyword+3digit: ' + Math.max.apply(null,nums), 'i'); return Math.max.apply(null,nums); }
                }
            }

            pbLog('[NOT FOUND] ไม่พบตัวเลข', 'e');
            return null;
        }

        // ==========================================
        // [FIX #8] detectSource — ตรวจจับแหล่งที่มาแบบกว้างขึ้น
        // ==========================================
        function detectSource(text) {
            const t = (text || '').toLowerCase();

            // Mae Manee แยกออกมาก่อน
            if (t.indexOf('mae manee') > -1 || t.indexOf('maemanee') > -1 || t.indexOf('แม่มณี') > -1) return 'maemanee';

            // เป๋าตัง / ถุงเงิน / TrueMoney
            if (t.indexOf('paotang') > -1 || t.indexOf('เป๋าตัง') > -1 ||
                t.indexOf('ถุงเงิน') > -1 || t.indexOf('tungngoen') > -1 || t.indexOf('tung ngoen') > -1 ||
                t.indexOf('pao tang') > -1 || t.indexOf('truemoney') > -1 || t.indexOf('ทรูมันนี่') > -1 ||
                t.indexOf('true money') > -1 || t.indexOf('wallet') > -1 || t.indexOf('เป๋าตัง') > -1) return 'paotang';

            // ธนาคาร — เพิ่มธนาคารมากขึ้น
            if (t.indexOf('scb') > -1 || t.indexOf('ไทยพาณิชย์') > -1 || t.indexOf('scb easy') > -1 || t.indexOf('scbeasy') > -1) return 'bank1';
            if (t.indexOf('k plus') > -1 || t.indexOf('กสิกร') > -1 || t.indexOf('kbank') > -1 || t.indexOf('kasikorn') > -1 || t.indexOf('k-plus') > -1 || t.indexOf('kplus') > -1) return 'bank2';
            if (t.indexOf('krungsri') > -1 || t.indexOf('กรุงศรี') > -1 || t.indexOf('ayudhya') > -1) return 'bank1';
            if (t.indexOf('bangkok bank') > -1 || t.indexOf('กรุงเทพ') > -1 || t.indexOf('bbl') > -1) return 'bank2';
            if (t.indexOf('krungthai') > -1 || t.indexOf('กรุงไทย') > -1 || t.indexOf('krung thai') > -1) return 'bank1';
            if (t.indexOf('ttb') > -1 || t.indexOf('ทหารไทย') > -1 || t.indexOf('thanachart') > -1) return 'bank2';
            if (t.indexOf('ออมสิน') > -1 || t.indexOf('gsb') > -1 || t.indexOf('govbank') > -1) return 'bank1';
            if (t.indexOf('เกษตร') > -1 || t.indexOf('baac') > -1) return 'bank2';
            if (t.indexOf('กรุงศรี') > -1 || t.indexOf('กรุงศรี') > -1) return 'bank1';
            if (t.indexOf('uob') > -1 || t.indexOf('ยูโอบี') > -1) return 'bank2';

            // Fallback: ใช้ keyword ทั่วไป
            if (t.indexOf('เงินเข้า') > -1 || t.indexOf('รับโอน') > -1 || t.indexOf('received') > -1 ||
                t.indexOf('transfer') > -1 || t.indexOf('incoming') > -1 || t.indexOf('รับเงิน') > -1) return 'bank1';

            return null;
        }

        // ==========================================
        // [FIX #9] pbInject — รวมจาก Override Patch + แก้ Dedup
        // [FIX #4] ลด Dedup Window จาก 10 → 3 วินาที + ใช้ Signature ที่เฉพาะเจาะจงกว่า
        // ==========================================
        function pbInject(amount, srcType, rawTitle, rawBody) {
            // --- ระบบป้องกันการบันทึกซ้ำซ้อน (Deduplication) ---
            var now = Date.now();
            var fullTextToParse = ((rawBody || '') + " " + (rawTitle || '')).replace(/\n/g, ' ');

            // [FIX] ใช้ข้อความเต็มแทนตัด 30 ตัวแรก — เดิมตัดสั้นเกินไป ทำให้สองรายการที่
            // "ยอดเท่ากันพอดี" จากคนละคนซึ่งเข้ามาไม่ถึง 3 วิ (ปกติมากตอนลูกค้าเยอะๆ จ่ายเลขกลมๆ
            // เช่น 20/50/100 บาท พร้อมกัน) ถูกมองว่าเป็น push+mirror ซ้ำกันของรายการเดียว ทั้งที่
            // ชื่อผู้โอนจริงต่างกัน (แค่บังเอิญอยู่หลังตำแหน่งที่ 30 ของเทมเพลตแจ้งเตือนธนาคาร) —
            // เลยถูกข้ามไปเงียบๆ ไม่บันทึกทั้งที่เป็นรายการจริง ข้อความเต็มยังจับ push+mirror ของ
            // เหตุการณ์เดียวกันได้เหมือนเดิม (เนื้อหาเหมือนกันทุกตัวอักษร) แต่ไม่ชนกับรายการอื่นที่
            // ชื่อผู้โอนต่างกันอีกต่อไป
            var sig = amount + "_" + fullTextToParse;

            // [FIX #4] ลด window จาก 10 วินาที → 3 วินาที (กันแอปเด้งเบิ้ล push+mirror)
            if (window._lastPbSig === sig && (now - window._lastPbTime) < 3000) {
                pbLog('⚠️ ข้ามการบันทึกซ้ำซ้อนภายใน 3 วินาที', 'w');
                return;
            }
            window._lastPbSig = sig;
            window._lastPbTime = now;
            // ---------------------------------------------

            var cfg = getPbConfig();
            var toTable = document.getElementById('pbToTable') ? document.getElementById('pbToTable').checked : true;

            // แมพแหล่งที่มา → config key
            var mapKey = srcType || 'fallback';
            if (srcType === 'bank1' || srcType === 'bank2') mapKey = 'bank';

            var recType = cfg[mapKey] || 'transfer';
            var doRecon = cfg['recon' + mapKey.charAt(0).toUpperCase() + mapKey.slice(1)];
            if (doRecon === undefined) doRecon = true;

            // ชื่อรายการอัตโนมัติ — [FIX] ดึงชื่อให้สั้นกระชับ
            var shortName = "";
            var match = fullTextToParse.match(/จาก\s*(.*?)(?:\s*วันที่|\s*เวลา|\s*จำนวน|\s*ยอด|$)/);
            if (match && match[1]) {
                shortName = match[1].trim();
            } else {
                shortName = fullTextToParse.trim().substring(0, 15);
            }
            if (shortName.length > 25) shortName = shortName.substring(0, 25) + '...';
            if (!shortName || shortName === "") shortName = "ลูกค้าโอน";

            var recordName = shortName;

            // 1. ใส่เข้าตารางหลัก POS
            if (toTable) {
                var timeStr = new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
                records.push({
                    time: timeStr,
                    type: recType,
                    name: recordName,
                    amount: amount,
                    isEdited: false
                });
                localStorage.setItem('posUltimateRecords', JSON.stringify(records));
                localStorage.setItem('posUltimateDate', new Date().toLocaleDateString('th-TH'));
                renderTable();
                pbLog('✅ บันทึก: +' + amount.toLocaleString('en-US') + ' ฿ (' + recordName + ')', 'm');
                if (window.heroWindow && window.heroWindow.notifyMoneyIn) {
                    window.heroWindow.notifyMoneyIn(amount, recordName, recType);
                }
                if (typeof celebrateTransaction === 'function') celebrateTransaction(amount, { moneyIn: true });
            }

            // 2. ใส่เข้าช่องกระทบยอด
            if (doRecon && document.getElementById('reconModal') && document.getElementById('reconModal').style.display === 'flex') {
                var fieldId = null;
                if (srcType === 'paotang') fieldId = 'reconPaotang';
                else if (srcType === 'bank1') fieldId = 'reconBank1';
                else if (srcType === 'bank2') fieldId = 'reconBank2';
                else if (srcType === 'maemanee') fieldId = 'reconBank1';
                else fieldId = 'reconBank1';

                var el = document.getElementById(fieldId);
                if (el) {
                    var oldVal = parseFloat(el.value) || 0;
                    var newVal = oldVal + amount;
                    el.value = newVal;
                    calcRecon();
                    el.style.background = '#dcfce7';
                    el.style.borderColor = '#16a34a';
                    setTimeout(function() { el.style.background = ''; el.style.borderColor = ''; }, 900);
                    pbLog('📱 กระทบยอด: +' + amount.toLocaleString('en-US') + ' ฿ → ' + fieldId, 'i');
                }
            }
        }

        // ==========================================
        // [FIX #10] handlePbPush — [FIX] เพิ่ม keyword + ใช้ appName
        // ==========================================
        function handlePbPush(push) {
            // [BACKFILL] iden ถาวร กันนับซ้ำระหว่าง realtime กับ poll backfill (ถ้าไม่มี iden
            // ให้ผ่านไปพึ่ง signature-dedup 3 วิใน pbInject แทน)
            if (push.iden && isPushProcessed(push.iden)) {
                pbLog('⏭️ ข้าม (ประมวลผลแล้ว): ' + push.iden, 'i');
                return;
            }

            try {
                var title = push.title || '';
                var body = push.body || '';
                // [FIX] ดึงชื่อแอปที่ส่งแจ้งเตือนมาด้วย!
                var appName = push.application_name || push.app_name || '';
                var full = title + ' ' + body + ' ' + appName;

                pbLog('---', 'i');
                pbLog('APP: ' + appName, 'i');
                pbLog('TITLE: ' + title.substring(0,40), 'i');
                pbLog('BODY: ' + body.substring(0,60), 'i');

                // [FIX #10] เพิ่ม keyword ให้ครอบคลุมมากขึ้น
                var kw = ['เงินเข้า','รับโอน','เงินโอน','received','transfer','เข้า','รับเงิน','ได้รับ',
                          'top-up','เติมเงิน','คืนเงิน','money received','incoming',
                          'เงินโอนเข้า','โอนเงินเข้า','รับชำระ','ชำระเงิน','promptpay','พร้อมเพย์',
                          'สำเร็จ','โอนเงิน','ยอดเงิน','เงินโอนเข้าบัญชี','ชำระ','รับ',
                          'deposit','credit','payment','transaction'];
                var isMoney = false;
                for (var i=0; i<kw.length; i++) {
                    if (full.toLowerCase().indexOf(kw[i]) > -1) { isMoney = true; break; }
                }
                if (!isMoney) {
                    pbLog('[SKIP] ไม่ใช่แจ้งเตือนเงินเข้า', 'i');
                    return;
                }

                var amt = extractMoney(full);
                var src = detectSource(full);

                if (!amt) {
                    pbLog('[FAIL] อ่านยอดไม่ได้: ' + full.substring(0,80), 'e');
                    return;
                }

                if (!src) {
                    src = 'fallback';
                    pbLog('[WARN] ไม่รู้แหล่งที่มา → ใช้ fallback', 'w');
                }

                pbInject(amt, src, title, body);
            } finally {
                // [BACKFILL] ประทับ iden ว่า "ประมวลผลแล้ว" ไม่ว่าผลจะเป็นบันทึกสำเร็จหรือ skip/fail
                // ก็ตาม กัน poll รอบถัดไปดึง push เดิมมาพยายามซ้ำอีกไม่รู้จบ
                if (push.iden) markPushProcessed(push.iden);
            }
        }

        // ==========================================
        // [BACKFILL] pollMissedPushes — ตาข่ายนิรภัยสำรองจาก WS realtime
        // ดึง push ที่อาจตกหล่นจาก Pushbullet REST API มา backfill ผ่าน pipeline เดิม
        // (handlePbPush มี iden-dedup กันนับซ้ำกับของที่ WS realtime เก็บไปแล้วอยู่แล้ว)
        // ==========================================
        function getPbPollTs() {
            var v = parseInt(localStorage.getItem('lastPbPollTs'), 10);
            // ครั้งแรกที่ไม่เคยมีค่า ให้เริ่มจาก "ตอนนี้" กันดึงประวัติเก่าย้อนหลังเป็นวันๆ มา replay
            if (!v) { v = Date.now(); localStorage.setItem('lastPbPollTs', String(v)); }
            return v;
        }

        function pollMissedPushes() {
            if (!pbToken || !window.heroWindow || !window.heroWindow.pollMissedPushes) return;
            var sinceTs = getPbPollTs() / 1000; // Pushbullet API ใช้หน่วยวินาที (epoch)
            window.heroWindow.pollMissedPushes(pbToken, sinceTs).then(function(res) {
                if (!res || !res.success) {
                    if (res && res.reason) pbLog('[POLL] เช็คย้อนหลังไม่สำเร็จ: ' + res.reason, 'w');
                    return;
                }
                var pushes = (res.pushes || []).filter(function(p) { return p.active !== false; });
                pushes.sort(function(a, b) { return (a.created || 0) - (b.created || 0); });
                pbLog('[POLL] เช็คย้อนหลัง: พบ ' + pushes.length + ' รายการ', 'i');
                pushes.forEach(function(p) { handlePbPush(p); });
                localStorage.setItem('lastPbPollTs', String(Date.now()));
            }).catch(function(e) {
                pbLog('[POLL] error: ' + e.message, 'e');
            });
        }

        setInterval(pollMissedPushes, 2 * 60 * 1000); // เช็คย้อนหลังทุก 2 นาทีเป็นพื้นฐาน

        // ==========================================
        // Initialize App
        // ==========================================
        initDrawerTable();
        initExchangeTable();
        handleTypeChange();
        renderTable();

