// ==UserScript==
// @name         Beliani — narzędzia prologistics (hub)
// @namespace    beliani.finance
// @version      1.15
// @description  Wszystkie skrypty w jednym pliku, dostępne z jednego guzika „Narzędzia" (launcher). Moduły włączasz/wyłączasz w launcherze (⚙ Moduły) lub w menu Tampermonkey/ScriptCat. Źródła: Księgowanie 3.62, Kurs+VIES 1.17, Refund 2.1, SEPA 1.5, Issue Log 0.24, Zmiana typu 2.2, Allegro 3.5.
// @author       Finance
// @match        https://www.prologistics.info/*
// @match        https://prologistics.info/*
// @match        https://salescenter.allegro.com/*
// @match        https://wyszukiwarkaregon.stat.gov.pl/*
// @connect      fxds-public-exchange-rates-api.oanda.com
// @connect      oanda.com
// @connect      ec.europa.eu
// @connect      wl-api.mf.gov.pl
// @connect      webservicesp.anaf.ro
// @connect      wyszukiwarkaregontest.stat.gov.pl
// @connect      wyszukiwarkaregon.stat.gov.pl
// @connect      api-krs.ms.gov.pl
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @updateURL   https://raw.githubusercontent.com/dawidgrzegowski-dev/beliani-userscripts/main/Beliani_prologistics_hub.user.js
// @downloadURL https://raw.githubusercontent.com/dawidgrzegowski-dev/beliani-userscripts/main/Beliani_prologistics_hub.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ===== Host helpers =====
    const H = location.hostname;
    const onProlo   = () => /(^|\.)prologistics\.info$/i.test(H);
    const onAllegro = () => /(^|\.)salescenter\.allegro\.com$/i.test(H);
    const onGus     = () => /(^|\.)wyszukiwarkaregon\.stat\.gov\.pl$/i.test(H);

    const HUB = 'beliani_hub_';
    const isOn = (id) => { try { return GM_getValue(HUB + id, true); } catch (e) { return true; } };

    // ===== Moduły (każdy = oryginalny skrypt owinięty, wnętrze bez zmian) =====
    function init_vies() {
(function () {
    'use strict';

    // === GUS appBIR (inny host): auto-wpis NIP + Szukaj; tryb bg=1: scrape tabeli -> opener -> close ===
    if (location.hostname.indexOf('wyszukiwarkaregon.stat.gov.pl') !== -1) {
        const hash = location.hash || '';
        const mNip = hash.match(/nip=(\d+)/i);
        if (mNip) {
            const nipVal = mNip[1];
            const bg = /(?:[#&])bg=1/i.test(hash);
            function scrapeGusTable(){
                const tables = document.getElementsByTagName('table');
                for (let i=0;i<tables.length;i++){
                    const t = tables[i];
                    const heads = Array.prototype.slice.call(t.querySelectorAll('th')).map(x=>x.textContent.replace(/\s+/g,' ').trim()).filter(x=>x);
                    if (!heads.some(h=>/regon/i.test(h)) || !heads.some(h=>/nazwa/i.test(h))) continue;
                    const rows = t.querySelectorAll('tr');
                    for (let r=0;r<rows.length;r++){
                        const cells = rows[r].querySelectorAll('td');
                        if (cells.length < 3) continue;
                        const vals = Array.prototype.slice.call(cells).map(x=>x.textContent.replace(/\s+/g,' ').trim());
                        const obj = {};
                        for (let k=0;k<Math.min(heads.length, vals.length);k++){ if (heads[k]) obj[heads[k]] = vals[k]; }
                        if (Object.keys(obj).filter(k=>obj[k]).length >= 3) return obj;
                    }
                }
                return null;
            }
            function sendAndClose(){
                let t = 0;
                const si2 = setInterval(() => {
                    const data = scrapeGusTable();
                    if (data || ++t > 50) {
                        clearInterval(si2);
                        try { if (window.opener) window.opener.postMessage({ __gusTable:true, nip:nipVal, data:data||null }, '*'); } catch(e){}
                        setTimeout(() => { try { window.close(); } catch(e){} }, 300);
                    }
                }, 300);
            }
            let tries = 0;
            const iv = setInterval(() => {
                const inp = document.getElementById('txtNip');
                const btn = document.getElementById('btnSzukaj');
                if (inp && btn) {
                    clearInterval(iv);
                    inp.value = nipVal;
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    setTimeout(() => { btn.click(); if (bg) sendAndClose(); }, 250);
                } else if (++tries > 40) { clearInterval(iv); }
            }, 250);
        }
        return; // na stronie GUS nie budujemy panelu przelicznika/VIES
    }

    // ---- Lista walut do wyboru (kod + etykieta) ----
    // Możesz dopisać/odjąć; pole wyboru pozwala też wpisać dowolny kod ręcznie.
    const CURRENCIES = [
        ['EUR', 'Euro'],
        ['HUF', 'Forint węgierski'],
        ['CHF', 'Frank szwajcarski'],
        ['PLN', 'Złoty polski'],
        ['USD', 'Dolar amerykański'],
        ['GBP', 'Funt brytyjski'],
        ['CZK', 'Korona czeska'],
        ['SEK', 'Korona szwedzka'],
        ['NOK', 'Korona norweska'],
        ['DKK', 'Korona duńska'],
        ['CNY', 'Juan chiński'],
        ['JPY', 'Jen japoński'],
        ['RON', 'Lej rumuński'],
        ['BGN', 'Lew bułgarski'],
        ['HKD', 'Dolar Hongkongu'],
        ['CAD', 'Dolar kanadyjski'],
        ['AUD', 'Dolar australijski'],
    ];

    // ---- Poziomy autoryzacji (progi w EUR) ----
    // cash/voucher = górny limit, do którego dany poziom MOŻE zatwierdzić kwotę.
    // Najwyższe poziomy (>1500 / >2000 w tabeli) traktujemy jako bez górnego limitu.
    const LEVELS = [
        { lvl: 'Level 0', roles: 'Assistant · Senior Assistant · Junior Specialist · CS Representative', cash: 50, voucher: 100, note: '< 5% Price Reduction' },
        { lvl: 'Level 1', roles: 'Specialist', cash: 150, voucher: 300 },
        { lvl: 'Level 2', roles: 'Senior Specialist · Process Controller Specialist · Area Coordinator · Junior Team Leader', cash: 250, voucher: 500 },
        { lvl: 'Level 3', roles: 'Team Leader', cash: 500, voucher: 1000 },
        { lvl: 'Level 4', roles: 'Senior Team Leader', cash: 1000, voucher: 2000 },
        { lvl: 'Level 5', roles: 'Junior Manager · Manager · Senior Manager', cash: 1500, voucher: 3000 },
        { lvl: 'Level 6', roles: 'Head of CS + Senior Manager', cash: Infinity, voucher: 4000 },
        { lvl: 'Level 7', roles: 'CEO', cash: Infinity, voucher: Infinity },
    ];

    const STORAGE_KEY = 'oandaKursPanel_v1';
    const saved = (() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
        catch (e) { return {}; }
    })();

    // ---- Pobranie kursu z OANDA ----
    // Zwraca średnią z average_bid i average_ask dla pary base->quote.
    function fetchRate(base, quote, dateStr) {
        return new Promise((resolve, reject) => {
            if (base === quote) { resolve(1); return; }
            // dzakres: dzień przed wskazaną datą -> wskazana data (jak w działającym żądaniu)
            const end = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
            const start = new Date(end.getTime() - 1 * 24 * 3600 * 1000);
            const fmt = (d) => d.toISOString().slice(0, 10);
            const url = 'https://fxds-public-exchange-rates-api.oanda.com/cc-api/currencies'
                + '?base=' + encodeURIComponent(base)
                + '&quote=' + encodeURIComponent(quote)
                + '&data_type=general_currency_pair'
                + '&start_date=' + fmt(start)
                + '&end_date=' + fmt(end);

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: { 'Accept': 'application/json' },
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        const rows = data && data.response;
                        const row = rows && rows.length ? rows[rows.length - 1] : null;
                        if (!row) {
                            const snippet = (res.responseText || '').slice(0, 200);
                            reject(new Error('Brak danych w odpowiedzi OANDA. Surowa odpowiedź: ' + snippet));
                            return;
                        }
                        const bid = parseFloat(row.average_bid);
                        const ask = parseFloat(row.average_ask);
                        let rate;
                        if (!isNaN(bid) && !isNaN(ask)) rate = (bid + ask) / 2;
                        else if (!isNaN(bid)) rate = bid;
                        else if (!isNaN(ask)) rate = ask;
                        else { reject(new Error('Brak kursu w odpowiedzi')); return; }
                        resolve(rate);
                    } catch (e) {
                        reject(new Error('Zła odpowiedź OANDA (nie JSON). Sprawdź adres API.'));
                    }
                },
                onerror: () => reject(new Error('Błąd połączenia z OANDA')),
                ontimeout: () => reject(new Error('Przekroczono czas połączenia z OANDA')),
                timeout: 15000,
            });
        });
    }

    // ---- UI ----
    GM_addStyle(`
        #oandaKursBtn{position:fixed;right:18px;bottom:18px;z-index:2147483646;
            width:48px;height:48px;border-radius:50%;border:none;cursor:pointer;
            background:#FF2F00;color:#fff;font-size:20px;box-shadow:0 2px 10px rgba(0,0,0,.3);}
        #oandaKursBtn:hover{background:#cc2600;}
        #oandaKursPanel{position:fixed;right:18px;bottom:76px;z-index:2147483647;
            width:340px;background:#fff;border:1px solid #d0d4da;border-radius:10px;
            box-shadow:0 6px 24px rgba(0,0,0,.25);font-family:Arial,Helvetica,sans-serif;
            color:#1a1a1a;display:none;overflow:hidden;}
        #oandaKursPanel.open{display:block;}
        #oandaKursPanel .hdr{background:#1F4E78;color:#fff;padding:10px 12px;font-weight:bold;
            display:flex;justify-content:space-between;align-items:center;font-size:14px;}
        #oandaKursPanel .hdr .x{cursor:pointer;font-size:16px;line-height:1;}
        #oandaKursPanel .body{padding:12px;}
        #oandaKursPanel .row{display:flex;gap:8px;align-items:center;margin-bottom:10px;}
        #oandaKursPanel label{font-size:12px;color:#555;width:42px;flex:0 0 42px;}
        #oandaKursPanel input,#oandaKursPanel select{
            flex:1;padding:7px 8px;border:1px solid #c4c9d0;border-radius:6px;font-size:14px;
            box-sizing:border-box;background:#fff;}
        #oandaKursPanel .swap{width:100%;margin:2px 0 10px;padding:6px;border:1px dashed #b9c0c9;
            background:#f5f7fa;border-radius:6px;cursor:pointer;font-size:12px;color:#1F4E78;}
        #oandaKursPanel .swap:hover{background:#eef2f7;}
        #oandaKursPanel .today{flex:0 0 auto;padding:7px 10px;border:1px solid #c4c9d0;border-radius:6px;
            background:#f5f7fa;cursor:pointer;font-size:12px;color:#1F4E78;}
        #oandaKursPanel .today:hover{background:#eef2f7;}
        #oandaKursPanel .result{background:#f0f5fb;border:1px solid #d6e2f0;border-radius:8px;
            padding:10px;text-align:center;font-size:18px;font-weight:bold;color:#13314d;min-height:22px;}
        #oandaKursPanel .meta{font-size:11px;color:#777;text-align:center;margin-top:6px;min-height:14px;}
        #oandaKursPanel .meta.err{color:#b3261e;}
        #oandaKursPanel .lvlhdr{display:flex;justify-content:space-between;align-items:center;
            margin:12px 0 6px;font-size:12px;color:#555;font-weight:bold;}
        #oandaKursPanel .seg{display:inline-flex;border:1px solid #c4c9d0;border-radius:6px;overflow:hidden;}
        #oandaKursPanel .seg button{border:none;background:#fff;padding:4px 8px;font-size:11px;cursor:pointer;color:#1F4E78;}
        #oandaKursPanel .seg button.active{background:#1F4E78;color:#fff;}
        #oandaKursPanel .eurline{font-size:11px;color:#777;text-align:center;margin-bottom:6px;min-height:14px;}
        #oandaKursPanel .levels{max-height:230px;overflow-y:auto;border:1px solid #e6e9ee;border-radius:8px;}
        #oandaKursPanel .lvl{display:flex;gap:8px;align-items:flex-start;padding:7px 9px;border-bottom:1px solid #eef1f4;
            border-left:4px solid transparent;font-size:12px;}
        #oandaKursPanel .lvl:last-child{border-bottom:none;}
        #oandaKursPanel .lvl.ok{background:#eafaf0;border-left-color:#1e9e54;}
        #oandaKursPanel .lvl.no{background:#fdecec;border-left-color:#d23b3b;}
        #oandaKursPanel .lvl.neutral{background:#fff;}
        #oandaKursPanel .lvl .cap{flex:0 0 auto;font-weight:bold;min-width:70px;}
        #oandaKursPanel .lvl .cap small{display:block;font-weight:normal;color:#888;font-size:10px;}
        #oandaKursPanel .lvl .roles{flex:1;color:#444;line-height:1.25;}
        #oandaKursPanel .lvl .mark{flex:0 0 auto;font-weight:bold;}
        #oandaKursPanel .lvl.ok .mark{color:#1e9e54;}
        #oandaKursPanel .lvl.no .mark{color:#d23b3b;}
    `);

    function todayStr() {
        const d = new Date();
        const off = d.getTimezoneOffset();
        return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
    }

    function buildOptions(selected) {
        return CURRENCIES.map(([code, name]) =>
            `<option value="${code}" ${code === selected ? 'selected' : ''}>${code} — ${name}</option>`
        ).join('');
    }

    const btn = document.createElement('button');
    btn.id = 'oandaKursBtn';
    btn.title = 'Przelicznik walut (OANDA)';
    btn.textContent = '€';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'oandaKursPanel';
    panel.innerHTML = `
        <div class="hdr">Przelicznik walut (OANDA)<span class="x" title="Zamknij">✕</span></div>
        <div class="body">
            <div class="row">
                <label>Kwota</label>
                <input id="okAmount" type="text" inputmode="decimal" value="${saved.amount != null ? saved.amount : '1'}">
            </div>
            <div class="row">
                <label>Z</label>
                <select id="okFrom">${buildOptions(saved.from || 'HUF')}</select>
            </div>
            <button class="swap" id="okSwap">⇅ zamień miejscami</button>
            <div class="row">
                <label>Na</label>
                <select id="okTo">${buildOptions(saved.to || 'EUR')}</select>
            </div>
            <div class="row">
                <label>Data</label>
                <input id="okDate" type="date" value="${todayStr()}">
                <button class="today" id="okToday" title="Ustaw dzisiejszą datę">dziś</button>
            </div>
            <div class="result" id="okResult">—</div>
            <div class="meta" id="okMeta"></div>
            <div class="lvlhdr">
                <span>Autoryzacja (wg EUR)</span>
                <span class="seg" id="okSeg">
                    <button data-t="cash" class="active">Gotówka</button><button data-t="voucher">Voucher</button>
                </span>
            </div>
            <div class="eurline" id="okEur"></div>
            <div class="levels" id="okLevels"></div>
        </div>
    `;
    document.body.appendChild(panel);

    const $ = (id) => panel.querySelector(id);
    const elAmount = $('#okAmount');
    const elFrom = $('#okFrom');
    const elTo = $('#okTo');
    const elDate = $('#okDate');
    const elResult = $('#okResult');
    const elMeta = $('#okMeta');
    const elEur = $('#okEur');
    const elLevels = $('#okLevels');
    const elSeg = $('#okSeg');
    let authType = saved.authType === 'voucher' ? 'voucher' : 'cash';
    let lastEur = null; // ostatnio policzona równowartość w EUR (lub null)

    // podświetl właściwy przycisk segmentu
    function syncSeg() {
        elSeg.querySelectorAll('button').forEach(b => {
            b.classList.toggle('active', b.dataset.t === authType);
        });
    }
    syncSeg();

    function fmtCap(v) {
        return v === Infinity ? 'bez limitu' : '< ' + formatNum(v, 0) + ' €';
    }

    function renderLevels() {
        const type = authType; // 'cash' | 'voucher'
        elLevels.innerHTML = LEVELS.map(L => {
            const cap = L[type];
            let cls = 'neutral', mark = '';
            if (lastEur !== null) {
                const ok = lastEur <= cap; // może zatwierdzić tę kwotę
                cls = ok ? 'ok' : 'no';
                mark = ok ? '✓' : '✕';
            }
            const note = L.note ? `<small>${L.note}</small>` : '';
            return `<div class="lvl ${cls}">
                <span class="cap">${fmtCap(cap)}<small>${L.lvl}</small></span>
                <span class="roles">${L.roles}${note ? '<br>' + note : ''}</span>
                <span class="mark">${mark}</span>
            </div>`;
        }).join('');
        if (lastEur !== null) {
            elEur.textContent = `Kwota ≈ ${formatNum(lastEur)} € · próg: ${authType === 'cash' ? 'Gotówka' : 'Voucher'}`;
        } else {
            elEur.textContent = '';
        }
    }
    renderLevels();

    function persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                amount: elAmount.value, from: elFrom.value, to: elTo.value, authType: authType
            }));
        } catch (e) {}
    }

    function parseAmount(v) {
        // akceptuje przecinek i kropkę, spacje jako separator tysięcy
        const cleaned = String(v).replace(/\s/g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
    }

    let reqToken = 0;
    function convert() {
        const amount = parseAmount(elAmount.value);
        const from = elFrom.value;
        const to = elTo.value;
        persist();
        elMeta.classList.remove('err');

        if (amount === null) {
            elResult.textContent = '—'; elMeta.textContent = 'Podaj kwotę';
            lastEur = null; renderLevels(); return;
        }

        const myToken = ++reqToken;
        elMeta.textContent = 'Pobieram kurs…';
        elResult.textContent = '…';

        const dateStr = elDate.value || todayStr();
        const isToday = dateStr === todayStr();

        // główne przeliczenie from -> to
        const pMain = fetchRate(from, to, dateStr);
        // równowartość w EUR (do oceny poziomów) — bez zbędnego zapytania, gdy się da
        let pEur;
        if (from === 'EUR') pEur = Promise.resolve(1);          // amount już w EUR
        else if (to === 'EUR') pEur = pMain;                    // ten sam kurs co główny
        else pEur = fetchRate(from, 'EUR', dateStr);

        pMain.then((rate) => {
            if (myToken !== reqToken) return;
            const out = amount * rate;
            elResult.textContent = `${formatNum(out)} ${to}`;
            const dateInfo = isToday ? 'dziś' : dateStr;
            elMeta.textContent = `1 ${from} = ${formatNum(rate, 6)} ${to} · OANDA · ${dateInfo}`;
        }).catch((err) => {
            if (myToken !== reqToken) return;
            elResult.textContent = '—';
            elMeta.textContent = err.message || 'Błąd pobierania kursu';
            elMeta.classList.add('err');
        });

        pEur.then((eurRate) => {
            if (myToken !== reqToken) return;
            lastEur = amount * eurRate;
            renderLevels();
        }).catch(() => {
            if (myToken !== reqToken) return;
            lastEur = null; renderLevels();
        });
    }

    function formatNum(n, maxFrac = 2) {
        return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, maxFrac) });
    }

    // zdarzenia
    btn.addEventListener('click', () => {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) { elAmount.focus(); elAmount.select(); convert(); }
    });
    panel.querySelector('.x').addEventListener('click', () => panel.classList.remove('open'));

    let typingTimer;
    elAmount.addEventListener('input', () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(convert, 250);
    });
    elFrom.addEventListener('change', convert);
    elTo.addEventListener('change', convert);
    elDate.addEventListener('change', convert);
    $('#okToday').addEventListener('click', () => { elDate.value = todayStr(); convert(); });
    elSeg.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
            authType = b.dataset.t;
            syncSeg(); persist(); renderLevels();
        });
    });
    $('#okSwap').addEventListener('click', () => {
        const a = elFrom.value; elFrom.value = elTo.value; elTo.value = a;
        convert();
    });

    // ============================================================
    //  v1.5 — VIES: walidacja VAT w VIES (UE) + Biała Lista MF (PL)
    //  Zapytania przez GM_xmlhttpRequest (omija CORS), jak OANDA.
    //  VIES:        https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{KRAJ}/vat/{NR}
    //  Biała Lista: https://wl-api.mf.gov.pl/api/search/nip/{NIP}?date=RRRR-MM-DD
    // ============================================================

    // Kraje VIES (kod 2-literowy wg VIES: Grecja = EL, Irlandia Płn. = XI; UK poza VIES)
    const VIES_COUNTRIES = [
        ['PL','Polska'],['AT','Austria'],['BE','Belgia'],['BG','Bułgaria'],['CY','Cypr'],
        ['CZ','Czechy'],['DE','Niemcy'],['DK','Dania'],['EE','Estonia'],['EL','Grecja'],
        ['ES','Hiszpania'],['FI','Finlandia'],['FR','Francja'],['HR','Chorwacja'],['HU','Węgry'],
        ['IE','Irlandia'],['IT','Włochy'],['LT','Litwa'],['LU','Luksemburg'],['LV','Łotwa'],
        ['MT','Malta'],['NL','Holandia'],['PT','Portugalia'],['RO','Rumunia'],['SE','Szwecja'],
        ['SI','Słowenia'],['SK','Słowacja'],['XI','Irlandia Płn.'],
    ];

    GM_addStyle(`
        #viesBtn{position:fixed;right:74px;bottom:18px;z-index:2147483646;
            height:48px;padding:0 16px;border-radius:24px;border:none;cursor:pointer;
            background:#FF2F00;color:#fff;font-size:14px;font-weight:bold;
            box-shadow:0 2px 10px rgba(0,0,0,.3);white-space:nowrap;}
        #viesBtn:hover{background:#cc2900;}
        #viesPanel{position:fixed;right:18px;bottom:76px;z-index:2147483647;
            width:372px;background:#fff;border:1px solid #d0d4da;border-radius:10px;
            box-shadow:0 6px 24px rgba(0,0,0,.25);font-family:Arial,Helvetica,sans-serif;
            color:#1a1a1a;display:none;overflow:hidden;}
        #viesPanel.open{display:block;}
        #viesPanel .hdr{background:#FF2F00;color:#fff;padding:10px 12px;font-weight:bold;
            display:flex;justify-content:space-between;align-items:center;font-size:14px;}
        #viesPanel .hdr .x{cursor:pointer;font-size:16px;line-height:1;}
        #viesPanel .body{padding:12px;}
        #viesPanel .row{display:flex;gap:8px;align-items:center;margin-bottom:10px;}
        #viesPanel label{font-size:12px;color:#555;width:66px;flex:0 0 66px;}
        #viesPanel input,#viesPanel select{
            flex:1;padding:7px 8px;border:1px solid #c4c9d0;border-radius:6px;font-size:14px;
            box-sizing:border-box;background:#fff;}
        #viesPanel .today{flex:0 0 auto;padding:7px 10px;border:1px solid #c4c9d0;border-radius:6px;
            background:#f5f7fa;cursor:pointer;font-size:12px;color:#750000;}
        #viesPanel .today:hover{background:#F6E7E6;}
        #viesPanel .check{width:100%;margin:2px 0 10px;padding:9px;border:none;border-radius:6px;
            background:#FF2F00;color:#fff;font-weight:bold;cursor:pointer;font-size:14px;}
        #viesPanel .check:hover{background:#cc2900;}
        #viesPanel .check:disabled{background:#DBD9D7;color:#888;cursor:default;}
        #viesPanel .regwrap{display:none;flex-wrap:wrap;gap:8px;margin:0 0 10px;}
        #viesPanel .reg{flex:1 1 auto;min-width:calc(50% - 4px);padding:9px 6px;border:1px solid #750000;border-radius:6px;
            background:#fff;color:#750000;font-weight:bold;cursor:pointer;font-size:12px;white-space:nowrap;}
        #viesPanel .reg:hover{background:#F6E7E6;}
        #viesPanel .meta{font-size:11px;color:#777;text-align:center;margin-bottom:8px;min-height:14px;}
        #viesPanel .meta.err{color:#b3261e;}
        #viesPanel .card{border:1px solid #e6e9ee;border-radius:8px;padding:10px;margin-bottom:10px;}
        #viesPanel .card:last-child{margin-bottom:0;}
        #viesPanel #viesResult{max-height:44vh;overflow-y:auto;overflow-x:hidden;}
        #viesPanel .card h4{margin:0 0 6px;font-size:12px;color:#750000;text-transform:uppercase;letter-spacing:.3px;}
        #viesPanel .kv{display:flex;font-size:12px;line-height:1.5;margin-bottom:2px;}
        #viesPanel .kv .k{flex:0 0 120px;color:#777;}
        #viesPanel .kv .v{flex:1;color:#222;word-break:break-word;}
        #viesPanel .badge{display:inline-block;padding:1px 8px;border-radius:10px;font-weight:bold;font-size:12px;}
        #viesPanel .badge.ok{background:#eafaf0;color:#1e9e54;}
        #viesPanel .badge.no{background:#fdecec;color:#d23b3b;}
        #viesPanel .badge.warn{background:#fff6e6;color:#a15c00;}
    `);

    function fetchVies(country, vat) {
        return new Promise((resolve, reject) => {
            const url = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/'
                + encodeURIComponent(country) + '/vat/' + encodeURIComponent(vat);
            GM_xmlhttpRequest({
                method:'GET', url:url, headers:{'Accept':'application/json'},
                onload:(res)=>{ try{ resolve(JSON.parse(res.responseText)); }
                    catch(e){ reject(new Error('VIES: zła odpowiedź (nie JSON)')); } },
                onerror:()=>reject(new Error('VIES: błąd połączenia')),
                ontimeout:()=>reject(new Error('VIES: przekroczono czas')),
                timeout:20000,
            });
        });
    }

    function fetchWykaz(nip, date) {
        return new Promise((resolve, reject) => {
            const url = 'https://wl-api.mf.gov.pl/api/search/nip/'
                + encodeURIComponent(nip) + '?date=' + encodeURIComponent(date);
            GM_xmlhttpRequest({
                method:'GET', url:url, headers:{'Accept':'application/json'},
                onload:(res)=>{
                    try{
                        const data = JSON.parse(res.responseText);
                        if (res.status === 200) { resolve(data); return; }
                        const msg = (data && (data.message || data.code)) ? (data.message || data.code) : ('HTTP ' + res.status);
                        reject(new Error('Biała Lista: ' + msg));
                    } catch(e){
                        if (res.status === 429) reject(new Error('Biała Lista: limit zapytań na dziś wyczerpany'));
                        else reject(new Error('Biała Lista: zła odpowiedź (HTTP ' + res.status + ')'));
                    }
                },
                onerror:()=>reject(new Error('Biała Lista: błąd połączenia')),
                ontimeout:()=>reject(new Error('Biała Lista: przekroczono czas')),
                timeout:20000,
            });
        });
    }

    // --- RO: ANAF (rejestr podatnikow VAT) — publiczne API, POST JSON [{cui,data}] ---
    function fetchAnaf(cui, date) {
        return new Promise((resolve, reject) => {
            const url = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';
            GM_xmlhttpRequest({
                method:'POST', url:url,
                headers:{'Content-Type':'application/json','Accept':'application/json'},
                data: JSON.stringify([{ cui: Number(cui), data: date }]),
                onload:(res)=>{ try{ resolve(JSON.parse(res.responseText)); }
                    catch(e){ reject(new Error('ANAF: zła odpowiedź (nie JSON)')); } },
                onerror:()=>reject(new Error('ANAF: błąd połączenia')),
                ontimeout:()=>reject(new Error('ANAF: przekroczono czas')),
                timeout:20000,
            });
        });
    }

    // Rejestry krajowe bez darmowego API — otwierane w nowej karcie (VIES daje ważność+nazwę)
    // ===================== GUS BIR (REGON) — SOAP API =====================
    // Wymaga klucza produkcyjnego (wniosek e-mail: regon_bir@stat.gov.pl).
    // Domyslnie srodowisko TESTOWE (klucz publiczny) — dane zamrozone na
    // 2014-11-08 i zanonimizowane (nazwy/adresy). Aby miec realne dane:
    // ustaw GUS.env='prod' i wklej klucz produkcyjny w GUS.keys.prod.
    const GUS = {
        env: 'test',
        keys: { test: 'abcde12345abcde12345', prod: 'TU_WKLEJ_KLUCZ_PRODUKCYJNY' },
        url: {
            test: 'https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc',
            prod: 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc',
        },
    };
    let gusSid = null;
    function gusEndpoint(){ return GUS.url[GUS.env]; }
    function gusKey(){ return GUS.keys[GUS.env]; }

    function gusPost(action, bodyXml, useSid){
        const ep = gusEndpoint();
        const envelope =
            '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">'
          + '<soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">'
          + '<wsa:To>' + ep + '</wsa:To>'
          + '<wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/' + action + '</wsa:Action>'
          + '</soap:Header><soap:Body>' + bodyXml + '</soap:Body></soap:Envelope>';
        const headers = { 'Content-Type': 'application/soap+xml; charset=utf-8' };
        if (useSid && gusSid) headers['sid'] = gusSid;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method:'POST', url:ep, headers:headers, data:envelope,
                onload:(res)=>resolve(res.responseText || ''),
                onerror:()=>reject(new Error('GUS: blad polaczenia')),
                ontimeout:()=>reject(new Error('GUS: przekroczono czas')),
                timeout:25000,
            });
        });
    }

    function gusExtractResult(responseText, resultLocalName){
        const m = responseText.match(/<(\w+):Envelope[\s\S]*<\/\1:Envelope>/) || responseText.match(/<Envelope[\s\S]*<\/Envelope>/);
        if (!m) return null;
        let doc;
        try { doc = new DOMParser().parseFromString(m[0], 'text/xml'); } catch(e){ return null; }
        const all = doc.getElementsByTagName('*');
        for (let i=0;i<all.length;i++){ if (all[i].localName === resultLocalName) return all[i].textContent; }
        return null;
    }

    function gusParseFields(innerXml){
        if (!innerXml || innerXml.indexOf('<dane>') === -1) return null;
        let d;
        try { d = new DOMParser().parseFromString(innerXml, 'text/xml'); } catch(e){ return null; }
        const dane = d.getElementsByTagName('dane')[0];
        if (!dane) return null;
        const out = {};
        const kids = dane.childNodes;
        for (let i=0;i<kids.length;i++){ const n = kids[i]; if (n.nodeType === 1) out[n.localName] = (n.textContent||'').trim(); }
        return out;
    }

    async function gusZaloguj(){
        const body = '<ns:Zaloguj><ns:pKluczUzytkownika>' + gusKey() + '</ns:pKluczUzytkownika></ns:Zaloguj>';
        const txt = await gusPost('Zaloguj', body, false);
        const sid = gusExtractResult(txt, 'ZalogujResult');
        if (!sid || !sid.trim()) throw new Error('GUS: logowanie nieudane (klucz?)');
        return sid.trim();
    }
    async function gusSzukaj(nip){
        const body = '<ns:DaneSzukajPodmioty><ns:pParametryWyszukiwania><dat:Nip>' + nip + '</dat:Nip></ns:pParametryWyszukiwania></ns:DaneSzukajPodmioty>';
        const txt = await gusPost('DaneSzukajPodmioty', body, true);
        return gusParseFields(gusExtractResult(txt, 'DaneSzukajPodmiotyResult'));
    }
    async function gusRaport(regon, report){
        const body = '<ns:DanePobierzPelnyRaport><ns:pRegon>' + regon + '</ns:pRegon><ns:pNazwaRaportu>' + report + '</ns:pNazwaRaportu></ns:DanePobierzPelnyRaport>';
        const txt = await gusPost('DanePobierzPelnyRaport', body, true);
        return gusParseFields(gusExtractResult(txt, 'DanePobierzPelnyRaportResult'));
    }
    async function gusLookup(nip){
        if (!gusSid) gusSid = await gusZaloguj();
        let dane = await gusSzukaj(nip);
        if (!dane) { gusSid = await gusZaloguj(); dane = await gusSzukaj(nip); } // sesja mogla wygasnac
        if (!dane) return null;
        let extra = null;
        try {
            const typ = (dane.Typ || '').charAt(0);
            const regon = dane.Regon || '';
            if (regon && typ === 'P') extra = await gusRaport(regon, 'BIR11OsPrawna');
            else if (regon && typ === 'F') extra = await gusRaport(regon, 'BIR11OsFizycznaDzialalnoscCeidg');
        } catch(e){}
        return { dane, extra };
    }
    function gusRegDate(extra){
        if (!extra) return '';
        return extra.praw_dataPowstania || extra.fiz_dataPowstania
            || extra.praw_dataRozpoczeciaDzialalnosci || extra.fiz_dataRozpoczeciaDzialalnosci
            || extra.praw_dataWpisuDoRegon || extra.fiz_dataWpisuDzialalnosciDoRegon || '';
    }
    function renderGus(result){
        if (!result || !result.dane){
            return `<div class="card"><h4>GUS REGON</h4>${viesKv('Status', viesBadge('no','Nie znaleziono w rejestrze REGON'))}</div>`;
        }
        const d = result.dane;
        const hasReal = (d.Regon && d.Regon.length) || (d.Nazwa && d.Nazwa.length);
        const typ = (d.Typ||'').charAt(0);
        const typName = typ==='P' ? 'osoba prawna / jedn. organizacyjna' : (typ==='F' ? 'osoba fizyczna (dz. gosp.)' : (d.Typ||'—'));
        const nr = d.NrNieruchomosci ? (d.NrNieruchomosci + (d.NrLokalu ? '/'+d.NrLokalu : '')) : '';
        const addr = [d.Ulica, nr, d.KodPocztowy, d.Miejscowosc].filter(x=>x).join(' ');
        const zakonczona = d.DataZakonczeniaDzialalnosci && d.DataZakonczeniaDzialalnosci.replace(/[^0-9]/g,'').length >= 8;
        const reg = gusRegDate(result.extra);
        const forma = result.extra ? (result.extra.praw_podstawowaFormaPrawna_Nazwa || '') : '';
        const env = GUS.env === 'test' ? ' (TEST: dane 2014, anonim.)' : '';
        return `<div class="card">
            <h4>GUS REGON${viesEsc(env)}</h4>
            ${viesKv('Status', !hasReal ? viesBadge('warn','Brak danych (pusty rekord — srodowisko testowe?)') : (zakonczona ? viesBadge('no','Dzialalnosc zakonczona') : viesBadge('ok','Aktywny w REGON')))}
            ${viesKv('Data powstania', reg ? viesEsc(reg) : viesBadge('warn','brak'))}
            ${viesKv('Nazwa', viesEsc(d.Nazwa||'—'))}
            ${viesKv('Adres', viesEsc(addr||'—'))}
            ${viesKv('REGON', viesEsc(d.Regon||'—'))}
            ${viesKv('NIP', viesEsc(d.Nip||'—'))}
            ${viesKv('Typ', viesEsc(typName))}
            ${forma ? viesKv('Forma prawna', viesEsc(forma)) : ''}
        </div>`;
    }
    async function runGusInPanel(nip){
        if (!nip){ vMeta.className='meta err'; vMeta.textContent='Podaj NIP'; return; }
        const loadingId = 'gus-loading-card';
        const old = document.getElementById(loadingId); if (old) old.remove();
        vResult.insertAdjacentHTML('beforeend', `<div class="card" id="${loadingId}"><h4>GUS REGON</h4>${viesKv('Status','Sprawdzam…')}</div>`);
        try {
            const result = await gusLookup(nip);
            const el = document.getElementById(loadingId); if (el) el.outerHTML = renderGus(result);
        } catch(e){
            const el = document.getElementById(loadingId);
            const html = `<div class="card"><h4>GUS REGON</h4>${viesKv('Status', viesBadge('warn','blad: '+viesEsc(e.message)))}</div>`;
            if (el) el.outerHTML = html; else vResult.insertAdjacentHTML('beforeend', html);
        }
    }

    // ===================== KRS — API Ministerstwa Sprawiedliwosci =====================
    // Bezplatne, bezkluczowe. Odpis aktualny w JSON po numerze KRS (z Bialej Listy).
    // rejestr: P = przedsiebiorcy, S = stowarzyszenia/fundacje. Probujemy P, potem S.
    function fetchKrsOne(krs, rejestr){
        return new Promise((resolve) => {
            const url = 'https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/' + encodeURIComponent(krs) + '?rejestr=' + rejestr + '&format=json';
            GM_xmlhttpRequest({
                method:'GET', url:url, headers:{'Accept':'application/json'},
                onload:(res)=>{ try { if (res.status===200){ const d = JSON.parse(res.responseText); if (d && d.odpis) { resolve(d); return; } } } catch(e){} resolve(null); },
                onerror:()=>resolve(null), ontimeout:()=>resolve(null), timeout:20000,
            });
        });
    }
    async function fetchKrs(krs){
        let d = await fetchKrsOne(krs, 'P');
        if (!d) d = await fetchKrsOne(krs, 'S');
        return d;
    }
    function renderKrs(data){
        if (!data || !data.odpis) return `<div class="card"><h4>KRS (Rejestr Sadowy)</h4>${viesKv('Status', viesBadge('no','Nie znaleziono odpisu aktualnego'))}</div>`;
        const o = data.odpis;
        const nag = o.naglowekA || {};
        const d1 = (o.dane && o.dane.dzial1) || {};
        const pod = d1.danePodmiotu || {};
        const sia = d1.siedzibaIAdres || {};
        const adr = sia.adres || {};
        const regDate = nag.dataRejestracjiWKRS || nag.dataRejestracji || '';
        const nr = adr.nrDomu ? (adr.nrDomu + (adr.nrLokalu ? '/'+adr.nrLokalu : '')) : '';
        const address = [adr.ulica, nr, adr.kodPocztowy, adr.miejscowosc].filter(x=>x).join(' ');
        return `<div class="card">
            <h4>KRS (Rejestr Sadowy)</h4>
            ${viesKv('Data rejestracji', regDate ? viesEsc(regDate) : viesBadge('warn','brak'))}
            ${viesKv('Forma prawna', viesEsc(pod.formaPrawna || '—'))}
            ${viesKv('Nazwa', viesEsc(pod.nazwa || '—'))}
            ${viesKv('Siedziba', viesEsc(address || '—'))}
            ${viesKv('Nr KRS', viesEsc(nag.numerKRS || '—'))}
        </div>`;
    }
    async function runKrsInPanel(krs){
        const digits = String(krs||'').replace(/[^0-9]/g,'');
        if (!digits) return;
        const id = 'krs-loading-card';
        const old = document.getElementById(id); if (old) old.remove();
        vResult.insertAdjacentHTML('beforeend', `<div class="card" id="${id}"><h4>KRS (Rejestr Sadowy)</h4>${viesKv('Status','Sprawdzam…')}</div>`);
        try {
            const data = await fetchKrs(digits);
            const el = document.getElementById(id); if (el) el.outerHTML = renderKrs(data);
        } catch(e){
            const el = document.getElementById(id);
            if (el) el.outerHTML = `<div class="card"><h4>KRS (Rejestr Sadowy)</h4>${viesKv('Status', viesBadge('warn','blad: '+viesEsc(e.message)))}</div>`;
        }
    }

    function renderGusTable(d){
        if (!d || !Object.keys(d).length) return `<div class="card"><h4>GUS REGON (tabela)</h4>${viesKv('Status', viesBadge('no','Brak wyniku w GUS'))}</div>`;
        let rows = '';
        for (const k in d){ const v = (d[k]||'').replace(/^[-\s]+$/,'').trim(); if (v) rows += viesKv(k, viesEsc(v)); }
        if (!rows) rows = viesKv('Status', viesBadge('no','Pusty wynik'));
        return `<div class="card"><h4>GUS REGON (tabela)</h4>${rows}</div>`;
    }
    function runGusPopup(nip){
        const digits = String(nip||'').replace(/[^0-9]/g,'');
        if (!digits){ vMeta.className='meta err'; vMeta.textContent='Podaj NIP'; return; }
        const cardId = 'gustab-card';
        const old = document.getElementById(cardId); if (old) old.remove();
        vResult.insertAdjacentHTML('beforeend', `<div class="card" id="${cardId}"><h4>GUS REGON (tabela)</h4>${viesKv('Status','Pobieram z GUS…')}</div>`);
        const url = 'https://wyszukiwarkaregon.stat.gov.pl/appBIR/index.aspx#nip=' + encodeURIComponent(digits) + '&bg=1';
        let done = false;
        let win = null;
        const finish = (html) => { if (done) return; done = true; window.removeEventListener('message', onMsg); const el = document.getElementById(cardId); if (el) el.outerHTML = html; try { if (win && !win.closed) win.close(); } catch(e){} };
        const onMsg = (e) => { if ((e.origin||'').indexOf('wyszukiwarkaregon.stat.gov.pl') === -1) return; if (!e.data || !e.data.__gusTable) return; finish(renderGusTable(e.data.data)); };
        window.addEventListener('message', onMsg);
        win = window.open(url, 'gusbg', 'width=1080,height=680');
        if (!win) { finish('<div class="card"><h4>GUS REGON (tabela)</h4>' + viesKv('Status', viesBadge('warn','Okienko zablokowane przez przegladarke')) + '<div style="margin-top:6px"><a href="' + url + '" target="_blank" rel="noopener" style="color:#750000;font-weight:bold">Otworz w GUS →</a></div></div>'); return; }
        setTimeout(() => { finish('<div class="card"><h4>GUS REGON (tabela)</h4>' + viesKv('Status', viesBadge('warn','Nie udalo sie pobrac tabeli')) + '<div style="margin-top:6px"><a href="' + url + '" target="_blank" rel="noopener" style="color:#750000;font-weight:bold">Otworz w GUS →</a></div></div>'); }, 20000);
    }
    function runGusIframe(nip){
        const digits = String(nip||'').replace(/[^0-9]/g,'');
        if (!digits){ vMeta.className='meta err'; vMeta.textContent='Podaj NIP'; return; }
        const cardId = 'gustab-card';
        const old = document.getElementById(cardId); if (old) old.remove();
        vResult.insertAdjacentHTML('beforeend', `<div class="card" id="${cardId}"><h4>GUS REGON (tabela)</h4>${viesKv('Status','Pobieram w tle z GUS…')}</div>`);
        const url = 'https://wyszukiwarkaregon.stat.gov.pl/appBIR/index.aspx#nip=' + encodeURIComponent(digits);
        const ifr = document.createElement('iframe');
        ifr.style.cssText = 'position:absolute;left:-99999px;top:-99999px;width:1200px;height:800px;border:0;';
        ifr.src = url;
        let done = false;
        const finish = (html) => { if (done) return; done = true; window.removeEventListener('message', onMsg); try{ifr.remove();}catch(e){} const el = document.getElementById(cardId); if (el) el.outerHTML = html; };
        const onMsg = (e) => {
            if ((e.origin||'').indexOf('wyszukiwarkaregon.stat.gov.pl') === -1) return;
            if (!e.data || !e.data.__gusTable) return;
            finish(renderGusTable(e.data.data));
        };
        window.addEventListener('message', onMsg);
        document.body.appendChild(ifr);
        setTimeout(() => {
            finish('<div class="card"><h4>GUS REGON (tabela)</h4>' + viesKv('Status', viesBadge('warn','Nie udalo sie w tle (GUS mogl zablokowac osadzanie)')) + '<div style="margin-top:6px"><a href="' + url + '" target="_blank" rel="noopener" style="color:#750000;font-weight:bold">Otworz w GUS →</a></div></div>');
        }, 18000);
    }

    const REGISTRIES = {
        PL: [
            { name:'GUS (tabela)', api:'gustab' },
            { name:'CEIDG', url:()=>'https://aplikacja.ceidg.gov.pl/CEIDG/CEIDG.Public.UI/Search.aspx' },
        ],
        RO: [ { name:'ANAF / mfinante', url:(id)=>'https://mfinante.gov.ro/apps/infocodfiscal.html?cod='+encodeURIComponent(id) } ],
        IT: [ { name:'Agenzia Entrate', url:()=>'https://telemanagrafici.agenziaentrate.gov.it/VerificaPIVA/IVerificaPiva.jsp' } ],
        SK: [ { name:'foaf.sk', url:()=>'https://www.foaf.sk/' } ],
        HU: [ { name:'cegtalalo.hu', url:()=>'https://www.cegtalalo.hu/' } ],
    };
    function openRegistry(country, idx, id){
        const list = REGISTRIES[country]; if (!list || !list[idx] || !list[idx].url) return;
        try { if (navigator.clipboard && id) navigator.clipboard.writeText(id); } catch(e){}
        window.open(list[idx].url(id), '_blank', 'noopener');
    }

    function renderAnaf(data, date){
        const f = (data && Array.isArray(data.found) && data.found.length) ? data.found[0] : null;
        if (!f){
            return `<div class="card"><h4>ANAF (RO) — na dzień ${viesEsc(date)}</h4>${viesKv('Status', viesBadge('no','Nie znaleziono CUI w rejestrze'))}</div>`;
        }
        const dg = f.date_generale || f;
        const scpObj = f.inregistrare_scop_Tva || {};
        const isVat = (scpObj.scpTVA === true) || (dg.scpTVA === true) || (f.scpTVA === true);
        let reg = dg.data_inregistrare || '';
        if (!reg && dg.stare_inregistrare){ const m = String(dg.stare_inregistrare).match(/(\d{2}\.\d{2}\.\d{4})/); if (m) reg = m[1]; }
        const regHtml = reg ? viesEsc(reg) : viesBadge('warn','brak daty rejestracji');
        const vatMsg = scpObj.mesaj_ScpTVA || dg.mesaj_ScpTVA || '';
        return `<div class="card">
            <h4>ANAF (RO) — na dzień ${viesEsc(date)}</h4>
            ${viesKv('Status VAT', isVat ? viesBadge('ok','✓ Płatnik VAT') : viesBadge('no','✕ Niepłatnik VAT'))}
            ${vatMsg ? viesKv('Uwaga', viesEsc(vatMsg)) : ''}
            ${viesKv('Data rejestracji', regHtml)}
            ${viesKv('Nazwa', viesEsc(dg.denumire || '—'))}
            ${viesKv('Adres', viesEsc(dg.adresa || '—'))}
            ${viesKv('Nr Reg. Com.', viesEsc(dg.nrRegCom || '—'))}
            ${viesKv('Stan', viesEsc(dg.stare_inregistrare || '—'))}
        </div>`;
    }

    function viesEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    function viesKv(k,v){ return `<div class="kv"><span class="k">${viesEsc(k)}</span><span class="v">${v}</span></div>`; }
    function viesBadge(kind, txt){ return `<span class="badge ${kind}">${viesEsc(txt)}</span>`; }
    function viesDigits(s){ return String(s||'').replace(/[^0-9]/g,''); }

    const viesBtn = document.createElement('button');
    viesBtn.id = 'viesBtn';
    viesBtn.title = 'Sprawdź VAT w VIES / Biała Lista';
    viesBtn.textContent = 'VIES';
    document.body.appendChild(viesBtn);

    const viesPanel = document.createElement('div');
    viesPanel.id = 'viesPanel';
    viesPanel.innerHTML = `
        <div class="hdr">VIES — sprawdzenie VAT<span class="x" title="Zamknij">✕</span></div>
        <div class="body">
            <div class="row">
                <label>Kraj</label>
                <select id="viesCountry">${VIES_COUNTRIES.map(([c,n])=>`<option value="${c}" ${c==='PL'?'selected':''}>${c} — ${n}</option>`).join('')}</select>
            </div>
            <div class="row">
                <label>NIP / VAT</label>
                <input id="viesNip" type="text" placeholder="np. 7171642051">
            </div>
            <div class="row" id="viesDateRow">
                <label>Na dzień</label>
                <input id="viesDate" type="date" value="${todayStr()}">
                <button class="today" id="viesToday" title="Dzisiejsza data">dziś</button>
            </div>
            <button class="check" id="viesCheck">Sprawdź</button>
            <div id="viesReg" class="regwrap"></div>
            <div class="meta" id="viesMeta"></div>
            <div id="viesResult"></div>
        </div>
    `;
    document.body.appendChild(viesPanel);

    const vq = (id) => viesPanel.querySelector(id);
    const vCountry = vq('#viesCountry');
    const vNip = vq('#viesNip');
    const vDate = vq('#viesDate');
    const vDateRow = vq('#viesDateRow');
    const vCheck = vq('#viesCheck');
    const vMeta = vq('#viesMeta');
    const vResult = vq('#viesResult');
    const vReg = vq('#viesReg');

    function syncDateRow(){ const c = vCountry.value; vDateRow.style.display = (c === 'PL' || c === 'RO') ? 'flex' : 'none'; }
    function syncRegBtn(){
        const list = REGISTRIES[vCountry.value];
        if (!list || !list.length){ vReg.style.display='none'; vReg.innerHTML=''; return; }
        vReg.style.display='flex';
        vReg.innerHTML = list.map((r,i)=>`<button class="reg" data-idx="${i}">${viesEsc(r.name)}${r.api ? '' : ' →'}</button>`).join('');
    }
    function syncCountryUI(){ syncDateRow(); syncRegBtn(); }
    syncCountryUI();

    function renderVies(v){
        const valid = (v.isValid === true) || (v.userError === 'VALID');
        const name = (v.name && v.name !== '---') ? viesEsc(v.name) : '—';
        const addr = (v.address && v.address !== '---') ? viesEsc(v.address).replace(/\n/g,'<br>') : '—';
        const when = viesEsc(String(v.requestDate||'').replace('T',' ').replace(/\..*/,'')) || '—';
        const ident = (v.requestIdentifier && String(v.requestIdentifier).trim()) ? viesEsc(v.requestIdentifier) : '—';
        return `<div class="card">
            <h4>VIES (UE)</h4>
            ${viesKv('Status', valid ? viesBadge('ok','✓ Ważny numer VAT') : viesBadge('no','✕ Nieważny / brak'))}
            ${viesKv('Nazwa', name)}
            ${viesKv('Adres', addr)}
            ${viesKv('Sprawdzono', when)}
            ${viesKv('Nr potwierdzenia', ident)}
        </div>`;
    }

    function renderWykaz(data, date){
        const subj = (data && data.result) ? data.result.subject : null;
        if (!subj){
            return `<div class="card">
                <h4>Biała Lista (MF) — na dzień ${viesEsc(date)}</h4>
                ${viesKv('Status VAT', viesBadge('no','Brak w wykazie na ten dzień'))}
                ${viesKv('Data rejestracji', '—')}
            </div>`;
        }
        const status = subj.statusVat || '—';
        const stKind = /czynny/i.test(status) ? 'ok' : (/zwolniony/i.test(status) ? 'warn' : 'no');
        const reg = subj.registrationLegalDate ? viesEsc(subj.registrationLegalDate) : viesBadge('warn','brak daty rejestracji');
        const addr = viesEsc(subj.workingAddress || subj.residenceAddress || '—');
        const accs = Array.isArray(subj.accountNumbers) ? subj.accountNumbers : [];
        const accHtml = accs.length ? accs.map(a=>viesEsc(a)).join('<br>') : '—';
        return `<div class="card">
            <h4>Biała Lista (MF) — na dzień ${viesEsc(date)}</h4>
            ${viesKv('Status VAT', viesBadge(stKind, status))}
            ${viesKv('Data rejestracji VAT', reg)}
            ${viesKv('Nazwa', viesEsc(subj.name || '—'))}
            ${viesKv('Adres', addr)}
            ${viesKv('KRS', viesEsc(subj.krs || '—'))}
            ${viesKv('REGON', viesEsc(subj.regon || '—'))}
            ${viesKv('Konta ('+accs.length+')', accHtml)}
        </div>`;
    }

    async function runViesCheck(){
        const country = vCountry.value;
        const rawNip = vNip.value.trim();
        let vatForVies = rawNip.replace(/\s+/g,'').toUpperCase();
        if (vatForVies.startsWith(country)) vatForVies = vatForVies.slice(country.length);
        vatForVies = vatForVies.replace(/[^0-9A-Z]/g,'');
        if (!vatForVies){ vMeta.className='meta err'; vMeta.textContent='Podaj numer NIP/VAT'; return; }

        vCheck.disabled = true;
        vMeta.className='meta'; vMeta.textContent='Sprawdzam…';
        vResult.innerHTML='';

        const jobs = [];
        jobs.push(fetchVies(country, vatForVies)
            .then(v => ({type:'vies', ok:true, v}))
            .catch(e => ({type:'vies', ok:false, err:e.message})));

        let dateUsed = null;
        if (country === 'PL' || country === 'RO') dateUsed = vDate.value || todayStr();
        if (country === 'PL'){
            const nip = viesDigits(rawNip);
            jobs.push(fetchWykaz(nip, dateUsed)
                .then(d => ({type:'wl', ok:true, d}))
                .catch(e => ({type:'wl', ok:false, err:e.message})));
        } else if (country === 'RO'){
            const cui = viesDigits(rawNip);
            jobs.push(fetchAnaf(cui, dateUsed)
                .then(d => ({type:'anaf', ok:true, d}))
                .catch(e => ({type:'anaf', ok:false, err:e.message})));
        }

        const results = await Promise.all(jobs);
        let html = '';
        let krsNum = null;
        const errs = [];
        for (const r of results){
            if (r.type==='vies'){
                if (r.ok) html += renderVies(r.v);
                else { errs.push(r.err); html += `<div class="card"><h4>VIES (UE)</h4>${viesKv('Status', viesBadge('warn','błąd: '+viesEsc(r.err)))}</div>`; }
            } else if (r.type==='wl'){
                if (r.ok) { html += renderWykaz(r.d, dateUsed); const _s = (r.d && r.d.result) ? r.d.result.subject : null; if (_s && _s.krs) krsNum = _s.krs; }
                else { errs.push(r.err); html += `<div class="card"><h4>Biała Lista (MF)</h4>${viesKv('Status', viesBadge('warn','błąd: '+viesEsc(r.err)))}</div>`; }
            } else if (r.type==='anaf'){
                if (r.ok) html += renderAnaf(r.d, dateUsed);
                else { errs.push(r.err); html += `<div class="card"><h4>ANAF (RO)</h4>${viesKv('Status', viesBadge('warn','błąd: '+viesEsc(r.err)))}</div>`; }
            }
        }
        vResult.innerHTML = html;
        if (country === 'PL' && GUS.env === 'prod') runGusInPanel(viesDigits(rawNip));
        if (country === 'PL' && krsNum) runKrsInPanel(krsNum);
        vMeta.className = errs.length ? 'meta err' : 'meta';
        vMeta.textContent = errs.length ? ('Część danych niedostępna: ' + errs.join(' · ')) : 'Gotowe';
        vCheck.disabled = false;
    }

    viesBtn.addEventListener('click', () => {
        panel.classList.remove('open');
        viesPanel.classList.toggle('open');
        if (viesPanel.classList.contains('open')) vNip.focus();
    });
    // przelicznik i VIES nie są otwarte jednocześnie
    btn.addEventListener('click', () => viesPanel.classList.remove('open'));
    viesPanel.querySelector('.x').addEventListener('click', () => viesPanel.classList.remove('open'));
    vCountry.addEventListener('change', syncCountryUI);
    vDate.addEventListener('change', () => { const c=vCountry.value; if ((c==='PL'||c==='RO') && vNip.value.trim()) runViesCheck(); });
    vq('#viesToday').addEventListener('click', () => { vDate.value = todayStr(); const c=vCountry.value; if ((c==='PL'||c==='RO') && vNip.value.trim()) runViesCheck(); });
    vCheck.addEventListener('click', runViesCheck);
    vNip.addEventListener('keydown', (e) => { if (e.key === 'Enter') runViesCheck(); });
    vReg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-idx]'); if (!b) return;
        const list = REGISTRIES[vCountry.value] || [];
        const entry = list[parseInt(b.dataset.idx,10)];
        if (!entry) return;
        if (entry.api === 'gus') { runGusInPanel(viesDigits(vNip.value)); return; }
        if (entry.api === 'gustab') { runGusPopup(viesDigits(vNip.value)); return; }
        openRegistry(vCountry.value, parseInt(b.dataset.idx,10), viesDigits(vNip.value));
    });

})();
    }

    function init_ksieg() {
(function () {
    'use strict';

    const BASE = 'https://www.prologistics.info';
    const SEARCH_URL = `${BASE}/search.php?express`;

    let previewRows = [];
    let tmIsBusy = false;
    let popupCb = null;

    window.addEventListener('beforeunload', function (e) {
        if (!tmIsBusy) return;
        e.preventDefault();
        e.returnValue = '';
    });

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function absoluteUrl(href) {
        return new URL(href, BASE).href;
    }

    function normalizeSpaces(value) {
        let text = String(value || '');
        text = text.split(String.fromCharCode(10)).join(' ');
        text = text.split(String.fromCharCode(13)).join(' ');
        text = text.split(String.fromCharCode(9)).join(' ');
        while (text.indexOf('  ') >= 0) {
            text = text.split('  ').join(' ');
        }
        return text.trim();
    }

    function normalizeAmount(v) {
        if (v == null) return null;
        let s = String(v).replace(/\u00a0/g, '').replace(/\s+/g, '').replace(/[€£$]/g, '').trim();
        if (!s) return null;
        s = s.replace(/[^0-9.,-]/g, '');
        if (!s || s === '-') return null;
        const neg = s.startsWith('-');
        s = s.replace(/-/g, '');
        // Separatorem dziesiętnym jest ten, który występuje JAKO OSTATNI; reszta = separatory tysięcy.
        const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
        if (lc > -1 && ld > -1) {
            s = (lc > ld) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
        } else if (lc > -1) {
            const cnt = (s.match(/,/g) || []).length, after = s.length - lc - 1;
            s = (cnt > 1 || after === 3) ? s.replace(/,/g, '') : s.replace(',', '.'); // 1,900 = tysiące; 1,90 = dziesiętne
        } else if (ld > -1) {
            const cnt = (s.match(/\./g) || []).length, after = s.length - ld - 1;
            if (cnt > 1 || after === 3) s = s.replace(/\./g, ''); // 1.900 = tysiące; 1.90 = dziesiętne
        }
        let n = parseFloat(s);
        if (isNaN(n)) return null;
        if (neg) n = -n;
        return n.toFixed(2);
    }

    function isZeroAmount(amount) {
        const n = parseFloat(String(amount || '').replace(',', '.'));
        return !isNaN(n) && Math.abs(n) === 0;
    }

    function looksLikeAmountCell(v) {
        const s = String(v || '').trim();
        if (!s) return false;
        if (!/[0-9]/.test(s)) return false;
        if (/^[0-9]{3}-[0-9]{7}-[0-9]{7}$/.test(s)) return false;
        if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(s)) return false;
        return normalizeAmount(s) !== null;
    }

    function cleanOrder(v) {
        const s = String(v || '').trim();
        if (!s) return '';
        if (/order number/i.test(s)) return '';
        if (/fulfilment/i.test(s)) return '';
        if (/fulfillment/i.test(s)) return '';
        return s;
    }

    const ACCOUNTS = {
        "1000":"Kasse PLN BCE",
        "1001":"Kasse EUR BCE",
        "1002":"Kasse CHF BCE",
        "1003":"Kasse CNY BCE",
        "1007":"Qualistyle Revolut PLN",
        "1008":"Qualistyle Revolut EUR",
        "1009":"Qualistyle Revolut CHF",
        "1010":"Postfinance CHF Beliani CH",
        "1011":"Saferpay Beliani CHF",
        "1012":"Raiffeisen BCE PLN",
        "1013":"UniCredit RO Beliani EU GmbH",
        "1014":"UBS NOK Beliani (Norge) GmbH",
        "1015":"Postfinance GBP Beliani UK",
        "1016":"Postfinance CHF Beliani UK",
        "1017":"Postfinance EUR Beliani CH",
        "1018":"Postfinance USD Beliani USA",
        "1019":"Saferpay Beliani GBP",
        "1021":"Qualistyle PF EUR",
        "1022":"Saferpay Beliani EUR",
        "1023":"PayU Beliani PL",
        "1024":"PLN Alior Bank",
        "1025":"PLN CITIBANK Michael Widmer",
        "1026":"VidaXL PL",
        "1027":"BZ WBK PLN Beliani PL",
        "1028":"Saferpay PLN Beliani PL",
        "1029":"Paypal PLN Beliani PL",
        "1030":"CITIBANK PLN Beliani CH",
        "1031":"Przelewy24 Beliani PL",
        "1032":"Shopgate PLN Beliani PL",
        "1033":"Superwnetrze.pl Beliani PL",
        "1034":"Galaxus CHF",
        "1035":"Payever EUR Beliani DE",
        "1036":"Eboutic Beliani CH",
        "1037":"Decofinder CH",
        "1038":"DeinDeal Beliani CH",
        "1039":"Saferpay Beliani DE SEK",
        "1040":"Saferpay Beliani DE DKK",
        "1041":"Home 24 Beliani Switzerland GmbH",
        "1042":"Raiffeisen PLN Beliani PL",
        "1043":"Siroop Beliani CH",
        "1044":"Groupon CH",
        "1045":"Meble.pl Beliani PL",
        "1046":"MyStore Beliani CH",
        "1047":"VidaXL CH",
        "1048":"VidaXL DE",
        "1049":"PostFinance Beliani INT USD",
        "1050":"VidaXL FR",
        "1051":"VidaXL IT",
        "1052":"VidaXL PT",
        "1053":"Coop Beliani CH",
        "1054":"VidaXL SE",
        "1055":"CDON FI Beliani DE",
        "1056":"VidaXL HU",
        "1057":"VidaXL DK",
        "1058":"VidaXL CZ",
        "1059":"VidaXL FI",
        "1060":"VidaXL ES",
        "1061":"ePrice Beliani IT",
        "1062":"Carrefour ES Beliani Europe OU",
        "1063":"Credit Suisse Beliani Switzerland",
        "1064":"DiniChance Beliani Switzerland",
        "1065":"Postfinance Beliani Switzerland CHF",
        "1066":"Microspot Beliani CH",
        "1067":"Limango PLN, Beliani PL",
        "1068":"Swissbilling SA",
        "1069":"Allegro Beliani Polska",
        "1070":"UBS/Credit Suisse Beliani International GmbH",
        "1071":"Allegro Beliani",
        "1072":"OberBank CZK Beliani International",
        "1073":"Carrefour HiPay PLN",
        "1074":"UBS Beliani Switzerland",
        "1075":"Hir TV",
        "1076":"COD Rohling Suus",
        "1077":"COD DPD",
        "1078":"COD GLS",
        "1079":"COD DTS",
        "1080":"Raiffeisenbank CZK Beliani (International) GmbH",
        "1081":"Klarna Beliani PL",
        "1082":"Amazon PL",
        "1083":"Amazon SE",
        "1084":"PayU CZK Beliani DE",
        "1085":"COD FUTAR HU",
        "1086":"COD GLS HUF",
        "1087":"EMAG HUF",
        "1088":"Unpaid COD",
        "1089":"COD Ambro",
        "1090":"CDON discounts",
        "1091":"CDON NO - Beliani Norway- NOK",
        "1092":"Manor CH",
        "1093":"COD DHL",
        "1094":"COD InPost",
        "1095":"eMag RO Beliani (EU) GmbH",
        "1096":"COD PTT Beliani RO",
        "1097":"COD GLS Beliani RO",
        "1098":"COD Rohling Suus RO",
        "1099":"CS Beliani (PL) GmbH PLN",
        "1100":"Postbank 100235705 (BCE)",
        "1101":"CITIBANK Prologistics",
        "1102":"Monetico FR",
        "1103":"Conforama ES",
        "1104":"Vente Unique ES Beliani DE",
        "1107":"E.Leclerc FR",
        "1108":"Maisons Du Monde ES",
        "1110":"Galaxus DE",
        "1111":"Raiffeisenbank CZK Beliani (DE) GmbH",
        "1113":"Vente Unique IT Beliani DE",
        "1114":"Vente Unique DE Beliani DE",
        "1115":"Conforama PT Beliani DE",
        "1116":"Black Red White",
        "1117":"Leroy Merlin ES Beliani DE",
        "1118":"Raiffeisenbank EUR Beliani (DE) GmbH",
        "1119":"Maisons Du Monde DE",
        "1120":"Home and You PLN",
        "1121":"Vente Unique BE",
        "1122":"Vente Unique Beliani Swizterland GmbH",
        "1123":"Productpine Beliani Europe OU",
        "1124":"Furniture 1 FI",
        "1125":"JUMPL Beliani DE GmbH FR",
        "1126":"Millenium Bank Beliani DE PT",
        "1127":"XXXLutz EUR Beliani (DE) GmbH",
        "1128":"Raiffeisenbank CZK Beliani Europe OU",
        "1129":"DNB Bank Beliani Norway OU",
        "1130":"Corplife Beliani AT",
        "1131":"Kaufland SK Beliani DE",
        "1132":"Danske Bank Beliani Norway OU",
        "1133":"Kaufland CZK Beliani DE",
        "1134":"Groupon DE",
        "1135":"MOB SK Beliani DE GmbH",
        "1136":"COD GLS CZ",
        "1137":"COD Toptrans CZK",
        "1138":"Home24 Beliani DE",
        "1139":"Krakkainen FI Beliani DE EUR",
        "1141":"COD Toptrans EUR",
        "1142":"COD GLS Beliani SK",
        "1143":"Vente Unique PT",
        "1144":"Vente Unique NL Beliani Europe OU",
        "1145":"Home24 FR Beliani DE",
        "1146":"B&Q Beliani (UK) GmbH",
        "1147":"Home24 AT Beliani DE",
        "1148":"Allegro CZ Beliani DE",
        "1149":"Carrefour FR Beliani DE",
        "1150":"Brico Depot ES Beliani DE",
        "1151":"Brico Depot PT Beliani DE",
        "1152":"Castorama FR Beliani DE",
        "1153":"Hypoveriensbank EUR Beliani (EU) GmbH BE",
        "1154":"Gamm vert FR (Terract) Beliani DE",
        "1155":"Paypal EUR BE Beliani (EU)",
        "1156":"Saferpay EUR BE Beliani (EU)",
        "1157":"Klarna EUR BE Beliani (EU)",
        "1158":"Paypal NO Beliani Norway OU",
        "1159":"Saferpay RO Beliani (EU) GmbH",
        "1160":"Klarna RO Beliani (EU) GmbH",
        "1161":"CS RON Beliani (EU) Gmbh",
        "1162":"CS EUR Beliani (EU)Gmbh",
        "1163":"Home24 NL Beliani (EU) GmbH",
        "1164":"Robert Dyas Beliani (UK) GmbH",
        "1165":"BNP PLN Beliani PL",
        "1166":"Post Finance DKK Beliani (DE) GmbH",
        "1167":"Post Finance SEK Beliani (DE) GmbH",
        "1168":"Shein Beliani (DE) GmbH",
        "1169":"Joybuy DE Beliani (DE) GmbH",
        "1201":"Chase Bank Beliani USA LLC",
        "1202":"Bank of Amercica Beliani LLC",
        "1203":"Morele NET Beliani (PL) GmbH",
        "1206":"Paypal Beliani USA LLC",
        "1207":"Ebay UK",
        "1208":"Ebay DE",
        "1209":"Ebay IT",
        "1210":"Ebay ES",
        "1211":"Ebay FR",
        "1212":"CS - Beliani Int - SEK",
        "1213":"CS - Beliani Int - DKK",
        "1214":"CS - Beliani Int - HUF",
        "1215":"CS - Beliani Int - CZK",
        "1216":"Unicredit Beliani DE HUF",
        "1218":"CS - Beliani DE - EUR",
        "1219":"CS - Beliani DE - CHF",
        "1220":"Maisons Du Monde IT",
        "1221":"CS - Beliani DE - NOK",
        "1222":"Settlement of payments in other currencies",
        "1223":"Wayfair",
        "1224":"Check24",
        "1230":"VIDA XL Beliani UK",
        "1231":"Soisy IT Beliani DE",
        "1232":"EUPAGO PT Beliani DE",
        "1238":"ManoMano GBP Beliani UK",
        "1239":"Berliner Bank Beliani DE",
        "1241":"Wayfair GBP Beliani UK",
        "1242":"Westwing FR Schoenteakmoebel",
        "1243":"Postbank Beliani SP alias Beliani DE",
        "1244":"Bestmarques FR Schoenteakmoebel",
        "1245":"Lesara Schoenteakmoebel",
        "1246":"Handelsbanken Beliani DE DKK",
        "1247":"Millenium Bank Beliani GmbH - PT",
        "1248":"Handelsbanken Beliani DE SEK",
        "1249":"Deutsche Bank Beliani DE - ES",
        "1250":"Commerzbank Fachhandelpro",
        "1251":"Paypal EUR Schoenteakmoebel",
        "1252":"Amazon EUR Schoenteakmoebel",
        "1253":"Commerzbank Schoenteakmoebel",
        "1254":"Commerzbank EUR Beliani DE",
        "1255":"Postbank EUR Beliani DE",
        "1256":"Bank Austria Beliani DE",
        "1257":"Commerzbank HUF Beliani DE",
        "1258":"ManoMano FR Beliani DE",
        "1259":"Limango PS EUR Schoenteakmoebel",
        "1260":"Postbank (Bonviva venture)",
        "1261":"ManoMano IT Beliani DE",
        "1262":"Westwing DE EUR Schoenteakmoebel",
        "1263":"ManoMano ES Beliani DE",
        "1264":"Hypoveriensbank Beliani SP (DE)",
        "1265":"Delamaison FR Beliani DE",
        "1266":"ManoMano DE Beliani DE",
        "1267":"Crowdfox DE Beliani DE",
        "1268":"Idealo Direktkauf DE Beliani DE",
        "1269":"KuantoKusta PT Beliani DE",
        "1270":"Orders on the way",
        "1271":"Paypal EUR Fachhandelpro (p)",
        "1272":"Saferpay EUR NL",
        "1273":"Paypal CHF Beliani CH",
        "1274":"Paypal GBP Beliani UK",
        "1275":"Klarna EUR NL",
        "1276":"Shopgate GBP Beliani UK",
        "1277":"Paypal GBP Beliani CH",
        "1278":"Paypal USD Beliani CH",
        "1279":"PayPal EUR AT Beliani CH",
        "1280":"Postbank 1412709 (Guenstigerdirekt GmbH)",
        "1281":"PayPal EUR DE/AT/FR Beliani CH",
        "1282":"Amazon GBP Beliani UK",
        "1283":"HSBC GBP Beliani UK",
        "1284":"Saferpay Beliani USA",
        "1285":"Amazon EUR Beliani FR",
        "1286":"Amazon USD Beliani",
        "1287":"Walmart Beliani LLC",
        "1288":"Overstock Beliani LLC",
        "1289":"Beliani UK Homfer",
        "1290":"Saferpay Beliani CA",
        "1291":"PayPal CAD Beliani CA",
        "1292":"Beanstream Velago CA",
        "1293":"PayPal CAD Velago CA",
        "1294":"PayPal USD Beliani UK",
        "1295":"PayPal CHF Beliani UK",
        "1296":"PayPal EUR AT Beliani UK",
        "1297":"PayPal EUR DE Beliani UK",
        "1298":"OnBuy GBP Beliani UK",
        "1299":"Google Checkout GBP Beliani UK",
        "1300":"Postfinance (Michael Widmer)",
        "1301":"PayPal EUR DE/AT/FR Beliani DE",
        "1302":"Billpay CHF Beliani CH",
        "1303":"Billpay EUR Beliani DE",
        "1304":"Shopgate CHF Beliani CH",
        "1305":"GrouponShopDE Beliani DE",
        "1306":"MobelloDE",
        "1307":"Real DE Beliani DE",
        "1308":"Stripe Beliani LLC CAD",
        "1309":"Stripe Beliani LLC USD",
        "1310":"C discount Beliani DE",
        "1311":"Shopgate DE & AT Beliani DE",
        "1312":"Wayfair EUR Beliani DE",
        "1313":"Paypal USD Beliani USA",
        "1314":"PriceMinister Beliani DE EUR",
        "1315":"Bank USD Beliani USA",
        "1316":"Pixmania Beliani DE",
        "1317":"Paypal EUR Beliani NL",
        "1318":"Saferpay EUR Beliani NL",
        "1319":"Billpay EUR Beliani NL",
        "1320":"Rabobank NL",
        "1321":"iDeal EUR Beliani NL",
        "1322":"Bank BMO CAN",
        "1323":"Amazon EUR Beliani DE",
        "1324":"Bank CAD CA",
        "1325":"Rue du Commerce Beliani DE",
        "1326":"Ricardo Beliani CH",
        "1327":"Uni Credit Beliani Europe EUR",
        "1328":"Yatego.de Beliani DE",
        "1329":"Bol.com EUR |Beliani NL",
        "1330":"Beslist.nl EUR NL",
        "1331":"Neckermann EUR Beliani NL",
        "1332":"PostNL Rembours EUR Beliani NL",
        "1333":"PayPal SEK Beliani DE",
        "1334":"DARTY Beliani DE",
        "1335":"Amazon EUR Beliani ES",
        "1336":"Stripe Beliani UK",
        "1337":"Amazon EUR Beliani IT",
        "1338":"Rakuten.ES Beliani DE",
        "1339":"PayPal DKK Beliani DE",
        "1340":"PayPal HUF Beliani DE",
        "1341":"Yodetiendas.es Beliani DE",
        "1342":"PayPal CZK Beliani DE",
        "1343":"Klarna Beliani NL",
        "1344":"Capayable Beliani NL",
        "1345":"VidaXL NL",
        "1346":"Bancontact Beliani NL",
        "1347":"FonQ Beliani NL",
        "1348":"Blokker Beliani NL",
        "1349":"Homedeco Beliani NL",
        "1351":"Bank Austria Beliani AT",
        "1352":"PayPal NOK Beliani DE",
        "1353":"Amazon Beliani NL",
        "1354":"Leen Bakker Beliani NL",
        "1355":"Leroy Merlin FR",
        "1356":"SprayPay NL",
        "1358":"Paytrail FI Beliani DE",
        "1359":"Empik Beliani PL",
        "1360":"Vente Unique FR Beliani DE",
        "1361":"Mall CZK Beliani DE",
        "1362":"Leroy Merlin IT",
        "1363":"BUT Beliani FR-DE",
        "1364":"PayPal NL Beliani Europe OU",
        "1366":"Mall SK",
        "1367":"Clearing Account Beliani PL",
        "1368":"Mall HU",
        "1369":"OBI CH Switzerland",
        "1370":"COD Sameday HU",
        "1371":"Bloop PT",
        "1372":"COD HDT HUF Beliani (DE) GmbH",
        "1373":"Vivre RO Beliani (EU) Gmbh",
        "1374":"Wayfair Beliani (UK) GmbH",
        "1375":"DNB NOK Beliani (Norge) GmbH",
        "1376":"Cultura FR Beliani (DE) GmbH",
        "1377":"Shöpping AT Beliani (DE) GmbH",
        "1378":"Altex RO Beliani (EU) GmbH",
        "1379":"XXX Lutz CH Beliani Switzerland GmbH",
        "1400":"Kasse Beliani CH Allegro Broken",
        "1401":"Kasse PLN Michael Private",
        "1402":"Klarna Beliani Switzerland",
        "1403":"Migros CH",
        "1404":"MAISONDUMONDE FR",
        "1405":"Kasse BCE",
        "1406":"CIC Beliani FR",
        "1407":"CIC Beliani France",
        "1408":"CIC FR Beliani DE GmbH",
        "1410":"Kasse Beliani Polska",
        "1411":"Saferpay HU Beliani DE",
        "1412":"Klarna SE Beliani DE",
        "1413":"Fyndiq SE Beliani DE",
        "1414":"Shop.com Beliani UK",
        "1415":"Saferpay CZK Beliani DE",
        "1416":"CDON SE Beliani DE",
        "1417":"Fnac FR Beliani DE",
        "1418":"Deco FR Beliani DE",
        "1419":"Mano Mano BE Beliani DE",
        "1420":"Conforama FR Beliani DE",
        "1421":"Bricoprive FR Beliani DE",
        "1422":"Worten PT Beliani DE",
        "1423":"Amazon Retail FR Beliani DE",
        "1424":"IBS Beliani DE EUR",
        "1425":"CDON DK Beliani DE",
        "1426":"Wupti DK Beliani DE",
        "1427":"Klarna DE Beliani DE",
        "1428":"Klarna FI Beliani DE",
        "1429":"Klarna DKK Beliani DE",
        "1430":"Klarna IT Beliani DE",
        "1431":"MobilePay DKK",
        "1432":"Moebel24 EUR",
        "1433":"Klarna UK Beliani UK",
        "1434":"Deutsche Bank Schoenteakmoebel",
        "1435":"Amazon Pay Beliani DE",
        "1436":"FNAC PT",
        "1437":"Worten ES",
        "1438":"Saferpay NOK Beliani DE",
        "1439":"Klarna NOK",
        "1440":"Klarna AT",
        "1441":"Klarna ES Beliani DE",
        "1443":"CS - Beliani DE - SEK",
        "1444":"CS - Beliani DE - DKK",
        "1445":"CS - Beliani DE - HUF",
        "1446":"CS - Beliani DE - CZK",
        "1447":"CS - Beliani DE - NOK",
        "1448":"CS - Beliani DE - RON",
        "1449":"UniCredit IT Beliani DE",
        "1450":"Raiffeisenbank CZ Beliani SP GmbH",
        "1451":"Raiffeisenbank CZ EUR Beliani SP GmbH",
        "1452":"Amazon NL Beliani EU GmbH",
        "1453":"COD NO LIMIT Beliani PL",
        "1500":"Compensation Beliani PL",
        "1501":"UniCredit- Beliani Norway- NOK",
        "1502":"Klarna CZ Beliani DE",
        "1503":"Klarna FR Beliani DE",
        "1504":"Klarna PT Beliani DE",
        "1509":"Klarna HU Beliani DE",
        "1510":"Klarna SK Beliani DE",
        "1511":"Kaufland PL Beliani PL",
        "1512":"Kaufland AT",
        "1513":"Brico Bravo IT",
        "1514":"Clubfasion PT",
        "1515":"Limango DE",
        "1516":"Allegro HU Beliani DE",
        "1517":"Allegro SK Beliani DE",
        "1518":"Vente Unique PL Beliani PL",
        "1519":"Praxis NL Beliani (EU) GmbH",
        "1520":"Brico BE Beliani EU GmbH",
        "1521":"OBI DE Beliani DE",
        "1522":"Hormbach DE Beliani DE",
        "1523":"Castorama PL",
        "1524":"Wowcher Beliani UK (GmbH)",
        "1525":"XXXLutz AT Beliani (DE) GmbH",
        "1526":"Vente Unique AT Beliani (DE) GmbH",
        "1527":"Vente Unique LU Beliani (DE) GmbH",
        "1528":"Hobbybox FI Beliani (DE) GmbH",
        "1529":"Bricomarche FR Beliani (DE) GmbH"
    };

    function getAccountLabel(num) {
        return ACCOUNTS[String(num || '').trim()] || null;
    }

    function updateAccountLabel() {
        const inp = document.getElementById('tm-t-account');
        const label = document.getElementById('tm-t-account-label');
        if (!inp || !label) return;
        const val = inp.value.trim();
        const name = getAccountLabel(val);
        if (name) {
            label.textContent = `✓ ${val}, ${name}`;
            label.style.color = '#16a34a';
        } else if (val) {
            label.textContent = '⚠️ nieznane konto';
            label.style.color = '#dc2626';
        } else {
            label.textContent = '';
        }
    }

    function initAccountAutocomplete() {
        const inp = document.getElementById('tm-t-account');
        const dropdown = document.getElementById('tm-t-account-dropdown');
        if (!inp || !dropdown || inp.dataset.autocompleteReady === '1') return;
        inp.dataset.autocompleteReady = '1';

        let selectedIndex = -1;

        function renderDropdown(query) {
            const q = String(query || '').toLowerCase().trim();
            if (!q) {
                dropdown.style.display = 'none';
                return;
            }

            const matches = Object.entries(ACCOUNTS)
                .filter(([num, name]) => num.includes(q) || name.toLowerCase().includes(q))
                .slice(0, 40);

            if (!matches.length) {
                dropdown.style.display = 'none';
                return;
            }

            dropdown.innerHTML = '';
            selectedIndex = -1;

            matches.forEach(([num, name], idx) => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:6px 8px;cursor:pointer;font-size:12px;border-bottom:1px solid #f3f4f6;line-height:1.3;';
                item.innerHTML = `<strong>${num}</strong>, ${name}`;
                item.dataset.num = num;
                item.onmouseenter = () => {
                    [...dropdown.children].forEach(c => c.style.background = '');
                    item.style.background = '#f5f3ff';
                    selectedIndex = idx;
                };
                item.onmousedown = e => {
                    e.preventDefault();
                    inp.value = num;
                    dropdown.style.display = 'none';
                    updateAccountLabel();
                };
                dropdown.appendChild(item);
            });

            dropdown.style.display = 'block';
        }

        function highlight(idx) {
            const items = [...dropdown.children];
            items.forEach(c => c.style.background = '');
            if (items[idx]) items[idx].style.background = '#f5f3ff';
        }

        inp.addEventListener('input', () => {
            renderDropdown(inp.value);
            updateAccountLabel();
        });

        inp.addEventListener('focus', () => {
            renderDropdown(inp.value);
            updateAccountLabel();
        });

        inp.addEventListener('blur', () => {
            setTimeout(() => { dropdown.style.display = 'none'; }, 150);
        });

        inp.addEventListener('keydown', e => {
            const items = [...dropdown.children];
            if (dropdown.style.display === 'none' || !items.length) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                highlight(selectedIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                highlight(selectedIndex);
            } else if (e.key === 'Enter' && selectedIndex >= 0 && items[selectedIndex]) {
                e.preventDefault();
                inp.value = items[selectedIndex].dataset.num;
                dropdown.style.display = 'none';
                updateAccountLabel();
            } else if (e.key === 'Escape') {
                dropdown.style.display = 'none';
            }
        });
    }

    function parseExcel(raw) {
        const lines = String(raw || '')
            .split(/\r?\n/)
            .map(line => line.trimEnd())
            .filter(line => line.trim());

        if (!lines.length) return [];

        const rows = lines.map(line => line.split('\t'));

        // NOWY FORMAT: wklejona lista "Brak ticketu" (po ręcznym założeniu ticketów).
        // Rozpoznajemy po markerach: "Auftrag #", "auction.php?number=" lub "Brak ticketu".
        // Z każdej linii bierzemy: numer zamówienia, kwotę i datę (data per wiersz).
        const isNoTicketList = lines.some(l =>
            /Auftrag\s*#?\d+/i.test(l) || /auction\.php\?number=\d+/i.test(l) || /brak ticketu/i.test(l)
        );
        if (isNoTicketList) {
            const out = [];
            const seen = new Set();
            for (const line of lines) {
                // numer zamówienia (Amazon 3-7-7 lub UUID Allegro)
                let om = line.match(/\b\d{3}-\d{7}-\d{7}\b/) ||
                         line.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
                if (!om) continue;
                const orderNumber = om[0];
                if (seen.has(orderNumber)) continue;

                // data: YYYY-MM-DD albo DD.MM.YYYY
                let date = '';
                const dIso = line.match(/\b(\d{4}-\d{2}-\d{2})\b/);
                const dPl = line.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
                if (dIso) date = dIso[1];
                else if (dPl) date = `${dPl[3]}-${dPl[2]}-${dPl[1]}`;

                // kwota: liczba, ale NIE numer Auftragu (po "#"/"number=") i nie fragment daty.
                let rest = line
                    .replace(/\b\d{3}-\d{7}-\d{7}\b/g, ' ')
                    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/ig, ' ')
                    .replace(/Auftrag\s*#?\d+/ig, ' ')
                    .replace(/number=\d+/ig, ' ')
                    .replace(/txnid=\d+/ig, ' ')
                    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
                    .replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, ' ');
                const am = rest.match(/-?\d+(?:[.,]\d{1,2})?/);
                const amount = am ? Math.abs(parseFloat(am[0].replace(',', '.'))).toFixed(2) : '';
                if (!amount || amount === '0.00') continue;

                // opcjonalny numer Auftragu -> pozwala pominąć wyszukiwanie fulfilmentu
                const auf = line.match(/(?:Auftrag\s*#?|number=)(\d+)/i);
                seen.add(orderNumber);
                out.push({
                    orderNumber, amount, date, source: 'noticket',
                    auftragNumber: auf ? auf[1] : ''
                });
            }
            return out;
        }

        // v3.34: NOWY FORMAT bol/Partnerplatform (holenderski). Rozpoznajemy go po
        // jednoznacznym znaczniku "Correctie verkoopprijs artikel(en)" — te i tylko te
        // wiersze to zwroty. Kolumny (po tab): [0]=Type, [5]=Bestelnummer (numer
        // fulfilmentu), [9]=Bedrag (kwota, np. "€57.860000" → 57.86). Kilka wierszy na
        // ten sam numer sumujemy i księgujemy jedną wartość. Reszta (wyszukiwanie ticketu,
        // Solution=7, data, konto) działa jak dotąd, bo zwracamy te same obiekty.
        const isBolFormat = rows.some(r =>
            String(r[0] || '').trim().toLowerCase().startsWith('correctie verkoopprijs artikel') &&
            !String(r[0] || '').toLowerCase().includes('totaal')
        );
        if (isBolFormat) {
            // kwota bol: usuń €, spacje i separator tysięcy ’/' (dziesiętny to kropka)
            function parseBolAmount(v) {
                if (v == null) return null;
                const s = String(v)
                    .replace(/\u00a0/g, '')
                    .replace(/\s+/g, '')
                    .replace(/[€£$]/g, '')
                    .replace(/[’'`]/g, '')
                    .trim();
                if (!s) return null;
                const n = parseFloat(s);
                return isNaN(n) ? null : n;
            }

            const sums = new Map();      // orderNumber -> suma (float)
            const order = [];            // zachowanie kolejności pojawienia się
            for (const r of rows) {
                const type = String(r[0] || '').trim().toLowerCase();
                if (!type.startsWith('correctie verkoopprijs artikel')) continue;
                if (type.includes('totaal')) continue; // pomiń wiersz sumy
                const orderNumber = cleanOrder(r[5]);
                const amount = parseBolAmount(r[9]);
                if (!orderNumber || amount == null || amount === 0) continue;
                if (!sums.has(orderNumber)) order.push(orderNumber);
                sums.set(orderNumber, (sums.get(orderNumber) || 0) + amount);
            }

            return order
                .map(orderNumber => {
                    const total = sums.get(orderNumber);
                    if (total == null || Math.abs(total) === 0) return null;
                    return { orderNumber, amount: total.toFixed(2), source: 'bol' };
                })
                .filter(Boolean);
        }

        // NOWY FORMAT Allegro CZ/HU/SK/PL: Data | Order number (UUID) | Kwota | Typ (B2B/B2C).
        // Zwroty = kwoty ujemne; ksiegujemy wartosc bezwzgledna (bez minusa). orderNumber = UUID.
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        // FORMAT Allegro PL (pelny eksport, 16 kolumn): [0]=data, [3]=operacja(zwrot),
        // [8]=kwota (kol I), [11]=Fulfillment UUID = order number (kol L), [12]=Typ (B2B/B2C).
        const isAllegroPL = rows.some(r =>
            UUID_RE.test(String(r[11] || '').trim()) && /^B2[BC]$/i.test(String(r[12] || '').trim())
        );
        if (isAllegroPL) {
            const sums = new Map();
            const dates = new Map();
            const order = [];
            const toYmd = function (d) { const p = String(d || '').trim().split(' ')[0].split('.'); return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : ''; };
            for (const r of rows) {
                const orderNumber = String(r[11] || '').trim();
                if (!UUID_RE.test(orderNumber)) continue;
                const n = parseFloat(String(r[8] || '').replace(/\s/g, '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
                if (isNaN(n) || n === 0) continue;
                if (!sums.has(orderNumber)) { order.push(orderNumber); dates.set(orderNumber, toYmd(r[0])); }
                sums.set(orderNumber, (sums.get(orderNumber) || 0) + Math.abs(n));
            }
            return order
                .map(orderNumber => { const total = sums.get(orderNumber); if (total == null || total === 0) return null; return { orderNumber, amount: total.toFixed(2), source: 'allegro', date: dates.get(orderNumber) || '' }; })
                .filter(Boolean);
        }

        const isAllegroUuid = rows.some(r =>
            UUID_RE.test(String(r[1] || '').trim()) && /^B2[BC]$/i.test(String(r[3] || '').trim())
        );
        if (isAllegroUuid) {
            const sums = new Map();
            const dates = new Map();
            const order = [];
            const toYmd = function (d) { const p = String(d || '').trim().split('.'); return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : ''; };
            for (const r of rows) {
                const orderNumber = String(r[1] || '').trim();
                if (!UUID_RE.test(orderNumber)) continue;
                const n = parseFloat(String(r[2] || '').replace(/\s/g, '').replace(',', '.'));
                if (isNaN(n) || n === 0) continue;
                if (!sums.has(orderNumber)) { order.push(orderNumber); dates.set(orderNumber, toYmd(r[0])); }
                sums.set(orderNumber, (sums.get(orderNumber) || 0) + Math.abs(n));
            }
            return order
                .map(orderNumber => {
                    const total = sums.get(orderNumber);
                    if (total == null || total === 0) return null;
                    return { orderNumber, amount: total.toFixed(2), source: 'allegro', date: dates.get(orderNumber) || '' };
                })
                .filter(Boolean);
        }

        // v3.34: NOWY FORMAT marketplace (Order ID / Return ID / ... / Net paypout amount).
        // Kolumny (po tab): [0]=Order ID (numer zamówienia), [7]=Gross Unit Price (kwota,
        // format EU "1.339,99" → 1339.99), [10]=Net paypout amount. ZWROT = wiersz, w którym
        // Net paypout amount (kol K) jest UJEMNY. Kwotę do zaksięgowania bierzemy z Gross Unit
        // Price (kol H), sumujemy po numerze zamówienia. Rozpoznajemy format po danych (działa
        // też dla pojedynczych linii bez nagłówka): Order ID w postaci "105-1234567..." oraz
        // numer wariantu w notacji naukowej (np. 4.25168E+12) — nie koliduje z bol ani z Excelem.
        function parseEuAmount(v) {
            if (v == null) return null;
            let s = String(v)
                .replace(/\u00a0/g, '')
                .replace(/\s+/g, '')
                .replace(/[€£$]/g, '');
            if (!s) return null;
            s = s.replace(/[^0-9.,-]/g, ''); // zostaw cyfry, separatory i znak
            if (!s) return null;
            // Separatorem dziesiętnym jest ten znak (',' lub '.'), który występuje JAKO OSTATNI;
            // pozostałe wystąpienia to separatory tysięcy. Obsługuje "1.339,99", "39.99" i "39,99".
            const lastComma = s.lastIndexOf(',');
            const lastDot = s.lastIndexOf('.');
            if (lastComma > -1 && lastDot > -1) {
                if (lastComma > lastDot) {
                    s = s.replace(/\./g, '').replace(/,/g, '.'); // przecinek dziesiętny
                } else {
                    s = s.replace(/,/g, ''); // kropka dziesiętna, przecinki = tysiące
                }
            } else if (lastComma > -1) {
                const commaCount = (s.match(/,/g) || []).length;
                s = commaCount > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
            } else {
                const dotCount = (s.match(/\./g) || []).length;
                if (dotCount > 1) s = s.replace(/\./g, ''); // wiele kropek = tysiące
                // pojedyncza kropka lub brak = dziesiętna, zostawiamy
            }
            const n = parseFloat(s);
            return isNaN(n) ? null : n;
        }

        const isMarketplaceFormat =
            rows.some(r =>
                /^\d{3}-\d{6,}$/.test(String(r[0] || '').trim()) &&
                /^\d+(\.\d+)?e\+?\d+$/i.test(String(r[3] || '').replace(/\s+/g, ''))
            ) ||
            rows.some(r => {
                const joined = r.map(c => String(c || '').toLowerCase()).join('|');
                return joined.includes('net paypout amount') || joined.includes('gross unit price');
            });

        if (isMarketplaceFormat) {
            const sums = new Map();
            const order = [];
            for (const r of rows) {
                const orderNumber = String(r[0] || '').trim();
                if (!/^\d{3}-\d{6,}$/.test(orderNumber)) continue; // tylko wiersze danych (pomija nagłówek)
                const payout = parseEuAmount(r[10]); // kol K Net paypout amount
                if (payout == null || payout >= 0) continue; // zwrot tylko gdy ujemny
                const gross = parseEuAmount(r[7]); // kol H Gross Unit Price
                if (gross == null || gross === 0) continue;
                if (!sums.has(orderNumber)) order.push(orderNumber);
                sums.set(orderNumber, (sums.get(orderNumber) || 0) + Math.abs(gross));
            }

            return order
                .map(orderNumber => {
                    const total = sums.get(orderNumber);
                    if (total == null || Math.abs(total) === 0) return null;
                    return { orderNumber, amount: total.toFixed(2), source: 'marketplace' };
                })
                .filter(Boolean);
        }

        // ===== Format CHECK24 =====
        // Kolumny (0-idx): D=3 Bestell-Nr.(CHECK24)=Fulfilment, H=7 Wareneinkauf Brutto,
        // N=13 Korrekturbuchungen Brutto.
        // Zwrot CAŁOŚCIOWY: H < 0  -> kwota = |H| (N ignorujemy, nawet jeśli też ujemne).
        // Zwrot CZĘŚCIOWY:  H = 0 i N < 0 -> kwota = |N|.
        // H > 0 (zakup) -> wiersz pomijamy. Zwroty sumujemy per Fulfilment.
        const ffRe = /^F[A-Z0-9]{4,}$/i;
        const isCheck24 =
            rows.some(r => {
                const joined = r.map(c => String(c || '').toLowerCase()).join('|');
                return joined.includes('bestell-nr. (check24)') ||
                    (joined.includes('wareneinkauf') && joined.includes('korrekturbuchungen'));
            }) ||
            rows.some(r => r.length >= 14 && ffRe.test(String(r[3] || '').trim()) && looksLikeAmountCell(r[7]));

        if (isCheck24) {
            const sums = new Map();
            const order = [];
            for (const r of rows) {
                const ff = String(r[3] || '').trim();
                if (!ffRe.test(ff)) continue; // pomija nagłówek i puste wiersze
                const H = parseEuAmount(r[7]);
                const N = parseEuAmount(r[13]);
                let refund = 0;
                if (H != null && H < -0.005) {
                    refund = Math.abs(H);                              // całościowy (kol. H)
                } else if ((H == null || Math.abs(H) < 0.005) && N != null && N < -0.005) {
                    refund = Math.abs(N);                             // częściowy (kol. N przy H=0)
                }
                if (!(refund > 0)) continue;
                if (!sums.has(ff)) order.push(ff);
                sums.set(ff, (sums.get(ff) || 0) + refund);
            }

            return order
                .map(ff => {
                    const total = sums.get(ff);
                    if (total == null || Math.abs(total) < 0.005) return null;
                    return { orderNumber: ff, amount: total.toFixed(2), source: 'check24' };
                })
                .filter(Boolean);
        }

        function findAmountNear(row, amountIdx) {
            for (let offset = 0; offset <= 12; offset++) {
                const idx = amountIdx + offset;
                if (idx >= row.length) break;
                const rawCell = row[idx];
                if (!looksLikeAmountCell(rawCell)) continue;
                const amount = normalizeAmount(rawCell);
                if (!amount) continue;
                // PIERWSZA komórka wyglądająca jak kwota = właściwa kwota.
                // Jeśli to 0 — pozycja ma kwotę 0: pomijamy ją (zwracamy null) i NIE
                // szukamy dalej, bo kolejne liczby to konto / VAT account, nie kwota.
                if (isZeroAmount(amount)) return null;
                return amount;
            }
            return null;
        }

        function makeItem(row, orderIdx, amountIdx, source) {
            if (!row || orderIdx < 0 || amountIdx < 0) return null;
            const orderNumber = cleanOrder(row[orderIdx]);
            const amount = findAmountNear(row, amountIdx);
            if (!orderNumber || !amount) return null;
            const isGoodwill = row.some(c => /goodwill/i.test(String(c || '')));
            return { orderNumber, amount, source, isGoodwill };
        }

        function parseByIndexes(orderIdx, amountIdx, source) {
            return rows.map(row => makeItem(row, orderIdx, amountIdx, source)).filter(Boolean);
        }

        const oldByFixedColumns = parseByIndexes(4, 14, 'old-fixed');
        const newByFixedColumns = parseByIndexes(7, 9, 'new-fixed');

        let headerBased = [];
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const lower = rows[i].map(c => String(c || '').trim().toLowerCase());
            const orderIdx = lower.findIndex(c =>
                c.includes('order number') || c.includes('fulfilment') || c.includes('fulfillment')
            );
            const amountIdx = lower.findIndex(c =>
                c === 'amount' || c.includes('amount') || c.includes('sum of') || c.includes('kwota')
            );

            if (orderIdx >= 0 && amountIdx >= 0) {
                headerBased = rows.slice(i + 1)
                    .map(row => makeItem(row, orderIdx, amountIdx, 'header'))
                    .filter(Boolean);
                break;
            }
        }

        const regexBased = [];
        for (const row of rows) {
            const orderIdx = row.findIndex(c => /^[0-9]{3}-[0-9]{7}-[0-9]{7}$/.test(String(c || '').trim()));
            if (orderIdx < 0) continue;

            let amount = null;
            for (let idx = orderIdx + 1; idx < row.length; idx++) {
                if (!looksLikeAmountCell(row[idx])) continue;
                const parsed = normalizeAmount(row[idx]);
                if (!parsed) continue;
                // Pierwsza komórka-kwota decyduje; jeśli to 0 → pomijamy pozycję
                // (nie bierzemy kolejnych liczb, bo to konto / VAT account).
                amount = isZeroAmount(parsed) ? null : parsed;
                break;
            }

            if (amount) {
                regexBased.push({
                    orderNumber: String(row[orderIdx]).trim(),
                    amount,
                    source: 'regex',
                    isGoodwill: row.some(c => /goodwill/i.test(String(c || '')))
                });
            }
        }

        const candidates = [oldByFixedColumns, newByFixedColumns, headerBased, regexBased];
        const chosen = candidates.reduce((best, curr) => curr.length > best.length ? curr : best, []);

        // v3.42: sumujemy kwoty per numer fulfilmentu/zamówienia.
        // v3.43: WYJĄTEK — wiersze \"Goodwill\" NIE są scalane ze zwykłymi zwrotami tego
        // samego zamówienia (klucz zawiera znacznik goodwill). Dzięki temu np. zwykły 18.99
        // + goodwill 18.99 zostają DWIEMA osobnymi pozycjami, a nie jedną 37.98.
        const sums = new Map();
        const order = [];
        for (const item of chosen) {
            const key = item.orderNumber + (item.isGoodwill ? '|G' : '|N');
            if (!sums.has(key)) {
                order.push(key);
                sums.set(key, { orderNumber: item.orderNumber, sum: 0, source: item.source, isGoodwill: !!item.isGoodwill });
            }
            sums.get(key).sum += parseFloat(item.amount) || 0;
        }
        return order.map(key => {
            const v = sums.get(key);
            return { orderNumber: v.orderNumber, amount: v.sum.toFixed(2), source: v.source, isGoodwill: v.isGoodwill };
        });
    }

    const btn = document.createElement('button');
    btn.textContent = '🎫 Księgowanie w tickecie'; btn.id = 'ksieg-btn';
    btn.style.cssText = `
        position:fixed; top:158px; right:20px; z-index:999999;
        padding:10px 15px; background:#FF2F00; color:white;
        border:none; border-radius:8px; cursor:pointer;
        font-size:14px; box-shadow:0 2px 8px rgba(0,0,0,0.2);
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
        display:none; position:fixed; top:204px; right:20px; z-index:999999;
        background:white; border:1px solid #ccc; border-radius:10px;
        box-shadow:0 4px 16px rgba(0,0,0,0.15); padding:16px;
        width:min(1100px, calc(100vw - 40px));
        font-family:sans-serif; max-height:calc(100vh - 224px); overflow-y:auto;
    `;

    panel.innerHTML = `
        <div style="font-weight:bold;margin-bottom:8px;color:#111;font-size:15px;">🎫 Księgowanie Money back w tickecie <span style="font-weight:normal;font-size:11px;color:#750000;">v3.62</span></div>
        <div style="font-size:11px;color:#666;margin-bottom:8px;">
            Obsługiwane formaty: stary E/O, nowy H/J, nagłówki Order Number + Sum of Y + AG, duże przerwy kolumnowe, Goodwill przed kwotą. Kwoty 0 są pomijane.
        </div>
        <div id="tm-t-resume-bar" style="display:none;margin-bottom:8px;padding:8px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;font-size:12px;color:#92400e;"></div>
        <textarea id="tm-t-input" placeholder="Wklej tabelę z Excela..." style="width:100%;height:90px;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:12px;resize:vertical;box-sizing:border-box;font-family:monospace;"></textarea>
        <div id="tm-t-parse-preview" style="margin-top:4px;font-size:11px;color:#555;min-height:16px;"></div>

        <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <label style="font-size:12px;color:#333;white-space:nowrap;">📅 Data:</label>
            <input id="tm-t-date" type="text" placeholder="YYYY-MM-DD" style="width:120px;padding:5px 7px;border:1px solid #ccc;border-radius:5px;font-size:12px;">
            <label style="font-size:12px;color:#333;white-space:nowrap;">Konto:</label>
            <div style="position:relative;width:340px;max-width:100%;">
                <input id="tm-t-account" type="text" value="1000" autocomplete="off" placeholder="numer lub nazwa konta..." style="width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid #ccc;border-radius:5px;font-size:12px;">
                <div id="tm-t-account-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:white;border:1px solid #FF2F00;border-top:none;border-radius:0 0 6px 6px;max-height:220px;overflow-y:auto;z-index:9999999;box-shadow:0 4px 12px rgba(0,0,0,0.12);"></div>
            </div>
            <span id="tm-t-account-label" style="font-size:11px;color:#16a34a;font-style:italic;white-space:nowrap;">✓ 1000, Kasse PLN BCE</span>
            <span id="tm-t-allegro-acc" style="display:none;font-size:12px;color:#333;white-space:nowrap;">
                Zwroty Allegro:
                <label style="margin-left:6px;"><input type="radio" name="tm-t-allegro-acc-r" value="1069" checked> 1069 (PL Beliani Polska)</label>
                <label style="margin-left:6px;"><input type="radio" name="tm-t-allegro-acc-r" value="1071"> 1071 (PL Beliani)</label>
            </span>
        </div>
        <div id="tm-t-allegro-note" style="display:none;margin-top:4px;font-size:11px;color:#b45309;">🔒 Format Allegro: data brana z listy (per wiersz), konto tylko 1069/1071.</div>

        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button id="tm-t-check-btn" style="flex:1;min-width:180px;padding:9px;background:#332524;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">🔍 Sprawdź ordery</button>
            <button id="tm-t-clear-btn" style="width:120px;padding:9px;background:#750000;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">🧹 Wyczyść</button>
        </div>
        <div style="margin-top:8px;padding:8px;background:#F6E7E6;border:1px solid #FFCCB7;border-radius:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span style="font-size:12px;color:#750000;font-weight:bold;">⚙️ Księgowanie równoległe:</span>
            <label style="font-size:11px;color:#750000;white-space:nowrap;">workerów:</label>
            <input id="tm-t-parallel-workers" type="number" min="1" max="10" value="5" style="width:55px;padding:4px 6px;border:1px solid #750000;border-radius:4px;font-size:12px;text-align:center;">
            <label style="font-size:11px;color:#750000;white-space:nowrap;" title="Mnożnik wszystkich timeoutów na ładowanie/akcje. 1 = standard (20s). 3 = 60s. Zwiększ gdy serwer jest wolny / dużo workerów.">×&nbsp;timeout:</label>
            <input id="tm-t-timeout-mult" type="number" min="1" max="10" step="0.5" value="3" style="width:55px;padding:4px 6px;border:1px solid #750000;border-radius:4px;font-size:12px;text-align:center;" title="Mnożnik timeoutów: 1=20s, 2=40s, 3=60s. Zwiększ przy wielu workerach.">
            <button id="tm-t-check-and-book-parallel-btn" style="flex:1;min-width:240px;padding:7px;background:#FF2F00;color:white;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold;">🚀 Sprawdź i zaksięguj RÓWNOLEGLE</button>
            <span style="font-size:10px;color:#750000;font-style:italic;width:100%;">Uwaga: kilka requestów do serwera jednocześnie. Zacznij od 2-3 workerów; jeśli stabilnie, zwiększ. Przy 6-10 workerach ustaw ×&nbsp;timeout na 2-3 (serwer wolniej odpowiada pod obciążeniem).</span>
        </div>

        <div id="tm-t-preview-section" style="display:none;margin-top:12px;">
            <div style="font-size:12px;font-weight:bold;color:#333;margin-bottom:6px;">Podgląd — kliknij ✏️ aby edytować:</div>
            <div style="overflow-x:auto;max-width:100%;border:1px solid #e5e7eb;border-radius:6px;">
                <table style="width:100%;min-width:980px;border-collapse:collapse;font-size:12px;table-layout:auto;">
                    <thead>
                        <tr style="background:#f3f4f6;">
                            <th style="padding:5px 6px;text-align:center;border:1px solid #e5e7eb;width:38px;">✓</th>
                            <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Fulfilment</th>
                            <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Ticket #</th>
                            <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Status</th>
                            <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Kwota</th>
                            <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Konto</th>
                            <th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Data</th>
                            <th style="padding:5px 6px;text-align:center;border:1px solid #e5e7eb;">Status weryfikacji</th>
                        </tr>
                    </thead>
                    <tbody id="tm-t-preview-body"></tbody>
                </table>
            </div>


            <div id="tm-t-progress" style="margin-top:10px;display:none;">
                <div style="font-size:12px;color:#333;margin-bottom:6px;font-weight:bold;">Postęp:</div>
                <div id="tm-t-progress-list" style="font-size:11px;max-height:260px;overflow-y:auto;"></div>
                <div id="tm-t-summary" style="margin-top:8px;font-size:13px;font-weight:bold;"></div>
                <div id="tm-t-issue-report" style="margin-top:10px;font-size:12px;line-height:1.45;"></div>
            </div>
        </div>
    `;

    const editPopup = document.createElement('div');
    editPopup.style.cssText = `display:none; position:fixed; z-index:9999999; background:white; border:1px solid #FF2F00; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.18); padding:16px; width:300px; font-family:sans-serif;`;
    editPopup.innerHTML = `
        <div style="font-size:13px;font-weight:bold;color:#111;margin-bottom:8px;">✏️ Edytuj — order <span id="tm-t-popup-orderid" style="color:#FF2F00;"></span></div>
        <label style="font-size:11px;color:#555;" id="tm-t-popup-label">Wartość:</label>
        <input id="tm-t-popup-input" type="text" style="width:100%;box-sizing:border-box;padding:7px 9px;margin-top:3px;font-size:13px;border:1px solid #ccc;border-radius:6px;outline:none;">
        <div style="margin-top:10px;display:flex;gap:8px;">
            <button id="tm-t-popup-ok" style="flex:1;padding:8px;background:#FF2F00;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">✅ Zatwierdź</button>
            <button id="tm-t-popup-cancel" style="flex:1;padding:8px;background:#DBD9D7;color:#332524;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Anuluj</button>
        </div>
    `;
    document.body.appendChild(editPopup);

    // Każdy worker dostaje własny iframe. Tryb sekwencyjny używa defaultFrameCtx,
    // tryb równoległy tworzy dodatkowe konteksty przez createFrameCtx().
    function createFrameCtx() {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed; left:-2000px; top:-2000px; width:1200px; height:900px; opacity:0; pointer-events:none; z-index:-1;';
        document.body.appendChild(iframe);
        return { iframe };
    }

    function destroyFrameCtx(ctx) {
        if (ctx && ctx.iframe && ctx.iframe.parentNode) ctx.iframe.parentNode.removeChild(ctx.iframe);
    }

    const defaultFrameCtx = createFrameCtx();
    const iframe = defaultFrameCtx.iframe; // alias dla wstecznej zgodności

    function getFrameDoc(ctx = defaultFrameCtx) {
        return ctx.iframe.contentDocument || ctx.iframe.contentWindow.document;
    }

    function getFrameWin(ctx = defaultFrameCtx) {
        return ctx.iframe.contentWindow;
    }

    // === NOWE w v3.4 ===
    // Globalny mnożnik timeoutów — pozwala wydłużyć czas oczekiwania
    // gdy serwer jest obciążony (np. przy 10 workerach jednocześnie).
    // Ustawiany z UI w polu "x timeout".
    let tmTimeoutMultiplier = 1.0;

    // ─── v3.22: passive server response time monitoring ─────────────────────
    // Mierzy czas trwania każdego roundtripu serwera (loadInFrame, waitFrameLoad
    // = post-Submit page navigation). Zerowe narzuty: tylko performance.now()
    // przed/po + push do tablicy. Wynik prezentowany w postępie po batchu.
    let serverTimings = [];
    function recordServerTiming(opName, durationMs) {
        if (!isFinite(durationMs) || durationMs < 0 || durationMs > 600000) return;
        serverTimings.push({ op: opName, ms: Math.round(durationMs), t: Date.now() });
    }
    function resetServerTimings() {
        serverTimings = [];
    }
    function computeServerStats() {
        if (!serverTimings.length) return null;
        const arr = serverTimings.map(s => s.ms).sort((a,b) => a-b);
        const n = arr.length;
        const percentile = (p) => arr[Math.min(n-1, Math.floor(p * n))];
        const sum = arr.reduce((a,b) => a+b, 0);
        return {
            n,
            min: arr[0],
            p50: percentile(0.50),
            p95: percentile(0.95),
            max: arr[n-1],
            mean: Math.round(sum / n)
        };
    }
    function recommendSettings(stats) {
        // Bazując na p95 — najgorsze 5% requestów (głównie one decydują o timeout/workerach)
        if (!stats) return null;
        const p95 = stats.p95;
        if (p95 < 1500)  return { workers: '3-5', timeout: 1,   verdict: 'serwer szybki' };
        if (p95 < 3000)  return { workers: '3',   timeout: 1,   verdict: 'standardowy' };
        if (p95 < 5000)  return { workers: '2-3', timeout: 2,   verdict: 'wolniejszy serwer / obciążony' };
        return                  { workers: '1-2', timeout: 3,   verdict: 'serwer bardzo wolno odpowiada' };
    }
    function formatServerStatsHtml(stats) {
        if (!stats) return '';
        const rec = recommendSettings(stats);
        return ` &nbsp; 📡 <small>Serwer: ${stats.n} req, p50=${stats.p50}ms p95=${stats.p95}ms max=${stats.max}ms ` +
               `→ ${rec.verdict} (workerów: ${rec.workers}, ×timeout: ${rec.timeout})</small>`;
    }
    // ─────────────────────────────────────────────────────────────────────────

    function loadInFrame(url, ms = 20000, ctx = defaultFrameCtx) {
        const effectiveMs = Math.round(ms * tmTimeoutMultiplier);
        const t0 = performance.now();
        return new Promise((resolve, reject) => {
            let done = false;
            const t = setTimeout(() => {
                if (!done) {
                    done = true;
                    reject(new Error('Timeout: ' + url));
                }
            }, effectiveMs);
            ctx.iframe.onload = () => {
                if (!done) {
                    done = true;
                    clearTimeout(t);
                    recordServerTiming('loadInFrame', performance.now() - t0);
                    resolve();
                }
            };
            ctx.iframe.src = url;
        });
    }

    function waitFrameLoad(ms = 20000, ctx = defaultFrameCtx) {
        const effectiveMs = Math.round(ms * tmTimeoutMultiplier);
        const t0 = performance.now();
        return new Promise((resolve, reject) => {
            let done = false;
            const t = setTimeout(() => {
                if (!done) {
                    done = true;
                    reject(new Error('Timeout po akcji'));
                }
            }, effectiveMs);
            ctx.iframe.onload = () => {
                if (!done) {
                    done = true;
                    clearTimeout(t);
                    recordServerTiming('waitFrameLoad', performance.now() - t0);
                    resolve();
                }
            };
        });
    }

    function setNativeValue(el, value) {
        if (!el) return;
        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function triggerChange(win, el) {
        if (!el) return;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        try {
            if (win && win.$) win.$(el).trigger('change');
        } catch (e) {}
    }

    // v3.34: data księgowania (cost_invoice_date). Walidacja "out of range" jest podpięta
    // pod wpisywanie z klawiatury i blokuje daty wsteczne. Kalendarz tej walidacji NIE
    // przechodzi — po kliknięciu dnia woła funkcję zwrotną setDate(y,m,d), która:
    //   const input = $(this).prop('CP_targetInput');   // = window.CP_targetInput
    //   input.value = 'yyyy-MM-dd'; date_alert.style.display='none'; handleStyleChange(...)
    // Zwroty z marketów księgujemy wstecz, więc musimy przejść DOKŁADNIE tą ścieżką:
    // ustawić window.CP_targetInput i wywołać setDate z this=window (tak jak robi to
    // kalendarz przy kliknięciu dnia). To odpala też handleStyleChange i chowanie alertu.
    function setDateField(win, el, value) {
        if (!el || !value) return;
        const w = win || window;
        const parts = String(value).split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        let usedCalendar = false;
        try {
            if (typeof w.setDate === 'function' && y && m && d) {
                w.CP_targetInput = el;                 // jak CP_select(inputobj,...)
                w.setDate.call(w, y, m, d);            // jak kliknięcie dnia (this=window)
                usedCalendar = true;
            }
        } catch (e) { usedCalendar = false; }

        // Wymuś kanoniczny zapis YYYY-MM-DD (setDate nie zeruje dnia: '...-6' zamiast '-06').
        // Ustawienie .value wprost nie odpala walidacji (brak keyup/blur), więc bezpieczne.
        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, value); else el.value = value;

        // Gdy kalendarz niedostępny — przynajmniej schowaj alert ręcznie (jak setDate).
        if (!usedCalendar) {
            try {
                const a = (el.ownerDocument || document).getElementById('date_alert_' + el.id);
                if (a) a.style.display = 'none';
            } catch (e) {}
        }
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    }

    function openEditPopup(orderId, label, currentValue, anchorEl, cb) {
        popupCb = cb;
        document.getElementById('tm-t-popup-orderid').textContent = orderId;
        document.getElementById('tm-t-popup-label').textContent = label;
        const inp = document.getElementById('tm-t-popup-input');
        inp.value = currentValue || '';

        const rect = anchorEl.getBoundingClientRect();
        let top = rect.bottom + 6;
        let left = rect.left;
        if (left + 310 > window.innerWidth) left = window.innerWidth - 316;
        if (top + 150 > window.innerHeight) top = rect.top - 156;
        editPopup.style.top = top + 'px';
        editPopup.style.left = left + 'px';
        editPopup.style.display = 'block';
        setTimeout(() => { inp.focus(); inp.select(); }, 30);
    }

    function closeEditPopup() {
        editPopup.style.display = 'none';
        popupCb = null;
    }

    editPopup.querySelector('#tm-t-popup-ok').onclick = () => {
        const val = document.getElementById('tm-t-popup-input').value.trim();
        if (popupCb) popupCb(val);
        closeEditPopup();
    };
    editPopup.querySelector('#tm-t-popup-cancel').onclick = closeEditPopup;
    document.getElementById('tm-t-popup-input').onkeydown = e => {
        if (e.key === 'Enter') editPopup.querySelector('#tm-t-popup-ok').click();
        if (e.key === 'Escape') closeEditPopup();
    };

    let isAllegroMode = false;

    function applyAllegroLock(items) {
        isAllegroMode = items.length > 0 && items.every(i => i.source === 'allegro') && items.some(i => i.source === 'allegro');
        const dateInp = document.getElementById('tm-t-date');
        const accInp = document.getElementById('tm-t-account');
        const accToggle = document.getElementById('tm-t-allegro-acc');
        const note = document.getElementById('tm-t-allegro-note');
        if (!dateInp || !accInp) return;

        if (isAllegroMode) {
            dateInp.disabled = true;
            dateInp.placeholder = 'z listy (per wiersz)';
            dateInp.value = '';
            const r = document.querySelector('input[name="tm-t-allegro-acc-r"]:checked');
            accInp.value = r ? r.value : '1069';
            accInp.readOnly = true;
            updateAccountLabel();
            if (accToggle) accToggle.style.display = '';
            if (note) note.style.display = '';
        } else {
            dateInp.disabled = false;
            dateInp.placeholder = 'YYYY-MM-DD';
            accInp.readOnly = false;
            if (accToggle) accToggle.style.display = 'none';
            if (note) note.style.display = 'none';
        }
    }

    function updateParsePreview() {
        const items = parseExcel(document.getElementById('tm-t-input').value || '');
        applyAllegroLock(items);
        const el = document.getElementById('tm-t-parse-preview');
        if (!el) return;
        el.innerHTML = items.length
            ? `<span style="color:#16a34a">✓ ${items.length} pozycji:</span> ` + items.slice(0, 20).map(i => `<strong>${i.orderNumber}</strong>→${i.amount}`).join(', ') + (items.length > 20 ? '…' : '')
            : '<span style="color:#888">Nie znaleziono pozycji</span>';
    }

    function parseDateMs(text) {
        const s = String(text || '').trim();
        const m = s.match(/([0-9]{4})-([0-9]{2})-([0-9]{2}) +([0-9]{2}):([0-9]{2}):([0-9]{2})/);
        if (!m) return 0;
        return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).getTime() || 0;
    }

    async function searchAuctionUrls(ffNumber, ctx = defaultFrameCtx) {
        await loadInFrame(SEARCH_URL, 20000, ctx);
        const doc = getFrameDoc(ctx);
        const win = getFrameWin(ctx);
        const input = doc.querySelector('input[name="ff_number"]');
        if (!input) throw new Error('Nie znaleziono pola ff_number na search.php');

        try {
            if (win.select_radio) win.select_radio('radio_36');
        } catch (e) {}

        const radio = doc.querySelector('input[name="what"][value="ff_number"], input#radio_36');
        if (radio && !radio.checked) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
        }

        setNativeValue(input, ffNumber);
        const form = input.closest('form');
        if (!form) throw new Error('Nie znaleziono formularza wyszukiwania');

        const lp = waitFrameLoad(15000, ctx).catch(() => null);
        form.submit();
        await lp;
        await sleep(1000);

        const url = ctx.iframe.contentWindow.location.href;
        if (/auction[.]php/i.test(url)) return { ok: true, urls: [url], count: 1 };

        const links = [...getFrameDoc(ctx).querySelectorAll('a[href*="auction.php?number="]')]
            .map(a => absoluteUrl(a.getAttribute('href') || ''))
            .filter(href => /auction[.]php[?]number=/i.test(href) && !/shipping_auction[.]php/i.test(href));
        const uniqueUrls = [...new Set(links)];
        if (!uniqueUrls.length) return { ok: false, urls: [], count: 0, reason: 'not_found' };
        return { ok: true, urls: uniqueUrls, count: uniqueUrls.length };
    }

    function getTicketLinks(ctx = defaultFrameCtx) {
        const doc = getFrameDoc(ctx);
        const map = new Map();
        for (const a of doc.querySelectorAll('a[href*="rma.php"][href*="rma_id="]')) {
            const href = absoluteUrl(a.getAttribute('href') || '');
            const m = href.match(/[?&]rma_id=([0-9]+)/i);
            if (!m) continue;
            const id = m[1];
            const row = a.closest('tr');
            const dateText = row && row.cells && row.cells[0] ? row.cells[0].textContent.trim() : '';
            const createdAtMs = parseDateMs(dateText);
            if (!map.has(id)) {
                map.set(id, {
                    id,
                    href,
                    text: a.textContent.trim(),
                    createdAtText: dateText,
                    createdAtMs,
                    rmaIdNum: Number(id) || 0
                });
            }
        }
        return [...map.values()];
    }

    function getTicketStatus(doc) {
        const rendered = doc.querySelector('[id^="select2-ticket_status"][id$="-container"]') ||
            [...doc.querySelectorAll('.select2-selection__rendered')].find(x => /open|closed/i.test(x.getAttribute('title') || x.textContent || ''));
        const txt = rendered ? String(rendered.getAttribute('title') || rendered.textContent || '').trim() : '';
        if (/closed/i.test(txt)) return 'Closed';
        if (/open/i.test(txt)) return 'Open';
        const body = doc.body ? doc.body.textContent : '';
        if (/Status\s*:\s*Closed/i.test(body)) return 'Closed';
        if (/Status\s*:\s*Open/i.test(body)) return 'Open';
        return '';
    }

    function findTicketStatusSelect(doc) {
        return doc.querySelector('select[name*="ticket_status"], select[id*="ticket_status"]') ||
            [...doc.querySelectorAll('select')].find(s =>
                [...s.options].some(o => /^open$/i.test(o.textContent.trim())) &&
                [...s.options].some(o => /^closed$/i.test(o.textContent.trim()))
            ) || null;
    }

    function setSelectByText(win, select, wantedText) {
        if (!select) return false;
        const opt = [...select.options].find(o => o.textContent.trim().toLowerCase() === wantedText.toLowerCase());
        if (!opt) return false;
        select.value = opt.value;
        triggerChange(win, select);
        return true;
    }

    async function setTicketStatus(wantedStatus, ctx = defaultFrameCtx) {
        const doc = getFrameDoc(ctx);
        const win = getFrameWin(ctx);
        const select = findTicketStatusSelect(doc);
        if (!select) throw new Error(`Brak selecta statusu ticketu (${wantedStatus})`);
        if (!setSelectByText(win, select, wantedStatus)) throw new Error(`Nie znaleziono opcji statusu: ${wantedStatus}`);
        const updateBtn = doc.querySelector('input.ticket-status__button[type="submit"]') ||
            doc.querySelector('input.ticket-status__button') ||
            [...doc.querySelectorAll('input[type="submit"],button')].find(b => /update/i.test(b.value || b.textContent || ''));
        if (!updateBtn) throw new Error('Brak przycisku Update statusu');
        const lp = waitFrameLoad(12000, ctx).catch(() => null);
        updateBtn.click();
        await lp;
        await sleep(1000);
    }

    // === ESCALATION HELPERS (v3.5) ===
    // Gdy ticket nie ma Solution=7 albo credit note, zamiast rzucać błąd
    // dodajemy komentarz "Please add solution" i przepinamy ticket do osoby,
    // która go otworzyła (Ticket Opened By).

    function removeDiacritics(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ß/g, 'ss')
            .replace(/Ł/g, 'L').replace(/ł/g, 'l');
    }

    function normalizeForMatch(s) {
        return removeDiacritics(String(s || ''))
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    // v3.10: szybki test czy strona ticketu w ogóle się wyrenderowała.
    // Po przeładowaniu (np. po setTicketStatus('Open')) zdarza się że iframe
    // dostaje uciętą wersję widoku — brak Auftrag Details, brak broken items,
    // brak textarea komentarza. Lepiej to wykryć od razu niż zaliczyć 3 osobne
    // błędy po kolei.
    function isTicketPageHealthy(doc) {
        if (!doc || !doc.body) return false;
        const hasAuftragDetails = !!doc.getElementById('auftrag_details');
        const hasBrokenItems = doc.querySelectorAll('input.broken-items-delart').length > 0;
        const hasNewComment = !!doc.querySelector('textarea#newcomment, textarea[name="newcomment"]');
        const hasUpdateBtn = !!doc.querySelector('input#update-button, input.update-button');
        // Strona jest w sensownym stanie jeśli ma przynajmniej JEDEN z głównych elementów
        return hasAuftragDetails || hasBrokenItems || hasNewComment || hasUpdateBtn;
    }

    function extractTicketOpenedBy(doc) {
        // Szuka <td><b>Ticket Opened By</b></td><td>Imię Nazwisko</td>
        const tds = [...doc.querySelectorAll('td')];
        for (const td of tds) {
            const b = td.querySelector('b, strong');
            if (!b) continue;
            if (!/ticket\s+opened\s+by/i.test(b.textContent || '')) continue;
            const next = td.nextElementSibling;
            if (!next) continue;
            const txt = normalizeSpaces(next.textContent || '');
            if (txt) return txt;
        }
        return '';
    }

    function findResponsibleSelect(doc) {
        return doc.querySelector('select#responsible_uname, select[name="responsible_uname"]');
    }

    function findResponsibleOptionByName(select, fullName) {
        if (!select || !fullName) return null;
        const target = normalizeForMatch(fullName);
        if (!target) return null;
        const opts = [...select.options].map(o => ({
            opt: o,
            text: normalizeForMatch(o.textContent || ''),
            value: normalizeForMatch(o.value || '')
        }));

        // 1. Dokładne dopasowanie po tekście opcji
        let m = opts.find(x => x.text === target);
        if (m) return m.opt;

        // 2. Opcja zawiera szukane imię/nazwisko (np. opcja "Martin Grosse Mueller" zawiera "Martin Grosse")
        m = opts.find(x => x.text && x.text.includes(target));
        if (m) return m.opt;

        // 3. Wszystkie słowa znaczące (>2 znaki) z szukanej nazwy są w opcji
        const targetWords = target.split(' ').filter(w => w.length > 2);
        if (targetWords.length) {
            m = opts.find(x => x.text && targetWords.every(w => x.text.includes(w)));
            if (m) return m.opt;
        }

        // 4. Imię + nazwisko (pierwsze + ostatnie słowo) w słowach opcji
        if (targetWords.length >= 2) {
            const first = targetWords[0];
            const last = targetWords[targetWords.length - 1];
            m = opts.find(x => {
                const ow = (x.text || '').split(' ').filter(w => w.length > 1);
                return ow.includes(first) && ow.includes(last);
            });
            if (m) return m.opt;
        }

        // 5. Dopasowanie po value (np. opcja value="MGrosse" tekst "Martin Grosse")
        m = opts.find(x => x.value && (x.value.includes(target.replace(/\s/g, '')) || target.includes(x.value)));
        if (m) return m.opt;

        return null;
    }

    function findSolutionSelect(doc, articleId = null) {
        if (articleId) {
            const exact = doc.querySelector(`select[name="solution[${articleId}]"]`);
            if (exact && [...exact.options].some(o => String(o.value) === '7')) return exact;
        }

        const byId = doc.querySelector('select#solutionStatus');
        if (byId && [...byId.options].some(o => String(o.value) === '7')) return byId;

        const byName = doc.querySelector('select[name^="solution["]');
        if (byName && [...byName.options].some(o => String(o.value) === '7')) return byName;

        return [...doc.querySelectorAll('select')].find(s =>
            [...s.options].some(o => String(o.value) === '7')
        ) || null;
    }

    function findCostAccountSelect(doc, articleId) {
        if (articleId) {
            const s = doc.querySelector(`select[name="cost_account[${articleId}]"]`);
            if (s) return s;
        }
        return doc.querySelector('select[name^="cost_account["]') || null;
    }

    function fillRequiredRmaFields(doc, win, articleId) {
        // v3.28: wymagane pola RMA, które muszą być wypełnione żeby Update zapisał księgowanie.
        // v3.39: KLUCZOWA POPRAWKA — formularz ticketu przy Update waliduje WSZYSTKIE pozycje
        // (broken items), nie tylko tę, na której księgujemy. Pusta kategoria na DOWOLNEJ
        // pozycji (np. innej niż ta z credit-note, na której księgujemy) cicho blokuje zapis →
        // brak wpisu Rückerstattung → Solution reset → błąd "Solution nie ma value=7".
        // Dlatego uzupełniamy puste wymagane pola na CAŁYM formularzu, nie tylko dla articleId.
        // Uzupełniamy TYLKO puste (nie nadpisujemy wyborów obsługi klienta):
        //   - rma_spec_questions[*][N][answer_id] → opcja "I don't know"
        //     (wartość różni się per pytanie, np. [1]→14, [5]→20, więc szukamy PO LABELU)
        //   - liquidator_category_id[*] → "A"
        // Pola wiersza "Add new" (newliquidator_category_id, newproblem...) NIE mają nawiasów
        // w name, więc selektory z "[" ich nie łapią. global_liquidator_category_id ma tylko id
        // (bez name) → też pomijany.
        const result = { filledSpecQuestions: 0, filledCategory: false, filledCategoryIds: [] };
        if (!doc) return result;

        // 1. Wszystkie pytania spec na całym formularzu
        const specSelects = [...doc.querySelectorAll(
            `select[name^="rma_spec_questions["][name$="[answer_id]"]`
        )];
        for (const sel of specSelects) {
            const cur = String(sel.value || '').trim();
            if (cur && cur !== '0') continue; // już odpowiedziane — nie ruszamy
            const opt = [...sel.options].find(o => {
                const lbl = (o.label || o.textContent || '').trim().toLowerCase();
                return lbl.startsWith("i don't know") || lbl.startsWith('i dont know');
            });
            if (opt) {
                sel.value = opt.value;
                triggerChange(win, sel);
                result.filledSpecQuestions++;
            }
        }

        // 2. Kategoria likwidatora na całym formularzu — każda pusta → "A"
        const catSelects = [...doc.querySelectorAll('select[name^="liquidator_category_id["]')];
        for (const catSel of catSelects) {
            const cur = String(catSel.value || '').trim();
            if (cur) continue; // już ustawiona — nie ruszamy
            const optA = [...catSel.options].find(o =>
                (o.label || o.textContent || '').trim() === 'A'
            );
            if (optA) {
                catSel.value = optA.value;
                triggerChange(win, catSel);
                result.filledCategory = true;
                const m = (catSel.getAttribute('name') || '').match(/\[([0-9]+)\]/);
                if (m) result.filledCategoryIds.push(m[1]);
            }
        }

        return result;
    }

    function getArticleIdFromElement(el) {
        if (!el) return null;
        const attrs = ['name', 'id', 'value', 'data-article-id', 'data-id'];
        for (const attr of attrs) {
            const val = el.getAttribute && el.getAttribute(attr);
            if (!val) continue;
            const m = String(val).match(/\[([0-9]+)\]/);
            if (m) return m[1];
        }
        return null;
    }

    function getArticleIdFromBrokenItemRow(row, cb) {
        const fromCb = getArticleIdFromElement(cb);
        if (fromCb) return fromCb;
        const field = row.querySelector('input[name*="["], select[name*="["], textarea[name*="["]');
        return getArticleIdFromElement(field);
    }

    function getBrokenItemsWithCreditNote(doc) {
        const checkboxes = [...doc.querySelectorAll('input.broken-items-delart[type="checkbox"], input.broken-items-delart')]
            .filter(cb => !cb.classList.contains('broken-items-delart-all'));
        const targets = [];
        for (const cb of checkboxes) {
            const row = cb.closest('tr');
            if (!row) continue;
            const creditNoteLink = row.querySelector('a[href*="credit_note.php"]');
            if (!creditNoteLink) continue;
            targets.push({
                checkbox: cb,
                row,
                articleId: getArticleIdFromBrokenItemRow(row, cb),
                creditNoteHref: creditNoteLink.getAttribute('href') || ''
            });
        }
        return targets;
    }

    function getBrokenItemCount(doc) {
        return [...doc.querySelectorAll('input.broken-items-delart[type="checkbox"], input.broken-items-delart')]
            .filter(cb => !cb.classList.contains('broken-items-delart-all')).length;
    }

    // v3.52: checkbox delart z data-disabled (np. "1") = artykul juz przetworzony/nie do usuniecia.
    function isDelartDisabled(cb) {
        if (!cb) return false;
        const dd = cb.getAttribute('data-disabled');
        return !!cb.disabled || (dd != null && dd !== 'false' && dd !== '0'); // v3.57: data-disabled="" tez = wylaczony
    }
    function selectBrokenItemsWithCreditNote(doc, win, targets) {
        const items = targets || getBrokenItemsWithCreditNote(doc);
        let checked = 0;
        for (const item of items) {
            // v3.52: NIE zaznaczaj wylaczonego checkboxa delart. Zaznaczenie przelacza Update
            // w tryb usuwania artykulu i BLOKUJE utworzenie refundu (jak w sciezce fallback).
            // Refund powstaje z samego Solution=7 + kwota + Update.
            if (isDelartDisabled(item.checkbox)) continue;
            item.checkbox.checked = true;
            triggerChange(win, item.checkbox);
            checked++;
        }
        return checked;
    }

    async function inspectTicketCandidate(ticket, auctionUrl, ctx = defaultFrameCtx) {
        await loadInFrame(ticket.href, 20000, ctx);
        await sleep(700);
        const doc = getFrameDoc(ctx);
        const hasMoneBack = !!findSolutionSelect(doc);
        const creditNoteItems = getBrokenItemsWithCreditNote(doc);
        return {
            ...ticket,
            auctionUrl,
            hasMoneBack,
            creditNoteCount: creditNoteItems.length,
            brokenItemCount: getBrokenItemCount(doc),
            ticketStatus: getTicketStatus(doc) || '?',
            isValid: hasMoneBack && creditNoteItems.length > 0
        };
    }

    // ============================================================
    // === VAT REFUND (korekta nadpłaty VAT bez ticketu) — v3.29 ==
    // ============================================================
    // PLN + korekta VAT (różne stawki w tabeli Payments) + ujemny open amount
    // → księgujemy "VAT refund" przez #book (kwota ZE ZNAKIEM MINUS), resztę na 8100.
    function todayYmd() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function parsePaymentsTable(doc) {
        const result = { found: false, currency: '', rows: [], openAmount: null };
        if (!doc || !doc.querySelectorAll) return result;
        let table = null;
        const paymentsHeader = doc.querySelector('#payments');
        if (paymentsHeader) table = paymentsHeader.closest('table');
        if (!table) {
            table = [...doc.querySelectorAll('table')].find(t =>
                /\bPayments\b/.test(t.textContent || '') && /Auftrag value\s*-\s*Total of Payments/i.test(t.textContent || ''));
        }
        if (!table) return result;
        result.found = true;
        const headerCells = [...table.querySelectorAll('tr')]
            .map(tr => [...tr.querySelectorAll('td,th')])
            .find(cells => cells.some(c => /^\s*Date\s*$/i.test((c.textContent || '').trim())) &&
                           cells.some(c => /^\s*Amount\s*$/i.test((c.textContent || '').trim())));
        const colIndex = { date: 0, account: 1, amount: 2, vat: -1, comment: -1 };
        if (headerCells) {
            headerCells.forEach((c, idx) => {
                const t = (c.textContent || '').trim().toLowerCase();
                if (t === 'date') colIndex.date = idx;
                else if (t === 'account') colIndex.account = idx;
                else if (t === 'amount') colIndex.amount = idx;
                else if (t === 'vat %' || t === 'vat%') colIndex.vat = idx;
                else if (t === 'comment') colIndex.comment = idx;
            });
        }
        for (const tr of table.querySelectorAll('tr')) {
            const cells = [...tr.querySelectorAll('td')];
            if (!cells.length) continue;
            const firstTxt = (cells[colIndex.date] ? cells[colIndex.date].textContent : '').trim();
            const dateMatch = firstTxt.match(/(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2}:\d{2})?/);
            if (!dateMatch) continue;
            const amountTxt = cells[colIndex.amount] ? cells[colIndex.amount].textContent : '';
            const amt = normalizeAmount(amountTxt);
            if (amt === null) continue;
            const vatTxt = colIndex.vat >= 0 && cells[colIndex.vat] ? (cells[colIndex.vat].textContent || '').trim() : '';
            const commentTxt = colIndex.comment >= 0 && cells[colIndex.comment] ? normalizeSpaces(cells[colIndex.comment].textContent || '') : '';
            const accountTxt = cells[colIndex.account] ? (cells[colIndex.account].textContent || '').trim() : '';
            result.rows.push({ date: dateMatch[1], account: accountTxt, amount: amt, amountNum: parseFloat(amt), vat: vatTxt, comment: commentTxt });
        }
        for (const tr of table.querySelectorAll('tr')) {
            const txt = normalizeSpaces(tr.textContent || '');
            const m = txt.match(/Auftrag value\s*-\s*Total of Payments\s*:\s*([A-Z]{3})\s*(-?\d[\d.,]*)/i);
            if (m) { result.currency = m[1].toUpperCase(); result.openAmount = parseFloat(normalizeAmount(m[2])); break; }
        }
        if (!result.currency) {
            const m2 = (table.textContent || '').match(/Total of Payments\s*:\s*([A-Z]{3})/i);
            if (m2) result.currency = m2[1].toUpperCase();
        }
        return result;
    }

    function hasVatCorrection(payments) {
        const vats = (payments.rows || []).map(r => String(r.vat || '').trim()).filter(v => v !== '');
        return [...new Set(vats)].length >= 2;
    }

    function hasExistingVatRefund(payments, expectedAbsAmount, bookingDate) {
        const target = Math.abs(parseFloat(normalizeAmount(expectedAbsAmount)));
        const date = String(bookingDate || '').trim();
        return (payments.rows || []).some(r => r.date === date && Math.abs(Math.abs(r.amountNum) - target) < 0.005);
    }

    async function submitBookPayment(ctx, amountSigned, accountNum, bookingDate, comment) {
        const doc = getFrameDoc(ctx);
        const win = getFrameWin(ctx);
        const form = doc.querySelector('form#book') || [...doc.querySelectorAll('form')].find(f => f.querySelector('#make-payment'));
        if (!form) return { ok: false, error: 'Brak formularza #book (Make payment)' };
        const ymd = String(bookingDate || '').match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!ymd) return { ok: false, error: 'Zła data księgowania: ' + bookingDate };
        const yy = ymd[1], mm = ymd[2], dd = ymd[3];
        const mSel = form.querySelector('select[name="Date_Month"]');
        const dSel = form.querySelector('select[name="Date_Day"]');
        const ySel = form.querySelector('select[name="Date_Year"]');
        if (mSel) { mSel.value = mm; triggerChange(win, mSel); }
        if (dSel) { dSel.value = String(parseInt(dd, 10)); triggerChange(win, dSel); }
        if (ySel) { ySel.value = yy; triggerChange(win, ySel); }
        const accSel = form.querySelector('select[name="account"]');
        if (!accSel) return { ok: false, error: 'Brak selecta account w #book' };
        const accOpt = [...accSel.options].find(o => o.value === String(accountNum));
        if (!accOpt) return { ok: false, error: 'Konto ' + accountNum + ' nie istnieje na liście #book' };
        accSel.value = accOpt.value;
        triggerChange(win, accSel);
        const amtInput = form.querySelector('input[name="amount"]');
        if (!amtInput) return { ok: false, error: 'Brak pola amount w #book' };
        setNativeValue(amtInput, String(amountSigned));
        const commentInput = form.querySelector('input[name="paycomment"]');
        if (commentInput) setNativeValue(commentInput, comment || '');
        const payBtn = form.querySelector('#make-payment') || [...form.querySelectorAll('input[type="submit"]')].find(b => /make payment/i.test(b.value || ''));
        if (!payBtn) return { ok: false, error: 'Brak przycisku Make payment' };
        const lp = waitFrameLoad(15000, ctx).catch(() => null);
        payBtn.click();
        await lp;
        await sleep(1000);
        return { ok: true };
    }

    function isAuctionDeleted(doc) {
        try { return !!(doc && doc.querySelector('.auftrag-status--deleted')); } catch (e) { return false; }
    }

    async function detectVatRefund(orderNumber, amount, bookingDate, ctx = defaultFrameCtx) {
        const search = await searchAuctionUrls(orderNumber, ctx);
        if (!search.ok) return { applicable: false, search };
        const expectedAbs = Math.abs(parseFloat(normalizeAmount(amount)));
        const ticketsByAuction = {}; // v3.33: linki ticketów z tego samego wejścia co Payments
        let anyDeleted = false;
        for (const auctionUrl of search.urls) {
            await loadInFrame(auctionUrl, 20000, ctx);
            await sleep(500);
            if (isAuctionDeleted(getFrameDoc(ctx))) { anyDeleted = true; continue; } // Deleted -> nie księgujemy
            ticketsByAuction[auctionUrl] = getTicketLinks(ctx);
            const payments = parsePaymentsTable(getFrameDoc(ctx));
            if (!payments.found || payments.rows.length === 0) continue;
            if (payments.currency !== 'PLN') continue;
            if (payments.openAmount == null || payments.openAmount >= 0) continue; // tylko nadpłata (ujemny open)
            const openAbs = Math.abs(payments.openAmount);
            const diff = openAbs - expectedAbs;
            const matchesExcel = Math.abs(diff) <= 0.05;       // open amount = kwota z Excela (±0.05)
            const vatCorrected = hasVatCorrection(payments);   // ≥2 stawki VAT = korekta "na miejscu"
            // v3.30: włącz VAT refund gdy były zmiany VAT ALBO open amount zgadza się z Excelem (±0.05).
            // v3.32: jest nadpłata (ujemny open) w PLN, ale 1 stawka VAT i kwota z Excela nie pasuje do open amount
            // → to wariant VAT z błędną kwotą; zgłoś błąd kwoty i NIE szukaj ticketu.
            if (!vatCorrected && !matchesExcel) {
                return { applicable: false, amountMismatch: true, auctionUrl, openAmount: payments.openAmount, expectedAbs, search, ticketsByAuction };
            }
            return {
                applicable: true, auctionUrl,
                openAmount: payments.openAmount, expectedAbs, diff,
                overTolerance: !matchesExcel,
                vatReason: vatCorrected ? 'vat-rates' : 'open-matches-excel',
                alreadyBooked: hasExistingVatRefund(payments, expectedAbs, bookingDate),
                search
            };
        }
        return { applicable: false, deleted: anyDeleted && Object.keys(ticketsByAuction).length === 0, search, ticketsByAuction };
    }

    async function bookVatRefund(ctx, auctionUrl, expectedAmount, accountNum, bookingDate) {
        const expectedAbs = Math.abs(parseFloat(normalizeAmount(expectedAmount)));
        const log = [];
        await loadInFrame(auctionUrl, 20000, ctx);
        await sleep(600);
        let payments = parsePaymentsTable(getFrameDoc(ctx));
        if (hasExistingVatRefund(payments, expectedAbs, bookingDate)) {
            return { ok: true, alreadyBooked: true, vatRefund: true, openAmount: payments.openAmount, message: `już zaksięgowane: ${expectedAbs.toFixed(2)} z datą ${bookingDate}` };
        }
        const open = payments.openAmount;
        if (open == null) return { ok: false, vatRefund: false, error: 'Brak "Auftrag value - Total of Payments" w tabeli' };
        const diff = Math.abs(open) - expectedAbs;
        const rowsBefore = payments.rows.length;
        const mainSigned = (-Math.abs(expectedAbs)).toFixed(2);
        const r1 = await submitBookPayment(ctx, mainSigned, accountNum, bookingDate, 'VAT refund');
        if (!r1.ok) return { ok: false, vatRefund: false, error: r1.error };
        await loadInFrame(auctionUrl, 20000, ctx);
        await sleep(700);
        payments = parsePaymentsTable(getFrameDoc(ctx));
        const mainBooked = payments.rows.some(r => r.date === bookingDate && Math.abs(Math.abs(r.amountNum) - expectedAbs) < 0.005);
        if (!mainBooked && payments.rows.length <= rowsBefore) {
            return { ok: false, vatRefund: false, error: 'Po Make payment nie pojawił się wiersz VAT refund w tabeli Payments' };
        }
        log.push(`VAT refund ${mainSigned} -> konto ${accountNum}, data ${bookingDate}`);
        const remainder = payments.openAmount;
        let info8100 = null;
        const remAbs = (remainder != null) ? Math.abs(remainder) : 0;
        const remSigned = (remainder != null) ? remainder.toFixed(2) : null;
        // Na 8100 idzie TYLKO różnica zaokrągleń (|reszta| <= 0.05). Większy open amount to nie
        // rounding — NIE księgujemy go na 8100, zostawiamy otwarty i oznaczamy do ręcznej weryfikacji.
        if (remSigned != null && parseFloat(remSigned) !== 0 && remAbs > 0.05) {
            log.push(`reszta ${remSigned} POZOSTAWIONA OTWARTA (> 0.05) — nie księguję na 8100`);
            return { ok: true, vatRefund: true, verified: true, partial: true, openAmount: open, diff,
                info8100: { amount: remSigned, booked: false, overTolerance: true, skipped: true },
                log, message: `VAT refund OK, ale został open amount ${remSigned} (> 0.05) — NIE zaksięgowano na 8100, sprawdź ręcznie` };
        }
        // 8100 tylko gdy realnie wysyłana kwota (zaokrąglona do 2 miejsc) != 0.
        if (remSigned != null && parseFloat(remSigned) !== 0) {
            const rowsBefore2 = payments.rows.length;
            const r2 = await submitBookPayment(ctx, remSigned, '8100', todayYmd(), '');
            if (!r2.ok) {
                return { ok: true, vatRefund: true, verified: true, partial: true, openAmount: open, diff,
                    info8100: { amount: remSigned, booked: false, overTolerance: false },
                    error8100: r2.error, log, message: `VAT refund OK, reszta na 8100 NIE: ${r2.error}` };
            }
            await loadInFrame(auctionUrl, 20000, ctx);
            await sleep(700);
            payments = parsePaymentsTable(getFrameDoc(ctx));
            const remBooked = payments.rows.some(r => r.account === '8100' && Math.abs(Math.abs(r.amountNum) - Math.abs(remainder)) < 0.005) || payments.rows.length > rowsBefore2;
            info8100 = { amount: remSigned, booked: remBooked, overTolerance: false };
            log.push(`reszta ${remSigned} -> konto 8100, data ${todayYmd()}`);
        }
        return { ok: true, vatRefund: true, verified: true, openAmount: open, diff, info8100, log };
    }

    function vatExtraText(r) {
        if (!r.vat8100) return '';
        if (r.vat8100Skipped) return ` | reszta ${r.vat8100} — open amount > 0.05, NIE zaksięgowano na 8100 (sprawdź ręcznie)`;
        return ` | reszta ${r.vat8100} → 8100${r.vat8100Failed ? ' (NIE zaksięgowana!)' : ''}${r.vatOverTolerance ? ' ⚠️ różnica > 0.05' : ''}`;
    }
    function describeVatRefundStatus(row) {
        if (!row.vatRefund) return '';
        if (row.alreadyBooked) return '<span style="color:#2563eb">ℹ️ Zwrot nadpłaty z tytułu VAT — już zaksięgowany</span>';
        if (row.booked) {
            let s = '✅ Zwrot nadpłaty z tytułu VAT';
            s += vatExtraText(row);
            const color = (row.vatOverTolerance || row.vat8100Failed) ? '#d97706' : '#16a34a';
            return `<span style="color:${color}">${s}</span>`;
        }
        const open = (row.vatOpenAmount != null) ? ` (open amount ${Number(row.vatOpenAmount).toFixed(2)})` : '';
        return `<span style="color:#7c3aed">ℹ️ Zwrot nadpłaty z tytułu VAT${open} — do zaksięgowania</span>`;
    }

    async function findBestTicketForOrder(ffNumber, ctx = defaultFrameCtx, preSearch = null, preTickets = null) {
        const search = preSearch || await searchAuctionUrls(ffNumber, ctx);
        if (!search.ok) {
            return { ok: false, error: 'Nie znaleziono zamówienia dla tego numeru fulfilment', reportType: 'not_found' };
        }

        // v3.33: zbierz linki ticketów ze wszystkich auftragów. Jeśli detectVatRefund
        // odczytał je już przy okazji czytania Payments (preTickets), nie ładuj auftragu ponownie.
        const allTickets = [];
        for (const auctionUrl of search.urls) {
            let tickets;
            if (preTickets && preTickets[auctionUrl]) {
                tickets = preTickets[auctionUrl];
            } else {
                await loadInFrame(auctionUrl, 20000, ctx);
                await sleep(600);
                tickets = getTicketLinks(ctx);
            }
            for (const t of tickets) allTickets.push({ ...t, auctionUrl });
        }

        if (!allTickets.length) {
            return {
                ok: false,
                error: search.count > 1 ? `Znaleziono ${search.count} auftragów, ale nie znaleziono ticketu w żadnym z nich` : 'Brak ticketu',
                reportType: 'no_ticket',
                checkedAuctions: search.count,
                auctionUrls: search.urls
            };
        }

        // v3.33: sprawdzaj OD NAJNOWSZEGO i przerwij na pierwszym poprawnym (Solution=7 + credit note).
        // I tak wybralibyśmy najnowszy poprawny, więc nie otwieramy starszych ticketów.
        allTickets.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0) || (b.rmaIdNum || 0) - (a.rmaIdNum || 0));
        const inspected = [];
        let bestValid = null;
        for (const t of allTickets) {
            let cand;
            try {
                cand = await inspectTicketCandidate(t, t.auctionUrl, ctx);
            } catch (e) {
                cand = { ...t, isValid: false, hasMoneBack: false, creditNoteCount: 0, brokenItemCount: 0, inspectError: e.message };
            }
            inspected.push(cand);
            if (cand.isValid) { bestValid = cand; break; }
        }

        if (bestValid) {
            // Ramka jest już na bestValid.href (inspectTicketCandidate go załadował) — bez ponownego wejścia.
            return {
                ok: true,
                ticket: bestValid,
                checkedAuctions: search.count,
                checkedTickets: inspected.length,
                validTickets: 1,
                noSolutionTickets: inspected.filter(x => !x.hasMoneBack)
            };
        }

        // Brak poprawnego → fallback na NAJNOWSZY z istniejących (inspected[0]; przy braku valid sprawdziliśmy wszystkie).
        // Brak poprawnego → wybierz NAJLEPSZY fallback (a nie po prostu najnowszy).
        // Priorytet: (2) ticket z pozycjami z credit note, (1) ticket z jakimikolwiek
        // produktami (broken-items), (0) reszta. W obrębie priorytetu zostaje najnowszy,
        // bo inspected jest już posortowane od najnowszego. Dzięki temu ticket
        // „bez solution, ale z produktami" wygrywa z ticketem bez żadnych produktów.
        const fallbackRank = c => ((c.creditNoteCount || 0) > 0 ? 2 : ((c.brokenItemCount || 0) > 0 ? 1 : 0));
        let best = inspected[0];
        let bestRank = fallbackRank(best);
        for (const c of inspected) {
            const r = fallbackRank(c);
            if (r > bestRank) { best = c; bestRank = r; }
        }
        let forceFallbackReason;
        if (!best.hasMoneBack && best.creditNoteCount === 0) {
            forceFallbackReason = 'no_money_back_no_credit_note';
        } else if (!best.hasMoneBack) {
            forceFallbackReason = 'no_money_back';
        } else {
            forceFallbackReason = 'no_credit_note';
        }
        await loadInFrame(best.href, 20000, ctx);
        await sleep(500);
        return {
            ok: true,
            ticket: best,
            checkedAuctions: search.count,
            checkedTickets: inspected.length,
            validTickets: 0,
            forceFallback: true,
            forceFallbackReason,
            noSolutionTickets: inspected.filter(x => !x.hasMoneBack),
            allCandidates: inspected
        };
    }

    // v3.43: buduje wiersze podglądu + nadaje dupTotal/dupIndex (wielokrotności tej samej
    // kwoty na jednym zamówieniu — np. zwykły zwrot + goodwill) i znacznik isGoodwill.
    function validateBooking(items, bookingDate, accountNum) {
        const allegro = items.length && items.every(i => i.source === 'allegro');
        if (allegro) {
            if (accountNum !== '1069' && accountNum !== '1071') return 'Zwroty Allegro: wybierz konto 1069 lub 1071.';
            if (items.some(i => !/^\d{4}-\d{2}-\d{2}$/.test(i.date || ''))) return 'Brak/zła data w liście Allegro (kolumna Data).';
            return null;
        }
        const noticket = items.length && items.every(i => i.source === 'noticket');
        if (noticket) {
            if (!accountNum) return 'Podaj numer konta.';
            if (items.some(i => !/^\d{4}-\d{2}-\d{2}$/.test(i.date || ''))) return 'W liście brakuje daty przy którejś pozycji.';
            return null;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) return 'Podaj datę w formacie YYYY-MM-DD';
        if (!accountNum) return 'Podaj numer konta';
        return null;
    }

    function buildPreviewRows(items, accountNum, bookingDate) {
        const dupCount = new Map();
        items.forEach(it => { const k = it.orderNumber + '|' + it.amount; dupCount.set(k, (dupCount.get(k) || 0) + 1); });
        const dupSeen = new Map();
        return items.map(item => {
            const k = item.orderNumber + '|' + item.amount;
            const idx = (dupSeen.get(k) || 0) + 1; dupSeen.set(k, idx);
            const rowDate = (item.date) ? item.date : bookingDate;
            return {
                orderNumber: item.orderNumber, amount: item.amount, accountNum, bookingDate: rowDate,
                source: item.source || '', isGoodwill: !!item.isGoodwill, auftragNumber: item.auftragNumber || '',
                dupTotal: dupCount.get(k), dupIndex: idx,
                loading: true, error: null, selected: false, booked: false, skipped: false
            };
        });
    }

    async function checkOne(orderNumber, amount, accountNum, bookingDate, ctx = defaultFrameCtx, dupInfo = null) {
        // v3.29: najpierw VAT refund (PLN + korekta VAT + ujemny open amount)
        let preSearch = null;
        let preTickets = null;
        try {
            const vat = await detectVatRefund(orderNumber, amount, bookingDate, ctx);
            preSearch = vat.search || null;
            preTickets = vat.ticketsByAuction || null;
            if (vat.applicable) {
                return {
                    ok: true, vatRefund: true, vatAuctionUrl: vat.auctionUrl,
                    vatOpenAmount: vat.openAmount, vatOverTolerance: vat.overTolerance,
                    ticketId: null, ticketHref: null, ticketStatus: 'VAT',
                    selected: !vat.alreadyBooked, alreadyBooked: !!vat.alreadyBooked,
                    existingRefund: vat.alreadyBooked ? { matchType: 'single', amount: vat.expectedAbs.toFixed(2), date: bookingDate, entries: [{ amount: vat.expectedAbs.toFixed(2), date: bookingDate }] } : null,
                    accountNum, amount, bookingDate
                };
            }
            if (vat.amountMismatch) {
                return {
                    ok: false,
                    error: `Kwota z Excela (${normalizeAmount(amount)}) nie pasuje do open amount (PLN ${Number(vat.openAmount).toFixed(2)}). Sprawdź kwotę — ticket nie był sprawdzany.`,
                    reportType: 'amount_mismatch',
                    auctionUrls: vat.auctionUrl ? [vat.auctionUrl] : []
                };
            }
            if (vat.deleted) {
                return {
                    ok: false,
                    error: 'Auftrag jest Deleted — pomijam (nic nie księguję).',
                    reportType: 'deleted',
                    deleted: true,
                    auctionUrls: (preSearch && preSearch.urls) || []
                };
            }
        } catch (e) { preSearch = null; }

        const found = await findBestTicketForOrder(orderNumber, ctx, preSearch, preTickets);
        if (!found.ok) {
            return {
                ok: false,
                error: found.error,
                reportType: found.reportType || '',
                checkedAuctions: found.checkedAuctions || 0,
                checkedTickets: found.checkedTickets || 0,
                noSolutionTickets: found.noSolutionTickets || [],
                allCandidates: found.allCandidates || [],
                auctionUrls: found.auctionUrls || []
            };
        }

        const ticket = found.ticket;

        // v3.33: findBestTicketForOrder zostawia ramkę już na wybranym tickecie — czytamy bez ponownego wejścia.
        // v3.43: gdy dla tego zamówienia+kwoty są ≥2 osobne pozycje (np. zwykły + goodwill),
        // pozycję uznajemy za już zaksięgowaną tylko jeśli liczba wpisów tej kwoty osiągnęła jej numer.
        let existingRefund;
        if (dupInfo && dupInfo.total > 1) {
            const bookedCount = countBookedSameAmount(getFrameDoc(ctx), amount);
            existingRefund = bookedCount >= dupInfo.index
                ? { matchType: 'single', amount: normalizeAmount(amount), date: bookingDate, entries: [], multiOccurrence: true }
                : null;
        } else {
            existingRefund = findBookedRefundEntry(getFrameDoc(ctx), amount, bookingDate, false);
        }

        if (existingRefund) {
            return {
                ok: true,
                ticketId: ticket.id,
                ticketHref: ticket.href,
                ticketStatus: ticket.ticketStatus || '?',
                hasMoneBack: ticket.hasMoneBack !== false,
                creditNoteCount: ticket.creditNoteCount || 0,
                selected: false,
                alreadyBooked: true,
                existingRefund,
                accountNum,
                amount,
                bookingDate,
                checkedAuctions: found.checkedAuctions,
                checkedTickets: found.checkedTickets,
                validTickets: found.validTickets,
                forceFallback: !!found.forceFallback,
                forceFallbackReason: found.forceFallbackReason || null,
                selectedTicketDate: ticket.createdAtText || '',
                noSolutionTickets: found.noSolutionTickets || []
            };
        }

        return {
            ok: true,
            ticketId: ticket.id,
            ticketHref: ticket.href,
            ticketStatus: ticket.ticketStatus || '?',
            hasMoneBack: ticket.hasMoneBack !== false,
            creditNoteCount: ticket.creditNoteCount || 0,
            selected: true,
            alreadyBooked: false,
            accountNum,
            amount,
            bookingDate,
            checkedAuctions: found.checkedAuctions,
            checkedTickets: found.checkedTickets,
            validTickets: found.validTickets,
            forceFallback: !!found.forceFallback,
            forceFallbackReason: found.forceFallbackReason || null,
            selectedTicketDate: ticket.createdAtText || '',
            noSolutionTickets: found.noSolutionTickets || []
        };
    }

    function normalizeDateForCompare(value) {
        return String(value || '').trim();
    }

    function ticketTextForVerify(doc) {
        if (!doc || !doc.body) return '';
        let text = String(doc.body.innerText || doc.body.textContent || '');
        text = text.replace(/\u00a0/g, ' ');
        text = text.replace(/\s+/g, ' ');
        return text;
    }

    function amountVariantsForVerify(amount) {
        const n = normalizeAmount(amount);
        if (!n) return [];
        const fixed = String(n);
        const noTrailing = fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
        const comma = fixed.replace('.', ',');
        const variants = [fixed, noTrailing, comma];
        return [...new Set(variants.filter(Boolean))];
    }

    function parseRefundLinkText(text) {
        // v3.21: jeden uniwersalny regex. Tekst pojedynczego credit-note <a> ma sztywny
        // format: keyword + opcjonalnie preposition/currency + amount-z-dziesiętnymi +
        // opcjonalnie suffix + data YYYY-MM-DD. Z dowolną kolejnością currency-amount
        // (PT używa "89.99 EUR" — kwota przed walutą, inne języki "EUR 89.99").
        //
        // BEZPIECZEŃSTWO: ten regex jest stosowany TYLKO do tekstu jednego <a>
        // (już zlokalizowanego przez DOM marker id="unbook" lub data-refund-id),
        // a NIE do całego body strony — więc dropdown options, ceny produktów itp.
        // nie mogą zostać przypadkowo dopasowane.
        //
        // Wymagamy kwoty z DZIESIĘTNYMI (np. 89.99, 909.00) — to automatycznie
        // odrzuca placeholdery typu "Refund of EUR on 0000-00-00" (0000 nie ma kropki).
        //
        // Zaobserwowane słowa-klucze w systemie Prologistics:
        //   EN: Refund | DE: Rückerstattung | FR: Remboursement
        //   IT: Rimborso | ES: Reembolso | PT: Reembolso (de + em + "encomenda")
        //   DK: Refundering
        // Łatwo dorzucić kolejne języki gdy się pojawią (NL Terugbetaling,
        // HU Visszatérítés, RO Rambursare, SE Återbetalning, NO Refusion, etc).
        const re = /(?:Refund|R(?:ü|u)ckerstattung|Remboursement|Rimborso|Reembolso|Refundering|Terugbetaling|Visszatérítés|Rambursare|Återbetalning|Refusion|Hyvitys|Zwrot)\b[^0-9]{0,80}([0-9]+[.,][0-9]{1,2})[^0-9]+([0-9]{4}-[0-9]{2}-[0-9]{2})/i;
        const m = String(text || '').match(re);
        if (!m) return null;
        const amt = normalizeAmount(m[1]);
        const date = normalizeDateForCompare(m[2]);
        if (amt === null || amt === 0) return null;
        if (!date || date === '0000-00-00') return null;
        return { amount: amt, date: date };
    }

    function extractBookedRefundEntries(doc) {
        // v3.21: czysta detekcja DOM. Test na realnych ticketach (EN, DE, FR, PT, DK)
        // pokazał że KAŻDY zaksięgowany refund ma JEDNOCZEŚNIE dwa uniwersalne markery:
        //
        //   1) <a id="unbook"> na linku Delete obok credit-note
        //   2) <input type="checkbox" data-refund-id="XXXX" class="solution-checkbox">
        //      wewnątrz credit-note-link-container
        //
        // Niezaksięgowane credit-note'y mają zamiast tego <span class="solution-checkbox-placeholder">
        // i brak id="unbook" — automatycznie odrzucane.
        //
        // Iterujemy po obu markerach (dla redundancji jeśli jeden zniknie z systemu),
        // deduplikujemy przez refundId z URL credit_note.php?id=XXX.
        // Tekst linka credit-note jest w lokalnym języku — multi-language parsing przez
        // parseRefundLinkText (EN/DE/FR/IT/ES).
        const entries = [];
        const seenIds = new Set();

        if (!doc || !doc.querySelectorAll) return entries;

        function addFromContainer(linkContainer, source) {
            const a = linkContainer.querySelector('a[href*="credit_note.php"]');
            if (!a) return;
            const linkText = (a.textContent || '').trim();
            // v3.34: ten kontener trafił tu TYLKO przez marker data-refund-id / id="unbook",
            // więc JEST już zaksięgowany. Najpierw próbujemy normalnego (językowego) parsera;
            // jeśli język linka nie jest na liście słów-kluczy, robimy loose-parse: pierwsza
            // liczba z dziesiętnymi + pierwsza data YYYY-MM-DD wprost z tekstu. Bezpieczne,
            // bo tekst pochodzi z pojedynczego <a> już potwierdzonej credit note (nie z body).
            let parsed = parseRefundLinkText(linkText);
            if (!parsed) {
                const am = linkText.match(/([0-9]+[.,][0-9]{1,2})/);
                const dm = linkText.match(/([0-9]{4}-[0-9]{2}-[0-9]{2})/);
                const amt = am ? normalizeAmount(am[1]) : null;
                const dt = dm ? normalizeDateForCompare(dm[1]) : null;
                if (amt !== null && amt !== 0 && dt && dt !== '0000-00-00') {
                    parsed = { amount: amt, date: dt };
                }
            }
            if (!parsed) return;
            const m = (a.href || a.getAttribute('href') || '').match(/[?&]id=(\d+)/);
            const refundId = m ? m[1] : null;
            if (refundId) {
                if (seenIds.has(refundId)) return;
                seenIds.add(refundId);
            }
            entries.push({
                amount: parsed.amount,
                date: parsed.date,
                text: normalizeSpaces(linkText).slice(0, 180),
                source: source,
                refundId: refundId
            });
        }

        // Marker 1: a[id="unbook"] → najbliższy <tr> → .credit-note-link-container
        doc.querySelectorAll('a[id="unbook"]').forEach(ub => {
            const tr = ub.closest ? ub.closest('tr') : null;
            if (!tr) return;
            const lc = tr.querySelector('.credit-note-link-container');
            if (!lc) return;
            addFromContainer(lc, 'dom-unbook');
        });

        // Marker 2: input.solution-checkbox[data-refund-id] → najbliższy credit-note-link-container
        doc.querySelectorAll('input.solution-checkbox[data-refund-id]').forEach(cb => {
            const lc = cb.closest ? cb.closest('.credit-note-link-container') : null;
            if (!lc) return;
            addFromContainer(lc, 'dom-checkbox');
        });

        return entries;
    }

    // NEW: szuka kombinacji wpisów Rückerstattung sumującej się do oczekiwanej kwoty.
    // Rozwiązuje problem 50 + 50 = 100, kiedy refund został rozbity na kilka pozycji.
    // Zwraca tablicę wpisów albo null. Wymaga co najmniej 2 wpisów (pojedyncze
    // dopasowanie obsługuje wcześniej findBookedRefundEntry).
    function findSubsetMatchingSum(entries, target, tolerance) {
        const tol = tolerance == null ? 0.005 : tolerance;
        const n = entries.length;
        if (n < 2 || n > 20) return null;

        const sorted = [...entries].sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
        let best = null;

        function backtrack(idx, currentSum, currentSubset) {
            if (best) return;
            if (currentSubset.length >= 2 && Math.abs(currentSum - target) < tol) {
                best = [...currentSubset];
                return;
            }
            if (currentSum > target + tol) return;
            if (idx >= sorted.length) return;
            currentSubset.push(sorted[idx]);
            backtrack(idx + 1, currentSum + parseFloat(sorted[idx].amount), currentSubset);
            currentSubset.pop();
            if (best) return;
            backtrack(idx + 1, currentSum, currentSubset);
        }

        backtrack(0, 0, []);
        return best;
    }

    // v3.43: liczy ile JUŻ zaksięgowanych wpisów refund ma daną kwotę (do obsługi
    // wielu osobnych zwrotów tej samej kwoty na jednym zamówieniu, np. normalny + goodwill).
    function countBookedSameAmount(doc, amount) {
        const exp = normalizeAmount(amount);
        if (!exp) return 0;
        return extractBookedRefundEntries(doc).filter(e => e.amount === exp).length;
    }

    function findBookedRefundEntry(doc, amount, bookingDate, requireSameDate) {
        const expectedAmount = normalizeAmount(amount);
        if (!expectedAmount) return null;

        const expectedDate = normalizeDateForCompare(bookingDate);
        let entries = extractBookedRefundEntries(doc);
        if (!entries.length) return null;
        // Duplikat tylko przy zgodnej dacie: rozważamy wyłącznie wpisy z tą samą datą księgowania.
        if (expectedDate) entries = entries.filter(entry => entry.date === expectedDate);
        if (!entries.length) return null;

        // 1. Pojedyncza pozycja z taką samą kwotą (preferujemy z naszą datą)
        const sameAmount = entries.filter(entry => entry.amount === expectedAmount);
        if (sameAmount.length) {
            const exactDate = expectedDate ? sameAmount.find(entry => entry.date === expectedDate) : null;
            if (exactDate) {
                return { ...exactDate, exactDate: true, matchType: 'single', entries: [exactDate] };
            }
            if (requireSameDate) return null;
            return { ...sameAmount[0], exactDate: false, matchType: 'single', entries: [sameAmount[0]] };
        }

        if (requireSameDate) return null;

        const expectedNum = parseFloat(expectedAmount);

        // 2. Subset sumujący się dokładnie do oczekiwanej kwoty (np. 50 + 50 = 100)
        const subset = findSubsetMatchingSum(entries, expectedNum);
        if (subset) {
            const totalAmount = subset.reduce((s, e) => s + parseFloat(e.amount), 0).toFixed(2);
            return {
                matchType: 'subset',
                exactDate: false,
                amount: totalAmount,
                date: subset[subset.length - 1].date || '',
                text: subset.map(e => `${e.amount} (${e.date})`).join(' + '),
                entries: subset
            };
        }

        // 3. Suma wszystkich pozycji równa lub przekracza oczekiwaną kwotę
        if (entries.length > 1) {
            const total = entries.reduce((s, e) => s + parseFloat(e.amount), 0);
            if (Math.abs(total - expectedNum) < 0.005) {
                return {
                    matchType: 'sum-equal',
                    exactDate: false,
                    amount: total.toFixed(2),
                    date: entries[entries.length - 1].date || '',
                    text: entries.map(e => `${e.amount} (${e.date})`).join(' + '),
                    entries
                };
            }
            if (total > expectedNum + 0.005) {
                return {
                    matchType: 'sum-exceeds',
                    exactDate: false,
                    amount: total.toFixed(2),
                    date: entries[entries.length - 1].date || '',
                    text: entries.map(e => `${e.amount} (${e.date})`).join(' + '),
                    entries
                };
            }
        }

        return null;
    }

    function hasBookedRefundEntry(doc, amount, bookingDate) {
        // Weryfikacja po Update.
        // v3.15: akceptujemy zarówno pojedynczy wpis jak i ROZBITY (subset summing)
        // — gdy system rozdziela kwotę po Update na osobne wpisy per produkt
        // (np. 123.82+123.82+54.17+54.17 = 355.98 dla 4 zaznaczonych checkboxów).
        // Bezpieczeństwo: subset bierze TYLKO wpisy z naszą datą bookingu.
        //
        // v3.16: zwraca obiekt { matchType, entries, amount, date } gdy match,
        // lub null gdy brak. Stary if-truthy check (if (hasBookedRefundEntry(...)))
        // nadal działa — object jest truthy, null falsy.
        const expectedAmount = normalizeAmount(amount);
        if (!expectedAmount) return null;
        const expectedDate = normalizeDateForCompare(bookingDate);
        const entries = extractBookedRefundEntries(doc);

        // 1. Pojedynczy dokładny match
        const singleEntry = entries.find(e => e.amount === expectedAmount && e.date === expectedDate);
        if (singleEntry) {
            return {
                matchType: 'single',
                entries: [singleEntry],
                amount: expectedAmount,
                date: expectedDate
            };
        }

        // 2. Rozbity match: ≥2 wpisy z naszą datą, sumujące się do oczekiwanej kwoty
        const sameDateEntries = entries.filter(e => e.date === expectedDate);
        if (sameDateEntries.length >= 2) {
            const sum = sameDateEntries.reduce((s, e) => s + e.amount, 0);
            if (Math.abs(sum - expectedAmount) < 0.02) {
                return {
                    matchType: 'subset',
                    entries: sameDateEntries,
                    amount: expectedAmount,
                    date: expectedDate
                };
            }
        }

        return null;
    }

    function describeEscalation(esc) {
        if (!esc) return '';
        if (esc.pageNotHealthy) {
            return '<strong style="color:#dc2626;">strona ticketu nie wyrenderowała się poprawnie — sprawdź ticket ręcznie</strong>';
        }
        const parts = [];
        if (esc.commentAdded) parts.push('komentarz ✓');
        else parts.push('komentarz ✗' + (esc.commentError ? ` (${esc.commentError})` : ''));

        // v3.35: reassign nie jest już automatyczny — sygnalizujemy potrzebę ręcznego przepięcia.
        if (esc.needsManualReassign) {
            if (esc.reassignedTo) {
                parts.push(`⚠️ reassign RĘCZNIE → <strong>${esc.reassignedTo}</strong>`);
            } else {
                parts.push('⚠️ reassign RĘCZNIE (nie ustalono osoby otwierającej — sprawdź ticket)');
            }
        } else if (esc.reassigned && esc.reassignedTo) {
            parts.push(`przypisany do <strong>${esc.reassignedTo}</strong> ✓`);
        } else if (esc.reassignError) {
            parts.push(`reassign ✗: ${esc.reassignError}`);
        }
        return parts.join(' | ');
    }

    // Wspólny formater do komunikatów o już zaksięgowanym zwrocie — pokrywa
    // single match, subset (50+50=100), sum-equal i sum-exceeds.
    // v3.16: opis "rozbity na N wpisów" do dopisania w success logu
    function describeSplitInfo(splitInfo) {
        if (!splitInfo || splitInfo.matchType !== 'subset') return '';
        const entries = splitInfo.entries || [];
        if (entries.length < 2) return '';
        const parts = entries.map(e => Number(e.amount).toFixed(2)).join(' + ');
        return ` (rozbity na ${entries.length} wpisy: ${parts} = ${Number(splitInfo.amount).toFixed(2)})`;
    }

    function describeExistingRefund(existingRefund) {
        if (!existingRefund) return '';
        const mt = existingRefund.matchType || 'single';
        if (mt === 'single') {
            return `${existingRefund.amount}, data ${existingRefund.date}`;
        }
        const parts = (existingRefund.entries || [])
            .map(e => `${e.amount} (${e.date})`).join(' + ');
        if (mt === 'subset') {
            return `rozbite: ${parts} = ${existingRefund.amount}`;
        }
        if (mt === 'sum-equal') {
            return `suma wpisów: ${parts} = ${existingRefund.amount}`;
        }
        if (mt === 'sum-exceeds') {
            return `ticket ma już więcej: ${parts} = ${existingRefund.amount}`;
        }
        return `${existingRefund.amount}${existingRefund.date ? ', data ' + existingRefund.date : ''}`;
    }

    function findAmountInputForArticle(doc, articleId, primaryRow) {
        let amountInput = articleId ? doc.querySelector(`input[name="cost_invoice_number[${articleId}]"]`) : null;
        amountInput = amountInput || (primaryRow ? primaryRow.querySelector('input[name^="cost_invoice_number["]') : null);
        amountInput = amountInput || doc.querySelector('input[name^="cost_invoice_number["]');
        return amountInput;
    }

    function findDateInputForArticle(doc, articleId, primaryRow) {
        let dateInput = articleId ? doc.querySelector(`input[name="cost_invoice_date[${articleId}]"]`) : null;
        dateInput = dateInput || (primaryRow ? primaryRow.querySelector('input[name^="cost_invoice_date["]') : null);
        dateInput = dateInput || doc.querySelector('input[name^="cost_invoice_date["]');
        return dateInput;
    }

    function verifyTicketBooking(doc, amount, bookingDate, accountNum, articleId) {
        // Po prawidłowym Update system przenosi księgowanie do statycznego wpisu
        // typu "Rückerstattung von EUR ... am YYYY-MM-DD". Nie wolno weryfikować
        // tylko selecta Solution, bo po zapisie select może wrócić do pustego "Add new".

        // v3.34: strukturalny, JĘZYKOWO-NIEZALEŻNY sygnał sukcesu. Zaksięgowana credit note
        // ma w .credit-note-link-container <input class="solution-checkbox" data-refund-id>
        // (oraz <a id="unbook">), a NIEzaksięgowana ma <span class="solution-checkbox-placeholder">.
        // Po udanym Update przybywa kontener z data-refund-id. Liczymy je przed/po nie da się tu,
        // więc używamy hasBookedRefundEntry (kwota+data) jako głównego potwierdzenia, a ten
        // strukturalny check jako fallback gdy parser tekstu nie rozpozna języka.
        const matchInfo = hasBookedRefundEntry(doc, amount, bookingDate);
        if (matchInfo) {
            return { ok: true, method: 'existing-refund-entry', splitInfo: matchInfo };
        }

        // Fallback strukturalny: jest zaksięgowana credit note (data-refund-id) z naszą datą,
        // ale kwoty nie udało się sparsować z tekstu (nieobsługiwany język) → uznaj za sukces.
        const expectedDateStruct = normalizeDateForCompare(bookingDate);
        const bookedContainers = [...doc.querySelectorAll('.credit-note-link-container')].filter(c =>
            c.querySelector('input.solution-checkbox[data-refund-id]') &&
            !c.querySelector('.solution-checkbox-placeholder')
        );
        const bookedWithOurDate = bookedContainers.some(c => {
            const a = c.querySelector('a[href*="credit_note.php"]');
            const t = a ? (a.textContent || '') : '';
            return expectedDateStruct && t.indexOf(expectedDateStruct) >= 0;
        });
        if (bookedWithOurDate) {
            return { ok: true, method: 'dom-refund-marker' };
        }

        const expectedAmount = normalizeAmount(amount);
        const expectedDate = normalizeDateForCompare(bookingDate);
        const expectedAccount = String(accountNum || '').trim();

        const solutionSel = findSolutionSelect(doc, articleId);
        if (!solutionSel) {
            return { ok: false, error: 'Po Update nie znaleziono wpisu Rückerstattung ani pola Solution do potwierdzenia' };
        }

        const solutionOk = String(solutionSel.value) === '7';

        if (!solutionOk) {
            return { ok: false, error: 'Po Update nie znaleziono wpisu Rückerstattung, a Solution nie ma value=7' };
        }

        const amountInput = findAmountInputForArticle(doc, articleId, null);
        if (!amountInput) {
            return { ok: false, error: 'Po Update nie znaleziono wpisu Rückerstattung ani pola kwoty do potwierdzenia' };
        }

        const actualAmount = normalizeAmount(amountInput.value);
        if (actualAmount !== expectedAmount) {
            return {
                ok: false,
                error: 'Po Update kwota nie zgadza się. Oczekiwano ' + expectedAmount + ', jest ' + (actualAmount || 'pusto')
            };
        }

        const dateInput = findDateInputForArticle(doc, articleId, null);
        if (!dateInput) {
            return { ok: false, error: 'Po Update nie znaleziono wpisu Rückerstattung ani pola daty do potwierdzenia' };
        }

        const actualDate = normalizeDateForCompare(dateInput.value);
        if (actualDate !== expectedDate) {
            return {
                ok: false,
                error: 'Po Update data nie zgadza się. Oczekiwano ' + expectedDate + ', jest ' + (actualDate || 'pusto')
            };
        }

        let accountSel = findCostAccountSelect(doc, articleId);
        if (!accountSel) accountSel = doc.querySelector('select[name^="cost_account["]');

        if (accountSel) {
            const actualAccount = String(accountSel.value || '').trim();
            if (actualAccount !== expectedAccount) {
                return {
                    ok: false,
                    error: 'Po Update konto nie zgadza się. Oczekiwano ' + expectedAccount + ', jest ' + (actualAccount || 'pusto')
                };
            }
        }

        return { ok: true, method: 'editable-fields' };
    }

    // v3.9: responsible_uname używa Select2 z AJAX. Lista opcji w nativowym <select>
    // jest pusta dopóki user nie wpisze imienia w pole search. Otwieramy dropdown,
    // wpisujemy fragment imienia, czekamy na wyniki AJAX, klikamy najlepszy match.
    async function findUserInSelect2(ctx, queryName) {
        const doc = getFrameDoc(ctx);
        const win = getFrameWin(ctx);

        const select = doc.getElementById('responsible_uname');
        if (!select) return { ok: false, error: 'Brak select#responsible_uname' };

        // Strategia 1: może opcja jest już w nativowym select (np. po wcześniejszym otwarciu)
        // v3.13 Wariant B: native select zazwyczaj zawiera TYLKO osobę aktualnie odpowiedzialną
        // (ostatnio odbitą). Direct match przy 1 opcji = przypadkowa zbieżność i tautologiczny
        // reassign "do tej samej osoby" — pomijamy. Direct match akceptujemy DOPIERO gdy select
        // ma ≥2 opcji (czyli Select2 wcześniej dociągnął kandydatów asynchronicznie).
        const optionsCount = (select.options || []).length;
        if (optionsCount >= 2) {
            const directHit = findResponsibleOptionByName(select, queryName);
            if (directHit) {
                return {
                    ok: true,
                    value: directHit.value,
                    text: normalizeSpaces(directHit.textContent || ''),
                    method: 'direct'
                };
            }
        }

        // Strategia 2: Select2 search przez jQuery API
        const $ = win.$ || win.jQuery;
        if (!$) {
            return { ok: false, error: 'jQuery niedostępne — nie mogę otworzyć Select2' };
        }

        let $select;
        try {
            $select = $(select);
        } catch (e) {
            return { ok: false, error: 'Nie udało się zainicjalizować $select: ' + e.message };
        }

        // v3.10: trzy strategie otwarcia Select2
        let opened = false;
        let openError = null;
        const hasSelect2Plugin = !!($.fn && $.fn.select2);

        // Strategia A: jQuery API open
        if (hasSelect2Plugin) {
            try {
                // Czy Select2 jest zainicjalizowany na tym elemencie?
                const hasSelect2Data = $select.data && $select.data('select2');
                if (!hasSelect2Data) {
                    // Inicjalizuj — to nie zaszkodzi jeśli wcześniej już było ale data nie była ustawiona
                    try { $select.select2(); } catch (initErr) { /* ignore */ }
                }
                $select.select2('open');
                opened = true;
            } catch (e) {
                openError = 'jQuery API: ' + e.message;
            }
        } else {
            openError = 'brak $.fn.select2';
        }

        // Strategia B: DOM click na .select2-selection (wrapper przy select)
        if (!opened) {
            let trigger = null;
            // Szukaj wrappera Select2 wśród rodzeństwa selecta
            let sibling = select.nextElementSibling;
            while (sibling) {
                if (sibling.classList && (sibling.classList.contains('select2') || sibling.classList.contains('select2-container'))) {
                    trigger = sibling.querySelector('.select2-selection');
                    if (trigger) break;
                }
                sibling = sibling.nextElementSibling;
            }
            // Fallback: szukaj w rodzicu
            if (!trigger) {
                const parent = select.parentElement;
                if (parent) trigger = parent.querySelector('.select2-container .select2-selection') || parent.querySelector('.select2-selection');
            }
            // Fallback: globalnie po id renderowanego elementu
            if (!trigger) {
                const renderedId = 'select2-' + select.id + '-container';
                const rendered = doc.getElementById(renderedId);
                if (rendered) trigger = rendered.closest('.select2-selection') || rendered.closest('.select2-container');
            }

            if (trigger) {
                try {
                    trigger.click();
                    opened = true;
                } catch (e) {
                    openError = (openError ? openError + ' | ' : '') + 'DOM click: ' + e.message;
                }
            } else {
                openError = (openError ? openError + ' | ' : '') + 'brak triggera .select2-selection';
            }
        }

        if (!opened) {
            return {
                ok: false,
                error: 'Nie udało się otworzyć Select2: ' + (openError || 'unknown')
            };
        }

        await sleep(450);

        const searchInput = doc.querySelector('.select2-search__field[aria-controls="select2-responsible_uname-results"]') ||
                            doc.querySelector('.select2-dropdown .select2-search__field') ||
                            doc.querySelector('.select2-search__field');

        // v3.10: bezpieczne zamknięcie dropdownu — działa zarówno z init Select2 jak i bez
        const closeSelect2Dropdown = () => {
            try {
                if (hasSelect2Plugin && $select.data && $select.data('select2')) {
                    $select.select2('close');
                    return;
                }
            } catch (e) {}
            // Fallback DOM: Escape na search field, kliknięcie poza dropdownem
            try {
                const sf = doc.querySelector('.select2-search__field');
                if (sf) {
                    sf.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', code: 'Escape', keyCode: 27 }));
                    return;
                }
            } catch (e) {}
            try { doc.body.click(); } catch (e) {}
        };

        if (!searchInput) {
            closeSelect2Dropdown();
            return { ok: false, error: 'Brak pola .select2-search__field' };
        }

        // Spróbuj kilka różnych queries — pełna nazwa, samo imię, samo nazwisko (z/bez diakrytyków)
        const parts = String(queryName || '').split(/\s+/).filter(Boolean);
        const queries = [];
        if (queryName) queries.push(queryName);
        if (parts.length >= 1) queries.push(parts[0]);
        if (parts.length >= 2) queries.push(parts[parts.length - 1]);
        queries.push(removeDiacritics(queryName));
        if (parts.length >= 2) queries.push(removeDiacritics(parts[parts.length - 1]));
        // Unikaty + odfiltruj zbyt krótkie
        const uniqQueries = [...new Set(queries.filter(q => q && q.length >= 2))];

        const targetNorm = normalizeForMatch(queryName);
        let chosen = null;
        let chosenViaQuery = '';
        let lastResultsSample = [];

        for (const q of uniqQueries) {
            // Wyczyść poprzednie wpisanie
            try {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (e) {}
            await sleep(100);

            // Wpisz query
            setNativeValue(searchInput, q);
            try {
                searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: q.slice(-1) }));
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: q.slice(-1) }));
            } catch (e) {}

            // Czekaj na wyniki AJAX (max 4s na query)
            let results = null;
            for (let i = 0; i < 20; i++) {
                await sleep(200);
                const resContainer = doc.querySelector('#select2-responsible_uname-results') ||
                                     doc.querySelector('.select2-results__options');
                if (!resContainer) continue;

                const items = [...resContainer.querySelectorAll('li.select2-results__option')];
                const realItems = items.filter(li => {
                    const t = (li.textContent || '').trim();
                    if (!t) return false;
                    if (/searching|loading|wczytywanie|szukam/i.test(t)) return false;
                    if (/no results|brak wyników|no matches/i.test(t)) return false;
                    if (li.classList && li.classList.contains('loading-results')) return false;
                    return true;
                });
                if (realItems.length > 0) {
                    results = realItems;
                    break;
                }
            }

            if (!results || !results.length) continue;

            lastResultsSample = results.map(li => (li.textContent || '').trim()).slice(0, 5);

            // Znajdź najlepszy match wśród wyników
            // 1. Exact normalized match
            let item = results.find(li => normalizeForMatch(li.textContent) === targetNorm);
            // 2. Item contains target
            if (!item) item = results.find(li => normalizeForMatch(li.textContent).includes(targetNorm));
            // 3. All target words in item
            if (!item) {
                const tw = targetNorm.split(' ').filter(w => w.length > 2);
                if (tw.length) {
                    item = results.find(li => {
                        const lt = normalizeForMatch(li.textContent);
                        return tw.every(w => lt.includes(w));
                    });
                }
            }
            // 4. Last name match
            if (!item && parts.length >= 2) {
                const lastNameNorm = normalizeForMatch(parts[parts.length - 1]);
                if (lastNameNorm.length > 2) {
                    item = results.find(li => normalizeForMatch(li.textContent).includes(lastNameNorm));
                }
            }

            if (item) {
                chosen = item;
                chosenViaQuery = q;
                break;
            }
        }

        if (!chosen) {
            closeSelect2Dropdown();
            return {
                ok: false,
                error: 'Nie znaleziono "' + queryName + '" w Select2 (próbowane: ' + uniqQueries.join(', ') + ')',
                lastResultsSample
            };
        }

        // Kliknij wybrany element — to powinno zaktualizować nativowy select i zamknąć dropdown
        const chosenText = normalizeSpaces(chosen.textContent || '');
        try {
            chosen.click();
        } catch (e) {
            return { ok: false, error: 'Click na opcję Select2 zawiódł: ' + e.message };
        }
        await sleep(500);

        // Upewnij się że dropdown jest zamknięty
        closeSelect2Dropdown();
        await sleep(100);

        // Sprawdź nativowy select
        const selectedOpt = select.options[select.selectedIndex];
        if (selectedOpt) {
            return {
                ok: true,
                value: selectedOpt.value || '',
                text: normalizeSpaces(selectedOpt.textContent || '') || chosenText,
                method: 'select2-search',
                usedQuery: chosenViaQuery
            };
        }

        // Fallback gdy click nie zsynchronizował nativowego selecta — bierzemy z tekstu opcji
        return {
            ok: true,
            value: '',
            text: chosenText,
            method: 'select2-search-text-only',
            usedQuery: chosenViaQuery,
            warning: 'Native select nie został zaktualizowany przez Select2'
        };
    }

    async function addEscalationComment(ctx, commentText) {
        const doc = getFrameDoc(ctx);
        const win = getFrameWin(ctx);

        const textarea = doc.querySelector('textarea#newcomment, textarea[name="newcomment"]');
        if (!textarea) return { ok: false, error: 'Brak textarea #newcomment' };

        setNativeValue(textarea, commentText);
        await sleep(200);

        const addBtn =
            doc.querySelector('input[type="button"][value="Add comment"]') ||
            [...doc.querySelectorAll('input[type="button"], input[type="submit"], button')]
                .find(b => (b.getAttribute && /comments\.add/i.test(b.getAttribute('onclick') || '')) ||
                            /^add\s+comment$/i.test((b.value || b.textContent || '').trim()));
        if (!addBtn) return { ok: false, error: 'Brak przycisku Add comment' };

        addBtn.click();
        // comments.add('') zwykle robi XHR, czasem przeładowuje ramkę
        await sleep(1500);
        return { ok: true };
    }

    async function reassignTicketToUser(ctx, ticketHref, openedByName) {
        // v3.19: WRACAMY do zawsze-reload (jak v3.13). Conditional reload (v3.14 Opt #2)
        // miało oszczędzać czas ale w niektórych przypadkach DOM był w stanie pośrednim
        // po Add comment XHR — pre-check na select wprowadzał w błąd. Bezpieczniej
        // zawsze reload + polling.
        if (ticketHref) {
            try {
                await loadInFrame(ticketHref, 20000, ctx);
                await sleep(800);
            } catch (e) {
                // Jeśli reload zawiedzie, lecimy dalej — może i tak zadziała
            }
        }

        let doc = getFrameDoc(ctx);
        const win = getFrameWin(ctx);

        // Polling 5×500ms na pojawienie się selecta (async render Select2)
        let select = findResponsibleSelect(doc);
        if (!select) {
            for (let i = 0; i < 5; i++) {
                await sleep(500);
                doc = getFrameDoc(ctx);
                select = findResponsibleSelect(doc);
                if (select) break;
            }
        }
        if (!select) {
            const healthy = isTicketPageHealthy(doc);
            return {
                ok: false,
                error: `Brak select #responsible_uname (po reload + 5×500ms retry, pageHealthy=${healthy})`
            };
        }

        // v3.9: użyj Select2 z wyszukiwaniem AJAX zamiast samego nativowego select
        const found = await findUserInSelect2(ctx, openedByName);
        if (!found.ok) {
            return {
                ok: false,
                error: found.error,
                availableUsersSample: found.lastResultsSample || []
            };
        }

        const targetUserText = found.text;
        const targetUserValue = found.value;

        // Upewnij się że nativowy select ma value (jeśli Select2 click nie zsynchronizował,
        // ustawiamy ręcznie i triggerujemy change)
        if (targetUserValue && select.value !== targetUserValue) {
            select.value = targetUserValue;
            triggerChange(win, select);
            await sleep(200);
        }

        const reassignBtn =
            doc.querySelector('input[type="button"][value="Reassign"]') ||
            [...doc.querySelectorAll('input[type="button"], input[type="submit"], button')]
                .find(b => (b.getAttribute && /reassignComment/i.test(b.getAttribute('onclick') || '')) ||
                            /^reassign$/i.test((b.value || b.textContent || '').trim()));
        if (!reassignBtn) return { ok: false, error: 'Brak przycisku Reassign' };

        reassignBtn.click();
        await sleep(1800);

        // Po reassign przeładuj ticket i sprawdź kogo widać jako odpowiedzialnego
        try {
            await loadInFrame(ticketHref, 20000, ctx);
            await sleep(800);
        } catch (e) {
            return {
                ok: true,
                targetUser: targetUserText,
                targetValue: targetUserValue,
                currentResponsible: '',
                verified: false,
                verifyError: 'Nie udało się przeładować ticketu do weryfikacji: ' + e.message,
                searchMethod: found.method,
                searchQuery: found.usedQuery
            };
        }

        const newDoc = getFrameDoc(ctx);
        const newSelect = findResponsibleSelect(newDoc);
        let currentResponsibleText = '';
        let currentResponsibleValue = '';
        if (newSelect) {
            const selectedOpt = newSelect.options[newSelect.selectedIndex];
            if (selectedOpt) {
                currentResponsibleText = normalizeSpaces(selectedOpt.textContent || '');
                currentResponsibleValue = selectedOpt.value || '';
            }
        }

        const verified = (currentResponsibleValue && targetUserValue && currentResponsibleValue === targetUserValue) ||
            (currentResponsibleText && normalizeForMatch(currentResponsibleText) === normalizeForMatch(targetUserText));

        return {
            ok: true,
            targetUser: targetUserText,
            targetValue: targetUserValue,
            currentResponsible: currentResponsibleText,
            verified,
            searchMethod: found.method,
            searchQuery: found.usedQuery
        };
    }

    async function escalateNoSolutionTicket(ctx, ticketHref, reason, customComment) {
        // Wywoływane gdy fillTicket zwróci { noSolution: true }.
        // 1. Wyciąga Ticket Opened By z aktualnego widoku
        // 2. Dodaje komentarz "Please add solution"
        // 3. Przepina ticket do osoby, która go otworzyła
        // 4. Weryfikuje (po przeładowaniu) na kogo jest teraz przypisany
        const result = {
            reason: reason || '',
            openedBy: '',
            commentAdded: false,
            commentError: null,
            reassigned: false,
            reassignedTo: null,
            currentResponsible: null,
            reassignError: null,
            availableUsersSample: null,
            pageNotHealthy: false
        };

        const docBefore = getFrameDoc(ctx);

        // v3.10: jeśli strona ticketu jest "popsuta" (brak Auftrag Details, broken items,
        // textarea), nie ma sensu próbować — zwracamy jedną jasną informację zamiast
        // 3 osobnych błędów ("Brak textarea", "Brak Ticket Opened By", etc.)
        if (!isTicketPageHealthy(docBefore)) {
            result.pageNotHealthy = true;
            result.commentError = 'Strona ticketu nie wyrenderowała się poprawnie';
            result.reassignError = 'Strona ticketu nie wyrenderowała się poprawnie — sprawdź ticket ręcznie';
            return result;
        }

        result.openedBy = extractTicketOpenedBy(docBefore);

        // v3.44: komentarz zależny od tego, czego brakowało. Honorujemy wszystkie trzy
        // dozwolone teksty; w razie nieznanej wartości domyślnie "Please add solution".
        const allowedComments = ['Please check category', 'Please add solution and check category', 'Please add solution'];
        const commentText = allowedComments.includes(customComment) ? customComment : 'Please add solution';
        const commentResult = await addEscalationComment(ctx, commentText);
        result.commentAdded = !!commentResult.ok;
        if (!commentResult.ok) result.commentError = commentResult.error;

        // v3.35: NIE wykonujemy już automatycznego reassign. System reassign bywał zawodny —
        // osoba otwierająca ticket nie zawsze jest z customer service. Zostawiamy sam komentarz,
        // a potrzebę ręcznego przepięcia sygnalizujemy w UI (lista zadań do wykonania ręcznie).
        result.needsManualReassign = true;
        result.reassignedTo = result.openedBy || null; // sugerowany odbiorca (do kogo przepiąć ręcznie)
        result.reassigned = false;
        return result;
    }

    async function fillTicket(amount, bookingDate, accountNum, ctx = defaultFrameCtx, dupInfo = null) {
        const doc = getFrameDoc(ctx);
        const win = getFrameWin(ctx);

        // Najważniejsze zabezpieczenie przed duplikatem.
        // v3.43: gdy dla tego zamówienia+kwoty są ≥2 osobne pozycje (np. zwykły + goodwill),
        // blokujemy dopiero gdy liczba zaksięgowanych wpisów tej kwoty osiągnęła numer tej sztuki.
        let existingRefund;
        if (dupInfo && dupInfo.total > 1) {
            existingRefund = countBookedSameAmount(doc, amount) >= dupInfo.index
                ? { matchType: 'single', amount: normalizeAmount(amount), date: bookingDate, entries: [], multiOccurrence: true }
                : null;
        } else {
            existingRefund = findBookedRefundEntry(doc, amount, bookingDate, false);
        }
        if (existingRefund) {
            return {
                articleId: null,
                amount,
                bookingDate,
                accountNum,
                checkedCreditNoteItems: 0,
                alreadyBooked: true,
                existingRefund
            };
        }

        // Krok 1: spróbuj normalnie — pozycja z credit_note.php link + jej Solution=7
        const creditNoteItems = getBrokenItemsWithCreditNote(doc);
        let primaryItem = creditNoteItems[0] || null;
        let articleId = primaryItem ? primaryItem.articleId : null;
        let solutionSel = articleId ? findSolutionSelect(doc, articleId) : null;
        let fallbackUsed = false;
        let fallbackReason = '';

        // v3.6: gdy brak credit note ALBO brak Solution=7 dla pozycji z credit note,
        // bierzemy PIERWSZĄ pozycję produktu od góry (broken-items-delart) i próbujemy
        // na niej zaksięgować. Dodatkowo (w bookOne) wykonana zostanie eskalacja.
        if (!primaryItem || !solutionSel) {
            fallbackUsed = true;
            fallbackReason = !primaryItem ? 'no_credit_note_items' : 'no_solution_for_credit_note';

            const allCheckboxes = [...doc.querySelectorAll('input.broken-items-delart[type="checkbox"], input.broken-items-delart')]
                .filter(cb => !cb.classList.contains('broken-items-delart-all'));

            if (!allCheckboxes.length) {
                return {
                    noSolution: true,
                    reason: fallbackReason,
                    reasonText: 'Brak żadnych pozycji produktów (broken-items-delart) na tickecie — nie ma na czym zaksięgować',
                    amount, bookingDate, accountNum,
                    checkedCreditNoteItems: 0
                };
            }

            // querySelectorAll zwraca elementy w kolejności DOM → [0] to pierwsza od góry
            const firstCb = allCheckboxes[0];
            const firstRow = firstCb.closest('tr');
            if (!firstRow) {
                return {
                    noSolution: true,
                    reason: fallbackReason,
                    reasonText: 'Pierwsza pozycja produktu (broken-items-delart) nie ma <tr>',
                    amount, bookingDate, accountNum,
                    checkedCreditNoteItems: 0
                };
            }

            primaryItem = {
                checkbox: firstCb,
                row: firstRow,
                articleId: getArticleIdFromBrokenItemRow(firstRow, firstCb)
            };
            articleId = primaryItem.articleId;
            solutionSel = articleId ? findSolutionSelect(doc, articleId) : null;
            // solutionSel może być null — wtedy próbujemy best-effort:
            // wypełniamy cost_invoice_*, klikamy Update; nawet jeśli się nie zaksięguje,
            // eskalacja i tak dodaje komentarz + przepina ticket.
        }

        // Ustaw Solution=7 jeśli dropdown istnieje (best effort)
        if (solutionSel) {
            solutionSel.value = '7';
            triggerChange(win, solutionSel);
            await sleep(400);
            if (!articleId) {
                const m = (solutionSel.getAttribute('name') || '').match(/\[([0-9]+)\]/);
                articleId = m ? m[1] : null;
            }
        }

        const amountInput = findAmountInputForArticle(doc, articleId, primaryItem.row);
        if (!amountInput) {
            const errText = 'Brak pola cost_invoice_number dla ' + (fallbackUsed ? 'pierwszej pozycji od góry' : 'artykułu z credit note');
            if (fallbackUsed) {
                return { noSolution: true, reason: fallbackReason, reasonText: errText, amount, bookingDate, accountNum, checkedCreditNoteItems: 0 };
            }
            throw new Error(errText);
        }

        const dateInput = findDateInputForArticle(doc, articleId, primaryItem.row);
        if (!dateInput) {
            const errText = 'Brak pola cost_invoice_date dla ' + (fallbackUsed ? 'pierwszej pozycji od góry' : 'artykułu z credit note');
            if (fallbackUsed) {
                return { noSolution: true, reason: fallbackReason, reasonText: errText, amount, bookingDate, accountNum, checkedCreditNoteItems: 0 };
            }
            throw new Error(errText);
        }

        setNativeValue(amountInput, amount);
        setDateField(win, dateInput, bookingDate); // v3.34: data jak z kalendarza (value + chowanie alertu)
        await sleep(200); // v3.34: chwila na ustawienie się pola

        let accountSel = findCostAccountSelect(doc, articleId);
        accountSel = accountSel || primaryItem.row.querySelector('select[name^="cost_account["]');

        if (accountSel) {
            const opt = [...accountSel.options].find(o => o.value === String(accountNum));
            if (opt) {
                accountSel.value = opt.value;
                triggerChange(win, accountSel);
            }
        }

        // v3.28: wymagane pola RMA (czerwone obramowanie) muszą być wypełnione,
        // inaczej Update NIE zapisze księgowania. Uzupełniamy TYLKO puste:
        //   - rma_spec_questions[articleId][N][answer_id] → "I don't know"
        //   - liquidator_category_id[articleId] → "A"
        // Dotyczy obu ścieżek (fallback i primary z credit note).
        const reqFields = fillRequiredRmaFields(doc, win, articleId);
        if (reqFields.filledSpecQuestions || reqFields.filledCategory) {
            await sleep(300);
        }

        // Checkbox(y)
        let checkedCount = 0;
        if (fallbackUsed) {
            // v3.27: NIE zaznaczamy checkboxa delart. Ręczne księgowanie money back
            // BEZ credit note też go nie zaznacza — tylko Solution=7 + kwota + data + Update,
            // i refund powstaje jako normalny credit note ("Remboursement...").
            // Checkbox delart (z data-disabled="") służy do usuwania/zwrotu artykułu;
            // jego zaznaczanie przełączało operację i blokowało utworzenie refundu.
            checkedCount = 0;
        } else {
            // v3.62: SET wieloczesciowy — kwota + Solution=7 sa na PIERWSZEJ pozycji (powyzej).
            // Tu zaznaczamy tylko checkbox delart KAZDEJ pozycji z credit note (takze data-disabled="").
            // Prologistics sam rozbija wpisana kwote na wszystkie zaznaczone pozycje i tworzy
            // osobny refund per pozycja. Solution=7 na kolejnych liniach jest zbedny (nie utrzymuje
            // sie dla pod-pozycji i nie wplywa na podzial) — dlatego usuniety.
            checkedCount = 0;
            for (const it of creditNoteItems) {
                if (it.checkbox && !it.checkbox.disabled) {
                    it.checkbox.checked = true;
                    triggerChange(win, it.checkbox);
                    checkedCount++;
                }
            }
            if (checkedCount === 0) {
                console.log('[Ksieg] credit note obecny, ale nie zaznaczono zadnego delart (wszystkie HTML-disabled).');
            }
        }

        const updateBtn =
            doc.querySelector('input#update-button.update-button') ||
            doc.querySelector('input#update-button') ||
            doc.querySelector('input.update-button[type="button"]') ||
            [...doc.querySelectorAll('input[type="button"],input[type="submit"],button')]
                .find(b => /update/i.test(b.value || b.textContent || ''));

        if (!updateBtn) {
            if (fallbackUsed) {
                return { noSolution: true, reason: fallbackReason, reasonText: 'Nie znaleziono głównego przycisku Update', amount, bookingDate, accountNum, checkedCreditNoteItems: 0 };
            }
            throw new Error('Nie znaleziono głównego przycisku Update');
        }

        // v3.34: serwer pod obciążeniem (tryb równoległy) odpowiada p95~16s, max~19s.
        // 12s timeout obcinał Update w połowie. Podnosimy do 25s.
        const lp = waitFrameLoad(25000, ctx).catch(() => null);
        updateBtn.click();
        await lp;
        await sleep(1200);

        return {
            articleId,
            amount,
            bookingDate,
            accountNum,
            checkedCreditNoteItems: checkedCount,
            fallbackUsed,
            fallbackReason: fallbackUsed ? fallbackReason : null,
            hadSolutionDropdown: !!solutionSel,
            autoFilledCategory: reqFields.filledCategory,        // v3.28
            autoFilledSpecQuestions: reqFields.filledSpecQuestions // v3.28
        };
    }

    // v3.38 (diag): zrzut stanu ticketu po nieudanej próbie księgowania.
    // Dołączany do komunikatu błędu w raporcie, żeby ustalić przyczynę (np. niezgodność kwoty).
    function collectTicketDiag(doc, row, fillResult) {
        try {
            if (!doc || !doc.querySelectorAll) return 'DIAG: brak doc';
            const L = [];
            const tail = String(row.ticketHref || '').split('/').pop() || '';
            L.push('ticket=' + (row.ticketId || tail || '?'));
            L.push('status=' + (getTicketStatus(doc) || '?'));
            L.push('oczek.kwota=' + normalizeAmount(row.amount) + ' data=' + row.bookingDate + ' konto=' + row.accountNum);
            L.push('articleId=' + (fillResult && fillResult.articleId != null ? fillResult.articleId : '-') +
                   ' fallback=' + (fillResult && fillResult.fallbackUsed ? 'TAK' : 'nie') +
                   ' solDropdown=' + (fillResult && fillResult.hadSolutionDropdown ? 'TAK' : 'nie'));

            const sols = [...doc.querySelectorAll('select[name^="solution["], select#solutionStatus')];
            L.push('Solution=' + (sols.length ? sols.map(s => {
                const nm = (s.getAttribute('name') || s.id || '?');
                const has7 = [...s.options].some(o => String(o.value) === '7') ? 'opt7' : 'BRAK_opt7';
                return nm + '→' + s.value + '(' + has7 + ')';
            }).join(' , ') : 'BRAK'));

            const amts = [...doc.querySelectorAll('input[name^="cost_invoice_number["]')];
            if (amts.length) {
                L.push('pola_kwoty=' + amts.map(i =>
                    (i.getAttribute('name') || '?').replace('cost_invoice_number', 'amt') + '="' + i.value + '"').join(' , '));
            }

            const cnLinks = [...doc.querySelectorAll('a[href*="credit_note.php"]')];
            if (cnLinks.length) {
                const seen = new Set(); const lines = [];
                cnLinks.forEach(a => {
                    const t = normalizeSpaces(a.textContent || '').trim().slice(0, 90);
                    if (t && !seen.has(t)) { seen.add(t); lines.push(t); }
                });
                L.push('credit_note_linki(' + cnLinks.length + ')=[ ' + lines.join('  |  ') + ' ]');
            } else {
                L.push('credit_note_linki=BRAK');
            }

            const booked = extractBookedRefundEntries(doc);
            L.push('zaksiegowane_refundy=' + (booked.length ? booked.map(e => e.amount + '@' + e.date).join(' , ') : 'BRAK'));

            // v3.39: stan kategorii na WSZYSTKICH pozycjach (pusta kategoria blokuje Update)
            const cats = [...doc.querySelectorAll('select[name^="liquidator_category_id["]')];
            if (cats.length) {
                L.push('kategorie=' + cats.map(s => {
                    const m = (s.getAttribute('name') || '').match(/\[([0-9]+)\]/);
                    const id = m ? m[1] : '?';
                    return id + ':' + (String(s.value || '').trim() ? s.value : 'PUSTA');
                }).join(' , '));
            }

            const txt = (doc.body ? (doc.body.innerText || doc.body.textContent || '') : '');
            const re = /(open\s*amount|offener\s*betrag|montant\s*ouvert)[^0-9\-]{0,20}(-?[0-9][0-9.,]*)/ig;
            const open = []; let m;
            while ((m = re.exec(txt)) && open.length < 5) open.push(m[1].replace(/\s+/g, ' ') + '=' + m[2]);
            if (open.length) L.push('open_amount=' + open.join(' , '));

            return 'DIAG ▶ ' + L.join('  •  ');
        } catch (e) {
            return 'DIAG błąd: ' + e.message;
        }
    }

    async function bookOne(row, ctx = defaultFrameCtx) {
        // v3.29: ścieżka VAT refund (PLN, brak ticketu, korekta VAT + ujemny open amount)
        if (row.vatRefund && row.vatAuctionUrl) {
            const res = await bookVatRefund(ctx, row.vatAuctionUrl, row.amount, row.accountNum, row.bookingDate);
            const absAmt = Math.abs(parseFloat(normalizeAmount(row.amount))).toFixed(2);
            return {
                ok: !!res.ok, vatRefund: true,
                verified: res.verified === true,
                alreadyBooked: !!res.alreadyBooked,
                existingRefund: res.alreadyBooked ? { matchType: 'single', amount: absAmt, date: row.bookingDate, entries: [{ amount: absAmt, date: row.bookingDate }] } : null,
                info8100: res.info8100 || null, partial: !!res.partial, vatLog: res.log || [],
                error: res.ok ? null : res.error,
                amount: row.amount, bookingDate: row.bookingDate, accountNum: row.accountNum
            };
        }
        let ticketHref = row.ticketHref || null;
        let ticketId = row.ticketId || null;

        if (!ticketHref) {
            const found = await findBestTicketForOrder(row.orderNumber, ctx);
            if (!found.ok) return { ok: false, error: found.error };
            ticketHref = found.ticket.href;
            ticketId = found.ticket.id;
        }

        let wasClosedAtStart = false;
        let lastError = '';
        let diagSnapshot = ''; // v3.38 (diag)
        let fillTicketAttemptedBooking = false; // v3.25: tracking czy w poprzedniej próbie kliknięto Update

        for (let attempt = 1; attempt <= 3; attempt++) {
            await loadInFrame(ticketHref, 20000, ctx);
            await sleep(800);

            // Przed każdą kolejną próbą sprawdzamy, czy poprzednia próba już nie dodała wpisu.
            // Szukamy też tej samej kwoty z inną datą oraz rozbicia na kilka pozycji,
            // żeby nie zrobić duplikatu.
            // v3.43: gdy dla tego zamówienia+kwoty są ≥2 osobne pozycje (zwykły + goodwill),
            // tę sztukę uznajemy za już zaksięgowaną dopiero gdy liczba wpisów tej kwoty
            // osiągnęła jej numer (row.dupIndex). Inaczej zostawiamy normalną ochronę.
            let existingRefundBefore;
            if (row.dupTotal > 1) {
                existingRefundBefore = countBookedSameAmount(getFrameDoc(ctx), row.amount) >= row.dupIndex
                    ? { matchType: 'single', amount: normalizeAmount(row.amount), date: row.bookingDate, entries: [], multiOccurrence: true }
                    : null;
            } else {
                existingRefundBefore = findBookedRefundEntry(getFrameDoc(ctx), row.amount, row.bookingDate, false);
            }

            if (existingRefundBefore) {
                // v3.25: jeśli już klikaliśmy Update w poprzedniej iteracji, to wpisy
                // są NASZE (księgowanie się powiodło, verify w poprzedniej iteracji
                // zawiodło przez timing). Traktujemy jak normalne success z splitInfo.
                if (fillTicketAttemptedBooking) {
                    return {
                        ok: true,
                        wasClosed: wasClosedAtStart,
                        ticketHref,
                        ticketId,
                        bookingAttempts: attempt - 1,
                        verified: true,
                        verifyMethod: 'pre-check-after-prior-update',
                        verifySplitInfo: existingRefundBefore,
                        articleId: null,
                        amount: row.amount,
                        bookingDate: row.bookingDate,
                        accountNum: row.accountNum,
                        checkedCreditNoteItems: 0
                        // BRAK alreadyBooked — to było nasze księgowanie
                    };
                }
                // Inaczej: wpisy istniały zanim my się włączyliśmy → faktycznie "już zaksięgowane"
                return {
                    ok: true,
                    wasClosed: wasClosedAtStart,
                    ticketHref,
                    ticketId,
                    bookingAttempts: attempt - 1,
                    verified: true,
                    verifyMethod: existingRefundBefore.exactDate ? 'pre-check-exact-date' : ('pre-check-' + (existingRefundBefore.matchType || 'match')),
                    articleId: null,
                    amount: row.amount,
                    bookingDate: row.bookingDate,
                    accountNum: row.accountNum,
                    checkedCreditNoteItems: 0,
                    alreadyBooked: true,
                    existingRefund: existingRefundBefore
                };
            }

            const statusBefore = getTicketStatus(getFrameDoc(ctx));
            const isClosedNow = statusBefore === 'Closed';

            if (attempt === 1) {
                wasClosedAtStart = isClosedNow;
            }

            try {
                if (isClosedNow) {
                    await setTicketStatus('Open', ctx);
                    await sleep(800);
                    // v3.17: WRACAMY do zawsze-reload jak w v3.10.
                    // v3.14 skróciło to do "reload tylko gdy isTicketPageHealthy=false",
                    // ale isTicketPageHealthy jest za luźny (sprawdza OR z 4 elementów —
                    // 1 wystarczy). To pozwala fillTicket lecieć na częściowo zrenderowanej
                    // stronie, tworzyć wpisy, a verify potem failuje przez timing.
                    // Atempt 2 też wpada w to samo i tworzy DRUGIE księgowanie. Etc.
                    try {
                        await loadInFrame(ticketHref, 20000, ctx);
                        await sleep(700);
                    } catch (e) { /* sanity check niżej i tak to złapie */ }
                }

                // v3.10: jeśli strona jest popsuta, nie marnujemy 3 prób — kończymy z jasnym błędem
                if (!isTicketPageHealthy(getFrameDoc(ctx))) {
                    if (wasClosedAtStart) {
                        try {
                            await loadInFrame(ticketHref, 20000, ctx);
                            await sleep(500);
                            if (getTicketStatus(getFrameDoc(ctx)) !== 'Closed') {
                                await setTicketStatus('Closed', ctx);
                            }
                        } catch (e) {}
                    }
                    throw new Error('Strona ticketu nie wyrenderowała się poprawnie (brak Auftrag Details / broken items / textarea / przycisku Update). Sprawdź ticket ręcznie.');
                }

                const fillResult = await fillTicket(row.amount, row.bookingDate, row.accountNum, ctx, { total: row.dupTotal || 1, index: row.dupIndex || 1 });

                // v3.25: jeśli fillTicket zwrócił sukces (nie noSolution), to znaczy że
                // Update został kliknięty. W następnej iteracji pre-check potencjalnie
                // wykryje NASZE wpisy — wtedy traktuj jako success, nie "alreadyBooked".
                if (!fillResult.noSolution) {
                    fillTicketAttemptedBooking = true;
                }

                // v3.5: Brak Solution / brak credit note → eskalacja (komentarz + reassign)
                if (fillResult.noSolution) {
                    const escComment = fillResult.autoFilledCategory
                        ? 'Please add solution and check category'
                        : 'Please add solution';
                    const escalation = await escalateNoSolutionTicket(ctx, ticketHref, fillResult.reason, escComment);

                    // Przywróć Closed jeśli był zamknięty na początku
                    if (wasClosedAtStart) {
                        // v3.19: revert do inline reload+setStatus (jak v3.13)
                        try {
                            await loadInFrame(ticketHref, 20000, ctx);
                            await sleep(600);
                            if (getTicketStatus(getFrameDoc(ctx)) !== 'Closed') {
                                await setTicketStatus('Closed', ctx);
                            }
                        } catch (e) {}
                    }

                    return {
                        ok: true,
                        escalated: true,
                        noSolution: true,
                        noSolutionReason: fillResult.reason,
                        noSolutionReasonText: fillResult.reasonText,
                        escalation,
                        wasClosed: wasClosedAtStart,
                        ticketHref,
                        ticketId,
                        bookingAttempts: attempt,
                        articleId: null,
                        amount: row.amount,
                        bookingDate: row.bookingDate,
                        accountNum: row.accountNum,
                        checkedCreditNoteItems: 0
                    };
                }

                await loadInFrame(ticketHref, 20000, ctx);
                await sleep(900);

                let verify = verifyTicketBooking(
                    getFrameDoc(ctx),
                    row.amount,
                    row.bookingDate,
                    row.accountNum,
                    fillResult.articleId
                );

                // v3.21: race condition po Update — serwer mógł zapisać refund ale render
                // strony jeszcze nie pokazuje markera <a id="unbook">. Robimy do 3 retries
                // co 1500ms (extra reload + sprawdzenie) gdy pierwsze verify zwróciło fail.
                // Sumarycznie max ~4.5s opóźnienia w przypadku race; w typowym case 0s.
                // v3.34: race po Update na WOLNYM serwerze (p95~16s). Wcześniej 3×1.5s
                // było za krótkie — zapis się utrwalał później niż verify zdążył sprawdzić,
                // i wszystkie próby raportowały fałszywy błąd. Backoff 3/6/10s + reload 25s.
                const verifyBackoff = [3000, 6000, 10000];
                for (let retryNum = 1; retryNum <= verifyBackoff.length && !verify.ok; retryNum++) {
                    await sleep(verifyBackoff[retryNum - 1]);
                    try {
                        await loadInFrame(ticketHref, 25000, ctx);
                        await sleep(1500);
                    } catch (e) { /* reload fail — verify i tak zwróci coś */ }
                    verify = verifyTicketBooking(
                        getFrameDoc(ctx),
                        row.amount,
                        row.bookingDate,
                        row.accountNum,
                        fillResult.articleId
                    );
                }

                if (verify.ok) {
                    // v3.6: jeśli użyto ścieżki fallback (księgowanie na pierwszej pozycji
                    // od góry zamiast na credit-note), wykonujemy ZAWSZE eskalację:
                    // komentarz + przepięcie do Ticket Opened By.
                    // v3.28: dla primary path (jest credit note) eskalujemy TYLKO gdy
                    // auto-uzupełniliśmy kategorię → komentarz "Please check category".
                    // Eskalację robimy PRZED ewentualnym zamknięciem ticketu.
                    // v3.44: komentarz eskalacji zależy WPROST od tego, czego brakowało:
                    //   1) brak kategorii, jest solution        → "Please check category"
                    //   2) brak kategorii i brak solution        → "Please add solution and check category"
                    //   3) brak solution (kategoria jest)        → "Please add solution"
                    //   4) nic nie brakowało                     → bez eskalacji (zwykłe księgowanie)
                    // solution "brakowało" = poszliśmy fallbackiem (brak właściwego credit-note solution).
                    // kategorii "brakowało" = auto-uzupełniliśmy pustą kategorię (zgadliśmy "A").
                    let escalation = null;
                    let escalationKind = null; // 'fallback' | 'category_check'
                    const categoryMissing = !!fillResult.autoFilledCategory;
                    const solutionMissing = !!fillResult.fallbackUsed;
                    let escComment = null;
                    if (solutionMissing && categoryMissing) {
                        escComment = 'Please add solution and check category';
                        escalationKind = 'fallback';
                    } else if (solutionMissing) {
                        escComment = 'Please add solution';
                        escalationKind = 'fallback';
                    } else if (categoryMissing) {
                        escComment = 'Please check category';
                        escalationKind = 'category_check';
                    }
                    if (escComment) {
                        const escReason = escalationKind === 'category_check'
                            ? 'category_check'
                            : fillResult.fallbackReason;
                        try {
                            escalation = await escalateNoSolutionTicket(ctx, ticketHref, escReason, escComment);
                        } catch (e) {
                            escalation = { reason: escReason, escalationError: e.message };
                        }
                    }

                    if (wasClosedAtStart) {
                        // v3.19: revert do inline reload+setStatus (jak v3.13)
                        try {
                            await loadInFrame(ticketHref, 20000, ctx);
                            await sleep(600);
                            if (getTicketStatus(getFrameDoc(ctx)) !== 'Closed') {
                                await setTicketStatus('Closed', ctx);
                            }
                        } catch (e) {
                            return {
                                ok: true,
                                wasClosed: true,
                                closeError: e.message,
                                ticketHref,
                                ticketId,
                                bookingAttempts: attempt,
                                verified: true,
                                verifyMethod: verify.method || 'after-update',
                                verifySplitInfo: verify.splitInfo || null,
                                escalated: !!escalation,
                                escalationKind,
                                fallbackUsed: !!fillResult.fallbackUsed,
                                fallbackReason: fillResult.fallbackReason,
                                noSolutionReason: fillResult.fallbackReason,
                                escalation,
                                ...fillResult
                            };
                        }
                    }

                    return {
                        ok: true,
                        wasClosed: wasClosedAtStart,
                        ticketHref,
                        ticketId,
                        bookingAttempts: attempt,
                        verified: true,
                        verifyMethod: verify.method || 'after-update',
                        verifySplitInfo: verify.splitInfo || null,
                        escalated: !!escalation,
                        escalationKind,
                        fallbackUsed: !!fillResult.fallbackUsed,
                        fallbackReason: fillResult.fallbackReason,
                        noSolutionReason: fillResult.fallbackReason,
                        escalation,
                        ...fillResult
                    };
                }

                lastError = 'Próba ' + attempt + ': ' + verify.error;
                try { diagSnapshot = collectTicketDiag(getFrameDoc(ctx), { ...row, ticketHref, ticketId }, fillResult); } catch (e) {}
            } catch (e) {
                lastError = 'Próba ' + attempt + ': ' + e.message;
                try { diagSnapshot = collectTicketDiag(getFrameDoc(ctx), { ...row, ticketHref, ticketId }, null); } catch (e2) {}
            }

            await sleep(900);
        }

        if (wasClosedAtStart) {
            // v3.19: revert do inline reload+setStatus (jak v3.13)
            try {
                await loadInFrame(ticketHref, 20000, ctx);
                await sleep(600);
                if (getTicketStatus(getFrameDoc(ctx)) !== 'Closed') {
                    await setTicketStatus('Closed', ctx);
                }
            } catch (e) {}
        }

        throw new Error(
            'Po 3 próbach nie udało się potwierdzić księgowania w tickecie. ' +
            lastError + (diagSnapshot ? '  ||  ' + diagSnapshot : '')
        );
    }

    function makePopupEditTd(value, rowIndex, key, label, minWidth) {
        const td = document.createElement('td');
        td.style.cssText = `padding:4px 6px;border:1px solid #e5e7eb;min-width:${minWidth};`;
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:5px;';
        const span = document.createElement('span');
        span.style.cssText = 'flex:1;font-size:12px;color:#374151;';
        span.textContent = value || '—';
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:13px;padding:1px 3px;border-radius:4px;flex-shrink:0;';
        editBtn.onclick = e => {
            e.stopPropagation();
            openEditPopup(previewRows[rowIndex].orderNumber, label, previewRows[rowIndex][key], editBtn, newVal => {
                previewRows[rowIndex][key] = newVal;
                span.textContent = newVal || '—';
            });
        };
        wrap.appendChild(span);
        wrap.appendChild(editBtn);
        td.appendChild(wrap);
        return td;
    }

    function createTr(row, i) {
        const tr = document.createElement('tr');
        tr.dataset.row = i;
        tr.style.background = i % 2 === 0 ? '#fff' : '#f9fafb';

        const tdSelect = document.createElement('td');
        tdSelect.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;text-align:center;';
        const rowSelect = document.createElement('input');
        rowSelect.type = 'checkbox';
        rowSelect.checked = !!row.selected && !row.loading && !row.error;
        rowSelect.disabled = !!row.loading || !!row.error || !!row.alreadyBooked;
        rowSelect.onchange = () => { previewRows[i].selected = rowSelect.checked; };
        tdSelect.appendChild(rowSelect);
        tr.appendChild(tdSelect);

        const tdId = document.createElement('td');
        tdId.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;font-weight:bold;white-space:nowrap;font-family:monospace;';
        tdId.textContent = row.orderNumber;
        tr.appendChild(tdId);

        if (row.loading) {
            ['ładowanie…','ładowanie…','ładowanie…','ładowanie…','ładowanie…','ładowanie…'].forEach(txt => {
                const td = document.createElement('td');
                td.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;color:#aaa;font-style:italic;';
                td.textContent = txt;
                tr.appendChild(td);
            });
            return tr;
        }

        if (row.error) {
            // v3.8: kolumna Ticket # — link do auftragu jeśli mamy URL(e)
            const tdTicket = document.createElement('td');
            tdTicket.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;white-space:normal;word-break:break-word;min-width:120px;';
            const urls = (row.auctionUrls && row.auctionUrls.length) ? row.auctionUrls : [];
            if (urls.length) {
                tdTicket.innerHTML = urls.map(url => {
                    const m = String(url).match(/number=(\d+)/);
                    const num = m ? m[1] : url;
                    return `<a href="${url}" target="_blank" style="color:#7c3aed;text-decoration:none;font-family:monospace;font-size:12px;">Auftrag #${num}</a>`;
                }).join('<br>');
            } else {
                tdTicket.innerHTML = '<span style="color:#9ca3af;">—</span>';
            }
            tr.appendChild(tdTicket);

            // Pozostałe 4 kolumny (Status, Kwota, Konto, Data) zwijamy w jedną z błędem
            const tdErr = document.createElement('td');
            tdErr.colSpan = 4;
            tdErr.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;color:#dc2626;white-space:normal;word-break:break-word;font-size:11px;line-height:1.35;';
            tdErr.textContent = row.error;
            tr.appendChild(tdErr);

            // Status weryfikacji
            const tdS = document.createElement('td');
            tdS.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;text-align:center;';
            tdS.innerHTML = '<span style="color:#dc2626">❌ błąd</span>';
            tr.appendChild(tdS);
            return tr;
        }

        if (row.vatRefund) {
            const tdTicketV = document.createElement('td');
            tdTicketV.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap;';
            if (row.vatAuctionUrl) {
                const mm = String(row.vatAuctionUrl).match(/number=(\d+)/);
                const num = mm ? mm[1] : '';
                tdTicketV.innerHTML = `<a href="${row.vatAuctionUrl}" target="_blank" style="color:#7c3aed;text-decoration:none;font-family:monospace;font-size:12px;">Auftrag${num ? ' #' + num : ''}</a>`;
            } else { tdTicketV.innerHTML = '<span style="color:#9ca3af;">—</span>'; }
            tr.appendChild(tdTicketV);
            const tdStatusV = document.createElement('td');
            tdStatusV.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap;';
            tdStatusV.innerHTML = '<span style="color:#7c3aed">💶 VAT</span>';
            tr.appendChild(tdStatusV);
            tr.appendChild(makePopupEditTd(row.amount, i, 'amount', 'Kwota', '70px'));
            tr.appendChild(makePopupEditTd(row.accountNum, i, 'accountNum', 'Konto', '70px'));
            tr.appendChild(makePopupEditTd(row.bookingDate, i, 'bookingDate', 'Data YYYY-MM-DD', '100px'));
            const tdVv = document.createElement('td');
            tdVv.id = `tm-t-vstat-${row.orderNumber}`;
            tdVv.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;text-align:center;white-space:normal;word-break:break-word;min-width:130px;';
            tdVv.innerHTML = describeVatRefundStatus(row);
            tr.appendChild(tdVv);
            return tr;
        }
        const tdTicket = document.createElement('td');
        tdTicket.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap;';
        const tLink = document.createElement('a');
        tLink.href = row.ticketHref;
        tLink.target = '_blank';
        tLink.textContent = `#${row.ticketId}`;
        tLink.style.cssText = 'color:#7c3aed;text-decoration:none;';
        tdTicket.appendChild(tLink);
        tr.appendChild(tdTicket);

        const tdStatus = document.createElement('td');
        tdStatus.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap;';
        tdStatus.innerHTML = row.ticketStatus === 'Open' ? '<span style="color:#16a34a">🟢 Open</span>' : '<span style="color:#6b7280">🔒 Closed</span>';
        tr.appendChild(tdStatus);

        tr.appendChild(makePopupEditTd(row.amount, i, 'amount', 'Kwota', '70px'));
        tr.appendChild(makePopupEditTd(row.accountNum, i, 'accountNum', 'Konto', '70px'));
        tr.appendChild(makePopupEditTd(row.bookingDate, i, 'bookingDate', 'Data YYYY-MM-DD', '100px'));

        const tdV = document.createElement('td');
        tdV.id = `tm-t-vstat-${row.orderNumber}`;
        tdV.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;text-align:center;white-space:normal;word-break:break-word;min-width:130px;';
        if (row.bookError) {
            tdV.innerHTML = `<span style="color:#dc2626">❌ nie zaksięgowano: ${row.bookError}</span>`;
        } else if (row.alreadyBooked && row.existingRefund) {
            tdV.innerHTML = `<span style="color:#2563eb">ℹ️ już zaksięgowane: ${describeExistingRefund(row.existingRefund)}</span>`;
        } else if (row.escalationKind === 'category_check') {
            // v3.28: primary zaksięgowane OK + uzupełniono kategorię → sprawdź
            tdV.innerHTML = `<span style="color:#d97706">✅+⚠️ Zaksięgowano${describeSplitInfo(row.verifySplitInfo)} — uzupełniono kategorię (A), sprawdź. Eskalacja: ${describeEscalation(row.escalation)}</span>`;
        } else if (row.booked && row.fallbackUsed && row.escalation) {
            // v3.6: zaksięgowane na pierwszej pozycji od góry + eskalacja
            const reasonShort = row.fallbackReason === 'no_credit_note_items' ? 'brak credit note' : 'brak Solution=7 dla credit note';
            tdV.innerHTML = `<span style="color:#d97706">✅+⚠️ Zaksięgowane na pierwszej pozycji od góry (${reasonShort}). Eskalacja: ${describeEscalation(row.escalation)}</span>`;
        } else if (row.escalated && row.escalation) {
            const reasonShort = row.noSolutionReason === 'no_credit_note_items' || row.fallbackReason === 'no_credit_note_items'
                ? 'brak credit note'
                : 'brak Solution=7';
            const detail = row.noSolutionReasonText ? ` — <em>${row.noSolutionReasonText}</em>` : '';
            tdV.innerHTML = `<span style="color:#d97706">⚠️ Eskalacja bez zaksięgowania (${reasonShort}${detail}): ${describeEscalation(row.escalation)}</span>`;
        } else if (row.booked) {
            // v3.25: jeśli system rozbił booking na N wpisów, pokaż detail
            const splitDetail = describeSplitInfo(row.verifySplitInfo);
            tdV.innerHTML = `<span style="color:#16a34a">✅ zaksięgowany${splitDetail}</span>`;
        } else if (row.skipped) {
            tdV.innerHTML = '<span style="color:#6b7280">⏭️ pominięty</span>';
        } else if (row.forceFallback) {
            // v3.7: po sprawdzeniu wiemy że nie ma idealnego ticketu — przy księgowaniu
            // zostanie użyty fallback (pierwsza pozycja od góry + eskalacja)
            const reasonLabel = row.forceFallbackReason === 'no_credit_note' ? 'brak credit note'
                : row.forceFallbackReason === 'no_money_back' ? 'brak Money back'
                : 'brak Money back i credit note';
            const extra = row.checkedAuctions && row.checkedAuctions > 1 ? ` | auftragi: ${row.checkedAuctions}, tickety: ${row.checkedTickets}` : '';
            tdV.innerHTML = `<span style="color:#d97706">⚠️ Wymagany fallback (${reasonLabel}) — przy księgowaniu: pierwsza pozycja od góry + eskalacja${extra}</span>`;
            // v1.15: pusty ticket (0 broken items) — doczytaj open amount z Auftragu i oflaguj do recznego sprawdzenia.
            // Fetch TYLKO dla tego przypadku (problematyczne zamowienia), wiec bez wplywu na szybkosc normalnego ksiegowania.
            if (row.forceFallbackReason === 'no_money_back_no_credit_note' && row.auctionUrl) {
                (async () => {
                    try {
                        const _ah = await fetch(row.auctionUrl, { credentials: 'same-origin' }).then(r => r.text());
                        const _ad = new DOMParser().parseFromString(_ah, 'text/html');
                        const _pay = parsePaymentsTable(_ad);
                        if (_pay && _pay.openAmount != null && Math.abs(_pay.openAmount) > 0.005) {
                            const _sp = tdV.querySelector('span');
                            if (_sp) _sp.innerHTML += ' | <span style="color:#dc2626;font-weight:bold">⚠️ Auftrag open amount: ' + _pay.openAmount + ' ' + (_pay.currency || '') + ' — sprawdź ręcznie</span>';
                        }
                    } catch (e) {}
                })();
            }
        } else {
            const cn = row.creditNoteCount ? ` | credit note: ${row.creditNoteCount}` : '';
            const extra = row.checkedAuctions && row.checkedAuctions > 1 ? ` | auftragi: ${row.checkedAuctions}, tickety: ${row.checkedTickets}, wybrany: #${row.ticketId}` : '';
            tdV.innerHTML = `<span style="color:#16a34a">✅ OK${cn}${extra}</span>`;
        }
        tr.appendChild(tdV);
        return tr;
    }

    const PROGRESS_KEY = 'tm_t_progress_v1';

    function saveProgress() {
        try {
            if (!Array.isArray(previewRows) || !previewRows.length) return;
            const slim = previewRows.map(r => ({
                orderNumber: r.orderNumber, amount: r.amount, accountNum: r.accountNum,
                bookingDate: r.bookingDate, source: r.source || '', isGoodwill: !!r.isGoodwill,
                dupTotal: r.dupTotal, dupIndex: r.dupIndex,
                booked: !!r.booked, alreadyBooked: !!r.alreadyBooked, skipped: !!r.skipped,
                error: r.error || null, ticketId: r.ticketId || null, vatRefund: !!r.vatRefund
            }));
            localStorage.setItem(PROGRESS_KEY, JSON.stringify({
                ts: Date.now(),
                raw: (document.getElementById('tm-t-input') || {}).value || '',
                rows: slim
            }));
        } catch (e) {}
    }
    function loadProgress() {
        try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null'); } catch (e) { return null; }
    }
    function clearProgress() { try { localStorage.removeItem(PROGRESS_KEY); } catch (e) {} }

    // wznawianie: przenieś flagi booked/alreadyBooked z zapisu na świeżo zbudowane wiersze
    function applySavedProgress(rows) {
        const p = loadProgress();
        if (!p || !Array.isArray(p.rows)) return 0;
        const key = r => `${r.orderNumber}|${r.amount}|${r.dupIndex || 1}`;
        const done = new Map();
        p.rows.forEach(r => { if (r.booked || r.alreadyBooked) done.set(key(r), r); });
        let n = 0;
        rows.forEach(r => {
            const s = done.get(key(r));
            if (s) { r.booked = !!s.booked; r.alreadyBooked = !!s.alreadyBooked; r.ticketId = s.ticketId || r.ticketId; r.loading = false; n++; } // v3.54: nie pokazuj “ladowanie…” dla przywroconych
        });
        return n;
    }

    function freeCtx(ctx) {
        try { (ctx || defaultFrameCtx).iframe.src = 'about:blank'; } catch (e) {}
    }

    function buildInitialTable(rows) {
        const tbody = document.getElementById('tm-t-preview-body');
        tbody.innerHTML = '';
        rows.forEach((row, i) => tbody.appendChild(createTr(row, i)));
    }

    function updateRow(i) {
        const tbody = document.getElementById('tm-t-preview-body');
        const existing = tbody.querySelector(`tr[data-row="${i}"]`);
        const newTr = createTr(previewRows[i], i);
        if (existing) tbody.replaceChild(newTr, existing);
        else tbody.appendChild(newTr);
        saveProgress();
    }

    function buildIssueReportHtml() {
        return '';
    }

    // v3.35: po zaksięgowaniu całości buduje listę zadań do wykonania RĘCZNIE:
    //  (A) Auftragi/zamówienia bez ticketu lub z błędem wyszukiwania,
    //  (B) Tickety wymagające ręcznego reassign (od v3.35 nie robimy auto-reassign),
    //      z informacją do kogo przepiąć, czy zaksięgowano i czy trzeba sprawdzić kategorię.
    function updateIssueReport() {
        const el = document.getElementById('tm-t-issue-report');
        if (!el) return;
        if (!Array.isArray(previewRows) || !previewRows.length) { el.innerHTML = ''; return; }

        const noTicket = [];
        const manualReassign = [];
        for (const row of previewRows) {
            if (!row) continue;
            if (row.error) { noTicket.push(row); continue; }
            if (row.escalated && row.escalation && row.escalation.needsManualReassign) {
                manualReassign.push(row);
            }
        }

        if (!noTicket.length && !manualReassign.length) {
            el.innerHTML = '<div style="margin-top:6px;color:#16a34a;">✅ Brak dodatkowych zadań ręcznych.</div>';
            return;
        }

        const auftragLinks = (row) => {
            const urls = (row.auctionUrls && row.auctionUrls.length) ? row.auctionUrls : [];
            if (!urls.length) return '';
            return ' — ' + urls.map(url => {
                const m = String(url).match(/number=(\d+)/);
                const num = m ? m[1] : url;
                return `<a href="${url}" target="_blank" style="color:#7c3aed;text-decoration:none;">Auftrag #${num}</a>`;
            }).join(', ');
        };
        const ticketLink = (row) => row.ticketHref
            ? `<a href="${row.ticketHref}" target="_blank" style="color:#7c3aed;text-decoration:none;">Ticket #${row.ticketId}</a>`
            : (row.ticketId ? `Ticket #${row.ticketId}` : 'ticket ?');

        let html = '<div style="margin-top:10px;padding:8px 10px;border:1px solid #f59e0b;border-radius:6px;background:#fffbeb;">';
        html += `<div style="font-weight:bold;color:#b45309;margin-bottom:6px;">📋 Do wykonania ręcznie (${noTicket.length + manualReassign.length})</div>`;

        if (noTicket.length) {
            html += `<div style="font-weight:bold;color:#92400e;margin-top:4px;">Brak ticketu / błąd wyszukiwania (${noTicket.length}):</div><ul style="margin:4px 0 6px 18px;padding:0;">`;
            for (const row of noTicket) {
                const kwota = row.amount != null ? String(row.amount) : '';
                const data = row.bookingDate || '';
                html += `<li style="margin:2px 0;"><strong>${row.orderNumber}</strong>${auftragLinks(row)} — <strong>${kwota}</strong> — ${data} — <span style="color:#dc2626;">${row.error || 'brak ticketu'}</span></li>`;
            }
            html += '</ul>';
        }

        if (manualReassign.length) {
            html += `<div style="font-weight:bold;color:#92400e;margin-top:4px;">Reassign ręcznie (${manualReassign.length}):</div><ul style="margin:4px 0 6px 18px;padding:0;">`;
            for (const row of manualReassign) {
                const esc = row.escalation || {};
                const who = esc.reassignedTo ? `→ <strong>${esc.reassignedTo}</strong>` : '→ <em>sprawdź kto otworzył ticket</em>';
                const booked = row.booked ? 'zaksięgowano' : '<span style="color:#dc2626;">⚠️ NIE zaksięgowano — dodaj Solution</span>';
                const cat = row.escalationKind === 'category_check' ? ' | sprawdź kategorię (auto „A")' : '';
                html += `<li style="margin:2px 0;"><strong>${row.orderNumber}</strong> — ${ticketLink(row)} — kliknij <strong>Reassign</strong> ${who} | ${booked}${cat}</li>`;
            }
            html += '</ul>';
        }

        html += '</div>';
        el.innerHTML = html;
    }

    panel.querySelector('#tm-t-check-btn').onclick = async () => {
        const raw = document.getElementById('tm-t-input').value;
        const items = parseExcel(raw);
        const bookingDate = document.getElementById('tm-t-date').value.trim();
        const accountNum = document.getElementById('tm-t-account').value.trim();
        updateAccountLabel();

        if (!items.length) {
            document.getElementById('tm-t-parse-preview').innerHTML = '<span style="color:red">⚠️ Brak danych!</span>';
            return;
        }
        const vErr = validateBooking(items, bookingDate, accountNum);
        if (vErr) { alert(vErr); return; }

        document.getElementById('tm-t-preview-section').style.display = 'block';
        document.getElementById('tm-t-progress').style.display = 'none';
        document.getElementById('tm-t-summary').innerHTML = '';
        document.getElementById('tm-t-issue-report').innerHTML = '';

        previewRows = buildPreviewRows(items, accountNum, bookingDate);

        buildInitialTable(previewRows);

        const checkBtn = document.getElementById('tm-t-check-btn');
        checkBtn.disabled = true;
        checkBtn.textContent = '⏳ Sprawdzam…';
        tmIsBusy = true;

        for (let i = 0; i < previewRows.length; i++) {
            const row = previewRows[i];
            try {
                const result = await checkOne(row.orderNumber, row.amount, row.accountNum, row.bookingDate, defaultFrameCtx, { total: row.dupTotal || 1, index: row.dupIndex || 1 });
                if (result.ok) {
                    Object.assign(previewRows[i], result);
                    previewRows[i].noSolutionTickets = result.noSolutionTickets || [];
                    previewRows[i].allCandidates = result.allCandidates || [];
                    previewRows[i].loading = false;
                    previewRows[i].selected = !previewRows[i].alreadyBooked;
                } else {
                    previewRows[i].loading = false;
                    previewRows[i].selected = false;
                    previewRows[i].error = result.error;
                    previewRows[i].reportType = result.reportType || '';
                    previewRows[i].noSolutionTickets = result.noSolutionTickets || [];
                    previewRows[i].checkedAuctions = result.checkedAuctions || 0;
                    previewRows[i].checkedTickets = result.checkedTickets || 0;
                    previewRows[i].auctionUrls = result.auctionUrls || [];
                    previewRows[i].noSolutionTickets = result.noSolutionTickets || [];
                }
            } catch (e) {
                previewRows[i].loading = false;
                previewRows[i].selected = false;
                previewRows[i].error = e.message;
                previewRows[i].reportType = '';
            }
            updateRow(i);
            await sleep(300);
        }

        tmIsBusy = false;
        checkBtn.disabled = false;
        checkBtn.textContent = '🔍 Sprawdź ordery';
        updateIssueReport();
    };

    // === TRYB RÓWNOLEGŁY (testowy) ===
    // Każdy worker działa we własnym iframe i pobiera kolejne pozycje z wspólnej kolejki.
    // Pozycje już zaksięgowane są pomijane. UI aktualizuje się na bieżąco.
    panel.querySelector('#tm-t-check-and-book-parallel-btn').onclick = async () => {
        try { var _d = document.getElementById('tm-t-date'); var _a = document.getElementById('tm-t-account'); if (_d) localStorage.setItem('tm_t_last_date', _d.value); if (_a) localStorage.setItem('tm_t_last_account', _a.value); } catch(e){}
        const raw = document.getElementById('tm-t-input').value;
        const items = parseExcel(raw);
        const bookingDate = document.getElementById('tm-t-date').value.trim();
        const accountNum = document.getElementById('tm-t-account').value.trim();
        const workersCount = Math.max(1, Math.min(10, parseInt(document.getElementById('tm-t-parallel-workers').value, 10) || 5)); // v3.34: min 1 (test na wolnym serwerze)
        const timeoutMult = Math.max(1, Math.min(10, parseFloat(document.getElementById('tm-t-timeout-mult').value) || 3));
        tmTimeoutMultiplier = timeoutMult;
        updateAccountLabel();

        if (!items.length) {
            document.getElementById('tm-t-parse-preview').innerHTML = '<span style="color:red">⚠️ Brak danych!</span>';
            return;
        }
        const vErr = validateBooking(items, bookingDate, accountNum);
        if (vErr) { alert(vErr); return; }

        if (!confirm(`⚙️ Księgowanie równoległe\n\nPozycji: ${items.length}\nWorkerów równolegle: ${workersCount}\n× timeout: ${timeoutMult} (load=${Math.round(20*timeoutMult)}s, akcje=${Math.round(12*timeoutMult)}s)\nKonto: ${accountNum}\nData: ${bookingDate}\n\nKażdy worker pracuje we własnym iframe. Pozycje już zaksięgowane (pojedynczo lub rozbite) są pomijane.\n\nUWAGA: kilka równoległych requestów do serwera. Jeśli zauważysz błędy lub spowolnienie, zmniejsz liczbę workerów.\n\nKontynuować?`)) {
            return;
        }

        document.getElementById('tm-t-preview-section').style.display = 'block';
        document.getElementById('tm-t-progress').style.display = 'block';
        document.getElementById('tm-t-progress-list').innerHTML = '';
        document.getElementById('tm-t-summary').innerHTML = '';
        document.getElementById('tm-t-issue-report').innerHTML = '';

        previewRows = buildPreviewRows(items, accountNum, bookingDate);
        applySavedProgress(previewRows); // wznawianie po crashu
        buildInitialTable(previewRows);

        const parallelBtn = document.getElementById('tm-t-check-and-book-parallel-btn');
        const checkBtn = document.getElementById('tm-t-check-btn');
        parallelBtn.disabled = true;
        parallelBtn.textContent = `⏳ Pracuję (${workersCount} workerów)…`;
        checkBtn.disabled = true;
        tmIsBusy = true;
        resetServerTimings(); // v3.22: nowe metryki serwera dla tego batcha

        const progressList = document.getElementById('tm-t-progress-list');
        let ok = 0, fail = 0, already = 0, escalated = 0;

        // Wspólna kolejka indeksów pozycji do przetworzenia
        const queue = previewRows.map((_, i) => i);

        // Pomocnik do logowania — każdy worker dorzuca swoje wiersze do progress listy
        function logLine(html, color) {
            const div = document.createElement('div');
            div.style.cssText = 'padding:4px 0;border-bottom:1px solid #f0f0f0;white-space:normal;word-break:break-word;line-height:1.35;color:' + (color || '#374151') + ';';
            div.innerHTML = html;
            progressList.appendChild(div);
            progressList.scrollTop = progressList.scrollHeight;
            return div;
        }

        async function processOne(workerLabel, i, ctx) {
            const row = previewRows[i];
            if (row.booked || row.alreadyBooked) { already++; return; } // wznawianie
            const logRow = logLine(`🔍 [W${workerLabel}] <strong>${row.orderNumber}</strong> — szukam ticketu…`, '#6b7280');

            let checkResult;
            try {
                checkResult = await checkOne(row.orderNumber, row.amount, row.accountNum, row.bookingDate, ctx, { total: row.dupTotal || 1, index: row.dupIndex || 1 });
            } catch (e) {
                previewRows[i].loading = false;
                previewRows[i].error = e.message;
                logRow.innerHTML = `❌ [W${workerLabel}] <strong>${row.orderNumber}</strong> — błąd przy sprawdzaniu: ${e.message}`;
                logRow.style.color = '#dc2626';
                updateRow(i);
                fail++;
                return;
            }

            if (!checkResult.ok) {
                previewRows[i].loading = false;
                previewRows[i].error = checkResult.error;
                previewRows[i].reportType = checkResult.reportType || '';
                previewRows[i].noSolutionTickets = checkResult.noSolutionTickets || [];
                previewRows[i].checkedAuctions = checkResult.checkedAuctions || 0;
                previewRows[i].checkedTickets = checkResult.checkedTickets || 0;
                previewRows[i].auctionUrls = checkResult.auctionUrls || [];
                logRow.innerHTML = `❌ [W${workerLabel}] <strong>${row.orderNumber}</strong> — ${checkResult.error}`;
                logRow.style.color = '#dc2626';
                updateRow(i);
                fail++;
                return;
            }

            Object.assign(previewRows[i], checkResult);
            previewRows[i].noSolutionTickets = checkResult.noSolutionTickets || [];
            previewRows[i].loading = false;

            if (previewRows[i].alreadyBooked && previewRows[i].existingRefund) {
                const desc = describeExistingRefund(previewRows[i].existingRefund);
                logRow.innerHTML = `ℹ️ [W${workerLabel}] <strong>${row.orderNumber}</strong> — Ticket #${previewRows[i].ticketId} — już zaksięgowane: ${desc}. Pomijam.`;
                logRow.style.color = '#2563eb';
                updateRow(i);
                already++;
                return;
            }

            logRow.innerHTML = `⏳ [W${workerLabel}] <strong>${row.orderNumber}</strong> — Ticket #${previewRows[i].ticketId} | ${row.amount} | księguję…`;

            try {
                const bookResult = await bookOne(previewRows[i], ctx);
                if (bookResult.ok && bookResult.vatRefund) {
                    previewRows[i].vatRefund = true;
                    previewRows[i].selected = false;
                    previewRows[i].booked = bookResult.verified === true && !bookResult.alreadyBooked;
                    previewRows[i].vat8100 = bookResult.info8100 ? bookResult.info8100.amount : null;
                    previewRows[i].vat8100Failed = !!(bookResult.info8100 && bookResult.info8100.booked === false);
                    previewRows[i].vatOverTolerance = !!(bookResult.info8100 && bookResult.info8100.overTolerance);
                    previewRows[i].vat8100Skipped = !!(bookResult.info8100 && bookResult.info8100.skipped);
                    if (bookResult.alreadyBooked) {
                        previewRows[i].alreadyBooked = true;
                        previewRows[i].existingRefund = bookResult.existingRefund || null;
                        logRow.innerHTML = `[W${workerLabel}] ` + `ℹ️ <strong>${row.orderNumber}</strong> — Zwrot nadpłaty z tytułu VAT już zaksięgowany. Pomijam.`;
                        logRow.style.color = '#2563eb';
                        already++;
                    } else if (previewRows[i].booked) {
                        const _ex = vatExtraText(previewRows[i]);
                        logRow.innerHTML = `[W${workerLabel}] ` + `✅ <strong>${row.orderNumber}</strong> — Zwrot nadpłaty z tytułu VAT: ${(-Math.abs(parseFloat(row.amount))).toFixed(2)} → konto ${row.accountNum}, ${row.bookingDate}${_ex}`;
                        logRow.style.color = (previewRows[i].vatOverTolerance || previewRows[i].vat8100Failed) ? '#d97706' : '#16a34a';
                        ok++;
                    } else {
                        logRow.innerHTML = `[W${workerLabel}] ` + `❌ <strong>${row.orderNumber}</strong> — VAT refund BŁĄD: ${bookResult.error || 'nieznany'}`;
                        logRow.style.color = '#dc2626';
                        fail++;
                    }
                } else if (bookResult.ok) {
                    previewRows[i].selected = false;
                    previewRows[i].booked = bookResult.verified === true && !bookResult.noSolution;
                    previewRows[i].verifySplitInfo = bookResult.verifySplitInfo || null; // v3.25
                    if (bookResult.escalated) {
                        previewRows[i].escalated = true;
                        previewRows[i].escalation = bookResult.escalation;
                        previewRows[i].escalationKind = bookResult.escalationKind; // v3.28
                        previewRows[i].noSolutionReason = bookResult.noSolutionReason || bookResult.fallbackReason;
                        previewRows[i].noSolutionReasonText = bookResult.noSolutionReasonText;
                        previewRows[i].fallbackUsed = !!bookResult.fallbackUsed;
                        previewRows[i].fallbackReason = bookResult.fallbackReason;
                        const esc = bookResult.escalation || {};
                        const reasonCode = bookResult.noSolutionReason || bookResult.fallbackReason || '';
                        const reasonShort = reasonCode === 'no_credit_note_items' ? 'brak credit note' : 'brak Solution=7';
                        const detail = bookResult.noSolutionReasonText ? ` — <em>${bookResult.noSolutionReasonText}</em>` : '';
                        const who = esc.reassigned ? esc.reassignedTo : (esc.openedBy || '?');
                        if (bookResult.escalationKind === 'category_check') {
                            logRow.innerHTML = `✅+⚠️ [W${workerLabel}] <strong>${row.orderNumber}</strong> — Ticket #${previewRows[i].ticketId} zaksięgowano${describeSplitInfo(bookResult.verifySplitInfo)} — uzupełniono kategorię (A), sprawdź: ${describeEscalation(esc)} → <strong>${who}</strong>`;
                        } else if (bookResult.fallbackUsed && bookResult.verified) {
                            logRow.innerHTML = `✅+⚠️ [W${workerLabel}] <strong>${row.orderNumber}</strong> — Ticket #${previewRows[i].ticketId} zaksięg. na pierwszej pozycji (${reasonShort})${describeSplitInfo(bookResult.verifySplitInfo)} + ESKALACJA: ${describeEscalation(esc)} → <strong>${who}</strong>`;
                        } else {
                            logRow.innerHTML = `⚠️ [W${workerLabel}] <strong>${row.orderNumber}</strong> — Ticket #${previewRows[i].ticketId} ESKALACJA bez zaksięg. (${reasonShort}${detail}): ${describeEscalation(esc)} → <strong>${who}</strong>`;
                        }
                        logRow.style.color = '#d97706';
                        escalated++;
                    } else if (bookResult.alreadyBooked && bookResult.existingRefund) {
                        const desc = describeExistingRefund(bookResult.existingRefund);
                        previewRows[i].alreadyBooked = true;
                        previewRows[i].existingRefund = bookResult.existingRefund;
                        logRow.innerHTML = `ℹ️ [W${workerLabel}] <strong>${row.orderNumber}</strong> — w międzyczasie zaksięgowane: ${desc}.`;
                        logRow.style.color = '#2563eb';
                        already++;
                    } else {
                        logRow.innerHTML = `✅ [W${workerLabel}] <strong>${row.orderNumber}</strong> — zaksięgowano (Ticket #${previewRows[i].ticketId}, ${row.amount}, ${row.bookingDate})${describeSplitInfo(bookResult.verifySplitInfo)}${bookResult.wasClosed ? ' | ticket zamknięty ponownie' : ''}`;
                        logRow.style.color = '#16a34a';
                        ok++;
                    }
                } else {
                    previewRows[i].bookError = bookResult.error; previewRows[i].booked = false;
                    logRow.innerHTML = `❌ [W${workerLabel}] <strong>${row.orderNumber}</strong> — BŁĄD: ${bookResult.error}`;
                    logRow.style.color = '#dc2626';
                    fail++;
                }
            } catch (e) {
                previewRows[i].bookError = e.message; previewRows[i].booked = false;
                logRow.innerHTML = `❌ [W${workerLabel}] <strong>${row.orderNumber}</strong> — BŁĄD: ${e.message}`;
                logRow.style.color = '#dc2626';
                fail++;
            }
            updateRow(i);
        }

        async function workerLoop(workerLabel) {
            const ctx = createFrameCtx();
            try {
                while (queue.length > 0) {
                    const i = queue.shift();
                    if (i == null) break;
                    await processOne(workerLabel, i, ctx);
                    freeCtx(ctx); // zwolnij pamięć po każdej pozycji
                    await sleep(300);
                }
            } finally {
                destroyFrameCtx(ctx);
            }
        }

        const startedAt = Date.now();
        logLine(`🚀 Start trybu równoległego: ${workersCount} workerów, ${items.length} pozycji.`, '#7c3aed');

        // Odpal wszystkich workerów jednocześnie i poczekaj na zakończenie wszystkich
        const workers = [];
        for (let w = 1; w <= workersCount; w++) {
            workers.push(workerLoop(w));
        }
        await Promise.all(workers);

        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        buildInitialTable(previewRows);
        if (fail === 0) clearProgress();

        const summary = document.getElementById('tm-t-summary');
        const _srvStatsP = formatServerStatsHtml(computeServerStats()); // v3.22
        summary.innerHTML = (fail === 0
            ? `🎉 Zaksięgowano teraz: <strong>${ok}</strong>. ℹ️ Już było: <strong>${already}</strong>.${escalated ? ` ⚠️ Eskalacje: <strong>${escalated}</strong>.` : ''} Czas: ${elapsed}s (${workersCount} workerów).`
            : `✅ Zaksięgowano teraz: <strong>${ok}</strong> &nbsp; ℹ️ Już było: <strong>${already}</strong>${escalated ? ` &nbsp; ⚠️ Eskalacje: <strong>${escalated}</strong>` : ''} &nbsp; ❌ Błędy: <strong>${fail}</strong> &nbsp; Czas: ${elapsed}s (${workersCount} workerów)`) + _srvStatsP;
        summary.style.color = fail === 0 ? (escalated ? '#d97706' : '#16a34a') : '#b45309';
        updateIssueReport();

        tmIsBusy = false;
        parallelBtn.disabled = false;
        parallelBtn.textContent = '🚀 Sprawdź i zaksięguj RÓWNOLEGLE';
        checkBtn.disabled = false;
    };

    panel.querySelector('#tm-t-clear-btn').onclick = () => {
        previewRows = [];
        tmIsBusy = false;
        clearProgress();
        document.getElementById('tm-t-input').value = '';
        // v3.60: reset blokady trybu Allegro po Wyczysc (inaczej data/konto zostawaly zablokowane na 1069/1071)
        const _accInp = document.getElementById('tm-t-account');
        if (_accInp) _accInp.value = '1000';
        applyAllegroLock([]);
        updateAccountLabel();
        document.getElementById('tm-t-parse-preview').innerHTML = '<span style="color:#888">Nie znaleziono pozycji</span>';
        document.getElementById('tm-t-preview-body').innerHTML = '';
        document.getElementById('tm-t-progress-list').innerHTML = '';
        document.getElementById('tm-t-summary').innerHTML = '';
        document.getElementById('tm-t-issue-report').innerHTML = '';
        document.getElementById('tm-t-progress').style.display = 'none';
        document.getElementById('tm-t-preview-section').style.display = 'none';
        closeEditPopup();
    };

    function offerResume() {
        const p = loadProgress();
        if (!p || !Array.isArray(p.rows) || !p.rows.length) return;
        const done = p.rows.filter(r => r.booked || r.alreadyBooked).length;
        const total = p.rows.length;
        if (done >= total) { clearProgress(); return; }
        const inp = document.getElementById('tm-t-input');
        const bar = document.getElementById('tm-t-resume-bar');
        if (!bar) return;
        if (p.raw && !inp.value.trim()) inp.value = p.raw;
        bar.style.display = 'block';
        bar.innerHTML = `↩️ Poprzednia sesja przerwana: <strong>${done}/${total}</strong> zaksięgowane. ` +
            `Kliknij <strong>„🚀 Sprawdź i zaksięguj RÓWNOLEGLE"</strong> — dokończy równolegle tylko pozostałe. ` +
            `<button id="tm-t-resume-discard" style="margin-left:6px;padding:2px 8px;border:none;border-radius:4px;background:#dc2626;color:#fff;cursor:pointer;font-size:11px;">Odrzuć</button>`;
        updateParsePreview();
        const disc = document.getElementById('tm-t-resume-discard');
        if (disc) disc.onclick = () => { clearProgress(); bar.style.display = 'none'; };
    }

    btn.onclick = () => {
        const opening = panel.style.display === 'none';
        panel.style.display = opening ? 'block' : 'none';
        if (opening) {
            (function(){ try {
                var _sd = localStorage.getItem('tm_t_last_date');
                var _sa = localStorage.getItem('tm_t_last_account');
                var _di = document.getElementById('tm-t-date');
                var _ai = document.getElementById('tm-t-account');
                if (_di && _sd) _di.value = _sd;
                if (_ai && _sa) _ai.value = _sa;
                if (_di && !_di.__persistBound) { _di.__persistBound = true; _di.addEventListener('change', function(){ try { localStorage.setItem('tm_t_last_date', _di.value); } catch(e){} }); }
                if (_ai && !_ai.__persistBound) { _ai.__persistBound = true; ['change','input'].forEach(function(ev){ _ai.addEventListener(ev, function(){ try { localStorage.setItem('tm_t_last_account', _ai.value); } catch(e){} }); }); }
            } catch(e){} })();
            initAccountAutocomplete();
            updateAccountLabel();
            const dateInp = document.getElementById('tm-t-date');
            if (dateInp && !dateInp.value) {
                const d = new Date();
                dateInp.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
            document.getElementById('tm-t-input').removeEventListener('input', updateParsePreview);
            document.getElementById('tm-t-input').addEventListener('input', updateParsePreview);
            document.querySelectorAll('input[name="tm-t-allegro-acc-r"]').forEach(r => {
                r.onchange = () => {
                    if (!isAllegroMode) return;
                    const acc = document.getElementById('tm-t-account');
                    acc.value = r.value;
                    updateAccountLabel();
                };
            });
            offerResume();
        }
    };

    document.addEventListener('click', e => {
        if (!btn.contains(e.target) && !panel.contains(e.target) && !editPopup.contains(e.target)) {
            panel.style.display = 'none';
        }
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);
})();
    }

    function init_refund() {
(function () {
    'use strict';

    const refundBtn = document.createElement("button");
    refundBtn.innerText = "🔍 Refund checker"; refundBtn.id = 'refund-btn';
    refundBtn.style.cssText = `
        position: fixed; top: 62px; right: 20px;
        z-index: 999999; padding: 10px 15px;
        background: #FF2F00; color: white;
        border: none; border-radius: 8px;
        cursor: pointer; font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;

    const refundPanel = document.createElement("div");
    refundPanel.style.cssText = `
        display: none; position: fixed;
        top: 108px; right: 20px;
        z-index: 999999; background: white;
        border: 1px solid #ccc; border-radius: 10px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        padding: 16px; width: 480px;
        font-family: sans-serif;
        max-height: calc(100vh - 128px); overflow-y: auto;
    `;

    refundPanel.innerHTML = `
        <div style="font-weight:bold; margin-bottom:8px; color:#111; font-size:15px;">
            🔍 Refund Checker
        </div>
        <div style="font-size:11px; color:#666; margin-bottom:8px;">
            Wklej całą tabelę ze strony — skrypt sam wyciągnie numery z "Refund_ XXXXXXX". Sprawdza tylko refundy ze statusem "Refund approved".
        </div>
        <textarea id="tm-refund-input" placeholder="false&#9;1901240&#9;Refund_ 14548371&#9;Refund&#9;..." style="
            width: 100%; height: 120px; padding: 8px;
            border: 1px solid #ccc; border-radius: 6px;
            font-size: 12px; resize: vertical;
            box-sizing: border-box; font-family: monospace;
        "></textarea>
        <div id="tm-refund-preview" style="margin-top:4px; font-size:11px; color:#555; min-height:16px;"></div>
        <button id="tm-refund-btn" style="
            margin-top:10px; width:100%; padding:10px;
            background:#FF2F00; color:white;
            border:none; border-radius:6px;
            cursor:pointer; font-size:14px; font-weight:bold;
        ">🔍 Sprawdź wszystkie w tle</button>
        <div id="tm-refund-progress" style="margin-top:8px; font-size:12px; color:#555; display:none;">
            ⏳ Sprawdzam... <span id="tm-refund-counter">0</span> / <span id="tm-refund-total">0</span>
        </div>
        <div id="tm-refund-results" style="margin-top:10px; display:none;">
            <div id="tm-refund-duplicates-section" style="display:none; margin-bottom:10px;">
                <div style="font-weight:bold; color:#f59e0b; margin-bottom:4px;">⚠️ Duplikaty:</div>
                <div id="tm-refund-duplicates" style="
                    font-size:11px; background:#fffbeb; border:1px solid #fde68a;
                    border-radius:6px; padding:8px; max-height:170px; overflow-y:auto;
                    font-family:monospace;
                "></div>
                <div style="margin-top:6px;">
                    <button id="tm-deact-change" style="padding:5px 9px;border:none;border-radius:6px;background:#b45309;color:#fff;cursor:pointer;font-size:11px;font-weight:bold;">Zmień zaznaczone → Refund Deactivated</button>
                    <span id="tm-deact-status" style="font-size:11px;color:#666;margin-left:6px;"></span>
                </div>
            </div>
            <div style="font-weight:bold; color:#16a34a; margin-bottom:4px;">✅ OK:</div>
            <div id="tm-refund-ok" style="
                font-size:11px; background:#f0fdf4; border:1px solid #bbf7d0;
                border-radius:6px; padding:8px; max-height:170px; overflow-y:auto;
                margin-bottom:10px; font-family:monospace;
            "></div>
            <div style="font-weight:bold; color:#a15c00; margin-bottom:4px;">⚠️ Zrobione + wyksięgowane (Open=0) – zmień status na Done:</div>
            <div id="tm-refund-executed" style="
                font-size:11px; background:#fff7ed; border:1px solid #fed7aa;
                border-radius:6px; padding:8px; max-height:170px; overflow-y:auto;
                margin-bottom:10px; font-family:monospace;
            "></div>
            <div style="margin:0 0 10px;">
                <label style="font-size:12px;cursor:pointer;margin-right:10px;"><input type="checkbox" id="tm-exec-all"> zaznacz wszystkie</label>
                <button id="tm-exec-change" style="padding:6px 10px;border:none;border-radius:6px;background:#a15c00;color:#fff;cursor:pointer;font-size:12px;font-weight:bold;">Zmień zaznaczone → Refund Done</button>
                <span id="tm-exec-status" style="font-size:11px;color:#666;margin-left:8px;"></span>
            </div>
            <div style="font-weight:bold; color:#dc2626; margin-bottom:4px;">❌ Kwota nie odpowiada:</div>
            <div id="tm-refund-fail" style="
                font-size:11px; background:#fef2f2; border:1px solid #fecaca;
                border-radius:6px; padding:8px; max-height:170px; overflow-y:auto;
                font-family:monospace;
            "></div>
            <div id="tm-refund-summary" style="margin-top:8px; font-size:13px; font-weight:bold;"></div>
        </div>
    `;

    function parseAuftragNumbers(raw) {
        const matches = [...raw.matchAll(/Refund_\s*(\d+)/g)];
        const all = matches.map(m => m[1]);
        const counts = {};

        all.forEach(n => counts[n] = (counts[n] || 0) + 1);

        const unique = [...new Set(all)];
        const duplicates = unique.filter(n => counts[n] > 1);

        return { unique, duplicates, counts };
    }

    function parseMoney(value) {
        if (value === null || value === undefined) return null;

        let s = String(value)
            .replace(/\u00a0/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/Ft|HUF|€|EUR|\$|USD|£|GBP/gi, '')
            .replace(/'/g, '')
            .replace(/\s+/g, '')
            .trim();

        if (!s) return null;

        // 376,764.00 -> 376764.00
        if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
            s = s.replace(/,/g, '');
        }
        // 376.764,00 -> 376764.00
        else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
            s = s.replace(/\./g, '').replace(',', '.');
        }
        // 376764,00 -> 376764.00
        else {
            s = s.replace(',', '.');
        }

        const n = parseFloat(s);
        return isNaN(n) ? null : Math.abs(n);
    }

    function formatAmount(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return String(amount);
        return Number(amount).toFixed(2);
    }

    function normalizeText(text) {
        return String(text || '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getJsonOpenAmount(doc, html) {
        const patterns = [
            /"open_amount"\s*:\s*"(-?[\d.,]+)"/i,
            /"open_amount"\s*:\s*(-?[\d.,]+)/i,
            /'open_amount'\s*:\s*'(-?[\d.,]+)'/i,
            /'open_amount'\s*:\s*(-?[\d.,]+)/i,
            /open_amount\s*[:=]\s*["']?(-?[\d.,]+)/i
        ];

        const scripts = doc.querySelectorAll('script');

        for (const script of scripts) {
            const content = script.textContent || '';

            for (const pattern of patterns) {
                const match = content.match(pattern);
                if (!match) continue;

                const parsed = parseMoney(match[1]);
                if (parsed !== null) return parsed;
            }
        }

        const fullHtml = String(html || '');

        for (const pattern of patterns) {
            const match = fullHtml.match(pattern);
            if (!match) continue;

            const parsed = parseMoney(match[1]);
            if (parsed !== null) return parsed;
        }

        return null;
    }

    function getVisiblePaymentSummaryAmount(doc, html) {
        const bodyText = normalizeText(doc.body ? doc.body.textContent : '');
        const htmlText = normalizeText(html);
        const combinedText = `${bodyText} ${htmlText}`;

        // Najpierw szukamy po TD jak wcześniej.
        const allTds = doc.querySelectorAll('td');

        for (const td of allTds) {
            if (!td.textContent.includes('Auftrag value - Total of Payments')) continue;

            const row = td.closest('tr') || td;
            const rowText = normalizeText(row.textContent);
            const afterLabel = rowText.split('Auftrag value - Total of Payments').pop() || rowText;

            const currencyMatch =
                rowText.match(/Ft|HUF|€|EUR|\$|USD|£|GBP/i) ||
                afterLabel.match(/Ft|HUF|€|EUR|\$|USD|£|GBP/i);

            const currency = currencyMatch ? currencyMatch[0] : '';

            const amountPatterns = [
                /(?:Ft|HUF|€|EUR|\$|USD|£|GBP)\s*(-?[\d\s'.,]+)/i,
                /(-?[\d\s'.,]+)\s*(?:Ft|HUF|€|EUR|\$|USD|£|GBP)/i,
                /(-?[\d\s'.,]+)/
            ];

            for (const pattern of amountPatterns) {
                const amountMatch = afterLabel.match(pattern);
                if (!amountMatch) continue;

                const amount = parseMoney(amountMatch[1]);

                if (amount !== null) {
                    return {
                        amount,
                        currency,
                        rawText: afterLabel,
                        source: 'visible'
                    };
                }
            }
        }

        // Mocniejszy fallback po całym tekście strony.
        const labelMatch = combinedText.match(/Auftrag value\s*-\s*Total of Payments.{0,250}/i);

        if (labelMatch) {
            const part = labelMatch[0];

            const currencyMatch = part.match(/Ft|HUF|€|EUR|\$|USD|£|GBP/i);
            const currency = currencyMatch ? currencyMatch[0] : '';

            const amountPatterns = [
                /(?:Ft|HUF|€|EUR|\$|USD|£|GBP)\s*(-?[\d\s'.,]+)/i,
                /(-?[\d\s'.,]+)\s*(?:Ft|HUF|€|EUR|\$|USD|£|GBP)/i,
                /(-?[\d\s'.,]+)/
            ];

            for (const pattern of amountPatterns) {
                const amountMatch = part.match(pattern);
                if (!amountMatch) continue;

                const amount = parseMoney(amountMatch[1]);

                if (amount !== null) {
                    return {
                        amount,
                        currency,
                        rawText: part,
                        source: 'visible'
                    };
                }
            }
        }

        return null;
    }

    function getOpenAmountData(doc, html) {
        const jsonOpen = getJsonOpenAmount(doc, html);
        const visibleSummary = getVisiblePaymentSummaryAmount(doc, html);

        // Normalnie JSON jest źródłem prawdy.
        if (jsonOpen !== null) {
            return {
                amount: jsonOpen,
                source: 'json',
                jsonOpen,
                visibleAmount: visibleSummary ? visibleSummary.amount : null,
                visibleCurrency: visibleSummary ? visibleSummary.currency : '',
                visibleRawText: visibleSummary ? visibleSummary.rawText : ''
            };
        }

        // Fallback tylko jeśli JSON nie istnieje.
        if (visibleSummary) {
            return {
                amount: visibleSummary.amount,
                source: 'visible',
                jsonOpen: null,
                visibleAmount: visibleSummary.amount,
                visibleCurrency: visibleSummary.currency || '',
                visibleRawText: visibleSummary.rawText || ''
            };
        }

        return {
            amount: null,
            source: null,
            jsonOpen: null,
            visibleAmount: null,
            visibleCurrency: '',
            visibleRawText: ''
        };
    }

    function updateRefundPreview() {
        const { unique, duplicates } = parseAuftragNumbers(
            document.getElementById('tm-refund-input')?.value || ''
        );

        const el = document.getElementById('tm-refund-preview');
        if (!el) return;

        if (unique.length === 0) {
            el.innerHTML = '<span style="color:#888">Brak numerów w formacie "Refund_ XXXXXXX"</span>';
            return;
        }

        let html = `<span style="color:#FF2F00">✓ Znaleziono ${unique.length} unikalnych auftragów</span>`;

        if (duplicates.length > 0) {
            html += `<br><span style="color:#f59e0b">⚠️ Duplikaty w liście (${duplicates.length}x): <strong>${duplicates.join(', ')}</strong></span>`;
        }

        el.innerHTML = html;
    }

    function getSelectedStateValue(selectEl) {
        if (!selectEl) return null;

        const selectedOpt = selectEl.querySelector('option[selected]');
        if (selectedOpt) return selectedOpt.getAttribute('value') || selectedOpt.textContent.trim();

        return selectEl.value || null;
    }

    // Zmiana statusu refundu na "Refund Done" przez API strony aukcji.
    async function setRefundStatus(logId, newStatus) {
        try {
            const fd = new FormData();
            fd.append('new_status', newStatus);
            fd.append('log_id', logId);
            const resp = await fetch('/api/refunds/updateRefundStatus/', { method: 'POST', body: fd });
            let data = null;
            try { data = await resp.json(); } catch (e) {}
            if (!resp.ok) return { ok: false, error: 'HTTP ' + resp.status };
            if (!data || !data.success) return { ok: false, error: (data && data.message) ? data.message : 'serwer: success=false' };
            const state = (data.data && data.data.state) ? String(data.data.state) : '';
            return { ok: true, state: state };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    // Zwrot fizycznie wykonany u dostawcy (automaticRefundsTable): PayPal=DONE,
    // Saferpay=CAPTURED, Klarna=CANCEL DONE. Zwraca sume i daty (YYYY-MM-DD).
    function getExecutedRefund(doc) {
        const SUCCESS = ['captured', 'done', 'cancel done'];
        let sum = 0, found = false;
        const dates = [];
        const tables = doc.querySelectorAll('#automaticRefundsTable, table[data-simple-nav$="automatic booking refunds"]');
        tables.forEach(function(table){
            const headerRow = table.querySelector('tr.table-heading-row');
            if (!headerRow) return;
            const heads = Array.from(headerRow.querySelectorAll('td')).map(td => td.textContent.trim().toLowerCase());
            const amountIdx = heads.indexOf('amount');
            const statusIdx = heads.indexOf('status');
            let dateIdx = heads.indexOf('date');
            if (dateIdx < 0) dateIdx = heads.findIndex(h => h.indexOf('date') !== -1);
            if (amountIdx < 0 || statusIdx < 0) return;
            table.querySelectorAll('tr.table-row').forEach(function(row){
                const cells = row.querySelectorAll('td');
                if (cells.length <= Math.max(amountIdx, statusIdx)) return;
                const status = (cells[statusIdx].textContent || '').trim().toLowerCase();
                if (SUCCESS.indexOf(status) === -1) return;
                const amt = parseMoney(cells[amountIdx].textContent);
                if (amt !== null && amt > 0) { sum += amt; found = true; }
                if (dateIdx >= 0 && cells[dateIdx]) {
                    const d = (cells[dateIdx].textContent || '').trim().slice(0, 10);
                    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dates.push(d);
                }
            });
        });
        return found ? { amount: sum, dates: dates } : null;
    }

    // Czy zwrot jest wyksiegowany: w tabeli 'payments' jest wpis z ujemna kwota i ta sama data (dzien).
    function paymentsHasRefundBookingOnDate(doc, dayStr) {
        if (!dayStr) return false;
        let table = null;
        const anchor = doc.querySelector('#payments');
        if (anchor) table = anchor.closest('table');
        if (!table) table = doc.querySelector('table[data-simple-nav="Payments under billing information"]');
        if (!table) return false;
        const rows = table.querySelectorAll('tr');
        for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length < 3) continue;
            const dateTxt = (cells[0].textContent || '').trim();
            const amtTxt = (cells[2].textContent || '').trim();
            if (dateTxt.slice(0, 10) === dayStr && amtTxt.charAt(0) === '-') return true;
        }
        return false;
    }

    async function checkRefund(auftragNumber) {
        try {
            const resp = await fetch(`/auction.php?number=${auftragNumber}&txnid=3`);
            const html = await resp.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const openData = getOpenAmountData(doc, html);
            const openAmount = openData.amount;

            const approvedAmounts = [];
            const approvedLogIds = [];
            const approvedPairs = [];
            let totalRowsInTable = 0;

            // W surowym HTML tabela nie ma jeszcze id="refundTable" (orders.js dodaje je w przegladarce).
            // Szukamy jej po naglowku "Refund amount" (bywa ze spacja na koncu).
            let refundTable = doc.getElementById('refundTable');
            if (!refundTable) {
                const hdr = Array.from(doc.querySelectorAll('td[data-field-name]'))
                    .find(td => (td.getAttribute('data-field-name') || '').trim() === 'Refund amount');
                if (hdr) refundTable = hdr.closest('table');
            }

            if (refundTable) {
                const headerRow = refundTable.querySelector('tr.table-heading-row');
                const allHeaderCells = headerRow ? headerRow.querySelectorAll('td') : [];

                let colIdx = -1;

                allHeaderCells.forEach((td, i) => {
                    if ((td.getAttribute('data-field-name') || '').trim() === 'Refund amount') colIdx = i;
                });

                if (colIdx >= 0) {
                    const rows = refundTable.querySelectorAll('tr.table-row');
                    totalRowsInTable = rows.length;

                    for (const row of rows) {
                        const stateSelect = row.querySelector('.state-select');
                        const stateValue = getSelectedStateValue(stateSelect);

                        if (stateValue !== 'Refund approved') continue;
                        const _lid = stateSelect ? stateSelect.getAttribute('data-log-id') : null;
                        if (_lid) approvedLogIds.push(_lid);

                        const cells = row.querySelectorAll('td');

                        if (cells[colIdx]) {
                            const amt = parseMoney(cells[colIdx].textContent);

                            if (amt !== null && amt > 0) {
                                approvedAmounts.push(amt);
                                approvedPairs.push({ amount: amt, logId: _lid });
                            }
                        }
                    }
                }
            }

            if (approvedAmounts.length === 0) {
                return {
                    ok: false,
                    error: totalRowsInTable === 0
                        ? 'Brak tabeli refund'
                        : `Brak refundów ze statusem "Refund approved" (znaleziono ${totalRowsInTable} wierszy z innym statusem)`,
                    auftragNumber
                };
            }

            const amountGroups = {};

            approvedPairs.forEach(pr => {
                const key = pr.amount.toFixed(2);
                (amountGroups[key] = amountGroups[key] || []).push(pr.logId);
            });

            const internalDuplicates = Object.entries(amountGroups)
                .filter(([, ids]) => ids.length > 1)
                .map(([amt, ids]) => ({
                    amount: parseFloat(amt),
                    count: ids.length,
                    logIds: ids.filter(Boolean)
                }));

            const refundAmount = approvedAmounts.reduce((s, a) => s + a, 0);

            // Zwrot juz wykonany u dostawcy, mimo statusu "Refund approved"?
            const exec = getExecutedRefund(doc);
            const openIsZero = (openAmount !== null && !isNaN(openAmount) && Math.abs(openAmount) < 0.02);
            const bookedOnRefundDate = exec ? exec.dates.some(d => paymentsHasRefundBookingOnDate(doc, d)) : false;
            if (exec && refundAmount > 0 && Math.abs(exec.amount - refundAmount) < 0.02 && openIsZero && bookedOnRefundDate) {
                return {
                    executed: true,
                    auftragNumber,
                    refundAmount,
                    executedAmount: exec.amount,
                    approvedAmounts,
                    logIds: approvedLogIds,
                    error: `Zwrot wykonany i wyksiegowany (Open=0) — tylko status do zmiany`
                };
            }

            // KLUCZOWA ZMIANA:
            // Jeśli openAmount wyszedł jako 0 z fallbacku widocznego HTML,
            // JSON nie został znaleziony, a refund approved > 0,
            // to NIE pokazujemy zwykłego "Open: 0.00".
            // Oznaczamy jako podejrzany HUF bug / podejrzany fallback.
            const suspiciousZeroFallback =
                openData.source === 'visible' &&
                openData.jsonOpen === null &&
                openAmount === 0 &&
                refundAmount > 0;

            if (suspiciousZeroFallback) {
                return {
                    ok: false,
                    auftragNumber,
                    openAmount,
                    refundAmount,
                    approvedAmounts,
                    internalDuplicates,
                    suspiciousHufBug: true,
                    error: `Podejrzany HUF bug: JSON open=brak, widoczne open=${formatAmount(openAmount)}. Refund: ${refundAmount.toFixed(2)}`
                };
            }

            if (openAmount === null || isNaN(openAmount)) {
                return {
                    ok: false,
                    error: 'Nie znaleziono open amount',
                    auftragNumber
                };
            }

            const isMatch = Math.abs(openAmount - refundAmount) < 0.02;

            let error = null;

            if (internalDuplicates.length > 0) {
                error = `Duplikat statusu approved: ${internalDuplicates.map(d => `${formatAmount(d.amount)} ×${d.count}`).join(', ')}`;
            } else if (!isMatch) {
                error = `Open: ${formatAmount(openAmount)} ≠ Refund (suma approved): ${refundAmount.toFixed(2)}`;
            }

            return {
                ok: isMatch && internalDuplicates.length === 0,
                auftragNumber,
                openAmount,
                refundAmount,
                approvedAmounts,
                internalDuplicates,
                suspiciousHufBug: false,
                error
            };

        } catch (e) {
            return {
                ok: false,
                error: e.message,
                auftragNumber
            };
        }
    }

    refundPanel.querySelector('#tm-refund-btn').onclick = async () => {
        const raw = document.getElementById('tm-refund-input').value;
        const { unique, duplicates: inputDuplicates, counts } = parseAuftragNumbers(raw);

        if (unique.length === 0) {
            document.getElementById('tm-refund-preview').innerHTML =
                '<span style="color:red">⚠️ Nie znaleziono numerów w formacie "Refund_ XXXXXXX"!</span>';
            return;
        }

        const btn = document.getElementById('tm-refund-btn');
        const progressDiv = document.getElementById('tm-refund-progress');
        const counter = document.getElementById('tm-refund-counter');
        const total = document.getElementById('tm-refund-total');
        const resultsDiv = document.getElementById('tm-refund-results');
        const okDiv = document.getElementById('tm-refund-ok');
        const failDiv = document.getElementById('tm-refund-fail');
        const summaryDiv = document.getElementById('tm-refund-summary');
        const dupSection = document.getElementById('tm-refund-duplicates-section');
        const dupDiv = document.getElementById('tm-refund-duplicates');
        const executedDiv = document.getElementById('tm-refund-executed');

        btn.disabled = true;
        btn.textContent = '⏳ Sprawdzam...';

        progressDiv.style.display = 'block';
        resultsDiv.style.display = 'none';

        total.textContent = unique.length;
        counter.textContent = '0';

        okDiv.innerHTML = '';
        failDiv.innerHTML = '';
        summaryDiv.innerHTML = '';
        dupDiv.innerHTML = '';
        executedDiv.innerHTML = '';
        dupSection.style.display = 'none';

        const okList = [];
        const failList = [];
        const internalDupList = [];
        const executedList = [];

        // Równolegle, z limitem jednoczesnych żądań (zamiast: po jednym + 500 ms przerwy)
        const CONCURRENCY = 6;
        const results = new Array(unique.length);
        let nextIndex = 0;
        let completed = 0;

        async function refundWorker() {
            while (true) {
                const i = nextIndex++;
                if (i >= unique.length) return;
                try {
                    results[i] = await checkRefund(unique[i]);
                } catch (e) {
                    results[i] = { auftragNumber: unique[i], ok: false, error: 'Błąd: ' + (e && e.message ? e.message : e) };
                }
                completed++;
                counter.textContent = completed;
            }
        }

        await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, unique.length) }, refundWorker)
        );

        // Przetwarzanie wyników w kolejności wejściowej (widok bez zmian)
        for (let i = 0; i < unique.length; i++) {
            const result = results[i];
            if (!result) continue;
            if (result.executed) {
                executedList.push({ auftrag: result.auftragNumber, amount: result.executedAmount, logIds: result.logIds || [] });
            } else if (result.internalDuplicates && result.internalDuplicates.length > 0) {
                internalDupList.push({
                    auftrag: result.auftragNumber,
                    duplicates: result.internalDuplicates
                });
                failList.push(`${result.auftragNumber} — ${result.error}`);
            } else if (result.ok) {
                okList.push(`${result.auftragNumber} (${result.refundAmount.toFixed(2)})`);
            } else {
                failList.push(`${result.auftragNumber} — ${result.error}`);
            }
        }

        progressDiv.style.display = 'none';
        resultsDiv.style.display = 'block';

        let dupHtml = '';

        if (inputDuplicates.length > 0) {
            dupHtml += '<div style="font-weight:bold; margin-bottom:4px;">Z listy wejściowej:</div>';
            dupHtml += inputDuplicates
                .map(n => `<div>⚠️ <strong>${n}</strong> — pojawia się ${counts[n]}x</div>`)
                .join('');
        }

        if (internalDupList.length > 0) {
            if (dupHtml) dupHtml += '<div style="margin-top:8px;"></div>';

            dupHtml += '<div style="font-weight:bold; margin-bottom:4px;">Zduplikowane refundy approved:</div>';
            dupHtml += internalDupList
                .map(d => {
                    let h = `<div style="margin-bottom:4px;">⚠️ <strong>${d.auftrag}</strong>:</div>`;
                    d.duplicates.forEach(x => {
                        const boxes = (x.logIds || []).map(lid => `<label style="margin-right:10px;white-space:nowrap;"><input type="checkbox" class="tm-deact-cb" data-logid="${lid}"> deaktywuj #${lid}</label>`).join('');
                        h += `<div style="margin-left:14px;">${formatAmount(x.amount)} ×${x.count} → ${boxes}</div>`;
                    });
                    return h;
                })
                .join('');
        }

        if (dupHtml) {
            dupSection.style.display = 'block';
            dupDiv.innerHTML = dupHtml;
        }

        okDiv.innerHTML = okList.length
            ? okList.map(l => `<div>${l}</div>`).join('')
            : '<div style="color:#888">Brak</div>';

        failDiv.innerHTML = failList.length
            ? failList.map(l => `<div style="color:#dc2626">${l}</div>`).join('')
            : '<div style="color:#888">Brak</div>';

        executedDiv.innerHTML = executedList.length
            ? executedList.map(e => {
                const links = (e.logIds || []).map(id => `<a href="/react/settings_page/import_payments/${id}/" target="_blank">${id}</a>`).join(', ') || '—';
                return `<div style="display:flex;align-items:flex-start;gap:6px;padding:3px 0;" data-logids="${(e.logIds||[]).join(',')}">`
                    + `<input type="checkbox" class="tm-exec-cb" style="margin-top:2px;">`
                    + `<span><strong>${e.auftrag}</strong> — ${e.amount.toFixed(2)} — status: <b>Refund approved</b> — import: ${links}<span class="tm-exec-note" style="color:#16a34a;"></span></span></div>`;
              }).join('')
            : '<div style="color:#888">Brak</div>';

        let summary = `✅ OK: <strong>${okList.length}</strong> &nbsp; ⚠️ Wykonane: <strong>${executedList.length}</strong> &nbsp; ❌ Problemy: <strong>${failList.length}</strong>`;

        const totalDups = inputDuplicates.length + internalDupList.length;

        if (totalDups > 0) {
            summary += ` &nbsp; ⚠️ Duplikaty: <strong>${totalDups}</strong>`;

            if (internalDupList.length > 0) {
                summary += ` <span style="font-weight:normal;">(${internalDupList.length} approved-duplikatów)</span>`;
            }
        }

        summaryDiv.innerHTML = summary;
        summaryDiv.style.color = failList.length === 0 ? '#16a34a' : '#b45309';

        btn.disabled = false;
        btn.textContent = '🔍 Sprawdź wszystkie w tle';
    };

    refundPanel.querySelector('#tm-exec-change').onclick = async () => {
        const execDiv = document.getElementById('tm-refund-executed');
        const statusSpan = document.getElementById('tm-exec-status');
        const checked = Array.from(execDiv.querySelectorAll('.tm-exec-cb:checked'));
        if (!checked.length) { statusSpan.textContent = 'Zaznacz przynajmniej jedno.'; return; }
        if (!confirm('Zmienic status na "Refund Done" dla ' + checked.length + ' zamowien?')) return;
        statusSpan.textContent = 'Zmieniam...';
        let done = 0, err = 0;
        for (const cb of checked) {
            const row = cb.closest('[data-logids]');
            const logIds = (row.getAttribute('data-logids') || '').split(',').filter(Boolean);
            let allOk = logIds.length > 0;
            let lastState = '', lastErr = '';
            for (const lid of logIds) { const res = await setRefundStatus(lid, 'Refund Done'); if (!res.ok) { allOk = false; lastErr = res.error || 'blad'; } else { lastState = res.state || ''; } }
            const note = row.querySelector('.tm-exec-note');
            if (allOk) { done++; row.style.opacity = '0.55'; if (note) { note.style.color = '#16a34a'; note.textContent = ' ✅ serwer: ' + (lastState || 'Refund Done'); } cb.checked = false; cb.disabled = true; }
            else { err++; if (note) { note.style.color = '#dc2626'; note.textContent = ' ❌ ' + (lastErr || 'blad') + ' (zmien przez link)'; } }
        }
        statusSpan.textContent = 'Gotowe: ' + done + ' zmienione' + (err ? ', ' + err + ' blad' : '') + '.';
    };

    refundPanel.querySelector('#tm-deact-change').onclick = async () => {
        const dupDivEl = document.getElementById('tm-refund-duplicates');
        const st = document.getElementById('tm-deact-status');
        const checked = Array.from(dupDivEl.querySelectorAll('.tm-deact-cb:checked'));
        if (!checked.length) { st.textContent = 'Zaznacz przynajmniej jeden zwrot do deaktywacji.'; return; }
        if (!confirm('Zmienic status na "Refund Deactivated" dla ' + checked.length + ' zwrotow?')) return;
        st.textContent = 'Zmieniam...';
        let done = 0, err = 0;
        for (const cb of checked) {
            const lid = cb.getAttribute('data-logid');
            const res = await setRefundStatus(lid, 'Refund Deactivated');
            const lab = cb.closest('label');
            if (res.ok) { done++; cb.checked = false; cb.disabled = true; if (lab) { lab.style.color = '#16a34a'; lab.insertAdjacentHTML('beforeend', ' ✅'); } }
            else { err++; if (lab) { lab.style.color = '#dc2626'; lab.insertAdjacentHTML('beforeend', ' ❌ ' + (res.error || 'blad')); } }
        }
        st.textContent = 'Gotowe: ' + done + ' deaktywowane' + (err ? ', ' + err + ' blad' : '') + '.';
    };

    refundPanel.querySelector('#tm-exec-all').onchange = (e) => {
        const on = e.target.checked;
        document.getElementById('tm-refund-executed').querySelectorAll('.tm-exec-cb').forEach(cb => { if (!cb.disabled) cb.checked = on; });
    };

    refundBtn.onclick = () => {
        const isOpen = refundPanel.style.display !== 'none';
        refundPanel.style.display = isOpen ? 'none' : 'block';

        if (!isOpen) {
            setTimeout(() => {
                document.getElementById('tm-refund-input')?.addEventListener('input', updateRefundPreview);
            }, 50);
        }
    };

    document.addEventListener('click', (e) => {
        if (!refundBtn.contains(e.target) && !refundPanel.contains(e.target)) {
            refundPanel.style.display = 'none';
        }
    });

    document.body.appendChild(refundBtn);
    document.body.appendChild(refundPanel);
})();
    }

    function init_sepa() {
(function () {
    'use strict';
    if (window.__sepaValidatorLoaded) return;
    window.__sepaValidatorLoaded = true;

    // ---------- Stale ----------
    // Dlugosci IBAN wg rejestru ISO 13616 (SEPA + popularne).
    const IBAN_LEN = {
        AD:24,AE:23,AL:28,AT:20,AZ:28,BA:20,BE:16,BG:22,BH:22,BR:29,BY:28,CH:21,CR:22,CY:28,CZ:24,
        DE:22,DK:18,DO:28,EE:20,EG:29,ES:24,FI:18,FO:18,FR:27,GB:22,GE:22,GI:23,GL:18,GR:27,GT:28,
        HR:21,HU:28,IE:22,IL:23,IS:26,IT:27,JO:30,KW:30,KZ:20,LB:28,LC:32,LI:21,LT:20,LU:20,LV:21,
        MC:27,MD:24,ME:22,MK:19,MR:27,MT:31,MU:30,NL:18,NO:15,PK:24,PL:28,PS:29,PT:25,QA:29,RO:24,
        RS:22,SA:24,SC:31,SE:24,SI:19,SK:24,SM:27,TN:24,TR:26,UA:29,VA:22,VG:24,XK:20
    };
    // ISO 4217 (podzbior; nietypowa waluta = tylko ostrzezenie).
    const CCY = new Set(['EUR','USD','GBP','PLN','CHF','CZK','HUF','SEK','NOK','DKK','RON','BGN','HRK','ISK','TRY','JPY','CAD','AUD','CNY','RSD','UAH','AED']);
    // Zestaw znakow SEPA (EPC) dla nazwy/tytulu.
    const NON_SEPA = /[^A-Za-z0-9\/\-?:().,'+ ]/;
    // Transliteracja niemiecka (DFÜ Anlage 3) + typowe znaki.
    const TRANSLIT = {
        'ä':'ae','ö':'oe','ü':'ue','Ä':'Ae','Ö':'Oe','Ü':'Ue','ß':'ss',
        'ł':'l','Ł':'L','ø':'o','Ø':'O','đ':'d','Đ':'D','ð':'d','Þ':'Th','þ':'th',
        'æ':'ae','Æ':'Ae','œ':'oe','Œ':'Oe','ı':'i','İ':'I'
    };

    // ---------- Helpery walidacji ----------
    function mod97ok(iban) {
        const r = iban.slice(4) + iban.slice(0, 4);
        let rem = 0;
        for (const ch of r) {
            const v = /[0-9]/.test(ch) ? ch : (ch.charCodeAt(0) - 55).toString();
            for (const d of v) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
        }
        return rem === 1;
    }
    function cleanupIban(raw) {
        let s = (raw == null ? '' : String(raw)).trim();
        s = s.replace(/^\s*iban[:\s]*/i, '');      // doklejony prefiks "IBAN"
        s = s.toUpperCase();
        s = s.replace(/[\s\-.\u00A0]/g, '');        // spacje, myslniki, kropki, nbsp
        return s;
    }
    // Waliduje JUZ oczyszczony IBAN (bez czyszczenia w srodku). Zwraca liste bledow.
    function validateClean(cleaned) {
        const errs = [];
        if (!cleaned) { errs.push('brak IBAN'); return errs; }
        if (/[^A-Z0-9]/.test(cleaned)) errs.push('niedozwolone znaki (np. litery narodowe)');
        if (!/^[A-Z]{2}/.test(cleaned)) errs.push('brak kodu kraju');
        else {
            const cc = cleaned.slice(0, 2);
            if (IBAN_LEN[cc] && cleaned.length !== IBAN_LEN[cc]) errs.push(`zla dlugosc ${cc} (${cleaned.length}/${IBAN_LEN[cc]})`);
            if (!IBAN_LEN[cc]) errs.push(`nieznany kod kraju ${cc}`);
        }
        if (errs.length === 0 && !mod97ok(cleaned)) errs.push('bledny checksum (mod-97)');
        return errs;
    }

    // Cyfry kontrolne IBAN dla podanego BBAN i kodu kraju (ISO 13616).
    function ibanCheckDigits(bban, cc) {
        const r = bban + cc + '00';
        let rem = 0;
        for (const ch of r) { const v = /[0-9]/.test(ch) ? ch : (ch.charCodeAt(0) - 55).toString(); for (const d of v) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97; }
        const c = 98 - rem; return c < 10 ? '0' + c : '' + c;
    }
    // Probuje zbudowac poprawny IBAN z samych cyfr krajowego konta + kodu kraju.
    function tryBuildIban(digits, cc) {
        const L = IBAN_LEN[cc]; if (!L) return null;
        if (2 + digits.length === L) { const cand = cc + digits; return mod97ok(cand) ? cand : null; }           // NRB juz zawiera cyfry kontrolne (np. PL)
        if (4 + digits.length === L) { const cand = cc + ibanCheckDigits(digits, cc) + digits; return mod97ok(cand) ? cand : null; } // policz cyfry kontrolne (np. HU)
        return null;
    }
    function ccFromName(name) {
        const s = (name || '').toLowerCase();
        const map = { poland: 'PL', polska: 'PL', hungary: 'HU', czech: 'CZ', germany: 'DE', deutschland: 'DE', slovak: 'SK', austria: 'AT', spain: 'ES', italy: 'IT', france: 'FR', portugal: 'PT', netherlands: 'NL', belgium: 'BE' };
        for (const k in map) if (s.includes(k)) return map[k];
        return '';
    }
    // Rozstrzyga IBAN: ok / format (do normalizacji) / prefix (dodac kraj) / manual (blad).
    function resolveIban(raw, cc) {
        const cleaned = cleanupIban(raw);
        if (validateClean(cleaned).length === 0) return { value: cleaned, kind: raw === cleaned ? 'ok' : 'format' };
        if (cc && /^[0-9]+$/.test(cleaned)) { const built = tryBuildIban(cleaned, cc); if (built) return { value: built, kind: 'prefix', cc }; }
        return { value: null, kind: 'manual', errs: validateClean(cleaned) };
    }
    function centsOf(a) {
        const s = String(a == null ? '' : a).replace(',', '.').trim();
        if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
        return Math.round(parseFloat(s) * 100);
    }
    function fmt2(cents) { return (cents / 100).toFixed(2); }
    function hasNonSepa(s) { return NON_SEPA.test(s || ''); }
    function translit(s) {
        let out = String(s || '').split('').map(ch => (ch in TRANSLIT ? TRANSLIT[ch] : ch)).join('');
        out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');   // rozklad + usuniecie diakrytykow
        out = out.replace(NON_SEPA, ' ');                              // cokolwiek zostalo poza SEPA -> spacja
        out = out.replace(/\s{2,}/g, ' ').trim();
        return out;
    }

    // ---------- Stan ----------
    let model = [];       // wiersze
    let xmlDoc = null;    // sparsowany dokument (zrodlo prawdy dla struktury)
    let fileName = 'refunds_fixed.xml';
    let fileCc = '';      // kod kraju z nazwy pliku (fallback dla BBAN bez prefiksu)

    const q = (n, name) => n.getElementsByTagNameNS('*', name);
    const first = (n, name) => { const l = q(n, name); return l.length ? l[0] : null; };
    const txt = (n, name) => { const e = first(n, name); return e ? (e.textContent || '').trim() : ''; };

    function parseAndBuild(text) {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) {
            throw new Error('Nieprawidlowy XML: ' + doc.getElementsByTagName('parsererror')[0].textContent.replace(/\s+/g, ' ').slice(0, 200));
        }
        if (!first(doc, 'CstmrCdtTrfInitn')) throw new Error('To nie wyglada na pain.001 (brak CstmrCdtTrfInitn).');
        xmlDoc = doc;
        model = [];
        fileCc = ccFromName(fileName);
        Array.from(q(doc, 'PmtInf')).forEach(pmt => {
            Array.from(q(pmt, 'CdtTrfTxInf')).forEach(tx => model.push(makeRow(tx, pmt)));
        });
        validateAll();
    }

    function debtorCcOf(pmt) {
        const dbtrAcct = first(pmt, 'DbtrAcct');
        const dbtrIban = (dbtrAcct ? (first(dbtrAcct, 'IBAN') || {}).textContent : '') || '';
        return /^\s*[A-Za-z]{2}/.test(dbtrIban) ? dbtrIban.trim().toUpperCase().slice(0, 2) : fileCc;
    }
    function makeRow(tx, pmt) {
        const amtEl = first(tx, 'InstdAmt');
        const acct = first(tx, 'CdtrAcct');
        const ibanEl = acct ? first(acct, 'IBAN') : null;
        const cd = first(tx, 'Cdtr');
        const nmEl = cd ? first(cd, 'Nm') : null;
        return {
            e2e: txt(tx, 'EndToEndId'),
            nm: nmEl ? (nmEl.textContent || '').trim() : '',
            iban: ibanEl ? (ibanEl.textContent || '').trim() : '',
            ccy: amtEl ? (amtEl.getAttribute('Ccy') || '') : '',
            amt: amtEl ? (amtEl.textContent || '').trim() : '',
            ustrd: txt(tx, 'Ustrd'),
            nodes: { tx, amtEl, ibanEl, nmEl },
            pmt, debtorCc: debtorCcOf(pmt),
            sel: false, errs: [], warns: []
        };
    }
    // Usuwa pozycje: kasuje wezel transakcji (i cale PmtInf, gdy zostaje puste).
    function deleteRow(i) {
        const r = model[i]; if (!r) return;
        const tx = r.nodes.tx, pmt = r.pmt;
        if (tx && tx.parentNode) tx.parentNode.removeChild(tx);
        if (pmt && q(pmt, 'CdtTrfTxInf').length === 0 && pmt.parentNode) pmt.parentNode.removeChild(pmt);
        model.splice(i, 1);
        validateAll(); renderTable(); updateSummary();
        toast('Usunieto pozycje.');
    }
    // Dodaje nowa, pusta pozycje (klon szablonu -> trafi do pobranego XML).
    function addRow() {
        if (!xmlDoc) { toast('Najpierw wczytaj plik.'); return; }
        const pmts = Array.from(q(xmlDoc, 'PmtInf'));
        let tpl = null;
        for (let k = pmts.length - 1; k >= 0; k--) { if (q(pmts[k], 'CdtTrfTxInf').length) { tpl = pmts[k]; break; } }
        if (!tpl) { toast('Brak szablonu pozycji.'); return; }
        const clone = tpl.cloneNode(true);
        Array.from(q(clone, 'CdtTrfTxInf')).slice(1).forEach(t => t.parentNode.removeChild(t));
        const tx = q(clone, 'CdtTrfTxInf')[0];
        const setT = (n, name, val) => { const e = first(n, name); if (e) e.textContent = val; };
        setT(tx, 'EndToEndId', '');
        const cd = first(tx, 'Cdtr'); if (cd) setT(cd, 'Nm', '');
        const acct = first(tx, 'CdtrAcct'); if (acct) { const ib = first(acct, 'IBAN'); if (ib) ib.textContent = ''; }
        const amtEl = first(tx, 'InstdAmt'); if (amtEl) amtEl.textContent = '';
        setT(tx, 'Ustrd', '');
        const pid = first(clone, 'PmtInfId'); if (pid) pid.textContent = 'Refund_new_' + (++addRow._n);
        const init = first(xmlDoc, 'CstmrCdtTrfInitn');
        init.appendChild(xmlDoc.createTextNode('\n        '));
        init.appendChild(clone);
        model.push(makeRow(tx, clone));
        validateAll(); renderTable(); updateSummary();
        const box = document.querySelector('#sepa-tbody'); if (box && box.lastElementChild) box.lastElementChild.scrollIntoView({ block: 'nearest' });
        toast('Dodano pusta pozycje - uzupelnij dane.');
    }

    function markDuplicates() {
        const ibanMap = {}, e2eMap = {};
        model.forEach((r, i) => {
            const ib = cleanupIban(r.iban);
            if (ib) (ibanMap[ib] = ibanMap[ib] || []).push(i);
            if (r.e2e) (e2eMap[r.e2e] = e2eMap[r.e2e] || []).push(i);
        });
        Object.values(ibanMap).forEach(idxs => { if (idxs.length > 1) idxs.forEach(i => model[i].warns.push('zdublowany IBAN (poz. ' + idxs.map(x => x + 1).join(', ') + ')')); });
        Object.values(e2eMap).forEach(idxs => { if (idxs.length > 1) idxs.forEach(i => model[i].warns.push('zdublowany EndToEndId')); });
    }

    function validateRow(r) {
        r.errs = []; r.warns = [];
        // IBAN: ok / format do normalizacji / brak prefiksu kraju / realny blad
        const res = resolveIban(r.iban, r.debtorCc);
        if (res.kind === 'format') r.errs.push('IBAN: format do poprawy (spacje/wielkosc liter/prefiks) -> "Popraw zaznaczone"');
        else if (res.kind === 'prefix') r.errs.push('IBAN: brak prefiksu kraju - dodac ' + res.cc + ' (auto) -> "Popraw zaznaczone"');
        else if (res.kind === 'manual') res.errs.forEach(e => r.errs.push('IBAN: ' + e));
        // kwota
        const c = centsOf(r.amt);
        if (isNaN(c)) r.errs.push('kwota: format (' + (r.amt || 'puste') + ')');
        else if (c <= 0) r.errs.push('kwota: musi byc > 0');
        // waluta
        if (!r.ccy) r.errs.push('brak waluty');
        else if (!CCY.has(r.ccy.toUpperCase())) r.warns.push('nietypowa waluta: ' + r.ccy);
        // nazwa / tytul - znaki spoza SEPA
        if (hasNonSepa(r.nm)) r.warns.push('nazwa: znaki spoza SEPA (mozna transliterowac)');
        if (hasNonSepa(r.ustrd)) r.warns.push('tytul: znaki spoza SEPA (mozna transliterowac)');
    }
    function validateAll() { model.forEach(validateRow); markDuplicates(); }

    // ---------- Zapis do XML + pobranie ----------
    function writeModelToDoc() {
        model.forEach(r => {
            if (r.nodes.ibanEl) r.nodes.ibanEl.textContent = cleanupIban(r.iban);
            if (r.nodes.nmEl) r.nodes.nmEl.textContent = r.nm;
            if (r.nodes.amtEl) {
                const c = centsOf(r.amt);
                r.nodes.amtEl.textContent = isNaN(c) ? r.amt : fmt2(c);
                if (r.ccy) r.nodes.amtEl.setAttribute('Ccy', r.ccy.toUpperCase());
            }
            const ustrdEl = first(r.nodes.tx, 'Ustrd');
            if (ustrdEl) ustrdEl.textContent = r.ustrd;
            const e2eEl = first(r.nodes.tx, 'EndToEndId');
            if (e2eEl) e2eEl.textContent = r.e2e;
        });
        recomputeSums();
    }
    function recomputeSums() {
        // per PmtInf
        let grpCents = 0, grpN = 0;
        Array.from(q(xmlDoc, 'PmtInf')).forEach(pmt => {
            let cents = 0, n = 0;
            Array.from(q(pmt, 'CdtTrfTxInf')).forEach(tx => {
                const a = first(tx, 'InstdAmt');
                const c = a ? centsOf(a.textContent) : NaN;
                if (!isNaN(c)) { cents += c; }
                n++;
            });
            const cs = first(pmt, 'CtrlSum'); if (cs) cs.textContent = fmt2(cents);
            const nb = first(pmt, 'NbOfTxs'); if (nb) nb.textContent = String(n);
            grpCents += cents; grpN += n;
        });
        const gh = first(xmlDoc, 'GrpHdr');
        if (gh) {
            const cs = first(gh, 'CtrlSum'); if (cs) cs.textContent = fmt2(grpCents);
            const nb = first(gh, 'NbOfTxs'); if (nb) nb.textContent = String(grpN);
        }
    }
    function download() {
        writeModelToDoc();
        const xml = new XMLSerializer().serializeToString(xmlDoc);
        const blob = new Blob([xml], { type: 'application/xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    // ---------- Akcje ----------
    function applyFixSelected() {
        let fixed = 0, left = 0;
        model.forEach(r => {
            if (!r.sel) return;
            const res = resolveIban(r.iban, r.debtorCc);
            if ((res.kind === 'format' || res.kind === 'prefix') && res.value && r.iban !== res.value) { r.iban = res.value; fixed++; }
            else if (res.kind === 'manual') left++;        // realny blad, bez bezpiecznej auto-poprawki
        });
        validateAll(); renderTable(); updateSummary();
        toast(`Poprawiono IBAN: ${fixed}. Wymaga recznej poprawki: ${left}.`);
    }
    function applyTranslit() {
        let n = 0;
        model.forEach(r => {
            if (r.sel) {
                if (hasNonSepa(r.nm)) { r.nm = translit(r.nm); n++; }
                if (hasNonSepa(r.ustrd)) { r.ustrd = translit(r.ustrd); n++; }
            }
        });
        validateAll(); renderTable(); updateSummary();
        toast(`Transliterowano pol: ${n}.`);
    }
    function selectErrors() { model.forEach(r => r.sel = r.errs.length > 0); renderTable(); }
    function selectNone() { model.forEach(r => r.sel = false); renderTable(); }

    // ---------- UI ----------
    let panel, tbody, summaryEl, toastEl;

    function css() {
        const s = document.createElement('style');
        s.textContent = `
        #sepa-btn{position:fixed;right:16px;bottom:90px;z-index:2147483000;background:#FF2F00;color:#fff;border:none;border-radius:24px;padding:12px 16px;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}
        #sepa-btn:hover{background:#cc2600}
        #sepa-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483001;display:none;align-items:flex-start;justify-content:center}
        #sepa-panel{background:#fff;margin:24px;width:min(1200px,96vw);max-height:92vh;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;font:13px system-ui,sans-serif;color:#111}
        #sepa-panel h2{margin:0;font-size:15px}
        .sepa-head{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#f8fafc}
        .sepa-x{margin-left:auto;background:#ef4444;color:#fff;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px}
        .sepa-body{padding:12px 16px;overflow:auto}
        .sepa-drop{border:2px dashed #cbd5e1;border-radius:8px;padding:18px;text-align:center;color:#475569;background:#f8fafc}
        .sepa-drop.drag{border-color:#0f766e;background:#ecfeff}
        .sepa-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
        .sepa-bar button{padding:7px 11px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer;font:600 12px system-ui}
        .sepa-bar button.primary{background:#FF2F00;color:#fff;border-color:#0f766e}
        .sepa-bar button.warn{background:#b45309;color:#fff;border-color:#b45309}
        .sepa-sum{font-size:12px;color:#334155;margin-left:auto;text-align:right;line-height:1.5}
        table.sepa-t{border-collapse:collapse;width:100%;font-size:12px}
        table.sepa-t th,table.sepa-t td{border:1px solid #e5e7eb;padding:3px 6px;text-align:left;vertical-align:top}
        table.sepa-t th{position:sticky;top:0;background:#f1f5f9;z-index:1}
        table.sepa-t input{border:1px solid transparent;background:transparent;font:12px ui-monospace,monospace;width:100%;box-sizing:border-box;padding:2px 3px}
        table.sepa-t input:focus{border-color:#0f766e;background:#fff;outline:none}
        tr.err{background:#fef2f2}
        tr.warnrow{background:#fffbeb}
        td.st{font:11px system-ui;white-space:normal;min-width:180px}
        td.st .e{color:#b91c1c;display:block}
        td.st .w{color:#b45309;display:block}
        td.st .ok{color:#15803d}
        .sepa-num{width:150px}
        #sepa-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:8px;z-index:2147483002;font:13px system-ui;display:none}
        `;
        document.head.appendChild(s);
    }

    function build() {
        css();
        const btn = document.createElement('button');
        btn.id = 'sepa-btn'; btn.textContent = '€ Walidator SEPA';
        btn.onclick = openPanel;
        document.body.appendChild(btn);

        const ov = document.createElement('div'); ov.id = 'sepa-overlay';
        ov.innerHTML = `
          <div id="sepa-panel">
            <div class="sepa-head">
              <h2>€ Walidator SEPA (pain.001)</h2>
              <span style="font-size:11px;color:#64748b">v1.5</span>
              <button class="sepa-x" title="Zamknij">×</button>
            </div>
            <div class="sepa-body">
              <div class="sepa-drop" id="sepa-drop">
                <div style="margin-bottom:8px"><b>Wgraj plik</b> — przeciagnij tutaj albo
                <button id="sepa-pick" style="padding:6px 14px;border:1px solid #0f766e;background:#FF2F00;color:#fff;border-radius:6px;cursor:pointer;font-weight:600">📂 Wybierz plik</button></div>
                <input type="file" id="sepa-file" accept=".xml,.hct,.kpc,text/xml,application/xml" style="display:none">
                <div style="border-top:1px solid #e2e8f0;margin-top:6px;padding-top:8px"><b>...albo wklej XML</b>
                <textarea id="sepa-paste" placeholder="wklej tresc XML tutaj" style="width:100%;height:60px;font:12px ui-monospace,monospace;margin-top:4px"></textarea>
                <button id="sepa-load" style="margin-top:6px;padding:6px 12px;border:1px solid #64748b;background:#fff;color:#334155;border-radius:6px;cursor:pointer">Wczytaj z pola</button></div>
              </div>
              <div id="sepa-content"></div>
            </div>
          </div>`;
        document.body.appendChild(ov);
        panel = ov;

        ov.querySelector('.sepa-x').onclick = () => ov.style.display = 'none';
        ov.addEventListener('click', e => { if (e.target === ov) ov.style.display = 'none'; });

        const fileInput = ov.querySelector('#sepa-file');
        const drop = ov.querySelector('#sepa-drop');
        ov.querySelector('#sepa-pick').onclick = () => fileInput.click();
        fileInput.onchange = e => { const f = e.target.files[0]; if (f) readFile(f); };
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
        drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) readFile(f); });
        ov.querySelector('#sepa-load').onclick = () => {
            const t = ov.querySelector('#sepa-paste').value.trim();
            if (!t) return;
            fileName = 'refunds_fixed.xml';
            loadText(t);
        };

        const te = document.createElement('div'); te.id = 'sepa-toast'; document.body.appendChild(te); toastEl = te;
    }

    function readFile(f) {
        fileName = f.name.replace(/\.xml$/i, '') + '_fixed.xml';
        const r = new FileReader();
        r.onload = () => loadText(r.result);
        r.readAsText(f, 'UTF-8');
    }
    function loadText(text) {
        try {
            parseAndBuild(text);
            renderContent();
            selectErrors();
            updateSummary();
        } catch (e) {
            document.getElementById('sepa-content').innerHTML = `<div style="color:#b91c1c;padding:10px;border:1px solid #fecaca;background:#fef2f2;border-radius:6px">${e.message}</div>`;
        }
    }

    function renderContent() {
        const c = document.getElementById('sepa-content');
        c.innerHTML = `
          <div class="sepa-bar">
            <button class="primary" id="sepa-fix">Popraw zaznaczone (IBAN)</button>
            <button class="warn" id="sepa-tr">Transliteruj nazwy/tytuly zaznaczonych</button>
            <button id="sepa-selerr">Zaznacz bledne</button>
            <button id="sepa-selnone">Odznacz wszystko</button>
            <button id="sepa-add" style="background:#047857;color:#fff;border-color:#047857">➕ Dodaj pozycje</button>
            <button id="sepa-loadfile">📂 Wczytaj plik</button>
            <button id="sepa-dl" style="background:#1d4ed8;color:#fff;border-color:#1d4ed8">⬇ Pobierz poprawiony XML</button>
            <div class="sepa-sum" id="sepa-summary"></div>
          </div>
          <div style="max-height:60vh;overflow:auto;border:1px solid #e5e7eb;border-radius:6px">
            <table class="sepa-t">
              <thead><tr>
                <th style="width:28px"><input type="checkbox" id="sepa-all"></th>
                <th style="width:34px">#</th>
                <th style="width:110px">E2E / ref</th>
                <th>Odbiorca</th>
                <th style="width:290px">IBAN</th>
                <th style="width:90px">Kwota</th>
                <th style="width:60px">Ccy</th>
                <th>Status</th>
                <th style="width:40px"></th>
              </tr></thead>
              <tbody id="sepa-tbody"></tbody>
            </table>
          </div>`;
        tbody = c.querySelector('#sepa-tbody');
        summaryEl = c.querySelector('#sepa-summary');
        c.querySelector('#sepa-fix').onclick = applyFixSelected;
        c.querySelector('#sepa-tr').onclick = applyTranslit;
        c.querySelector('#sepa-selerr').onclick = selectErrors;
        c.querySelector('#sepa-selnone').onclick = selectNone;
        c.querySelector('#sepa-add').onclick = addRow;
        c.querySelector('#sepa-loadfile').onclick = () => panel.querySelector('#sepa-file').click();
        c.querySelector('#sepa-dl').onclick = download;
        c.querySelector('#sepa-all').onchange = e => { model.forEach(r => r.sel = e.target.checked); renderTable(); };
        renderTable();
    }

    function statusHtml(r) {
        if (r.errs.length === 0 && r.warns.length === 0) return '<span class="ok">✓ ok</span>';
        return r.errs.map(e => `<span class="e">✗ ${e}</span>`).join('') + r.warns.map(w => `<span class="w">▲ ${w}</span>`).join('');
    }

    function renderTable() {
        if (!tbody) return;
        const frag = document.createDocumentFragment();
        model.forEach((r, i) => {
            const tr = document.createElement('tr');
            tr.className = r.errs.length ? 'err' : (r.warns.length ? 'warnrow' : '');
            const cbTd = document.createElement('td');
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = r.sel;
            cb.onchange = () => { r.sel = cb.checked; };
            cbTd.appendChild(cb); tr.appendChild(cbTd);

            const idTd = document.createElement('td'); idTd.textContent = i + 1; tr.appendChild(idTd);

            tr.appendChild(inputCell(r, 'e2e', ''));
            tr.appendChild(inputCell(r, 'nm', ''));
            tr.appendChild(inputCell(r, 'iban', ''));
            tr.appendChild(inputCell(r, 'amt', 'sepa-num'));
            tr.appendChild(inputCell(r, 'ccy', ''));

            const stTd = document.createElement('td'); stTd.className = 'st'; stTd.innerHTML = statusHtml(r);
            tr.appendChild(stTd);

            const delTd = document.createElement('td'); delTd.style.textAlign = 'center';
            const del = document.createElement('button'); del.textContent = '✕'; del.title = 'Usun pozycje';
            del.style.cssText = 'border:none;background:#fee2e2;color:#b91c1c;border-radius:4px;cursor:pointer;font-size:12px;padding:1px 7px;line-height:18px';
            del.onclick = () => deleteRow(i);
            delTd.appendChild(del); tr.appendChild(delTd);
            frag.appendChild(tr);
        });
        tbody.innerHTML = '';
        tbody.appendChild(frag);
    }

    function inputCell(r, key, cls) {
        const td = document.createElement('td');
        const inp = document.createElement('input');
        if (cls) inp.className = cls;
        inp.value = r[key] == null ? '' : r[key];
        const revalidate = () => {
            r[key] = inp.value;
            try { validateRow(r); } catch (e) {}
            const tr = td.parentElement;
            if (tr) {
                tr.className = r.errs.length ? 'err' : (r.warns.length ? 'warnrow' : '');
                const st = tr.querySelector('td.st');
                if (st) st.innerHTML = statusHtml(r);
            }
            updateSummary();
        };
        inp.oninput = revalidate;   // rewalidacja na biezaco (nie tylko po blur)
        inp.onchange = revalidate;
        td.appendChild(inp);
        return td;
    }

    function updateSummary() {
        if (!summaryEl) return;
        let cents = 0, bad = 0, errs = 0, warns = 0;
        model.forEach(r => {
            const c = centsOf(r.amt); if (!isNaN(c)) cents += c;
            if (r.errs.length) { bad++; errs += r.errs.length; }
            if (r.warns.length) warns += r.warns.length;
        });
        const hdr = xmlDoc ? txt(first(xmlDoc, 'GrpHdr'), 'CtrlSum') : '';
        const sumOk = hdr && fmt2(cents) === hdr;
        summaryEl.innerHTML =
            `Przelewy: <b>${model.length}</b> &nbsp; Suma: <b>${fmt2(cents)}</b> ` +
            (hdr ? `(naglowek: ${hdr}${sumOk ? ' ✓' : ' — zostanie przeliczony przy pobraniu'}) ` : '') +
            `<br>Pozycje z bledem: <b style="color:${bad ? '#b91c1c' : '#15803d'}">${bad}</b> &nbsp; bledy: ${errs} &nbsp; ostrzezenia: ${warns}`;
    }

    addRow._n = 0;

    function openPanel() { panel.style.display = 'flex'; }
    function toast(msg) {
        if (!toastEl) return;
        toastEl.textContent = msg; toastEl.style.display = 'block';
        clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.style.display = 'none', 3200);
    }

    build();
})();
    }

    function init_issuelog() {
(function () {
    'use strict';
    if (window.__issuePaidLoaded) return;
    window.__issuePaidLoaded = true;

    const API = location.origin + '/api/issueLog';
    const API_ROOT = location.origin + '/api';
    const REASSIGN_PEOPLE = [
        { name: 'Agnieszka Dylewska', username: 'ADylewska' },
        { name: 'Agnieszka Gradowska', username: 'AgGradowska' },
        { name: 'Agnieszka Krzeszewska', username: 'Krzeszewska' },
        { name: 'Aleksandra Brysik', username: 'AlBrysik' },
        { name: 'Anna Kąkol', username: 'Kakol' },
        { name: 'Anna Zyga', username: 'AZyga' },
        { name: 'Antonina Krefta', username: 'AnKrefta' },
        { name: 'Beata Skrzypiec', username: 'BSkrzypiec' },
        { name: 'Dawid Grzegowski', username: 'DGrzegowski' },
        { name: 'Dominika Matulka', username: 'Matulka' },
        { name: 'Dorota Kwiatkowska', username: 'DKwiatkowska' },
        { name: 'Irena Stolarek', username: 'IStolarek' },
        { name: 'Joanna Kozak', username: 'JKozak' },
        { name: 'Karolina Maruszewska-Szwertfeger', username: 'KSzwertfeger' },
        { name: 'Katarzyna Półtorak', username: 'KPoltorak' },
        { name: 'Magdalena Kardaś', username: 'MaKardas' },
        { name: 'Magdalena Śluborska', username: 'Sluborska' },
        { name: 'Magdalena Żarska', username: 'ZarskaM' },
        { name: 'Malwina Sawicka', username: 'MalSawicka' },
        { name: 'Marta Bożek', username: 'MarBozek' },
        { name: 'Marta Frąckowiak', username: 'MaFrackowiak' },
        { name: 'Martyna Bednarz', username: 'MaBednarz' },
        { name: 'Monika Zwolińska', username: 'Zwolinska' },
        { name: 'Nikola Mucha', username: 'MuchaN' },
        { name: 'Patrycja Senderska', username: 'Senderska' },
        { name: 'Paulina Rysz', username: 'PRysz' },
        { name: 'Piotr Radomiński', username: 'Radominski' },
        { name: 'Sylwia Karkosz', username: 'Karkosz' },
        { name: 'Teresa Swora', username: 'TSwora' },
        { name: 'Tomasz Winiarski', username: 'TWiniarski' },
        { name: 'Urszula Wiese', username: 'UWiese' },
        { name: 'Weronika Rakowska', username: 'WRakowska' },
    ];
    function reaName(u) { const p = REASSIGN_PEOPLE.find(x => x.username === u); return p ? p.name : u; }
    const GROUP_FALLBACK = 'Shipping Invoice Payment';

    // ---------- API ----------
    async function fetchIssue(id) {
        const r = await fetch(`${API}/list/?page_id=${id}&show_with_inactive=1`, { credentials: 'same-origin' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const it = j && j.issue_list && j.issue_list[0];
        if (!it) throw new Error('brak issue_list');
        return it;
    }
    // Zmiana wartosci pola dropdown (np. PAID). Zwraca po weryfikacji: true/false.
    async function saveFieldValue(issueId, fieldId, optId, matchFn) {
        const qs = `issue_id=${issueId}`
            + `&additional_fields%5B0%5D%5Bfield_id%5D=${fieldId}`
            + `&additional_fields%5B0%5D%5Bvalue%5D=${optId}`
            + `&additional_fields%5B0%5D%5Bissuelog_flow_id%5D=`;
        await fetch(`${API}/saveAdditionalFields/?${qs}`, { credentials: 'same-origin' });
        await sleep(400);
        const it = await fetchIssue(issueId);
        const f = matchFn(it);
        return f && String(f.value) === String(optId);
    }
    async function savePaid(issueId, fieldId, optId) {
        return saveFieldValue(issueId, fieldId, optId, it => fieldByName(it, 'PAID - Finance', 'PAID'));
    }

    // ---------- parsowanie pol ----------
    function fieldByName(issue, ...names) {
        const af = issue.additional_fields || {};
        for (const arr of Object.values(af)) {
            if (!Array.isArray(arr)) continue;
            for (const f of arr) {
                const nm = (f.name || '').trim();
                if (names.some(n => nm === n || nm.toLowerCase() === n.toLowerCase())) return f;
            }
        }
        return null;
    }
    function fieldByPartial(issue, sub) {
        sub = sub.toLowerCase();
        const af = issue.additional_fields || {};
        for (const arr of Object.values(af)) { if (!Array.isArray(arr)) continue; for (const f of arr) { if ((f.name || '').toLowerCase().includes(sub)) return f; } }
        return null;
    }
    // Dopasowanie pola po wyrazeniu regularnym na nazwie (odporne na warianty pisowni miedzy typami issue).
    function fieldByRe(issue, re) {
        const af = issue.additional_fields || {};
        for (const arr of Object.values(af)) { if (!Array.isArray(arr)) continue; for (const f of arr) { if (re.test(f.name || '')) return f; } }
        return null;
    }
    function fieldVal(f) { if (!f) return ''; const t = (f.text_value == null ? '' : String(f.text_value)).trim(); if (t !== '') return t; return (f.value == null ? '' : String(f.value)).trim(); }
    function optId(f, answer) {
        if (!f || !Array.isArray(f.values)) return null;
        const o = f.values.find(v => (v.answer_value || '').trim().toLowerCase() === answer.toLowerCase());
        return o ? o.id : null;
    }
    function fieldObj(f) { return f ? { id: f.field_id, value: String(f.value), text: (f.text_value || '').trim(), yes: optId(f, 'Yes'), no: optId(f, 'No'), options: (f.values || []).map(o => ({ id: String(o.id), label: o.answer_value })) } : null; }
    function parseIssue(it) {
        // Dopasowanie po slowach kluczowych — dziala na roznych typach issue (Invoice / Invoice(s) / rozna pisownia).
        const paid = fieldByRe(it, /paid/i);
        const amtF = fieldByRe(it, /value|amount/i);
        const amtRaw = fieldVal(amtF);
        const pcf = fieldByRe(it, /confirmation/i);
        return {
            id: it.id,
            subject: it.issue || '',
            status: (it.status || '').toLowerCase(),
            closed: it.closed === '1',
            spolka: fieldVal(fieldByRe(it, /payer|sp[óo][łl]ka/i)),
            company: fieldVal(fieldByRe(it, /issuer|company/i)),
            invoice: fieldVal(fieldByRe(it, /invoice.{0,4}no|\bnumber\b/i)),
            amount: amtRaw,
            currency: fieldVal(fieldByRe(it, /currency/i)) || currencyFromAmount(amtRaw),
            approval: fieldVal(fieldByRe(it, /approval/i)),
            payConf: fieldObj(pcf),
            paidField: fieldObj(paid),
        };
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Dopisuje nowa linie statusu do wiersza (zachowuje poprzednie, max 6).
    function statusLine(tr) {
        const st = tr.querySelector('.st'); if (!st) return { innerHTML: '' };
        while (st.children.length >= 6) st.removeChild(st.firstChild);
        const line = document.createElement('div'); line.className = 'st-line'; st.appendChild(line); return line;
    }
    // ---------- komentarze: filtrowanie systemowych + alerty ----------
    const SYSTEM_TYPES = new Set(['issuelog_comment_ping', 'issuelog_comment']);
    const SYSTEM_PATTERNS = /^(Files have been attached|Solving person changed|Issue (closed|reopened)|Set ping days|Priority changed|Due date|Responsible( person)? changed|Status changed|Restricted access|Ping reminder|Reminder set|Issue moved|Board column|Department changed|Label)/i;
    const ALERT_RE = /(don'?t\s*pay|do\s*not\s*pay|nie\s*p[łl]a|wstrzyma|hold\b|\bstop\b|\bonly\b|\btylko\b|cz[eę][sś]ciow|partial|\bwait\b|czekaj|anuluj|\bcancel\b|blokad|zablokuj)/i;
    function stripHtml(h) { return String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); }
    function isSystemComment(c) {
        if (SYSTEM_TYPES.has(c.comment_type)) return true;
        if (SYSTEM_PATTERNS.test(stripHtml(c.comment))) return true;
        return false;
    }
    function hasAlert(list) { return list.some(c => ALERT_RE.test(c.text)); }
    function truncate(s, nn) { s = String(s || ''); return s.length > nn ? s.slice(0, nn) + '…' : s; }
    async function fetchComments(id) {
        const r = await fetch(`${API}/comments/?comment_type=issuelog&page_id=${id}`, { credentials: 'same-origin' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        return (j.comments || []).filter(c => !isSystemComment(c)).map(c => ({
            text: stripHtml(c.comment), author: c.full_username || c.username || '?', date: c.create_date || ''
        }));
    }

    function detectIssues(text) {
        // 6-cyfrowe liczby, ale TYLKO samodzielne (otoczone separatorem/#/:/poczatkiem-koncem).
        // Odrzuca fragmenty w dluzszych ciagach jak numery FV: "887126/91", ".../000573", "1281126".
        const re = /(^|[\s#:,.()\[\]])(\d{6})(?=$|[\s,.:)\]])/g;
        const ids = new Set();
        let m;
        while ((m = re.exec(text)) !== null) { ids.add(m[2]); re.lastIndex = m.index + 1; }
        return [...ids];
    }

    // pobieranie z limitem rownoleglosci
    async function loadAll(ids, withComments, onProgress) {
        const out = new Array(ids.length);
        let idx = 0, done = 0;
        const worker = async () => {
            while (idx < ids.length) {
                const i = idx++;
                try {
                    const row = parseIssue(await fetchIssue(ids[i]));
                    if (withComments) { try { row.comments = await fetchComments(ids[i]); } catch (e) { row.comments = []; } }
                    out[i] = { ok: true, row };
                } catch (e) { out[i] = { ok: false, id: ids[i], error: e.message }; }
                onProgress(++done, ids.length);
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
        return out;
    }

    // ---------- stan ----------
    let rows = [];   // {id, subject, spolka, company, invoice, amount, currency, approval, paidField, sel, _busy, _verify}

    // ---------- UI ----------
    let panel, tbody, summaryEl, toastEl;

    function css() {
        const s = document.createElement('style');
        s.textContent = `
        #ilp-btn{position:fixed;right:16px;bottom:150px;z-index:2147483000;background:#FF2F00;color:#fff;border:none;border-radius:24px;padding:12px 16px;font:600 13px system-ui;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}
        #ilp-btn:hover{background:#cc2600}
        #ilp-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483001;display:none;align-items:flex-start;justify-content:center}
        #ilp-panel{background:#fff;margin:20px;width:min(1250px,97vw);max-height:93vh;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;font:13px system-ui;color:#111}
        .ilp-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#f8fafc}
        .ilp-head h2{margin:0;font-size:15px}
        .ilp-x{margin-left:auto;background:#ef4444;color:#fff;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px}
        .ilp-body{padding:12px 16px;overflow:auto}
        .ilp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
        .ilp-bar button{padding:7px 11px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer;font:600 12px system-ui}
        .ilp-bar button.primary{background:#FF2F00;color:#fff;border-color:#7c3aed}
        .ilp-bar button.green{background:#047857;color:#fff;border-color:#047857}
        .ilp-bar button.red{background:#b91c1c;color:#fff;border-color:#b91c1c}
        .ilp-sum{margin-left:auto;font-size:12px;color:#334155;text-align:right}
        table.ilp-t{border-collapse:collapse;width:100%;font-size:12px}
        table.ilp-t th,table.ilp-t td{border:1px solid #e5e7eb;padding:4px 7px;text-align:left;vertical-align:top}
        table.ilp-t th{position:sticky;top:0;background:#f1f5f9;z-index:1}
        td.num{text-align:right;font-variant-numeric:tabular-nums}
        .paid-y{color:#15803d;font-weight:600}.paid-n{color:#b91c1c;font-weight:600}
        .ilp-toggle{padding:3px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font:600 11px system-ui}
        .st-ok{color:#15803d}.st-err{color:#b91c1c}.st-busy{color:#b45309}
        td.st{min-width:200px;max-width:300px}
        .st-line{padding:1px 0;white-space:normal;word-break:break-word;line-height:1.35;font-size:11px}
        .st-line+.st-line{border-top:1px dashed #e5e7eb;margin-top:1px;padding-top:2px}
        td.cmts{min-width:200px;max-width:280px}
        .ilp-cmts-row td{background:#fffbeb}
        #ilp-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:8px;z-index:2147483002;font:13px system-ui;display:none}
        `;
        document.head.appendChild(s);
    }

    function build() {
        css();
        const b = document.createElement('button'); b.id = 'ilp-btn'; b.textContent = '📋 Issue / PAID';
        b.onclick = () => panel.style.display = 'flex';
        document.body.appendChild(b);

        const ov = document.createElement('div'); ov.id = 'ilp-ov';
        ov.innerHTML = `
          <div id="ilp-panel">
            <div class="ilp-head"><h2>📋 Issue Log — Faktury / PAID</h2><span style="font-size:11px;color:#64748b">v0.24</span><button class="ilp-x">×</button></div>
            <div class="ilp-body">
              <div><b>Wklej liste</b> (tabela logow albo maile) — skrypt wyciagnie 6-cyfrowe numery Issue:</div>
              <textarea id="ilp-paste" style="width:100%;height:90px;font:12px ui-monospace,monospace;margin-top:4px" placeholder="wklej tutaj..."></textarea>
              <div class="ilp-bar">
                <button class="primary" id="ilp-load">Zaladuj</button>
                <label style="font-size:12px;color:#334155"><input type="checkbox" id="ilp-with-cmts" checked> pobierz komentarze</label>
                <span id="ilp-detect" style="font-size:12px;color:#475569"></span>
              </div>
              <div id="ilp-content"></div>
            </div>
          </div>`;
        document.body.appendChild(ov); panel = ov;
        ov.querySelector('.ilp-x').onclick = () => ov.style.display = 'none';
        ov.addEventListener('click', e => { if (e.target === ov) ov.style.display = 'none'; });

        const ta = ov.querySelector('#ilp-paste');
        const det = ov.querySelector('#ilp-detect');
        ta.addEventListener('input', () => { const n = detectIssues(ta.value).length; det.textContent = n ? `wykryto ${n} numerow` : ''; });
        ov.querySelector('#ilp-load').onclick = () => doLoad(detectIssues(ta.value));

        const t = document.createElement('div'); t.id = 'ilp-toast'; document.body.appendChild(t); toastEl = t;
    }

    async function doLoad(ids) {
        const c = document.getElementById('ilp-content');
        if (!ids.length) { c.innerHTML = '<div style="color:#b91c1c">Nie znaleziono numerow Issue (6 cyfr).</div>'; return; }
        c.innerHTML = `<div id="ilp-prog" style="padding:8px;color:#475569">Pobieram 0/${ids.length}...</div>`;
        const prog = document.getElementById('ilp-prog');
        const withCmts = (function () { const cb = document.getElementById('ilp-with-cmts'); return cb ? cb.checked : true; })();
        const res = await loadAll(ids, withCmts, (d, t) => { prog.textContent = `Pobieram ${d}/${t}...`; });
        rows = res.map((r, i) => r.ok ? { ...r.row, sel: false } : { id: ids[i], error: r.error, sel: false });
        renderContent();
    }

    function renderContent() {
        const c = document.getElementById('ilp-content');
        c.innerHTML = `
          <div class="ilp-bar">
            <button id="ilp-all">Zaznacz wszystkie</button>
            <button id="ilp-none">Odznacz</button>
            <button class="green" id="ilp-paid-yes">Zaznaczonym PAID = Yes</button>
            <button class="red" id="ilp-paid-no">Zaznaczonym PAID = No</button>
            <button id="ilp-clear">🗑 Wyczyść tabelę</button>
            <span style="border-left:1px solid #cbd5e1;height:20px;margin:0 4px"></span>
            <input id="ilp-cmt-mass" value="Paid." style="padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;font:12px system-ui;width:110px">
            <button class="primary" id="ilp-cmt-add">💬 Dodaj komentarz zaznaczonym</button>
            <button id="ilp-zip">📦 ZIP plików zaznaczonych</button>
            <button id="ilp-upl">➕ Wgraj plik do zaznaczonych</button>
            <select id="ilp-rea-mass" style="padding:5px;border:1px solid #cbd5e1;border-radius:6px;font:12px system-ui"></select>
            <button id="ilp-rea-btn">👤 Reassign zaznaczonym</button>
            <button id="ilp-cmts-load">💬 Wczytaj komentarze zaznaczonych</button>
            <div class="ilp-sum" id="ilp-summary"></div>
          </div>
          <div style="max-height:64vh;overflow:auto;border:1px solid #e5e7eb;border-radius:6px">
          <table class="ilp-t"><thead><tr>
            <th style="width:26px"><input type="checkbox" id="ilp-cba"></th>
            <th>Issue</th><th>Spolka</th><th>Company</th><th>FV</th><th>Amount</th><th>Ccy</th><th>Approval</th><th>Payment Confirm.</th><th>PAID</th><th>Reassign</th><th>Komentarze</th><th>Dodaj kom.</th><th>Pliki</th><th>Status</th>
          </tr></thead><tbody id="ilp-tbody"></tbody></table></div>`;
        tbody = c.querySelector('#ilp-tbody');
        summaryEl = c.querySelector('#ilp-summary');
        c.querySelector('#ilp-all').onclick = () => { rows.forEach(r => r.sel = !r.error); renderRows(); };
        c.querySelector('#ilp-none').onclick = () => { rows.forEach(r => r.sel = false); renderRows(); };
        c.querySelector('#ilp-cba').onchange = e => { rows.forEach(r => r.sel = e.target.checked && !r.error); renderRows(); };
        c.querySelector('#ilp-paid-yes').onclick = () => bulkPaid('Yes');
        c.querySelector('#ilp-paid-no').onclick = () => bulkPaid('No');
        c.querySelector('#ilp-clear').onclick = () => { rows = []; document.getElementById('ilp-content').innerHTML = ''; const d = document.getElementById('ilp-detect'); if (d) d.textContent = ''; };
        c.querySelector('#ilp-cmt-add').onclick = () => bulkComment(c.querySelector('#ilp-cmt-mass').value);
        c.querySelector('#ilp-zip').onclick = () => bulkZip();
        c.querySelector('#ilp-upl').onclick = () => bulkUpload();
        const rm = c.querySelector('#ilp-rea-mass'); rm.innerHTML = '<option value="">— osoba —</option>' + REASSIGN_PEOPLE.map(pp => `<option value="${pp.username}">${esc(pp.name)}</option>`).join('');
        c.querySelector('#ilp-rea-btn').onclick = () => bulkReassign(rm.value);
        c.querySelector('#ilp-cmts-load').onclick = () => bulkLoadComments();
        renderRows();
    }

    // Wyciaga liczbe z kwoty ignorujac walute/litery/symbole ("63 EUR", "CHF 62.34", "62,34 zl").
    function amountNumber(v) {
        if (v == null) return NaN;
        let x = String(v).replace(/[^\d.,\-]/g, '');
        if (!x) return NaN;
        const lc = x.lastIndexOf(','), ld = x.lastIndexOf('.');
        if (lc > -1 && ld > -1) x = (lc > ld) ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
        else if (lc > -1) { const cnt = (x.match(/,/g) || []).length, after = x.length - lc - 1; x = (cnt > 1 || after === 3) ? x.replace(/,/g, '') : x.replace(',', '.'); }
        else if (ld > -1) { const cnt = (x.match(/\./g) || []).length, after = x.length - ld - 1; if (cnt > 1 || after === 3) x = x.replace(/\./g, ''); }
        const num = parseFloat(x); return isNaN(num) ? NaN : num;
    }
    function amountDisplay(v) { const num = amountNumber(v); return isNaN(num) ? String(v || '') : num.toFixed(2); }
    function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function safeName(s) { return String(s || '').replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'brak'; }
    function currencyFromAmount(v) { const m = String(v || '').match(/\b(EUR|CHF|PLN|USD|GBP|CZK|HUF|SEK|NOK|DKK|RON|BGN|NGN)\b/i); return m ? m[1].toUpperCase() : ''; }
    function isYes(t) { return /^\s*yes\s*$/i.test(t || ''); }
    function isNo(t) { return /^\s*no\s*$/i.test(t || ''); }
    function companyKey(r) { return (r.company || '').trim(); }
    function sortRows() {
        rows.sort((a, b) => {
            if (a.error !== b.error) return a.error ? 1 : -1;
            const c = companyKey(a).toLowerCase().localeCompare(companyKey(b).toLowerCase());
            if (c) return c;
            return String(a.invoice || '').localeCompare(String(b.invoice || ''), undefined, { numeric: true });
        });
    }
    function proposedTitle(g) {
        const invs = g.map(r => String(r.invoice || '').trim()).filter(Boolean);
        invs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return invs.join(', ');
    }
    function sumAmount(g) {
        let cents = 0, cur = '';
        g.forEach(r => { const num = amountNumber(r.amount); if (!isNaN(num)) cents += Math.round(num * 100); if (r.currency) cur = r.currency; });
        return { sum: (cents / 100).toFixed(2), cur };
    }
    function renderRows() {
        sortRows();
        const groups = {};
        rows.forEach(r => { if (r.error) return; const k = companyKey(r); (groups[k] = groups[k] || []).push(r); });
        const frag = document.createDocumentFragment();
        let curCompany = null;
        rows.forEach(r => {
            if (!r.error && companyKey(r) !== curCompany) {
                curCompany = companyKey(r);
                const g = groups[curCompany];
                const agg = sumAmount(g);
                const title = proposedTitle(g);
                const hr = document.createElement('tr'); hr.className = 'ilp-grp';
                const gtd = document.createElement('td'); gtd.colSpan = 15;
                gtd.style.cssText = 'background:#eef2ff;padding:6px 10px;font-size:12px';
                const grp = g;
                const gcb = document.createElement('input'); gcb.type = 'checkbox'; gcb.title = 'Zaznacz całą firmę'; gcb.style.marginRight = '8px'; gcb.style.verticalAlign = 'middle';
                gcb.onchange = () => { grp.forEach(rr => { rr.sel = gcb.checked; const t = findTr(rr.id); if (t) { const cb = t.querySelector('input[type=checkbox]'); if (cb) cb.checked = gcb.checked; } }); updateSummary(); };
                gtd.appendChild(gcb);
                const gsp = document.createElement('span');
                gsp.innerHTML = `<b>🏢 ${esc(curCompany || '(brak firmy)')}</b> — ${g.length} fv, suma <b>${esc(agg.sum)} ${esc(agg.cur)}</b> &nbsp;|&nbsp; tytuł przelewu: <span style="font-family:ui-monospace,monospace">${esc(title)}</span> <button class="ilp-toggle ilp-copy">📋 Kopiuj tytuł</button>`;
                gtd.appendChild(gsp);
                hr.appendChild(gtd); frag.appendChild(hr);
                gsp.querySelector('.ilp-copy').onclick = () => { try { navigator.clipboard.writeText(title); toast('Skopiowano tytuł.'); } catch (e) { toast('Nie udało się skopiować.'); } };
            }
            const tr = document.createElement('tr');
            if (r.error) {
                tr.innerHTML = `<td></td><td>${link(r.id)}</td><td colspan="13" style="color:#b91c1c">błąd: ${esc(r.error)}</td>`;
                frag.appendChild(tr); return;
            }
            tr.innerHTML =
                `<td><input type="checkbox" ${r.sel ? 'checked' : ''}></td>` +
                `<td>${link(r.id)}</td>` +
                `<td>${esc(r.spolka)}</td><td>${esc(r.company)}</td><td>${esc(r.invoice)}</td>` +
                `<td class="num">${esc(amountDisplay(r.amount))}</td><td>${esc(r.currency)}</td><td>${esc(r.approval)}</td>` +
                `<td class="payconf"></td>` +
                `<td class="paidcell"></td>` +
                `<td class="rea"></td><td class="cmts"></td><td class="cmt"></td><td class="files"></td><td class="st"></td>`;
            tr.querySelector('input[type=checkbox]').onchange = e => { r.sel = e.target.checked; };
            if (r.paidField && r.paidField.options && r.paidField.options.length) {
                const pSel = document.createElement('select'); pSel.className = 'paidsel';
                pSel.style.cssText = 'font:12px system-ui;padding:2px 3px;border:1px solid #cbd5e1;border-radius:4px';
                pSel.innerHTML = r.paidField.options.map(o => `<option value="${esc(o.id)}" ${o.id === r.paidField.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
                const colorP = () => { const t = r.paidField.text || ''; pSel.style.color = isYes(t) ? '#15803d' : (isNo(t) ? '#b91c1c' : ''); pSel.style.fontWeight = '600'; };
                colorP();
                pSel.onchange = async () => { await changePaid(r, tr, pSel.value, pSel); colorP(); };
                tr.querySelector('.paidcell').appendChild(pSel);
            } else if (r.paidField) { tr.querySelector('.paidcell').textContent = r.paidField.text || '—'; }
            const reaSel = document.createElement('select');
            reaSel.style.cssText = 'font:12px system-ui;padding:2px 3px;border:1px solid #cbd5e1;border-radius:4px';
            reaSel.innerHTML = '<option value="">reassign…</option>' + REASSIGN_PEOPLE.map(pp => `<option value="${pp.username}">${esc(pp.name)}</option>`).join('');
            reaSel.onchange = () => { if (reaSel.value) reassignRow(r, tr, reaSel.value, reaSel); };
            tr.querySelector('.rea').appendChild(reaSel);
            const pcCell = tr.querySelector('.payconf');
            if (r.payConf && r.payConf.options && r.payConf.options.length) {
                const pcSel = document.createElement('select');
                pcSel.style.cssText = 'font:12px system-ui;padding:2px 3px;border:1px solid #cbd5e1;border-radius:4px';
                pcSel.innerHTML = r.payConf.options.map(o => `<option value="${esc(o.id)}" ${o.id === r.payConf.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
                const colorPc = () => { const t = r.payConf.text || ''; pcSel.style.color = /^\s*(yes|attached|tak)/i.test(t) ? '#15803d' : (/^\s*(no|not|brak|nie)/i.test(t) ? '#b91c1c' : ''); pcSel.style.fontWeight = '600'; };
                colorPc();
                pcSel.onchange = async () => { await changePayConf(r, tr, pcSel.value, pcSel); colorPc(); };
                pcCell.appendChild(pcSel);
            } else { pcCell.textContent = r.payConf ? (r.payConf.text || '—') : '—'; }
            const cmtCell = tr.querySelector('.cmt');
            const inp = document.createElement('input');
            inp.value = 'Paid.'; inp.className = 'cmt-inp';
            inp.style.cssText = 'width:100px;padding:2px 5px;border:1px solid #cbd5e1;border-radius:4px;font:12px system-ui';
            const add = document.createElement('button'); add.className = 'ilp-toggle'; add.textContent = 'Dodaj';
            add.style.marginLeft = '4px';
            add.onclick = () => addComment(r, tr, inp.value);
            cmtCell.appendChild(inp); cmtCell.appendChild(add);
            // pliki
            const fb = document.createElement('button'); fb.className = 'ilp-toggle'; fb.textContent = '📎';
            fb.title = 'Pokaż pliki'; fb.onclick = () => toggleFiles(r, tr, fb);
            tr.querySelector('.files').appendChild(fb);
            renderCommentCell(r, tr);
            frag.appendChild(tr);
        });
        tbody.innerHTML = ''; tbody.appendChild(frag);
        updateSummary();
    }

    // ---------- pliki ----------
    async function fetchFiles(id) {
        const r = await fetch(`${API}/getIssueImages/?page_id=${id}`, { credentials: 'same-origin' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const all = [].concat(j.files || [], j.images || [], j.videos || []);
        return all.map(f => ({ name: f.name, url: f.url, id: f.id, size: f.filesize || '' }));
    }
    function pickFile(cb) {
        const inp = document.createElement('input'); inp.type = 'file';
        inp.onchange = () => { if (inp.files && inp.files[0]) cb(inp.files[0]); };
        inp.click();
    }
    // Upload: POST /api/issueLog/saveImages/ (multipart: imgs[]=plik, data=JSON{page_id,comment_type:"issueLog"}).
    async function uploadFile(id, file) {
        const fd = new FormData();
        fd.append('imgs[]', file, file.name);
        fd.append('data', JSON.stringify({ page_id: String(id), comment_type: 'issueLog' }));
        const r = await fetch(`${API}/saveImages/`, { method: 'POST', credentials: 'same-origin', body: fd });
        return r.ok;
    }
    async function uploadAndVerify(id, file) {
        await uploadFile(id, file);
        await sleep(700);
        try { const files = await fetchFiles(id); return files.some(f => (f.name || '') === file.name); }
        catch (e) { return false; }
    }
    // Usuwanie pliku: GET /api/issueLog/deleteImages/?page_id=&images_delete[]=docId
    async function deleteFile(issueId, docId) {
        const r = await fetch(`${API}/deleteImages/?page_id=${issueId}&images_delete%5B%5D=${encodeURIComponent(docId)}`, { credentials: 'same-origin' });
        return r.ok;
    }
    async function bulkUpload() {
        const sel = rows.filter(r => r.sel && !r.error);
        if (!sel.length) { toast('Zaznacz wiersze.'); return; }
        pickFile(async (file) => {
            let ok = 0, fail = 0;
            for (const r of sel) {
                const tr = findTr(r.id); const line = tr ? statusLine(tr) : null;
                if (line) line.innerHTML = '<span class="st-busy">wgrywam…</span>';
                try { if (await uploadAndVerify(r.id, file)) { ok++; r.files = null; if (line) line.innerHTML = '<span class="st-ok">✓ dodano plik: ' + esc(file.name) + '</span>'; } else { fail++; if (line) line.innerHTML = '<span class="st-err">✗ plik</span>'; } }
                catch (e) { fail++; if (line) line.innerHTML = '<span class="st-err">✗</span>'; }
            }
            toast(`Wgrano „${file.name}": OK ${ok}, błąd ${fail}.`);
        });
    }
    async function downloadFile(f) {
        const r = await fetch(location.origin + f.url, { credentials: 'same-origin' });
        if (!r.ok) { toast('Błąd pobierania: HTTP ' + r.status); return false; }
        const b = await r.blob();
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name || ('plik_' + f.id);
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        return true;
    }
    async function zipFiles(list, zipName) {
        if (typeof JSZip === 'undefined') { toast('Brak biblioteki JSZip — odśwież stronę.'); return; }
        if (!list.length) { toast('Brak plików.'); return; }
        toast('Buduję ZIP…');
        const zip = new JSZip();
        for (const f of list) {
            try { const r = await fetch(location.origin + f.url, { credentials: 'same-origin' }); if (r.ok) zip.file(f.folder ? `${f.folder}/${f.name}` : f.name, await r.blob()); } catch (e) {}
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = zipName;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }
    async function toggleFiles(r, tr, btn) {
        const nx = tr.nextElementSibling;
        if (nx && nx.classList.contains('ilp-files-row')) { nx.remove(); return; }
        const old = btn.textContent; btn.disabled = true; btn.textContent = '⏳';
        let files;
        try { files = r.files || (r.files = await fetchFiles(r.id)); }
        catch (e) { btn.textContent = old; btn.disabled = false; toast('Błąd listy plików: ' + e.message); return; }
        btn.textContent = '📎 ' + files.length; btn.disabled = false;
        const row = document.createElement('tr'); row.className = 'ilp-files-row';
        const td = document.createElement('td'); td.colSpan = 15; td.style.cssText = 'background:#f8fafc;padding:8px 12px';
        if (!files.length) { td.innerHTML = '<i style="color:#64748b">brak plików</i>'; }
        else {
            td.innerHTML = files.map((f, i) =>
                `<div style="display:flex;gap:8px;align-items:center;padding:2px 0"><span style="flex:1">📄 ${esc(f.name)} <span style="color:#64748b">(${esc(f.size)})</span></span><button class="ilp-toggle" data-dl="${i}">Pobierz</button><button class="ilp-toggle" data-del="${i}" style="color:#b91c1c;border-color:#fca5a5" title="Usuń plik">✕</button></div>`
            ).join('') + `<div style="margin-top:6px"><button class="ilp-toggle" data-zip="1">📦 Pobierz wszystkie jako ZIP (${files.length})</button></div>`;
        }
        const addWrap = document.createElement('div'); addWrap.style.marginTop = '8px';
        const addBtn = document.createElement('button'); addBtn.className = 'ilp-toggle'; addBtn.textContent = '➕ Dodaj plik';
        addBtn.style.background = '#ecfdf5'; addBtn.style.borderColor = '#047857'; addBtn.style.color = '#047857';
        addBtn.onclick = () => pickFile(async (file) => {
            addBtn.disabled = true; addBtn.textContent = '⏳ wgrywam…';
            const ok = await uploadAndVerify(r.id, file);
            r.files = null;
            const ul = statusLine(tr); ul.innerHTML = ok ? ('<span class="st-ok">✓ dodano plik: ' + esc(file.name) + '</span>') : ('<span class="st-err">✗ dodanie: ' + esc(file.name) + '</span>');
            const cur = tr.nextElementSibling; if (cur && cur.classList.contains('ilp-files-row')) cur.remove();
            btn.textContent = '📎'; await toggleFiles(r, tr, btn);
        });
        addWrap.appendChild(addBtn); td.appendChild(addWrap);
        row.appendChild(td); tr.after(row);
        td.querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => {
            const f = files[+b.getAttribute('data-dl')];
            const line = statusLine(tr);
            line.innerHTML = '<span class="st-busy">pobieram…</span>';
            const ok = await downloadFile(f);
            line.innerHTML = ok ? ('<span class="st-ok">✓ pobrano: ' + esc(f.name) + '</span>') : ('<span class="st-err">✗ pobieranie: ' + esc(f.name) + '</span>');
        });
        const z = td.querySelector('[data-zip]'); if (z) z.onclick = async () => {
            const line = statusLine(tr);
            line.innerHTML = '<span class="st-busy">ZIP…</span>';
            const dateStr = todayStr(); const comp = safeName(r.company || 'brak firmy');
            await zipFiles(files.map(f => ({ ...f, folder: `${dateStr} ${comp}` })), `${comp}_${dateStr}.zip`);
            line.innerHTML = '<span class="st-ok">✓ pobrano ZIP (' + files.length + ' plików)</span>';
        };
        td.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
            const f = files[+b.getAttribute('data-del')];
            if (!confirm(`Usunąć plik „${f.name}"?\nTej operacji nie można cofnąć.`)) return;
            b.disabled = true; b.textContent = '⏳';
            try {
                await deleteFile(r.id, f.id);
                await sleep(500);
                const gone = !(await fetchFiles(r.id)).some(x => String(x.id) === String(f.id));
                r.files = null;
                const dl = statusLine(tr); dl.innerHTML = gone ? ('<span class="st-ok">✓ usunięto plik: ' + esc(f.name) + '</span>') : ('<span class="st-err">✗ usunięcie: ' + esc(f.name) + '</span>');
                const cur = tr.nextElementSibling; if (cur && cur.classList.contains('ilp-files-row')) cur.remove();
                btn.textContent = '📎'; await toggleFiles(r, tr, btn);
            } catch (e) { toast('Błąd usuwania: ' + e.message); b.disabled = false; b.textContent = '✕'; }
        });
    }
    async function bulkZip() {
        const sel = rows.filter(r => r.sel && !r.error);
        if (!sel.length) { toast('Zaznacz wiersze.'); return; }
        toast('Pobieram listy plików…');
        const dateStr = todayStr();
        const all = [];
        for (const r of sel) {
            try { const fs = r.files || (r.files = await fetchFiles(r.id)); const folder = `${dateStr} ${safeName(r.company || 'brak firmy')}`; fs.forEach(f => all.push({ ...f, folder })); } catch (e) {}
        }
        if (!all.length) { toast('Zaznaczone issue nie mają plików.'); return; }
        await zipFiles(all, `pliki_${dateStr}.zip`);
    }

    // ---------- PAID (lista) ----------
    async function changePaid(r, tr, optId, sel) {
        if (!r.paidField) return false;
        const line = statusLine(tr);
        if (sel) sel.disabled = true;
        line.innerHTML = '<span class="st-busy">PAID…</span>';
        let ok = false;
        try {
            ok = await saveFieldValue(r.id, r.paidField.id, optId, it => fieldByName(it, 'PAID - Finance', 'PAID'));
            if (ok) {
                r.paidField.value = String(optId);
                const o = r.paidField.options.find(x => x.id === String(optId));
                if (o) r.paidField.text = o.label;
                const ps = tr.querySelector('.paidsel');
                if (ps) { ps.value = r.paidField.value; ps.style.color = isYes(r.paidField.text) ? '#15803d' : (isNo(r.paidField.text) ? '#b91c1c' : ''); }
                line.innerHTML = '<span class="st-ok">✓ PAID: ' + esc(r.paidField.text) + '</span>';
                updateSummary();
            } else line.innerHTML = '<span class="st-err">✗ PAID nie potwierdzono</span>';
        } catch (e) { line.innerHTML = '<span class="st-err">✗ ' + esc(e.message) + '</span>'; }
        finally { if (sel) sel.disabled = false; }
        return ok;
    }

    // ---------- Payment Confirmation ----------
    async function changePayConf(r, tr, optId, sel) {
        if (!r.payConf) return false;
        const line = statusLine(tr);
        if (sel) sel.disabled = true;
        line.innerHTML = '<span class="st-busy">Payment Confirm…</span>';
        let ok = false;
        try {
            ok = await saveFieldValue(r.id, r.payConf.id, optId, it => fieldByPartial(it, 'Payment Confirmation'));
            if (ok) {
                r.payConf.value = String(optId);
                const o = r.payConf.options.find(x => x.id === String(optId));
                if (o) r.payConf.text = o.label;
                line.innerHTML = '<span class="st-ok">✓ Payment Confirm: ' + esc(r.payConf.text) + '</span>';
            } else line.innerHTML = '<span class="st-err">✗ Payment Confirm nie potwierdzono</span>';
        } catch (e) { line.innerHTML = '<span class="st-err">✗ ' + esc(e.message) + '</span>'; }
        finally { if (sel) sel.disabled = false; }
        return ok;
    }

    // ---------- reassign ----------
    async function reassignIssue(id, username) {
        await fetch(`${API}/changeResponsible/?comment_type=issuelog&page_id=${id}&resp_person=${encodeURIComponent(username)}`, { credentials: 'same-origin' });
        await sleep(500);
        try { const it = await fetchIssue(id); return (it.resp_username || '') === username; } catch (e) { return false; }
    }
    async function reassignRow(r, tr, username, sel) {
        if (!confirm(`Reassign issue ${r.id} do: ${reaName(username)}?`)) { if (sel) sel.value = ''; return; }
        const line = statusLine(tr);
        if (sel) sel.disabled = true;
        line.innerHTML = '<span class="st-busy">reassign…</span>';
        try {
            const ok = await reassignIssue(r.id, username);
            line.innerHTML = ok ? ('<span class="st-ok">✓ reassign: ' + esc(reaName(username)) + '</span>') : '<span class="st-err">✗ reassign</span>';
        } catch (e) { line.innerHTML = '<span class="st-err">✗ ' + esc(e.message) + '</span>'; }
        finally { if (sel) { sel.disabled = false; sel.value = ''; } }
    }
    async function bulkReassign(username) {
        if (!username) { toast('Wybierz osobę.'); return; }
        const sel = rows.filter(r => r.sel && !r.error);
        if (!sel.length) { toast('Zaznacz wiersze.'); return; }
        if (!confirm(`Reassign ${sel.length} zaznaczonych issue do: ${reaName(username)}?`)) return;
        let ok = 0, fail = 0;
        for (const r of sel) {
            const tr = findTr(r.id); const line = tr ? statusLine(tr) : null;
            if (line) line.innerHTML = '<span class="st-busy">reassign…</span>';
            try { if (await reassignIssue(r.id, username)) { ok++; if (line) line.innerHTML = '<span class="st-ok">✓ reassign: ' + esc(reaName(username)) + '</span>'; } else { fail++; if (line) line.innerHTML = '<span class="st-err">✗</span>'; } }
            catch (e) { fail++; if (line) line.innerHTML = '<span class="st-err">✗</span>'; }
        }
        toast(`Reassign → ${reaName(username)}: OK ${ok}, błąd ${fail}.`);
    }

    // ---------- komentarze: kolumna podgladu ----------
    function renderCommentCell(r, tr) {
        const cell = tr.querySelector('.cmts'); if (!cell) return;
        cell.innerHTML = '';
        if (r.comments === undefined) {
            const b = document.createElement('button'); b.className = 'ilp-toggle'; b.textContent = '💬 wczytaj';
            b.onclick = async () => { b.disabled = true; b.textContent = '⏳'; try { r.comments = await fetchComments(r.id); } catch (e) { r.comments = []; } renderCommentCell(r, tr); };
            cell.appendChild(b); return;
        }
        const cs = r.comments;
        if (!cs.length) { cell.innerHTML = '<span style="color:#94a3b8">—</span>'; return; }
        const alert = hasAlert(cs);
        const latest = cs[cs.length - 1];
        const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px';
        const b = document.createElement('button'); b.className = 'ilp-toggle';
        b.textContent = (alert ? '⚠️ ' : '💬 ') + cs.length + (cs.length > 5 ? ' (5+)' : '');
        if (alert) { b.style.background = '#fef2f2'; b.style.borderColor = '#dc2626'; b.style.color = '#b91c1c'; b.style.fontWeight = '600'; }
        b.onclick = () => toggleComments(r, tr, b);
        const prev = document.createElement('div');
        prev.style.cssText = 'font-size:11px;white-space:normal;word-break:break-word;color:' + (alert ? '#b91c1c' : '#475569');
        prev.innerHTML = `<b>${esc((latest.author || '').split(' ')[0])}:</b> ${esc(truncate(latest.text, 70))}`;
        wrap.appendChild(b); wrap.appendChild(prev); cell.appendChild(wrap);
    }
    function toggleComments(r, tr, btn) {
        const nx = tr.nextElementSibling;
        if (nx && nx.classList.contains('ilp-cmts-row')) { nx.remove(); return; }
        const cs = r.comments || [];
        const showAll = !!btn._all;
        const list = showAll ? cs : cs.slice(-5);
        const ordered = list; // chronologicznie: najstarsze u góry, najnowsze na dole
        const row = document.createElement('tr'); row.className = 'ilp-cmts-row';
        const td = document.createElement('td'); td.colSpan = 15; td.style.cssText = 'padding:8px 12px';
        td.innerHTML = (ordered.length ? ordered.map(c => {
            const al = ALERT_RE.test(c.text);
            return `<div style="padding:3px 0;border-bottom:1px dashed #e5e7eb"><span style="color:#64748b;font-size:11px">${esc(c.date)}</span> <b>${esc(c.author)}:</b> <span style="${al ? 'color:#b91c1c;font-weight:600' : ''}">${esc(c.text)}</span></div>`;
        }).join('') : '<i style="color:#64748b">brak komentarzy (systemowe pominięte)</i>')
            + (cs.length > 5 ? `<div style="margin-top:6px"><button class="ilp-toggle" data-all="1">${showAll ? 'pokaż tylko 5 ostatnich' : 'pokaż wszystkie (' + cs.length + ')'}</button></div>` : '');
        row.appendChild(td); tr.after(row);
        const ab = td.querySelector('[data-all]'); if (ab) ab.onclick = () => { btn._all = !showAll; row.remove(); toggleComments(r, tr, btn); };
    }
    async function bulkLoadComments() {
        const sel = rows.filter(r => r.sel && !r.error);
        if (!sel.length) { toast('Zaznacz wiersze.'); return; }
        let done = 0;
        for (const r of sel) { try { r.comments = await fetchComments(r.id); } catch (e) { r.comments = []; } const tr = findTr(r.id); if (tr) renderCommentCell(r, tr); done++; }
        toast(`Wczytano komentarze: ${done}.`);
    }

    // ---------- komentarze ----------
    // Lista komentarzy: POST /api/issueLog/comments z JSON {page_id, comment_type}.
    async function commentsText(id) {
        const r = await fetch(`${API}/comments`, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ page_id: Number(id), comment_type: 'issuelog' })
        });
        return r.ok ? await r.text() : '';
    }
    function countOcc(s, sub) { return sub ? s.split(sub).length - 1 : 0; }
    // Dodanie komentarza: POST /api/comments/save/ (form: page_id, comment_type, comment). Weryfikacja przez wzrost liczby wystapien.
    async function postComment(id, text) {
        const before = countOcc(await commentsText(id), text);
        await fetch(`${API_ROOT}/comments/save/`, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: `page_id=${encodeURIComponent(id)}&comment_type=issuelog&comment=${encodeURIComponent(text)}`
        });
        await sleep(500);
        return countOcc(await commentsText(id), text) > before;
    }
    async function addComment(r, tr, text) {
        text = (text || '').trim(); if (!text) return;
        const line = statusLine(tr);
        line.innerHTML = '<span class="st-busy">komentarz…</span>';
        try {
            const ok = await postComment(r.id, text);
            line.innerHTML = ok ? ('<span class="st-ok">✓ komentarz: „' + esc(text) + '"</span>') : '<span class="st-err">✗ komentarz (sprawdź)</span>';
        } catch (e) { line.innerHTML = '<span class="st-err">✗ ' + esc(e.message) + '</span>'; }
    }
    function findTr(id) { return [...tbody.children].find(x => { const a = x.querySelector('a'); return a && a.textContent === String(id); }); }
    async function bulkComment(text) {
        text = (text || '').trim(); if (!text) { toast('Wpisz treść komentarza.'); return; }
        const sel = rows.filter(r => r.sel && !r.error);
        if (!sel.length) { toast('Zaznacz wiersze.'); return; }
        let ok = 0, fail = 0;
        for (const r of sel) {
            const tr = findTr(r.id); const line = tr ? statusLine(tr) : null;
            if (line) line.innerHTML = '<span class="st-busy">komentarz…</span>';
            try { if (await postComment(r.id, text)) { ok++; if (line) line.innerHTML = '<span class="st-ok">✓ komentarz: „' + esc(text) + '"</span>'; } else { fail++; if (line) line.innerHTML = '<span class="st-err">✗ komentarz</span>'; } }
            catch (e) { fail++; if (line) line.innerHTML = '<span class="st-err">✗</span>'; }
        }
        toast(`Komentarz: OK ${ok}, błąd ${fail}.`);
    }

    async function togglePaid(r, tr, target) {
        if (!r.paidField) return false;
        const opt = target === 'Yes' ? r.paidField.yes : r.paidField.no;
        const line = statusLine(tr);
        const btn = tr.querySelector('.paidbtn');
        if (btn) btn.disabled = true;
        line.innerHTML = '<span class="st-busy">PAID…</span>';
        let ok = false;
        try {
            ok = await savePaid(r.id, r.paidField.id, opt);
            if (ok) {
                r.paidField.value = String(opt); r.paidField.text = target;
                const paidCell = tr.querySelector('.paidcell');
                if (paidCell) { paidCell.textContent = target; paidCell.className = 'paidcell ' + (target === 'Yes' ? 'paid-y' : 'paid-n'); }
                if (btn) { btn.textContent = target === 'Yes' ? '→ No' : '→ Yes'; btn.onclick = () => togglePaid(r, tr, target === 'Yes' ? 'No' : 'Yes'); }
                line.innerHTML = '<span class="st-ok">✓ PAID: ' + target + '</span>';
                updateSummary();
            } else {
                line.innerHTML = '<span class="st-err">✗ PAID nie potwierdzono</span>';
            }
        } catch (e) {
            line.innerHTML = '<span class="st-err">✗ ' + esc(e.message) + '</span>';
        } finally {
            if (btn) btn.disabled = false;
        }
        return ok;
    }

    async function bulkPaid(target) {
        const sel = rows.filter(r => r.sel && r.paidField && r.paidField.yes && r.paidField.no);
        if (!sel.length) { toast('Zaznacz wiersze z polem PAID.'); return; }
        let ok = 0, fail = 0;
        for (const r of sel) {
            const tr = findTr(r.id); if (!tr) { fail++; continue; }
            const opt = target === 'Yes' ? r.paidField.yes : r.paidField.no;
            if (opt && await changePaid(r, tr, opt, null)) ok++; else fail++;
        }
        toast(`PAID=${target}: OK ${ok}, błąd ${fail}.`);
    }

    function updateSummary() {
        if (!summaryEl) return;
        const n = rows.filter(r => !r.error).length;
        const paidYes = rows.filter(r => r.paidField && isYes(r.paidField.text)).length;
        const errs = rows.filter(r => r.error).length;
        summaryEl.innerHTML = `Issue: <b>${n}</b> &nbsp; PAID=Yes: <b>${paidYes}</b>` + (errs ? ` &nbsp; błędy: <b style="color:#b91c1c">${errs}</b>` : '');
    }

    function link(id) { return `<a href="${location.origin}/react/logs/issue_logs/${id}" target="_blank">${id}</a>`; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function toast(m) { if (!toastEl) return; toastEl.textContent = m; toastEl.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.style.display = 'none', 3200); }

    build();
})();
    }

    function init_klient() {
(function () {
    'use strict';

    const BASE = 'https://www.prologistics.info';
    const SEARCH_URL = BASE + '/search.php?express';

    let previewRows = [];
    let tmIsBusy = false;

    window.addEventListener('beforeunload', function (e) {
        if (!tmIsBusy) return;
        e.preventDefault();
        e.returnValue = '';
    });

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function absoluteUrl(href) {
        return new URL(href, BASE).href;
    }

    function auftragNoFromUrl(href) {
        try {
            const u = new URL(href, BASE);
            return u.searchParams.get('number') || '';
        } catch (e) {
            const m = String(href || '').match(/[?&]number=([^&]+)/);
            return m ? decodeURIComponent(m[1]) : '';
        }
    }

    function normalizeSpaces(value) {
        let text = String(value || '');
        text = text.split(String.fromCharCode(10)).join(' ');
        text = text.split(String.fromCharCode(13)).join(' ');
        text = text.split(String.fromCharCode(9)).join(' ');
        while (text.indexOf('  ') >= 0) text = text.split('  ').join(' ');
        return text.trim();
    }

    function setNativeValue(el, value) {
        if (!el) return;

        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');

        if (desc && desc.set) desc.set.call(el, value);
        else el.value = value;

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function triggerChange(win, el) {
        if (!el) return;

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        try {
            if (win && win.$) win.$(el).trigger('change');
        } catch (e) {}
    }

    function findHeaderIndex(headers, candidates) {
        const lower = headers.map(function (h) {
            return String(h || '').trim().toLowerCase();
        });

        for (const c of candidates) {
            const idx = lower.findIndex(function (h) {
                return h === c || h.indexOf(c) >= 0;
            });
            if (idx >= 0) return idx;
        }

        return -1;
    }

    // ---- Amazon DE: numer zamówienia w formacie 028-1234567-1234567 ----
    function parseAmazonOrderNo(s) {
        const m = String(s || '').match(/\d{3}-\d{7}-\d{7}/);
        return m ? m[0] : '';
    }

    // ---- NOWY parser Amazon DE: szeroki raport ----
    // Kolumny (po pominięciu pustych): Transaction Type | Order Number | ... | Sum of Y + AG | Type | Account | VAT account
    // Przykład wiersza:
    //   Order   028-0297231-2882775   230.94   B2B      1323   3283   (B2B -> selling/VAT 3283)
    //   Order   028-0945458-2393968   210.08   B2B 0%   1323   3264   (B2B 0% -> selling/VAT 3264)
    // Cel: ustawić typ klienta na B2B; docelowy selling/VAT account = kolumna "VAT account".
    function parseAmazonDeWide(raw) {
        const lines = String(raw || '')
            .split(String.fromCharCode(13)).join(String.fromCharCode(10))
            .split(String.fromCharCode(10))
            .filter(function (line) { return line.trim(); });

        const items = [];

        lines.forEach(function (line) {
            const tokens = line.split(String.fromCharCode(9))
                .map(function (c) { return String(c || '').trim(); })
                .filter(function (c) { return c.length; });

            if (tokens.length < 4) return;

            // numer zamówienia: pierwszy token pasujący do wzorca Amazona
            let orderNumber = '';
            for (const t of tokens) {
                const o = parseAmazonOrderNo(t);
                if (o) { orderNumber = o; break; }
            }
            if (!orderNumber) return;

            // kwota: token z kropką dziesiętną (np. 230.94, 142.3, 2009.55)
            let amount = '';
            for (const t of tokens) {
                if (/^\d+(\.\d+)?$/.test(t) && t.indexOf('.') >= 0) { amount = t; break; }
            }
            if (!amount) {
                for (const t of tokens) {
                    if (/^\d+$/.test(t) && t !== '1323' && !/^3\d{3}$/.test(t)) { amount = t; break; }
                }
            }

            // typ z raportu: B2B / B2B 0% / B2C
            let typeText = '';
            for (const t of tokens) {
                if (/B2B|B2C/i.test(t)) { typeText = t; break; }
            }

            // konta 4-cyfrowe: 1323 = Account (rozliczeniowe), drugie = VAT/selling account
            const accounts = tokens.filter(function (t) { return /^\d{4}$/.test(t); });
            const account = accounts.indexOf('1323') >= 0 ? '1323' : (accounts[0] || '');
            let vatAccount = '';
            for (const a of accounts) {
                if (a !== '1323') { vatAccount = a; break; }
            }

            if (!vatAccount) return; // bez konta docelowego nie ma czego weryfikować

            const description = (typeText || 'B2B') +
                ' \u00B7 Account ' + (account || '1323') +
                ' \u00B7 VAT/selling ' + vatAccount +
                (amount ? (' \u00B7 ' + amount) : '');

            items.push({
                marketplace: 'amazon_de',
                orderNumber: orderNumber,
                operation: 'zmiana na B2B',
                buyer: description,
                amount: amount,
                description: description,
                orderAccount: vatAccount,   // docelowy selling/VAT account (3283 = B2B, 3264 = B2B 0%)
                exportAccount: '',
                targetType: 'B2B',
                reviewOnly: false,
                reviewReason: '',
                selected: false,
                loading: false,
                error: null,
                changed: false,
                skipped: false,
                isDeleted: false,
                accountsAlreadyB2B: false,
                accountsAreB2C: false
            });
        });

        const seen = new Set();

        return items.filter(function (item) {
            const key = item.marketplace + '|' + item.orderNumber;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // ---- STARY parser Amazon DE: 3 kolumny z opisem "konto nieprawidłowe Order: .. Export: .." ----
    function parseAmazonDeLegacy(raw) {
        const lines = String(raw || '')
            .split(String.fromCharCode(13)).join(String.fromCharCode(10))
            .split(String.fromCharCode(10))
            .map(function (line) { return line.trimEnd(); })
            .filter(function (line) { return line.trim(); });

        if (!lines.length) return [];

        const rows = lines.map(function (line) {
            return line.split(String.fromCharCode(9));
        });

        const first = rows[0].map(function (h) {
            return String(h || '').trim().toLowerCase();
        });

        const hasHeader = first.indexOf('order number') >= 0 && first.indexOf('description') >= 0;
        const dataRows = hasHeader ? rows.slice(1) : rows;

        function getAccountFromDescription(description, label) {
            const marker = label + ':';
            const idx = description.indexOf(marker);
            if (idx < 0) return '';

            let rest = description.slice(idx + marker.length).trim();
            let out = '';

            for (let i = 0; i < rest.length; i++) {
                const ch = rest.charAt(i);
                if (ch >= '0' && ch <= '9') out += ch;
                else if (out) break;
            }

            return out;
        }

        const items = [];

        dataRows.forEach(function (row) {
            const orderNumber = String(row[0] || '').trim();
            const amount = String(row[1] || '').trim().split(',').join('.');
            const description = String(row[2] || '').trim();
            const descLower = description.toLowerCase();

            if (!orderNumber || descLower.indexOf('konto nieprawidłowe') < 0) return;

            const orderAccount = getAccountFromDescription(description, 'Order');
            const exportAccount = getAccountFromDescription(description, 'Export');

            let targetType = '';
            let reviewOnly = false;
            let reviewReason = '';

            if (orderAccount === '3283' && exportAccount === '3252') {
                targetType = 'B2B';
            } else if (orderAccount === '3252' && exportAccount === '3283') {
                targetType = 'B2C';
            } else if (
                (orderAccount === '3264' && exportAccount === '3242') ||
                (orderAccount === '3252' && exportAccount === '3253') ||
                (orderAccount === '3264' && exportAccount === '3252')
            ) {
                reviewOnly = true;
                reviewReason = 'Do sprawdzenia na Amazonie: ' + description;
            } else {
                reviewOnly = true;
                reviewReason = 'Nieobsługiwany układ kont: ' + description;
            }

            items.push({
                marketplace: 'amazon_de',
                orderNumber: orderNumber,
                operation: 'konto nieprawidłowe',
                buyer: description,
                amount: amount,
                description: description,
                orderAccount: orderAccount,
                exportAccount: exportAccount,
                targetType: targetType,
                reviewOnly: reviewOnly,
                reviewReason: reviewReason,
                selected: false,
                loading: false,
                error: null,
                changed: false,
                skipped: false,
                isDeleted: false,
                accountsAlreadyB2B: false,
                accountsAreB2C: false
            });
        });

        const seen = new Set();

        return items.filter(function (item) {
            const key = item.marketplace + '|' + item.orderNumber + '|' + item.description;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function parseAmazonDe(raw) {
        // najpierw próbujemy nowego, szerokiego raportu; jeśli pusto -> stary format
        const wide = parseAmazonDeWide(raw);
        if (wide.length) return wide;
        return parseAmazonDeLegacy(raw);
    }

    function parseAllegroUuid(raw) {
        const lines = String(raw || '')
            .split(String.fromCharCode(13)).join(String.fromCharCode(10))
            .split(String.fromCharCode(10))
            .map(function (l) { return l.trim(); })
            .filter(function (l) { return l; });

        const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const items = [];
        const seen = new Set();

        lines.forEach(function (line) {
            const cells = line.split(String.fromCharCode(9)).map(function (c) { return String(c || '').trim(); });
            const uuid = cells.find(function (c) { return UUID.test(c); });
            if (!uuid || seen.has(uuid)) return;
            const type = (cells.find(function (c) { return /^B2[BC]$/i.test(c); }) || '').toUpperCase();
            if (!type) return;
            const date = cells.find(function (c) { return /^\d{2}\.\d{2}\.\d{4}$/.test(c); }) || '';
            const amount = cells.find(function (c) { return /^-?\d+(\.\d+)?$/.test(c); }) || '';
            seen.add(uuid);
            items.push({
                marketplace: 'allegro_uuid',
                orderNumber: uuid,
                targetType: type,
                buyer: (date ? date + ' \u00B7 ' : '') + amount,
                amount: amount,
                selected: false, loading: false, error: null, changed: false,
                skipped: false, isDeleted: false, accountsAlreadyB2B: false, accountsAreB2C: false
            });
        });

        return items;
    }

    function parseMarketplace(raw, marketplace) {
        if (marketplace === 'amazon_de') return parseAmazonDe(raw);
        if (marketplace === 'allegro_uuid') return parseAllegroUuid(raw);

        const lines = String(raw || '')
            .split(String.fromCharCode(13)).join(String.fromCharCode(10))
            .split(String.fromCharCode(10))
            .map(function (line) { return line.trimEnd(); })
            .filter(function (line) { return line.trim(); });

        if (!lines.length) return [];

        const rows = lines.map(function (line) {
            return line.split(String.fromCharCode(9));
        });

        const firstRow = rows[0] || [];
        const firstRowLower = firstRow.map(function (h) {
            return String(h || '').trim().toLowerCase();
        });

        const hasHeader =
            firstRowLower.indexOf('operacja') >= 0 &&
            (firstRowLower.indexOf('fulfillment') >= 0 || firstRowLower.indexOf('fulfilment') >= 0);

        let dataRows;
        let operationIdx;
        let fulfillmentIdx;
        let transactionTypeIdx;
        let accountIdx;
        let buyerIdx;

        if (hasHeader) {
            operationIdx = findHeaderIndex(firstRow, ['operacja']);
            fulfillmentIdx = findHeaderIndex(firstRow, ['fulfillment', 'fulfilment']);
            transactionTypeIdx = findHeaderIndex(firstRow, ['typ transakcji']);
            accountIdx = findHeaderIndex(firstRow, ['account']);
            buyerIdx = findHeaderIndex(firstRow, ['kupujący', 'kupujacy', 'buyer']);
            dataRows = rows.slice(1);
        } else {
            operationIdx = 3;
            buyerIdx = 5;
            fulfillmentIdx = 11;
            transactionTypeIdx = 12;
            accountIdx = 13;
            dataRows = rows;
        }

        if (operationIdx < 0 || fulfillmentIdx < 0) return [];

        const items = [];

        for (const row of dataRows) {
            const operation = String(row[operationIdx] || '').trim().toLowerCase();
            if (operation !== 'wpłata' && operation !== 'wplata') continue;

            const fulfillment = String(row[fulfillmentIdx] || '').trim();
            if (!fulfillment) continue;

            items.push({
                marketplace: marketplace,
                orderNumber: fulfillment,
                operation: operation,
                transactionType: transactionTypeIdx >= 0 ? String(row[transactionTypeIdx] || '').trim() : '',
                accountNum: accountIdx >= 0 ? String(row[accountIdx] || '').trim() : '',
                buyer: buyerIdx >= 0 ? String(row[buyerIdx] || '').trim() : '',
                selected: false,
                loading: false,
                error: null,
                changed: false,
                skipped: false,
                isDeleted: false,
                accountsAlreadyB2B: false,
                accountsAreB2C: false
            });
        }

        const seen = new Set();

        return items.filter(function (item) {
            const key = item.marketplace + '|' + item.orderNumber;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    const btn = document.createElement('button');
    btn.textContent = '👤 Zmiana typu klienta'; btn.id = 'klient-btn';
    btn.style.cssText =
        'position:fixed;top:252px;right:20px;z-index:999999;padding:10px 15px;background:#FF2F00;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2);';

    const panel = document.createElement('div');
    panel.style.cssText =
        'display:none;position:fixed;top:298px;right:20px;z-index:999999;background:white;border:1px solid #ccc;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:16px;width:min(1100px, calc(100vw - 40px));font-family:sans-serif;max-height:calc(100vh - 320px);overflow-y:auto;';

    panel.innerHTML = '' +
        '<div style="font-weight:bold;margin-bottom:8px;color:#111;font-size:15px;">👤 Zmiana typu klienta</div>' +
        '<div style="font-size:11px;color:#666;margin-bottom:8px;">Wybierz marketplace, wklej tabelę lub pojedynczy wiersz.</div>' +

        '<div style="display:flex;gap:14px;align-items:center;margin-bottom:8px;font-size:13px;">' +
            '<label style="font-weight:bold;color:#333;">Marketplace:</label>' +
            '<label><input type="radio" name="tm-c-marketplace" value="allegro_pl" checked> Allegro PL</label>' +
            '<label><input type="radio" name="tm-c-marketplace" value="allegro_uuid"> Allegro CZ/HU/SK/PL</label>' +
            '<label><input type="radio" name="tm-c-marketplace" value="amazon_de"> Amazon DE</label>' +
        '</div>' +

        '<textarea id="tm-c-input" placeholder="Wklej tabelę albo pojedynczy wiersz..." style="width:100%;height:110px;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:12px;resize:vertical;box-sizing:border-box;font-family:monospace;"></textarea>' +
        '<div id="tm-c-parse-preview" style="margin-top:4px;font-size:11px;color:#555;min-height:16px;"></div>' +

        '<div style="margin-top:10px;display:flex;gap:8px;">' +
            '<button id="tm-c-check-btn" style="flex:1;padding:9px;background:#FF2F00;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">🔍 Sprawdź</button>' +
            '<button id="tm-c-check-change-btn" style="flex:1;padding:9px;background:#ea580c;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">⚡ Sprawdź i zmień od razu</button>' +
            '<button id="tm-c-clear-btn" style="width:120px;padding:9px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">🧹 Wyczyść</button>' +
        '</div>' +
        '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:6px 8px;">' +
            '<label style="font-size:11px;color:#92400e;white-space:nowrap;">workerów:</label>' +
            '<input id="tm-c-workers" type="number" min="1" max="10" value="3" style="width:55px;padding:4px 6px;border:1px solid #d97706;border-radius:4px;font-size:12px;text-align:center;">' +
            '<label style="font-size:11px;color:#92400e;white-space:nowrap;" title="Mnożnik timeoutów: 1=20s, 2=40s, 3=60s. Zwiększ przy wielu workerach.">× timeout:</label>' +
            '<input id="tm-c-timeout-mult" type="number" min="1" max="10" step="0.5" value="1" style="width:55px;padding:4px 6px;border:1px solid #d97706;border-radius:4px;font-size:12px;text-align:center;">' +
            '<button id="tm-c-check-change-parallel-btn" style="flex:1;min-width:240px;padding:7px;background:#b91c1c;color:white;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold;">🚀 Sprawdź i zmień RÓWNOLEGLE</button>' +
            '<span style="font-size:10px;color:#92400e;font-style:italic;width:100%;">Zacznij od 2-3 workerów. Ten sam order nie jest ruszany przez dwóch naraz.</span>' +
        '</div>' +

        '<div id="tm-c-preview-section" style="display:none;margin-top:12px;">' +
            '<div style="font-size:12px;font-weight:bold;color:#333;margin-bottom:6px;">Podgląd:</div>' +
            '<div style="overflow-x:auto;max-width:100%;border:1px solid #e5e7eb;border-radius:6px;">' +
                '<table style="width:100%;min-width:900px;border-collapse:collapse;font-size:12px;table-layout:auto;">' +
                    '<thead>' +
                        '<tr style="background:#f3f4f6;">' +
                            '<th style="padding:5px 6px;text-align:center;border:1px solid #e5e7eb;width:38px;">✓</th>' +
                            '<th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Marketplace</th>' +
                            '<th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Numer</th>' +
                            '<th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Opis / Buyer</th>' +
                            '<th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Auftrag</th>' +
                            '<th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Aktualny typ</th>' +
                            '<th style="padding:5px 6px;text-align:center;border:1px solid #e5e7eb;">Status</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody id="tm-c-preview-body"></tbody>' +
                '</table>' +
            '</div>' +

            '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button id="tm-c-change-selected-btn" style="flex:1;min-width:260px;padding:10px;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold;">🚀 Zmień typ klienta</button>' +
                '<button id="tm-c-select-all-btn" style="width:145px;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">✅ Zaznacz OK</button>' +
                '<button id="tm-c-unselect-all-btn" style="width:145px;padding:10px;background:#6b7280;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">⬜ Odznacz wszystko</button>' +
            '</div>' +

            '<div id="tm-c-progress" style="margin-top:10px;display:none;">' +
                '<div style="font-size:12px;color:#333;margin-bottom:6px;font-weight:bold;">Postęp:</div>' +
                '<div id="tm-c-progress-list" style="font-size:11px;max-height:260px;overflow-y:auto;"></div>' +
                '<div id="tm-c-summary" style="margin-top:8px;font-size:13px;font-weight:bold;"></div>' +
            '</div>' +
        '</div>';

    // Każdy worker dostaje własny iframe. Sekwencyjnie używamy defaultFrameCtx,
    // równolegle tworzymy dodatkowe konteksty przez createFrameCtx().
    function createFrameCtx() {
        const f = document.createElement('iframe');
        f.style.cssText =
            'position:fixed;left:-2000px;top:-2000px;width:1200px;height:900px;opacity:0;pointer-events:none;z-index:-1;';
        document.body.appendChild(f);
        return { iframe: f };
    }
    function destroyFrameCtx(ctx) {
        try { if (ctx && ctx.iframe && ctx.iframe.parentNode) ctx.iframe.parentNode.removeChild(ctx.iframe); } catch (e) {}
    }

    const defaultFrameCtx = createFrameCtx();
    const iframe = defaultFrameCtx.iframe;

    function getFrameDoc(ctx) {
        ctx = ctx || defaultFrameCtx;
        return ctx.iframe.contentDocument || ctx.iframe.contentWindow.document;
    }

    function getFrameWin(ctx) {
        ctx = ctx || defaultFrameCtx;
        return ctx.iframe.contentWindow;
    }

    function disableAutofillInFrame(ctx) {
        try {
            const doc = getFrameDoc(ctx);
            if (!doc) return;
            doc.querySelectorAll('form').forEach(function (form) {
                form.setAttribute('autocomplete', 'off');
                form.setAttribute('data-form-type', 'other');
            });
            doc.querySelectorAll('input, textarea, select').forEach(function (el) {
                el.setAttribute('autocomplete', 'new-password');
                el.setAttribute('spellcheck', 'false');
                el.setAttribute('data-form-type', 'other');
            });
        } catch (e) {}
    }

    let timeoutMult = 1;

    function loadInFrame(url, ms, ctx) {
        ctx = ctx || defaultFrameCtx;
        const timeoutMs = (ms || 20000) * timeoutMult;
        return new Promise(function (resolve, reject) {
            let done = false;
            const t = setTimeout(function () {
                if (!done) { done = true; reject(new Error('Timeout: ' + url)); }
            }, timeoutMs);
            ctx.iframe.onload = function () {
                if (!done) { done = true; clearTimeout(t); disableAutofillInFrame(ctx); resolve(); }
            };
            ctx.iframe.src = url;
        });
    }

    function waitFrameLoad(ms, ctx) {
        ctx = ctx || defaultFrameCtx;
        const timeoutMs = (ms || 20000) * timeoutMult;
        return new Promise(function (resolve) {
            let done = false;
            const t = setTimeout(function () {
                if (!done) { done = true; resolve(null); }
            }, timeoutMs);
            ctx.iframe.onload = function () {
                if (!done) { done = true; clearTimeout(t); disableAutofillInFrame(ctx); resolve(true); }
            };
        });
    }

    async function searchAuctionUrls(number, ctx) {
        let last = { ok: false, urls: [], count: 0 };
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const r = await searchAuctionUrlsOnce(number, ctx);
                if (r.ok && r.count > 0) return r;
                last = r;
            } catch (e) {
                last = { ok: false, urls: [], count: 0, error: e.message };
            }
            await sleep(800 * attempt);
        }
        if (last.error) throw new Error(last.error);
        return last;
    }

    async function searchAuctionUrlsOnce(number, ctx) {
        await loadInFrame(SEARCH_URL, undefined, ctx);

        const doc = getFrameDoc(ctx);
        const win = getFrameWin(ctx);
        const input = doc.querySelector('input[name="ff_number"]');

        if (!input) throw new Error('Nie znaleziono pola ff_number na search.php');

        try {
            if (win.select_radio) win.select_radio('radio_36');
        } catch (e) {}

        const radio = doc.querySelector('input[name="what"][value="ff_number"], input#radio_36');

        if (radio && !radio.checked) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
        }

        setNativeValue(input, number);

        const form = input.closest('form');
        if (!form) throw new Error('Nie znaleziono formularza wyszukiwania');

        const lp = waitFrameLoad(15000, ctx);
        form.submit();
        await lp;
        await sleep(1000);

        const url = getFrameWin(ctx).location.href;

        if (url.indexOf('auction.php') >= 0) {
            return { ok: true, urls: [url], count: 1 };
        }

        const links = Array.from(getFrameDoc(ctx).querySelectorAll('a[href*="auction.php?number="]'))
            .map(function (a) {
                return absoluteUrl(a.getAttribute('href') || '');
            })
            .filter(function (href) {
                return href.indexOf('auction.php?number=') >= 0 && href.indexOf('shipping_auction.php') < 0;
            });

        const uniqueUrls = Array.from(new Set(links));

        if (!uniqueUrls.length) return { ok: false, urls: [], count: 0 };

        return { ok: true, urls: uniqueUrls, count: uniqueUrls.length };
    }

    function getCustomerTypeSelect(doc) {
        return doc.querySelector('select[name="customer_type"]');
    }

    function getCurrentCustomerType(doc) {
        const sel = getCustomerTypeSelect(doc);
        if (!sel) return '';

        const opt = sel.options[sel.selectedIndex];

        return opt ? String(opt.value || opt.textContent || '').trim() : String(sel.value || '').trim();
    }

    function getChangeCustomerTypeButton(doc) {
        return doc.querySelector('button.change_customer_type') ||
            Array.from(doc.querySelectorAll('button,input[type="button"],input[type="submit"]')).find(function (b) {
                return /change customer type/i.test(b.textContent || b.value || '');
            });
    }

    function getPaymentAccountText(doc) {
        const form = doc.querySelector('form#book') || doc.querySelector('form[action*="auction.php"]');

        if (!form) return normalizeSpaces(doc.body ? doc.body.innerText : '').toLowerCase();

        let text = '';
        const nodes = Array.from(form.childNodes || []);

        nodes.forEach(function (node) {
            if (node.nodeType === 3) {
                text += ' ' + node.nodeValue;
            } else if (node.nodeType === 1) {
                const tag = String(node.tagName || '').toLowerCase();

                if (
                    tag !== 'select' &&
                    tag !== 'option' &&
                    tag !== 'input' &&
                    tag !== 'button' &&
                    tag !== 'textarea'
                ) {
                    text += ' ' + (node.textContent || '');
                }
            }
        });

        return normalizeSpaces(text).toLowerCase();
    }

    function hasB2CAccountsAlready(doc) {
        const text = getPaymentAccountText(doc);
        return text.indexOf('vat account: 13004') >= 0 && text.indexOf('selling account: 3292') >= 0;
    }

    function hasB2BAccountsAlready(doc) {
        const text = getPaymentAccountText(doc);

        if (text.indexOf('vat account: 13004') >= 0 && text.indexOf('selling account: 3292') >= 0) {
            return false;
        }

        return text.indexOf('vat account: 2202') >= 0 && text.indexOf('selling account: 3204') >= 0;
    }

    function isAuctionDeleted(doc) {
        if (!doc) return false;
        if (doc.querySelector('.auftrag-status--deleted')) return true;

        const status = doc.querySelector('.auftrag-status');

        return !!(status && /deleted/i.test(status.textContent || ''));
    }

    function parseAmountLoose(value) {
        let s = String(value || '').trim();

        s = s.split(String.fromCharCode(160)).join(' ');
        s = s.split(' ').join('');
        s = s.split('€').join('');
        s = s.split('PLN').join('');
        s = s.split(',').join('.');

        const n = parseFloat(s);

        if (isNaN(n)) return null;

        return n;
    }

    function findAmazonPaymentInfo(doc, expectedAmount, expectedSellingAccount, expectedDate) {
        const table = doc.querySelector('table[data-simple-nav="Payments under billing information"]');
        if (!table) return null;

        const expected = parseAmountLoose(expectedAmount);
        const rows = Array.from(table.querySelectorAll('tr'));
        let fallback = null;
        let exact = null;

        rows.forEach(function (tr) {
            const cells = Array.from(tr.querySelectorAll('td'));
            if (cells.length < 12) return;

            const dateText = normalizeSpaces(cells[0].textContent || '');
            const account = normalizeSpaces(cells[1].textContent || '');
            const amountText = normalizeSpaces(cells[2].textContent || '');
            const amount = parseAmountLoose(amountText);
            const clearingAccount = normalizeSpaces(cells[5].textContent || '');
            const sellingAccount = normalizeSpaces(cells[6].textContent || '');
            const vatAccount = normalizeSpaces(cells[7].textContent || '');
            const unbook = tr.querySelector('a#unbook, a[href*="delpay="]');

            if (!unbook || amount === null) return;
            if (account !== '1323') return;

            const info = {
                dateText: dateText,
                bookingDate: dateText.slice(0, 10),
                account: account,
                amount: amount.toFixed(2),
                clearingAccount: clearingAccount,
                sellingAccount: sellingAccount,
                vatAccount: vatAccount,
                unbookHref: absoluteUrl(unbook.getAttribute('href') || '')
            };

            const amountMatches =
                expected === null || Math.abs(Math.abs(amount) - Math.abs(expected)) < 0.01;

            const sellingMatches =
                !expectedSellingAccount || sellingAccount === String(expectedSellingAccount);

            const dateMatches =
                !expectedDate || info.bookingDate === expectedDate;

            if (!fallback) fallback = info;

            if (amountMatches && !expectedSellingAccount && !expectedDate) {
                fallback = info;
            }

            if (amountMatches && sellingMatches && dateMatches) {
                exact = info;
            }
        });

        return exact || fallback;
    }

    function verifyAmazonPaymentAfterRebook(doc, row, paymentInfo) {
        const expectedSelling = row.orderAccount || (row.targetType === 'B2C' ? '3252' : '3283');

        const confirmed = findAmazonPaymentInfo(
            doc,
            paymentInfo.amount,
            expectedSelling,
            paymentInfo.bookingDate
        );

        if (!confirmed) {
            return {
                ok: false,
                error:
                    'Brak potwierdzenia w Payments. Oczekiwano: Account 1323, kwota ' +
                    paymentInfo.amount +
                    ', data ' +
                    paymentInfo.bookingDate +
                    ', Selling Account ' +
                    expectedSelling
            };
        }

        return {
            ok: true,
            payment: confirmed
        };
    }

    function isCustomerTypeConfirmed(doc, targetType, marketplace) {
        const wanted = String(targetType || '').toUpperCase();
        const current = String(getCurrentCustomerType(doc) || '').toUpperCase();

        if (current === wanted) return true;

        if (marketplace !== 'amazon_de' && marketplace !== 'allegro_uuid' && wanted === 'B2B' && hasB2BAccountsAlready(doc)) {
            return true;
        }

        return false;
    }

    function setPaymentDate(doc, win, yyyyMmDd) {
        const parts = String(yyyyMmDd || '').split('-');

        if (parts.length !== 3) return;

        const monthSel = doc.querySelector('select[name="Date_Month"], select#Date_Month');
        const daySel = doc.querySelector('select[name="Date_Day"], select#Date_Day');
        const yearSel = doc.querySelector('select[name="Date_Year"], select#Date_Year');

        if (!monthSel || !daySel || !yearSel) return;

        monthSel.value = parts[1];
        daySel.value = String(parseInt(parts[2], 10));
        yearSel.value = parts[0];

        triggerChange(win, monthSel);
        triggerChange(win, daySel);
        triggerChange(win, yearSel);
    }

    function setCustomerTypeOnPage(doc, win, targetType) {
        const sel = getCustomerTypeSelect(doc);

        if (!sel) throw new Error('Nie znaleziono pola customer_type');

        const opt = Array.from(sel.options).find(function (o) {
            return String(o.value || o.textContent || '').trim().toUpperCase() === String(targetType || '').toUpperCase();
        });

        if (!opt) throw new Error('Nie znaleziono opcji ' + targetType);

        sel.value = opt.value;
        triggerChange(win, sel);
    }

    async function submitCustomerTypeChange(doc, ctx) {
        const changeBtn = getChangeCustomerTypeButton(doc);

        if (!changeBtn) throw new Error('Nie znaleziono przycisku Change Customer type');

        const lp = waitFrameLoad(15000, ctx);
        changeBtn.click();
        await lp;
        await sleep(1000);
    }

    async function changeCustomerTypeWithRetry(row, targetType, maxAttempts, ctx) {
        const attempts = maxAttempts || 3;
        let lastType = '';
        let lastError = '';

        for (let attempt = 1; attempt <= attempts; attempt++) {
            await loadInFrame(row.auctionHref, undefined, ctx);
            await sleep(800);

            let doc = getFrameDoc(ctx);
            let win = getFrameWin(ctx);

            if (isAuctionDeleted(doc)) {
                throw new Error('Auftrag jest Deleted — nie zmieniam');
            }

            if (isCustomerTypeConfirmed(doc, targetType, row.marketplace)) {
                return {
                    ok: true,
                    alreadyCorrect: attempt === 1,
                    attempts: attempt,
                    confirmedType: targetType
                };
            }

            const sel = getCustomerTypeSelect(doc);
            if (!sel) throw new Error('Nie znaleziono pola customer_type');

            lastType = getCurrentCustomerType(doc) || 'nieznany';

            const opt = Array.from(sel.options).find(function (o) {
                return String(o.value || o.textContent || '').trim().toUpperCase() === String(targetType).toUpperCase();
            });

            if (!opt) {
                throw new Error('Nie znaleziono opcji ' + targetType);
            }

            try {
                sel.value = opt.value;
                triggerChange(win, sel);
                await sleep(500);

                await submitCustomerTypeChange(doc, ctx);

                await loadInFrame(row.auctionHref, undefined, ctx);
                await sleep(900);

                doc = getFrameDoc(ctx);

                if (isCustomerTypeConfirmed(doc, targetType, row.marketplace)) {
                    return {
                        ok: true,
                        alreadyCorrect: false,
                        attempts: attempt,
                        confirmedType: targetType
                    };
                }

                lastType = getCurrentCustomerType(doc) || 'nieznany';
                lastError =
                    'Po próbie ' +
                    attempt +
                    ' typ nadal nie jest ' +
                    targetType +
                    '. Aktualny typ: ' +
                    lastType;
            } catch (e) {
                lastError = 'Próba ' + attempt + ' zmiany typu klienta nie powiodła się: ' + e.message;
            }

            await sleep(800);
        }

        throw new Error(
            'Po ' +
            attempts +
            ' próbach typ klienta nadal nie jest ' +
            targetType +
            '. Ostatni typ: ' +
            lastType +
            (lastError ? '. ' + lastError : '')
        );
    }

    async function rebookAmazonPayment(row, paymentInfo, ctx) {
        const doc = getFrameDoc(ctx);
        const win = getFrameWin(ctx);
        const form = doc.querySelector('form#book') || doc.querySelector('form[action*="auction.php"]');

        if (!form) throw new Error('Nie znaleziono formularza płatności');

        setPaymentDate(doc, win, paymentInfo.bookingDate);

        const accountSel = form.querySelector('select[name="account"]');
        if (!accountSel) throw new Error('Nie znaleziono pola Account');

        accountSel.value = '1323';
        triggerChange(win, accountSel);

        const amountInput = form.querySelector('input[name="amount"]');
        if (!amountInput) throw new Error('Nie znaleziono pola amount');

        setNativeValue(amountInput, paymentInfo.amount);

        const commentInput = form.querySelector('input[name="paycomment"]');
        if (commentInput) setNativeValue(commentInput, 'Amazon DE account correction');

        const makePaymentBtn =
            form.querySelector('input#make-payment') ||
            form.querySelector('input[type="submit"][value="Make payment"]');

        if (!makePaymentBtn) throw new Error('Nie znaleziono przycisku Make payment');

        const lp = waitFrameLoad(15000, ctx);
        makePaymentBtn.click();
        await lp;
        await sleep(1200);
    }

    async function changeAmazonDeTypeAndRebook(row, ctx) {
        if (row.reviewOnly) throw new Error(row.reviewReason || 'Do sprawdzenia na Amazonie');
        if (!row.targetType) throw new Error('Brak docelowego typu klienta');

        await loadInFrame(row.auctionHref, undefined, ctx);
        await sleep(700);

        let doc = getFrameDoc(ctx);

        if (isAuctionDeleted(doc)) {
            throw new Error('Auftrag jest Deleted — nie zmieniam');
        }

        let paymentInfo = findAmazonPaymentInfo(doc, row.amount);

        // Zmiana typu klienta — zawsze (z 3 próbami potwierdzenia)
        const typeResult = await changeCustomerTypeWithRetry(row, row.targetType, 3, ctx);

        // Brak płatności 1323 → nie ma czego wyksięgowywać/księgować. Kończymy na samej zmianie typu.
        if (!paymentInfo) {
            return {
                ok: true,
                amazonRebooked: false,
                typeOnly: true,
                targetType: row.targetType,
                typeAttempts: typeResult.attempts
            };
        }

        await loadInFrame(row.auctionHref, undefined, ctx);
        await sleep(800);

        doc = getFrameDoc(ctx);

        paymentInfo = findAmazonPaymentInfo(doc, row.amount) || paymentInfo;

        if (!paymentInfo.unbookHref) {
            throw new Error('Nie znaleziono linku Unbook');
        }

        try {
            const win = getFrameWin(ctx);
            win.confirm = function () {
                return true;
            };
        } catch (e) {}

        await loadInFrame(paymentInfo.unbookHref, undefined, ctx);
        await sleep(1200);

        let lastVerifyError = '';

        for (let attempt = 1; attempt <= 3; attempt++) {
            await loadInFrame(row.auctionHref, undefined, ctx);
            await sleep(800);

            const preVerify = verifyAmazonPaymentAfterRebook(getFrameDoc(ctx), row, paymentInfo);

            if (preVerify.ok) {
                return {
                    ok: true,
                    amazonRebooked: true,
                    targetType: row.targetType,
                    amount: paymentInfo.amount,
                    bookingDate: paymentInfo.bookingDate,
                    verifiedSellingAccount: preVerify.payment.sellingAccount,
                    verifiedVatAccount: preVerify.payment.vatAccount,
                    typeAttempts: typeResult.attempts,
                    paymentAttempts: attempt - 1
                };
            }

            try {
                await rebookAmazonPayment(row, paymentInfo, ctx);

                await loadInFrame(row.auctionHref, undefined, ctx);
                await sleep(1000);

                const verify = verifyAmazonPaymentAfterRebook(getFrameDoc(ctx), row, paymentInfo);

                if (verify.ok) {
                    return {
                        ok: true,
                        amazonRebooked: true,
                        targetType: row.targetType,
                        amount: paymentInfo.amount,
                        bookingDate: paymentInfo.bookingDate,
                        verifiedSellingAccount: verify.payment.sellingAccount,
                        verifiedVatAccount: verify.payment.vatAccount,
                        typeAttempts: typeResult.attempts,
                        paymentAttempts: attempt
                    };
                }

                lastVerifyError = verify.error || 'Brak potwierdzenia w Payments po próbie ' + attempt;
            } catch (e) {
                lastVerifyError = 'Próba księgowania ' + attempt + ' nie powiodła się: ' + e.message;
            }

            await sleep(900);
        }

        throw new Error(
            'Typ klienta został zmieniony na ' +
            row.targetType +
            ', ale po 3 próbach nie potwierdzono ponownego księgowania w Payments. ' +
            lastVerifyError
        );
    }

    async function checkOne(row, ctx) {
        const found = await searchAuctionUrls(row.orderNumber, ctx);

        if (!found.ok) {
            return {
                ok: false,
                error: 'Nie znaleziono Auftragu dla tego numeru',
                auctionUrls: []
            };
        }

        let best = null;
        let lastError = '';

        for (const auctionUrl of found.urls) {
            await loadInFrame(auctionUrl, undefined, ctx);
            await sleep(600);

            const doc = getFrameDoc(ctx);

            if (isAuctionDeleted(doc)) {
                best = {
                    ok: true,
                    auctionHref: auctionUrl,
                    currentType: 'Deleted',
                    isDeleted: true,
                    checkedAuctions: found.count,
                    selected: false
                };
                break;
            }

            if (row.marketplace === 'amazon_de') {
                const paymentInfo = findAmazonPaymentInfo(doc, row.amount);

                if (row.reviewOnly) {
                    best = {
                        ok: true,
                        auctionHref: auctionUrl,
                        currentType: 'Do sprawdzenia',
                        reviewOnly: true,
                        reviewReason: row.reviewReason,
                        paymentAmount: paymentInfo ? paymentInfo.amount : '',
                        currentSellingAccount: paymentInfo ? paymentInfo.sellingAccount : '',
                        currentVatAccount: paymentInfo ? paymentInfo.vatAccount : '',
                        checkedAuctions: found.count,
                        selected: false
                    };
                    break;
                }

                if (!paymentInfo) {
                    // Brak płatności 1323 w tabeli Payments → nie ma czego wyksięgowywać/księgować.
                    // Wykonujemy tylko zmianę typu klienta na docelowy (o ile nie jest już ustawiony).
                    const currentType = getCurrentCustomerType(doc);
                    const alreadyTarget =
                        String(currentType).toUpperCase() === String(row.targetType).toUpperCase();

                    best = {
                        ok: true,
                        auctionHref: auctionUrl,
                        currentType: alreadyTarget
                            ? ('Już ' + row.targetType + ' (brak płatności 1323)')
                            : ('Brak płatności 1323 — tylko zmiana typu na ' + row.targetType),
                        targetType: row.targetType,
                        noPayment: true,
                        checkedAuctions: found.count,
                        selected: !alreadyTarget
                    };
                    break;
                }

                let alreadyCorrect = false;

                if (row.orderAccount && paymentInfo.sellingAccount === row.orderAccount) {
                    alreadyCorrect = true;
                }

                best = {
                    ok: true,
                    auctionHref: auctionUrl,
                    currentType: alreadyCorrect ? 'Już poprawne' : 'Do zmiany na ' + row.targetType,
                    targetType: row.targetType,
                    noPayment: false,
                    paymentAmount: paymentInfo.amount,
                    currentSellingAccount: paymentInfo.sellingAccount,
                    currentVatAccount: paymentInfo.vatAccount,
                    checkedAuctions: found.count,
                    selected: !alreadyCorrect
                };
                break;
            }

            const sel = getCustomerTypeSelect(doc);
            const changeBtn = getChangeCustomerTypeButton(doc);

            if (sel && changeBtn) {
                if (row.targetType) {
                    const current = String(getCurrentCustomerType(doc) || '').toUpperCase();
                    const already = current === String(row.targetType).toUpperCase();
                    best = {
                        ok: true,
                        auctionHref: auctionUrl,
                        currentType: already ? ('Już ' + row.targetType) : ((current || '?') + ' \u2192 ' + row.targetType),
                        targetType: row.targetType,
                        checkedAuctions: found.count,
                        selected: !already
                    };
                    break;
                }

                const accountsAlreadyB2B = hasB2BAccountsAlready(doc);
                const accountsAreB2C = hasB2CAccountsAlready(doc);

                best = {
                    ok: true,
                    auctionHref: auctionUrl,
                    currentType: accountsAlreadyB2B ? 'B2B (konta OK)' : getCurrentCustomerType(doc),
                    accountsAlreadyB2B: accountsAlreadyB2B,
                    accountsAreB2C: accountsAreB2C,
                    checkedAuctions: found.count,
                    selected: !accountsAlreadyB2B
                };
                break;
            }

            lastError = 'Nie znaleziono pola customer_type albo przycisku Change Customer type';
        }

        if (!best) {
            return {
                ok: false,
                error: lastError || 'Nie znaleziono sekcji zmiany typu klienta',
                auctionUrls: found.urls,
                checkedAuctions: found.count
            };
        }

        return best;
    }

    async function changeCustomerType(row, ctx) {
        if (row.marketplace === 'amazon_de') {
            return await changeAmazonDeTypeAndRebook(row, ctx);
        }

        const target = row.targetType || 'B2B';
        const result = await changeCustomerTypeWithRetry(row, target, 3, ctx);

        return {
            ok: true,
            alreadyB2B: !!result.alreadyCorrect,
            attempts: result.attempts,
            confirmedType: target
        };
    }

    function getMarketplace() {
        const checked = panel.querySelector('input[name="tm-c-marketplace"]:checked');
        return checked ? checked.value : 'allegro_pl';
    }

    function marketplaceLabel(value) {
        if (value === 'amazon_de') return 'Amazon DE';
        if (value === 'allegro_uuid') return 'Allegro CZ/HU/SK/PL';
        return 'Allegro PL';
    }

    function updateParsePreview() {
        const items = parseMarketplace(document.getElementById('tm-c-input').value || '', getMarketplace());
        const el = document.getElementById('tm-c-parse-preview');

        if (!el) return;

        const mp = getMarketplace();
        const suffix = mp === 'amazon_de'
            ? ' pozycji Amazon DE (→ B2B):'
            : (mp === 'allegro_uuid' ? ' pozycji Allegro (order-id):' : ' pozycji wpłata:');

        el.innerHTML = items.length
            ? '<span style="color:#16a34a">✓ ' + items.length + suffix + '</span> ' +
                items.slice(0, 20).map(function (i) {
                    return '<strong>' + i.orderNumber + '</strong>';
                }).join(', ') +
                (items.length > 20 ? '…' : '')
            : '<span style="color:#888">Nie znaleziono pozycji</span>';
    }

    function createTr(row, i) {
        const tr = document.createElement('tr');
        tr.dataset.row = String(i);
        tr.style.background = i % 2 === 0 ? '#fff' : '#f9fafb';

        const tdSelect = document.createElement('td');
        tdSelect.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;text-align:center;';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!row.selected && !row.loading && !row.error;
        cb.disabled =
            !!row.loading ||
            !!row.error ||
            !!row.changed ||
            !!row.accountsAlreadyB2B ||
            !!row.isDeleted ||
            !!row.reviewOnly;

        cb.onchange = function () {
            previewRows[i].selected = cb.checked;
            previewRows[i].skipped = !cb.checked;
            updateRow(i);
        };

        tdSelect.appendChild(cb);
        tr.appendChild(tdSelect);

        function addTextCell(text, style) {
            const cell = document.createElement('td');
            cell.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;' + (style || '');
            cell.textContent = text || '';
            tr.appendChild(cell);
            return cell;
        }

        addTextCell(marketplaceLabel(row.marketplace), 'white-space:nowrap;');
        addTextCell(row.orderNumber, 'font-weight:bold;white-space:nowrap;font-family:monospace;');
        addTextCell(row.buyer || row.description || '', 'max-width:300px;white-space:normal;word-break:break-word;');

        const tdAuction = document.createElement('td');
        tdAuction.style.cssText = 'padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap;';

        if (row.auctionHref) {
            const a = document.createElement('a');
            a.href = row.auctionHref;
            a.target = '_blank';
            a.textContent = auftragNoFromUrl(row.auctionHref) || row.orderNumber || '#Auftrag';
            a.style.cssText = 'color:#0ea5e9;text-decoration:underline;font-family:monospace;';
            tdAuction.appendChild(a);
        } else if (Array.isArray(row.auctionUrls) && row.auctionUrls.length) {
            row.auctionUrls.forEach(function (href, idx) {
                const a = document.createElement('a');
                a.href = href;
                a.target = '_blank';
                const auftrag = auftragNoFromUrl(href);
                a.textContent = auftrag
                    ? auftrag
                    : (row.auctionUrls.length > 1 ? ('Auftrag #' + (idx + 1)) : '#Auftrag');
                a.style.cssText = 'color:#0ea5e9;text-decoration:underline;margin-right:8px;font-family:monospace;';
                tdAuction.appendChild(a);
            });
        } else {
            tdAuction.textContent = row.loading ? 'ładowanie…' : '';
        }

        tr.appendChild(tdAuction);

        addTextCell(row.loading ? 'ładowanie…' : (row.currentType || ''), 'white-space:nowrap;');

        const tdStatus = document.createElement('td');
        tdStatus.style.cssText =
            'padding:4px 6px;border:1px solid #e5e7eb;text-align:center;white-space:normal;word-break:break-word;min-width:170px;';

        if (row.loading) {
            tdStatus.innerHTML = '<span style="color:#6b7280">⏳ sprawdzam…</span>';
        } else if (row.changed) {
            tdStatus.innerHTML = '<span style="color:#16a34a">✅ typ klienta zmieniony i potwierdzony</span>';
        } else if (row.isDeleted) {
            tdStatus.innerHTML = '<span style="color:#f97316">🗑️ Auftrag jest Deleted — nie zmieniam</span>';
        } else if (row.reviewOnly) {
            tdStatus.innerHTML = '<span style="color:#f97316">⚠️ ' + (row.reviewReason || 'Do sprawdzenia na Amazonie') + '</span>';
        } else if (row.skipped && !row.selected) {
            tdStatus.innerHTML = '<span style="color:#6b7280">⏭️ pominięty</span>';
        } else if (row.error) {
            tdStatus.innerHTML = '<span style="color:#dc2626">❌ ' + row.error + '</span>';
        } else if (row.marketplace === 'allegro_uuid' && row.targetType) {
            const already = String(row.currentType || '').indexOf('Ju\u017c') === 0;
            tdStatus.innerHTML =
                '<span style="color:' + (already ? '#16a34a' : '#0ea5e9') + '">\u2705 ' +
                (row.currentType || ('do zmiany na ' + row.targetType)) + '</span>';
        } else if (row.marketplace === 'amazon_de' && row.targetType) {
            tdStatus.innerHTML =
                '<span style="color:#0ea5e9">✅ Amazon DE — ' +
                (row.currentType || ('do zmiany na ' + row.targetType)) +
                '</span>';
        } else if (row.accountsAlreadyB2B) {
            tdStatus.innerHTML = '<span style="color:#16a34a">✅ aktualny typ już B2B — konta są OK</span>';
        } else if (row.accountsAreB2C) {
            tdStatus.innerHTML = '<span style="color:#0ea5e9">✅ B2C — do zmiany na B2B</span>';
        } else if (String(row.currentType).toUpperCase() === 'B2B') {
            tdStatus.innerHTML = '<span style="color:#16a34a">✅ już B2B</span>';
        } else {
            tdStatus.innerHTML = '<span style="color:#0ea5e9">✅ znaleziono — do zmiany na B2B</span>';
        }

        tr.appendChild(tdStatus);

        return tr;
    }

    function buildTable() {
        const tbody = document.getElementById('tm-c-preview-body');
        tbody.innerHTML = '';

        previewRows.forEach(function (row, i) {
            tbody.appendChild(createTr(row, i));
        });
    }

    function updateRow(i) {
        const tbody = document.getElementById('tm-c-preview-body');
        const existing = tbody.querySelector('tr[data-row="' + i + '"]');
        const newTr = createTr(previewRows[i], i);

        if (existing) tbody.replaceChild(newTr, existing);
        else tbody.appendChild(newTr);
    }

    panel.querySelector('#tm-c-check-btn').onclick = async function () {
        const items = parseMarketplace(document.getElementById('tm-c-input').value || '', getMarketplace());

        if (!items.length) {
            document.getElementById('tm-c-parse-preview').innerHTML =
                '<span style="color:red">⚠️ Brak pasujących pozycji!</span>';
            return;
        }

        document.getElementById('tm-c-preview-section').style.display = 'block';
        document.getElementById('tm-c-progress').style.display = 'none';
        document.getElementById('tm-c-summary').innerHTML = '';

        previewRows = items.map(function (item) {
            item.loading = true;
            item.error = null;
            item.selected = false;
            item.changed = false;
            item.skipped = false;
            return item;
        });

        buildTable();

        const checkBtn = document.getElementById('tm-c-check-btn');
        checkBtn.disabled = true;
        checkBtn.textContent = '⏳ Sprawdzam…';
        tmIsBusy = true;

        for (let i = 0; i < previewRows.length; i++) {
            try {
                const result = await checkOne(previewRows[i]);

                if (result.ok) {
                    Object.assign(previewRows[i], result);
                    previewRows[i].loading = false;
                } else {
                    previewRows[i].loading = false;
                    previewRows[i].selected = false;
                    previewRows[i].error = result.error;
                    previewRows[i].auctionUrls = result.auctionUrls || [];
                }
            } catch (e) {
                previewRows[i].loading = false;
                previewRows[i].selected = false;
                previewRows[i].error = e.message;
            }

            updateRow(i);
            await sleep(300);
        }

        tmIsBusy = false;
        checkBtn.disabled = false;
        checkBtn.textContent = '🔍 Sprawdź';
    };

    async function processRowCheckAndChange(row, i, ctx, progressList, counters) {
        // 1) sprawdzenie
        try {
            const result = await checkOne(row, ctx);
            if (result.ok) { Object.assign(row, result); row.loading = false; }
            else { row.loading = false; row.selected = false; row.error = result.error; row.auctionUrls = result.auctionUrls || []; }
        } catch (e) { row.loading = false; row.selected = false; row.error = e.message; }
        updateRow(i);

        const needsChange = !row.error && row.selected && !row.changed &&
            !row.accountsAlreadyB2B && !row.isDeleted && !row.reviewOnly;

        if (!needsChange) {
            if (!row.error && !row.changed) counters.skipped++;
            return;
        }

        const logRow = document.createElement('div');
        logRow.style.cssText = 'padding:4px 0;border-bottom:1px solid #f0f0f0;white-space:normal;word-break:break-word;line-height:1.35;';
        logRow.innerHTML = '⏳ <strong>' + row.orderNumber + '</strong> — zmieniam na ' + (row.targetType || 'B2B') + '…';
        progressList.appendChild(logRow);
        progressList.scrollTop = progressList.scrollHeight;

        try {
            const result = await changeCustomerType(row, ctx);
            counters.ok++;
            row.selected = false; row.changed = true; row.skipped = false;
            row.currentType = result.targetType || row.targetType || 'B2B';
            if (result.typeOnly) {
                logRow.innerHTML = '✅ <strong>' + row.orderNumber + '</strong> — brak płatności 1323, zmieniono tylko typ na ' + result.targetType;
            } else if (result.amazonRebooked) {
                logRow.innerHTML = '✅ <strong>' + row.orderNumber + '</strong> — Amazon DE zmieniono na ' + result.targetType + ', przeksięgowano ' + result.amount;
            } else {
                logRow.innerHTML = '✅ <strong>' + row.orderNumber + '</strong> — zmieniono na ' + (result.confirmedType || row.targetType || 'B2B');
            }
            logRow.style.color = '#16a34a';
        } catch (e) {
            counters.fail++; row.error = e.message; row.selected = false;
            logRow.innerHTML = '❌ <strong>' + row.orderNumber + '</strong> — BŁĄD: ' + e.message;
            logRow.style.color = '#dc2626';
        }
        updateRow(i);
    }

    panel.querySelector('#tm-c-check-change-parallel-btn').onclick = async function () {
        const items = parseMarketplace(document.getElementById('tm-c-input').value || '', getMarketplace());
        if (!items.length) {
            document.getElementById('tm-c-parse-preview').innerHTML = '<span style="color:red">⚠️ Brak pasujących pozycji!</span>';
            return;
        }

        let workers = parseInt(document.getElementById('tm-c-workers').value, 10);
        if (!(workers >= 1)) workers = 3;
        if (workers > 10) workers = 10;

        let tm = parseFloat(document.getElementById('tm-c-timeout-mult').value);
        if (!(tm >= 1)) tm = 1;
        timeoutMult = tm;

        document.getElementById('tm-c-preview-section').style.display = 'block';
        const progressDiv = document.getElementById('tm-c-progress');
        const progressList = document.getElementById('tm-c-progress-list');
        const summary = document.getElementById('tm-c-summary');
        progressDiv.style.display = 'block';
        progressList.innerHTML = '';
        summary.innerHTML = '';

        previewRows = items.map(function (item) {
            item.loading = true; item.error = null; item.selected = false; item.changed = false; item.skipped = false;
            return item;
        });
        buildTable();

        const b = document.getElementById('tm-c-check-change-parallel-btn');
        b.disabled = true; b.textContent = '⏳ Pracuję (' + workers + ')…';
        tmIsBusy = true;

        const counters = { ok: 0, fail: 0, skipped: 0 };
        let next = 0;
        const activeOrders = new Set(); // blokada na ten sam order

        const ctxs = [];
        for (let w = 0; w < workers; w++) ctxs.push(createFrameCtx());

        async function worker(ctx) {
            while (true) {
                let i = -1;
                // znajdź kolejny wiersz, którego order nie jest właśnie przetwarzany
                for (let k = next; k < previewRows.length; k++) {
                    if (previewRows[k]._taken) continue;
                    if (activeOrders.has(previewRows[k].orderNumber)) continue;
                    i = k; break;
                }
                if (i < 0) {
                    // nic wolnego: albo koniec, albo czekamy aż zwolni się order
                    if (previewRows.every(r => r._taken)) break;
                    await sleep(200);
                    continue;
                }
                previewRows[i]._taken = true;
                if (i === next) { while (next < previewRows.length && previewRows[next]._taken) next++; }
                activeOrders.add(previewRows[i].orderNumber);
                try {
                    await processRowCheckAndChange(previewRows[i], i, ctx, progressList, counters);
                } finally {
                    activeOrders.delete(previewRows[i].orderNumber);
                }
            }
        }

        try {
            await Promise.all(ctxs.map(worker));
        } finally {
            ctxs.forEach(destroyFrameCtx);
        }

        buildTable();
        summary.innerHTML = '✅ Zmienione: <strong>' + counters.ok + '</strong> &nbsp; ❌ Błędy: <strong>' + counters.fail + '</strong> &nbsp; ⏭️ Pominięte: <strong>' + counters.skipped + '</strong>';
        summary.style.color = counters.fail === 0 ? '#16a34a' : '#b45309';

        tmIsBusy = false;
        timeoutMult = 1;
        b.disabled = false; b.textContent = '🚀 Sprawdź i zmień RÓWNOLEGLE';
    };

    panel.querySelector('#tm-c-check-change-btn').onclick = async function () {
        const items = parseMarketplace(document.getElementById('tm-c-input').value || '', getMarketplace());
        if (!items.length) {
            document.getElementById('tm-c-parse-preview').innerHTML =
                '<span style="color:red">⚠️ Brak pasujących pozycji!</span>';
            return;
        }

        document.getElementById('tm-c-preview-section').style.display = 'block';
        const progressDiv = document.getElementById('tm-c-progress');
        const progressList = document.getElementById('tm-c-progress-list');
        const summary = document.getElementById('tm-c-summary');
        progressDiv.style.display = 'block';
        progressList.innerHTML = '';
        summary.innerHTML = '';

        previewRows = items.map(function (item) {
            item.loading = true; item.error = null; item.selected = false; item.changed = false; item.skipped = false;
            return item;
        });
        buildTable();

        const b = document.getElementById('tm-c-check-change-btn');
        b.disabled = true; b.textContent = '⏳ Sprawdzam i zmieniam…';
        tmIsBusy = true;

        let ok = 0, fail = 0, skipped = 0;

        for (let i = 0; i < previewRows.length; i++) {
            const row = previewRows[i];

            // 1) sprawdzenie
            try {
                const result = await checkOne(row);
                if (result.ok) { Object.assign(row, result); row.loading = false; }
                else { row.loading = false; row.selected = false; row.error = result.error; row.auctionUrls = result.auctionUrls || []; }
            } catch (e) { row.loading = false; row.selected = false; row.error = e.message; }
            updateRow(i);

            // 2) jeśli są przesłanki do zmiany — zmień od razu
            const needsChange = !row.error && row.selected && !row.changed &&
                !row.accountsAlreadyB2B && !row.isDeleted && !row.reviewOnly;

            if (!needsChange) {
                if (!row.error && !row.changed) skipped++;
                await sleep(150);
                continue;
            }

            const logRow = document.createElement('div');
            logRow.style.cssText = 'padding:4px 0;border-bottom:1px solid #f0f0f0;white-space:normal;word-break:break-word;line-height:1.35;';
            logRow.innerHTML = '⏳ <strong>' + row.orderNumber + '</strong> — zmieniam na ' + (row.targetType || 'B2B') + '…';
            progressList.appendChild(logRow);
            progressList.scrollTop = progressList.scrollHeight;

            try {
                const result = await changeCustomerType(row);
                ok++;
                row.selected = false; row.changed = true; row.skipped = false;
                row.currentType = result.targetType || row.targetType || 'B2B';
                if (result.typeOnly) {
                    logRow.innerHTML = '✅ <strong>' + row.orderNumber + '</strong> — brak płatności 1323, zmieniono tylko typ na ' + result.targetType;
                } else if (result.amazonRebooked) {
                    logRow.innerHTML = '✅ <strong>' + row.orderNumber + '</strong> — Amazon DE zmieniono na ' + result.targetType + ', przeksięgowano ' + result.amount + ' (Selling ' + result.verifiedSellingAccount + ')';
                } else {
                    logRow.innerHTML = result.alreadyB2B
                        ? '✅ <strong>' + row.orderNumber + '</strong> — już poprawne'
                        : '✅ <strong>' + row.orderNumber + '</strong> — zmieniono na ' + (result.confirmedType || row.targetType || 'B2B');
                }
                logRow.style.color = '#16a34a';
            } catch (e) {
                fail++; row.error = e.message; row.selected = false;
                logRow.innerHTML = '❌ <strong>' + row.orderNumber + '</strong> — BŁĄD: ' + e.message;
                logRow.style.color = '#dc2626';
            }
            updateRow(i);
            await sleep(400);
        }

        buildTable();
        summary.innerHTML = '✅ Zmienione: <strong>' + ok + '</strong> &nbsp; ❌ Błędy: <strong>' + fail + '</strong> &nbsp; ⏭️ Pominięte: <strong>' + skipped + '</strong>';
        summary.style.color = fail === 0 ? '#16a34a' : '#b45309';

        tmIsBusy = false;
        b.disabled = false; b.textContent = '⚡ Sprawdź i zmień od razu';
    };

    panel.querySelector('#tm-c-change-selected-btn').onclick = async function () {
        const progressDiv = document.getElementById('tm-c-progress');
        const progressList = document.getElementById('tm-c-progress-list');
        const summary = document.getElementById('tm-c-summary');
        const changeBtn = document.getElementById('tm-c-change-selected-btn');

        const rowsToChange = previewRows.filter(function (row) {
            return (
                !row.error &&
                row.selected &&
                !row.changed &&
                !row.accountsAlreadyB2B &&
                !row.isDeleted &&
                !row.reviewOnly
            );
        });

        progressDiv.style.display = 'block';
        progressList.innerHTML = '';
        summary.innerHTML = '';

        if (!rowsToChange.length) {
            summary.innerHTML = '⚠️ Nie ma zaznaczonych pozycji do zmiany.';
            summary.style.color = '#b45309';
            return;
        }

        changeBtn.disabled = true;
        changeBtn.textContent = '⏳ Zmieniam…';
        tmIsBusy = true;

        let ok = 0;
        let fail = 0;
        let skipped = 0;

        for (let i = 0; i < previewRows.length; i++) {
            const row = previewRows[i];

            if (
                row.error ||
                !row.selected ||
                row.changed ||
                row.accountsAlreadyB2B ||
                row.isDeleted ||
                row.reviewOnly
            ) {
                if (!row.selected && !row.changed && !row.accountsAlreadyB2B && !row.isDeleted && !row.reviewOnly) {
                    row.skipped = true;
                    skipped++;
                }
                continue;
            }

            const logRow = document.createElement('div');
            logRow.style.cssText =
                'padding:4px 0;border-bottom:1px solid #f0f0f0;white-space:normal;word-break:break-word;line-height:1.35;';

            logRow.innerHTML =
                '⏳ <strong>' +
                row.orderNumber +
                '</strong> — zmieniam typ klienta' +
                (row.targetType ? (' na ' + row.targetType) : ' na B2B') +
                '…';

            progressList.appendChild(logRow);
            progressList.scrollTop = progressList.scrollHeight;

            try {
                const result = await changeCustomerType(row);

                ok++;
                row.selected = false;
                row.changed = true;
                row.skipped = false;
                row.currentType = result.targetType || 'B2B';

                if (result.amazonRebooked) {
                    logRow.innerHTML =
                        '✅ <strong>' +
                        row.orderNumber +
                        '</strong> — Amazon DE: zmieniono na ' +
                        result.targetType +
                        ', Unbook + ponowne księgowanie ' +
                        result.amount +
                        ' z datą ' +
                        result.bookingDate +
                        ' — potwierdzono w Payments (Selling Account: ' +
                        result.verifiedSellingAccount +
                        ', próby typu: ' +
                        result.typeAttempts +
                        ', próby księgowania: ' +
                        result.paymentAttempts +
                        ')';
                } else if (result.typeOnly) {
                    logRow.innerHTML =
                        '✅ <strong>' +
                        row.orderNumber +
                        '</strong> — Amazon DE: brak płatności 1323, zmieniono tylko typ klienta na ' +
                        result.targetType +
                        ' (próby typu: ' +
                        result.typeAttempts +
                        ')';
                } else {
                    logRow.innerHTML = result.alreadyB2B
                        ? '✅ <strong>' + row.orderNumber + '</strong> — już było B2B'
                        : '✅ <strong>' + row.orderNumber + '</strong> — typ klienta zmieniony i potwierdzony po ' + result.attempts + ' próbie/próbach';
                }

                logRow.style.color = '#16a34a';
            } catch (e) {
                fail++;
                row.error = e.message;
                row.selected = false;

                logRow.innerHTML =
                    '❌ <strong>' + row.orderNumber + '</strong> — BŁĄD: ' + e.message;

                logRow.style.color = '#dc2626';
            }

            updateRow(i);
            await sleep(600);
        }

        buildTable();

        summary.innerHTML =
            '✅ Zmienione: <strong>' +
            ok +
            '</strong> &nbsp; ❌ Błędy: <strong>' +
            fail +
            '</strong> &nbsp; ⏭️ Pominięte: <strong>' +
            skipped +
            '</strong>';

        summary.style.color = fail === 0 ? '#16a34a' : '#b45309';

        tmIsBusy = false;
        changeBtn.disabled = false;
        changeBtn.textContent = '🚀 Zmień typ klienta';
    };

    panel.querySelector('#tm-c-select-all-btn').onclick = function () {
        previewRows.forEach(function (row) {
            if (
                !row.error &&
                !row.loading &&
                !row.changed &&
                !row.accountsAlreadyB2B &&
                !row.isDeleted &&
                !row.reviewOnly
            ) {
                row.selected = true;
                row.skipped = false;
            }
        });

        buildTable();
    };

    panel.querySelector('#tm-c-unselect-all-btn').onclick = function () {
        previewRows.forEach(function (row) {
            row.selected = false;
            if (!row.changed) row.skipped = true;
        });

        buildTable();
    };

    panel.querySelector('#tm-c-clear-btn').onclick = function () {
        previewRows = [];
        tmIsBusy = false;

        document.getElementById('tm-c-input').value = '';
        document.getElementById('tm-c-parse-preview').innerHTML =
            '<span style="color:#888">Nie znaleziono pozycji</span>';
        document.getElementById('tm-c-preview-body').innerHTML = '';
        document.getElementById('tm-c-progress-list').innerHTML = '';
        document.getElementById('tm-c-summary').innerHTML = '';
        document.getElementById('tm-c-progress').style.display = 'none';
        document.getElementById('tm-c-preview-section').style.display = 'none';
    };

    panel.querySelectorAll('input[name="tm-c-marketplace"]').forEach(function (r) {
        r.addEventListener('change', updateParsePreview);
    });

    btn.onclick = function () {
        const opening = panel.style.display === 'none';
        panel.style.display = opening ? 'block' : 'none';

        if (opening) {
            const input = document.getElementById('tm-c-input');
            input.removeEventListener('input', updateParsePreview);
            input.addEventListener('input', updateParsePreview);
            setTimeout(updateParsePreview, 30);
        }
    };

    document.addEventListener('click', function (e) {
        if (!btn.contains(e.target) && !panel.contains(e.target)) {
            panel.style.display = 'none';
        }
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    // ===== SZYBKI TRYB (API): pokaz aktualny typ + zmien na B2B bez iframe =====
    (function setupFastB2B(){
        function fastMkt(){ var r = panel.querySelector('input[name="tm-c-marketplace"]:checked'); return r ? r.value : 'allegro_pl'; }
        function fastRead(orderNumber){
            var searchUrl = BASE + '/search.php?what=ff_number&ff_number=' + encodeURIComponent(orderNumber);
            return fetch(searchUrl, { credentials: 'same-origin' })
                .then(function(r){ return r.text().then(function(html){ return { finalUrl: r.url, html: html }; }); })
                .then(function(o){
                    var auctionUrl = null;
                    if (/auction\.php\?number=/.test(o.finalUrl)) auctionUrl = o.finalUrl;
                    if (!auctionUrl) { var d = new DOMParser().parseFromString(o.html, 'text/html'); var a = d.querySelector('a[href*="auction.php?number="]'); if (a) auctionUrl = absoluteUrl(a.getAttribute('href')); }
                    if (!auctionUrl) return { ok:false, error:'nie znaleziono zamowienia' };
                    return fetch(auctionUrl, { credentials:'same-origin' }).then(function(r){ return r.text(); }).then(function(ah){
                        var ad = new DOMParser().parseFromString(ah, 'text/html');
                        var sel = ad.querySelector('select[name="customer_type"]');
                        var current = (sel && sel.options[sel.selectedIndex]) ? String(sel.options[sel.selectedIndex].value || '').trim() : '';
                        var m = ah.match(/var __AUCTION = "([^"]+)"/);
                        return { ok:true, auctionUrl:auctionUrl, current:current, auction: m ? m[1] : '' };
                    });
                })
                .catch(function(e){ return { ok:false, error:e.message }; });
        }
        function fastChange(auction, targetType){
            var body = 'fn=change_customer_type&auction=' + encodeURIComponent(auction) + '&customerType=' + encodeURIComponent(targetType);
            return fetch(BASE + '/js_backend.php', { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With':'XMLHttpRequest' }, body: body })
                .then(function(r){ return r.ok; }).catch(function(){ return false; });
        }

        var wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:10px;padding-top:10px;border-top:2px dashed #FF2F00;';
        wrap.innerHTML =
            '<button id="tm-c-fast-btn" style="padding:9px;width:100%;background:#FF2F00;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">\u26A1 SZYBKO (API): pokaz typ + zmien na B2B</button>'
          + '<div id="tm-c-fast-status" style="font-size:11px;color:#666;margin-top:6px;"></div>'
          + '<div id="tm-c-fast-list" style="margin-top:6px;font-size:12px;max-height:260px;overflow-y:auto;font-family:monospace;"></div>'
          + '<button id="tm-c-fast-change" style="display:none;margin-top:8px;padding:8px;width:100%;background:#16a34a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">Zmien zaznaczone na B2B</button>';
        panel.appendChild(wrap);

        var fastItems = [];
        document.getElementById('tm-c-fast-btn').onclick = async function(){
            var st = document.getElementById('tm-c-fast-status');
            var listEl = document.getElementById('tm-c-fast-list');
            var changeBtn = document.getElementById('tm-c-fast-change');
            var inp = document.getElementById('tm-c-input');
            var parsed = parseMarketplace(inp ? inp.value : '', fastMkt());
            if (!parsed.length) { st.textContent = 'Brak rozpoznanych numerow we wklejce.'; return; }
            st.textContent = 'Sprawdzam ' + parsed.length + '...'; listEl.innerHTML = ''; changeBtn.style.display = 'none'; fastItems = [];
            for (var i = 0; i < parsed.length; i++) {
                var it = parsed[i];
                var res = await fastRead(it.orderNumber);
                st.textContent = 'Sprawdzam ' + (i+1) + '/' + parsed.length + '...';
                var idx = fastItems.length;
                var row = { order: it.orderNumber, target: (it.targetType || 'B2B'), current: res.ok ? res.current : '', auction: res.ok ? res.auction : '', auctionUrl: res.ok ? res.auctionUrl : '', error: res.ok ? '' : res.error };
                fastItems.push(row);
                var already = res.ok && String(row.current).toUpperCase() === String(row.target).toUpperCase();
                var h = '<div style="display:flex;align-items:flex-start;gap:6px;padding:2px 0;" data-idx="' + idx + '">';
                h += (res.ok && !already) ? '<input type="checkbox" class="tm-c-fast-cb" data-idx="' + idx + '">' : '<span style="width:13px;flex:0 0 13px;"></span>';
                h += '<span><strong>' + row.order + '</strong> \u2014 ';
                if (!res.ok) h += '<span style="color:#dc2626;">' + row.error + '</span>';
                else if (already) h += 'juz ' + row.current + ' \u2713';
                else h += 'teraz: <b>' + (row.current || '?') + '</b> \u2192 ' + row.target + (row.auctionUrl ? ' <a href="' + row.auctionUrl + '" target="_blank">[strona]</a>' : '');
                h += '<span class="tm-c-fast-note"></span></span></div>';
                listEl.insertAdjacentHTML('beforeend', h);
            }
            var changeable = fastItems.some(function(r){ return r.error === '' && String(r.current).toUpperCase() !== String(r.target).toUpperCase(); });
            changeBtn.style.display = changeable ? 'block' : 'none';
            st.textContent = 'Gotowe.';
        };

        document.getElementById('tm-c-fast-change').onclick = async function(){
            var listEl = document.getElementById('tm-c-fast-list');
            var st = document.getElementById('tm-c-fast-status');
            var checked = Array.prototype.slice.call(listEl.querySelectorAll('.tm-c-fast-cb:checked'));
            if (!checked.length) { st.textContent = 'Zaznacz przynajmniej jedno.'; return; }
            if (!confirm('Zmienic typ na B2B dla ' + checked.length + ' zamowien?')) return;
            var ok = 0, err = 0;
            for (var j = 0; j < checked.length; j++) {
                var cb = checked[j];
                var idx = parseInt(cb.getAttribute('data-idx'), 10);
                var row = fastItems[idx];
                var cont = cb.closest('[data-idx]');
                var note = cont ? cont.querySelector('.tm-c-fast-note') : null;
                if (!row || !row.auction) { err++; if (note) { note.style.color = '#dc2626'; note.textContent = ' \u274C brak __AUCTION'; } continue; }
                await fastChange(row.auction, row.target);
                var v = await fastRead(row.order);
                var okNow = v.ok && String(v.current).toUpperCase() === String(row.target).toUpperCase();
                if (okNow) { ok++; cb.checked = false; cb.disabled = true; if (note) { note.style.color = '#16a34a'; note.textContent = ' \u2705 ' + v.current; } }
                else { err++; if (note) { note.style.color = '#dc2626'; note.textContent = ' \u274C nie zmienil (' + (v.ok ? v.current : v.error) + ')'; } }
            }
            st.textContent = 'Gotowe: ' + ok + ' zmienione' + (err ? ', ' + err + ' blad' : '') + '.';
        };
    })();
})();
    }

    function init_allegro() {
(function () {
    'use strict';

    const SC = 'https://salescenter.allegro.com';
    const KEY = 'al_booking_state_v2';
    const WIDE_FROM = '2020-07-01T00:00:00.000Z'; // szeroki zakres = "all period" na settlements

    const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    const $ = function (sel, root) { return (root || document).querySelector(sel); };
    const $$ = function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); };

    function loadState() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    function saveState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
    function clearState() { try { localStorage.removeItem(KEY); } catch (e) {} }

    function normAmount(s) {
        let t = String(s || '').replace(/\u00a0/g, ' ');
        t = t.replace(/[^\d.,-]/g, '');
        const neg = t.indexOf('-') >= 0;
        t = t.replace(/-/g, '');
        if (!t) return '';
        const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
        let dec = -1;
        if (lc >= 0 && ld >= 0) dec = Math.max(lc, ld);
        else if (lc >= 0) dec = /,\d{1,2}$/.test(t) ? lc : -1;
        else if (ld >= 0) dec = /\.\d{1,2}$/.test(t) ? ld : -1;
        let intPart = (dec >= 0 ? t.slice(0, dec) : t).replace(/[.,]/g, '');
        let frac = dec >= 0 ? t.slice(dec + 1).replace(/[.,]/g, '') : '';
        return (neg ? '-' : '') + intPart + (frac ? '.' + frac : '');
    }

    function fmtDate(d) { const p = String(d || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : (d || ''); }
    const MARKETS = {
        'cz': { label: 'Allegro CZ', marketplaceId: 'allegro-cz', sellerId: '' },
        'hu': { label: 'Allegro HU', marketplaceId: 'allegro-hu', sellerId: '' },
        'sk': { label: 'Allegro SK', marketplaceId: 'allegro-sk', sellerId: '' },
        'pl1069': { label: 'Allegro PL1069', marketplaceId: 'allegro-pl', sellerId: '29243126' },
        'pl1071': { label: 'Allegro PL1071', marketplaceId: 'allegro-pl', sellerId: '58578594' }
    };
    function mkt(key) { return MARKETS[key] || MARKETS['cz']; }
    function marketLabel(key) { return mkt(key).label; }
    function dmyNum(d) { const p = String(d || '').split('.'); return p.length === 3 ? Number(p[2] + p[1] + p[0]) : 0; }

    function waitFor(cond, ms) {
        const timeoutMs = ms || 15000;
        return new Promise(function (resolve, reject) {
            const start = Date.now();
            (function loop() {
                let ok = false; try { ok = cond(); } catch (e) {}
                if (ok) return resolve(true);
                if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
                setTimeout(loop, 300);
            })();
        });
    }

    function nextPageButton() {
        return document.querySelector('nav[aria-label="Paginacja"] button[aria-label="nast\u0119pna strona"]');
    }

    async function collectAllPages() {
        const all = [];
        const seen = new Set();
        const add = function (arr) { arr.forEach(function (o) { if (!seen.has(o.uuid)) { seen.add(o.uuid); all.push(o); } }); };

        for (let page = 0; page < 60; page++) {
            await autoScrollOps();
            add(scrapeOps());

            const btn = nextPageButton();
            if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') break;

            const before = $$('a[href*="/orders?query="]').length ? $$('a[href*="/orders?query="]')[0].getAttribute('href') : '';
            msg('Strona ' + (page + 1) + ' \u2014 zebrano ' + all.length + ', ide dalej\u2026');
            btn.click();
            // czekaj az pierwszy wiersz sie zmieni (nowa strona)
            try {
                await waitFor(function () {
                    const first = $$('a[href*="/orders?query="]')[0];
                    return first && first.getAttribute('href') !== before;
                }, 12000);
            } catch (e) { break; }
            await sleep(800);
        }
        return all;
    }

    async function autoScrollOps() {
        let last = -1;
        for (let i = 0; i < 30; i++) {
            const n = $$('a[href*="/orders?query="]').length;
            const rows = $$('.mlkp_ag').length;
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(900);
            if (n === last && rows > 0 && $$('a[href*="/orders?query="]').length === n) {
                // jeszcze jedna proba po dluzszej chwili
                await sleep(700);
                if ($$('a[href*="/orders?query="]').length === n) break;
            }
            last = n;
        }
        window.scrollTo(0, 0);
    }

    // ---------- scraping ----------
    function scrapeOps() {
        const out = [];
        const seen = new Set();
        $$('a[href*="/orders?query="]').forEach(function (a) {
            const m = (a.getAttribute('href') || '').match(/query=([0-9a-fA-F-]+)/);
            const uuid = m ? m[1] : '';
            if (!uuid || seen.has(uuid)) return;
            let row = a.closest('.mlkp_ag');
            if (!row) {
                let el = a;
                for (let k = 0; k < 8; k++) {
                    el = el.parentElement;
                    if (!el) break;
                    if (el.querySelector('span.m9qz_yq') ||
                        Array.from(el.querySelectorAll('span[lang]')).some(function (s) {
                            return /CZK|EUR|HUF|PLN|Ft|z\u0142|\u20ac/.test(s.textContent || '');
                        })) { row = el; break; }
                }
            }
            if (!row) return;
            seen.add(uuid);
            let amount = '';
            {
                let amtSpan = row.querySelector('span.m9qz_yq') ||
                    row.querySelector('[data-test-cell-name="amount-cell"] span[lang]');
                if (!amtSpan) {
                    amtSpan = $$('span[lang]', row).find(function (s) {
                        return /CZK|EUR|HUF|PLN|Ft|z\u0142|\u20ac/.test(s.textContent || '');
                    });
                }
                if (amtSpan) amount = amtSpan.textContent;
            }
            const md = (row.textContent || '').match(/(\d{2}\.\d{2}\.\d{4})/);
            const date = md ? md[1] : '';
            out.push({ date: date, uuid: uuid, amount: normAmount(amount), orderId: '', type: '' });
        });
        return out;
    }

    function readOrderId() {
        const btn = $('[data-analytics-view-label="desktopDetailsLink_view"]');
        if (btn) { const v = (btn.getAttribute('data-analytics-view-value') || '').trim(); if (v) return v; }
        const el = $('[data-test-id="order-id"]');
        if (el) return el.textContent.trim();
        return '';
    }

    function readType() {
        const cells = $$('[data-test-cell-name="billingType-cell"]');
        const txt = cells.map(function (c) { return c.textContent || ''; }).join(' ');
        const isB2C = /VEP/.test(txt) || /e-?commerce vat/i.test(txt) || /naliczenie vat e-commerce/i.test(txt) ||
            !!$('[data-testid="keyed-context-entry-value-vatGoods"]');
        return isB2C ? 'B2C' : 'B2B';
    }

    // ---------- silnik ----------
    async function resume() {
        const st = loadState();
        if (!st || !st.active) return;

        ensurePanel(true);
        buildTable(st.rows);

        if (location.pathname.indexOf('/orders') === 0 && location.search.indexOf('query=') >= 0) {
            const r = st.rows[st.idx];
            const tries = (st.oTries || 0);
            msg('Order-id ' + (st.idx + 1) + '/' + st.rows.length + (tries ? ' (proba ' + (tries + 1) + ')' : '') + '\u2026');
            try { await waitFor(function () { return readOrderId(); }, 15000); } catch (e) {}
            r.orderId = readOrderId();

            if (!r.orderId && tries < 2) {
                st.oTries = tries + 1;
                saveState(st);
                await sleep(1000);
                location.reload();
                return;
            }
            st.oTries = 0;
            saveState(st); buildTable(st.rows);
            if (!r.orderId) { nextStep(st); return; }
            const cfg = mkt(st.market);
            let url = SC + '/settlements-with-allegro?marketplaceId=' + cfg.marketplaceId +
                '&dateFrom=' + encodeURIComponent(WIDE_FROM) +
                '&offerIdOrOrderId=' + encodeURIComponent(r.orderId);
            if (cfg.sellerId) url += '&sellerId=' + cfg.sellerId;
            location.href = url;
            return;
        }

        if (location.pathname.indexOf('/settlements-with-allegro') === 0) {
            const r = st.rows[st.idx];
            const tries = (st.tTries || 0);
            msg('Typ ' + (st.idx + 1) + '/' + st.rows.length + (tries ? ' (proba ' + (tries + 1) + ')' : '') + '\u2026');
            let loaded = false;
            try {
                await waitFor(function () {
                    return $$('[data-test-cell-name="billingType-cell"]').length > 0 || $('[data-testid="history-table"]');
                }, 15000);
                loaded = true;
            } catch (e) {}
            await sleep(1200);

            if (!loaded && $$('[data-test-cell-name="billingType-cell"]').length === 0 && tries < 2) {
                st.tTries = tries + 1;
                saveState(st);
                await sleep(1000);
                location.reload();
                return;
            }
            st.tTries = 0;
            r.type = readType();
            saveState(st); buildTable(st.rows);
            nextStep(st);
            return;
        }

        // crash/otwarcie na innej stronie w trakcie aktywnego runu -> zaproponuj wznowienie
        const done = st.rows.filter(function (r) { return r.type; }).length;
        msg('↩️ Przerwana sesja: ' + done + '/' + st.rows.length + '. ');
        showResumeButton(st);
    }

    function showResumeButton(st) {
        const el = document.getElementById('al-msg');
        if (!el) return;
        const b = document.createElement('button');
        b.textContent = '↩️ Wznów';
        b.style.cssText = 'margin-left:6px;padding:3px 10px;border:none;border-radius:5px;background:#16a34a;color:#fff;cursor:pointer;font-size:12px;font-weight:bold;';
        b.onclick = function () {
            const cur = st.rows[st.idx];
            if (!cur) { clearState(); return; }
            if (!cur.orderId) { location.href = ordersUrl(st, cur.uuid); return; }
            const cfg = mkt(st.market);
            let url = SC + '/settlements-with-allegro?marketplaceId=' + cfg.marketplaceId +
                '&dateFrom=' + encodeURIComponent(WIDE_FROM) +
                '&offerIdOrOrderId=' + encodeURIComponent(cur.orderId);
            if (cfg.sellerId) url += '&sellerId=' + cfg.sellerId;
            location.href = url;
        };
        const d = document.createElement('button');
        d.textContent = 'Odrzuć';
        d.style.cssText = 'margin-left:6px;padding:3px 10px;border:none;border-radius:5px;background:#dc2626;color:#fff;cursor:pointer;font-size:12px;';
        d.onclick = function () { clearState(); el.textContent = 'Odrzucono.'; };
        el.appendChild(b); el.appendChild(d);
    }

    function ordersUrl(st, uuid) {
        const cfg = mkt(st.market);
        let u = SC + '/orders?query=' + uuid;
        if (cfg.sellerId) u += '&sellerId=' + cfg.sellerId;
        return u;
    }

    function nextStep(st) {
        st.idx++;
        if (st.idx >= st.rows.length) {
            st.active = false; saveState(st);
            msg('Gotowe: ' + st.rows.length + ' pozycji. Mozesz pobrac CSV.');
            return;
        }
        saveState(st);
        location.href = ordersUrl(st, st.rows[st.idx].uuid);
    }

    // ---------- UI ----------
    let btnEl = null, panelEl = null;

    function msg(t) { const el = $('#al-msg'); if (el) el.textContent = t; }

    function sortB2BFirst(arr) {
        const rank = function (t) { return t === 'B2B' ? 0 : (t === 'B2C' ? 1 : 2); };
        return (arr || []).slice().sort(function (a, b) { return rank(a.type) - rank(b.type); });
    }

    function buildTable(rowsArr) {
        const tb = $('#al-body');
        if (!tb) return;
        tb.innerHTML = '';
        sortB2BFirst(rowsArr).forEach(function (r, i) {
            const tr = document.createElement('tr');
            tr.style.background = i % 2 ? '#f9fafb' : '#fff';
            const color = r.type === 'B2C' ? '#0ea5e9' : (r.type === 'B2B' ? '#16a34a' : '#888');
            tr.innerHTML =
                '<td style="padding:4px 6px;border:1px solid #e5e7eb;color:#000;white-space:nowrap;">' + (r.date || '') + '</td>' +
                '<td style="padding:4px 6px;border:1px solid #e5e7eb;font-family:monospace;color:#000;">' + (r.orderId || '') + '</td>' +
                '<td style="padding:4px 6px;border:1px solid #e5e7eb;text-align:right;font-family:monospace;color:#000;">' + (r.amount || '') + '</td>' +
                '<td style="padding:4px 6px;border:1px solid #e5e7eb;text-align:center;font-weight:bold;color:' + color + ';">' + (r.type || '') + '</td>';
            tb.appendChild(tr);
        });
    }

    function getMarket() { const s = $('#al-mkt'); return s ? s.value : 'cz'; }

    function exportCsv() {
        const st = loadState();
        const rowsArr = (st && st.rows) || [];
        if (!rowsArr.length) { msg('Brak danych do eksportu.'); return; }
        const lines = ['Data;Order number;Kwota;Typ'];
        sortB2BFirst(rowsArr).forEach(function (r) { lines.push([r.date || '', r.orderId || '', r.amount || '', r.type || ''].join(';')); });
        const csv = '\uFEFF' + lines.join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const from = (st && st.rangeFrom) || '';
        const to = (st && st.rangeTo) || '';
        const mkt = (st && st.market) || getMarket();
        const suf = (st && st.filter === 'refund') ? ' refund' : '';
        a.href = url;
        a.download = (from && to ? from + '-' + to + ' ' : '') + marketLabel(mkt) + suf + '.csv';
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
    }

    async function onRun() {
        if (location.href.indexOf('funds-and-operations-history') < 0) {
            msg('\u26A0\uFE0F Otworz w Allegro: Wyplaty i historia operacji (przychodzace), ustaw zakres, potem kliknij.');
            return;
        }

        msg('Zbieram transakcje (wszystkie strony)\u2026');
        const ops = await collectAllPages();
        if (!ops.length) { msg('\u26A0\uFE0F Brak operacji.'); return; }

        const ds = ops.map(function (o) { return o.date; }).filter(Boolean).sort(function (a, b) { return dmyNum(a) - dmyNum(b); });
        // zakres do nazwy pliku bierzemy z URL listy (dateFrom/dateTo), nie z dat wplat
        const qs = new URLSearchParams(location.search);
        const uFrom = qs.get('dateFrom') || '';
        const uTo = qs.get('dateTo') || '';
        const filter = (qs.get('filter') || 'income').toLowerCase();
        const isoToDmy = function (s) { const p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ''; };
        const rangeFrom = isoToDmy(uFrom) || ds[0] || '';
        const rangeTo = isoToDmy(uTo) || ds[ds.length - 1] || '';

        const st = { active: true, market: getMarket(), filter: filter, rangeFrom: rangeFrom, rangeTo: rangeTo, idx: 0, rows: ops };
        saveState(st);
        buildTable(ops);
        msg('Znaleziono ' + ops.length + ' operacji (' + rangeFrom + ' \u2013 ' + rangeTo + '). Startuje\u2026');
        location.href = ordersUrl(st, ops[0].uuid);
    }

    function ensurePanel(openIt) {
        if (panelEl && document.body.contains(panelEl)) { if (openIt) panelEl.style.display = 'block'; return; }
        if (panelEl && btnEl) { // panel zostal usuniety przez SPA -> przywroc
            document.body.appendChild(btnEl);
            document.body.appendChild(panelEl);
            if (openIt) panelEl.style.display = 'block';
            const st = loadState(); if (st) buildTable(st.rows);
            return;
        }

        const btn = document.createElement('button');
        btnEl = btn;
        btn.textContent = '\uD83D\uDCD8 Ksiegowanie';
        btn.style.cssText =
            'position:fixed;top:120px;right:20px;z-index:2147483647;padding:10px 15px;background:#FF2F00;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2);';

        const panel = document.createElement('div');
        panelEl = panel;
        panel.style.cssText =
            'display:' + (openIt ? 'block' : 'none') + ';position:fixed;top:166px;right:20px;z-index:2147483647;background:white;border:1px solid #ccc;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:16px;width:min(720px, calc(100vw - 40px));font-family:sans-serif;max-height:calc(100vh - 190px);overflow-y:auto;';

        panel.innerHTML = '' +
            '<div style="font-weight:bold;margin-bottom:8px;color:#111;font-size:15px;">\uD83D\uDCD8 Allegro CZ/HU/SK - lista do ksiegowania</div>' +
            '<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;font-size:13px;">' +
                '<label style="font-weight:bold;color:#333;">Rynek:</label>' +
                '<select id="al-mkt" style="padding:5px;border:1px solid #ccc;border-radius:5px;">' +
                    '<option value="cz">Allegro CZ</option>' +
                    '<option value="hu">Allegro HU</option>' +
                    '<option value="sk">Allegro SK</option>' +
                    '<option value="pl1069">Allegro PL1069</option>' +
                    '<option value="pl1071">Allegro PL1071</option>' +
                '</select>' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
                '<button id="al-run" style="flex:1;padding:9px;background:#FF2F00;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">\u25B6\uFE0F Pobierz transakcje</button>' +
                '<button id="al-csv" style="width:120px;padding:9px;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">\u2B07\uFE0F CSV</button>' +
                '<button id="al-clear" style="width:100px;padding:9px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">\uD83E\uDDF9 Reset</button>' +
            '</div>' +
            '<div id="al-msg" style="margin-top:8px;font-size:12px;color:#555;min-height:16px;"></div>' +
            '<div style="margin-top:10px;overflow-x:auto;max-width:100%;border:1px solid #e5e7eb;border-radius:6px;">' +
                '<table style="width:100%;min-width:560px;border-collapse:collapse;font-size:12px;">' +
                    '<thead><tr style="background:#f3f4f6;">' +
                        '<th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Data</th>' +
                        '<th style="padding:5px 6px;text-align:left;border:1px solid #e5e7eb;">Order number</th>' +
                        '<th style="padding:5px 6px;text-align:right;border:1px solid #e5e7eb;">Kwota</th>' +
                        '<th style="padding:5px 6px;text-align:center;border:1px solid #e5e7eb;">Typ</th>' +
                    '</tr></thead>' +
                    '<tbody id="al-body"></tbody>' +
                '</table>' +
            '</div>';

        btn.onclick = function () { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; };
        document.addEventListener('click', function (e) {
            if (!btn.contains(e.target) && !panel.contains(e.target)) panel.style.display = 'none';
        });

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        panel.querySelector('#al-run').onclick = onRun;
        panel.querySelector('#al-csv').onclick = exportCsv;
        panel.querySelector('#al-clear').onclick = function () { clearState(); buildTable([]); msg('Wyczyszczono.'); };

        // przywroc rynek/daty ze stanu
        const st = loadState();
        if (st) {
            if (st.market) { const sm = panel.querySelector('#al-mkt'); if (sm) sm.value = st.market; }
        }
    }

    ensurePanel(false);
    resume();

    // SPA podmienia body i kasuje panel -> pilnuj, zeby wrocil
    setInterval(function () {
        if (!panelEl || !document.body.contains(panelEl)) ensurePanel(false);
    }, 1500);
})();
    }

    // ===== Rejestr modułów + przełączniki per osoba =====
    const MODULES = [
        { id: 'vies',     name: 'Kurs walut + VIES/KRS/GUS', test: () => onProlo() || onGus(), init: init_vies },
        { id: 'ksieg',    name: 'Ksiegowanie w tickecie',    test: onProlo,   init: init_ksieg },
        { id: 'refund',   name: 'Refund Checker',            test: onProlo,   init: init_refund },
        { id: 'sepa',     name: 'SEPA Walidator IBAN',       test: onProlo,   init: init_sepa },
        { id: 'issuelog', name: 'Issue Log - Faktury',       test: onProlo,   init: init_issuelog },
        { id: 'klient',   name: 'Zmiana typu klienta',       test: onProlo,   init: init_klient },
        { id: 'allegro',  name: 'Allegro CZ/HU/SK',          test: onAllegro, init: init_allegro },
    ];

    MODULES.forEach(function (m) {
        try {
            GM_registerMenuCommand((isOn(m.id) ? '\u2705 ' : '\u2B1C ') + m.name, function () {
                try { GM_setValue(HUB + m.id, !isOn(m.id)); } catch (e) {}
                location.reload();
            });
        } catch (e) {}
        try {
            if (isOn(m.id) && m.test()) m.init();
        } catch (e) {
            console.error('[Beliani hub] modul ' + m.id + ':', e);
        }
    });


    // ===== Launcher: jeden guzik po prawej -> lista narzedzi + ustawienia =====
    function buildLauncher() {
        if (!onProlo()) return;
        if (!document.body) return;
        if (document.getElementById('beliani-launcher')) return;

        GM_addStyle(`
            #beliani-launcher{position:fixed;top:70px;right:12px;z-index:2147483647;font-family:Arial,Helvetica,sans-serif;}
            #beliani-launch-btn{height:44px;padding:0 16px;border:none;border-radius:22px;background:#FF2F00;color:#fff;font-size:15px;font-weight:bold;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.3);white-space:nowrap;display:flex;align-items:center;gap:8px;}
            #beliani-launch-btn:hover{background:#cc2600;}
            #beliani-launch-panel{margin-top:8px;width:252px;background:#fff;border:1px solid #e0e0e0;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.2);overflow:hidden;}
            #beliani-launcher .bl-row{display:flex;align-items:center;gap:10px;width:100%;padding:11px 14px;border:none;background:#fff;font-size:14px;color:#1a1a1a;cursor:pointer;text-align:left;box-sizing:border-box;}
            #beliani-launcher .bl-row:hover{background:#F6E7E6;}
            #beliani-launcher .bl-emoji{width:20px;flex:0 0 20px;display:flex;align-items:center;justify-content:center;}
            #beliani-launcher .bl-sep{height:1px;background:#eee;}
            #beliani-launcher .bl-gear{color:#750000;font-weight:bold;}
            #beliani-launcher .bl-set-row{display:block;width:100%;padding:9px 14px 9px 34px;border:none;background:#faf7f6;font-size:13px;color:#333;cursor:pointer;text-align:left;box-sizing:border-box;}
            #beliani-launcher .bl-set-row:hover{background:#F6E7E6;}
        `);

        function svgIco(p){ return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FF2F00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">' + p + '</svg>'; }
        const LAUNCH_TOOLS = [
            { id:'ksieg',    icon:svgIco('<path d="M15 5v2"/><path d="M15 11v2"/><path d="M15 17v2"/><path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2"/>'), label:'Ksiegowanie w tickecie', sel:'#ksieg-btn' },
            { id:'refund',   icon:svgIco('<circle cx="10" cy="10" r="7"/><path d="M21 21l-6 -6"/>'), label:'Refund Checker', sel:'#refund-btn' },
            { id:'vies',     icon:svgIco('<path d="M17.2 7a6 7 0 1 0 0 10"/><path d="M4 10h9"/><path d="M4 14h9"/>'), label:'Kurs walut', sel:'#oandaKursBtn' },
            { id:'vies',     icon:svgIco('<path d="M11.46 20.85a12 12 0 0 1 -7.96 -14.85a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06"/><path d="M15 19l2 2l4 -4"/>'), label:'VIES / KRS / GUS', sel:'#viesBtn' },
            { id:'klient',   icon:svgIco('<circle cx="12" cy="7" r="4"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>'), label:'Zmiana typu klienta', sel:'#klient-btn' },
            { id:'sepa',     icon:svgIco('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"/><path d="M9 13h6"/><path d="M9 17h6"/>'), label:'Walidator SEPA', sel:'#sepa-btn' },
            { id:'issuelog', icon:svgIco('<rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"/><path d="M9 12h.01"/><path d="M13 12h2"/><path d="M9 16h.01"/><path d="M13 16h2"/>'), label:'Issue / PAID', sel:'#ilp-btn' },
        ];

        function hideBtns(){ LAUNCH_TOOLS.forEach(function(t){ const b = document.querySelector(t.sel); if (b) b.style.display = 'none'; }); }

        const wrap = document.createElement('div'); wrap.id = 'beliani-launcher';
        const btn = document.createElement('button'); btn.id = 'beliani-launch-btn';
        btn.innerHTML = '<span>\u2630</span><span>Narzędzia</span>';
        const panel = document.createElement('div'); panel.id = 'beliani-launch-panel'; panel.style.display = 'none';

        let html = '';
        LAUNCH_TOOLS.forEach(function(t){
            if (!isOn(t.id)) return;
            html += '<button class="bl-row" data-sel="' + t.sel + '"><span class="bl-emoji">' + t.icon + '</span>' + t.label + '</button>';
        });
        html += '<div class="bl-sep"></div>';
        html += '<button class="bl-row bl-gear" id="bl-gear"><span class="bl-emoji">\u2699</span>Moduly i ustawienia</button>';
        html += '<div id="bl-settings" style="display:none">';
        MODULES.forEach(function(m){
            html += '<button class="bl-set-row" data-id="' + m.id + '">' + (isOn(m.id) ? '\u2705' : '\u2B1C') + ' ' + m.name + '</button>';
        });
        html += '</div>';
        panel.innerHTML = html;

        wrap.appendChild(btn); wrap.appendChild(panel);
        document.body.appendChild(wrap);

        btn.addEventListener('click', function(){ panel.style.display = (panel.style.display === 'none') ? 'block' : 'none'; });
        panel.querySelectorAll('.bl-row[data-sel]').forEach(function(r){
            r.addEventListener('click', function(){
                const sel = r.getAttribute('data-sel');
                panel.style.display = 'none';
                setTimeout(function(){ const b = document.querySelector(sel); if (b) b.click(); }, 0);
            });
        });
        const gear = panel.querySelector('#bl-gear');
        if (gear) gear.addEventListener('click', function(e){
            e.stopPropagation();
            const s = panel.querySelector('#bl-settings');
            s.style.display = (s.style.display === 'none') ? 'block' : 'none';
        });
        panel.querySelectorAll('.bl-set-row').forEach(function(r){
            r.addEventListener('click', function(){
                const id = r.getAttribute('data-id');
                try { GM_setValue(HUB + id, !isOn(id)); } catch(e){}
                location.reload();
            });
        });

        hideBtns();
        [600, 1500, 3000].forEach(function(ms){ setTimeout(hideBtns, ms); });
    }
    buildLauncher();
    [500, 1500].forEach(function(ms){ setTimeout(buildLauncher, ms); });

})();
