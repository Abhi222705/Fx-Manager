/* =========================================
   FX MANAGER - IMPORT TRADES FROM SCREENSHOT
   Reads MT5 history screenshots on the phone
   (OCR), detects every trade, lets you review
   and edit them, then adds them to the journal.
   Images never leave the device.
========================================= */
(function () {

    var TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    var rows = [];

    function $(id) { return document.getElementById(id); }

    /* ---------- parsing ---------- */

    function num(s) {
        if (s === null || s === undefined) return NaN;
        s = String(s).replace(/[\u2212\u2013\u2014]/g, "-").replace(/\s+/g, "");
        if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/,/g, "");
        else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".");
        else s = s.replace(/,/g, "");
        return parseFloat(s);
    }

    var HEAD = /([A-Za-z][A-Za-z0-9.#]{2,11})\s*[,.;:]?\s+(buy|s[e3][l1!|I]{1,3})(?:\s+(?:limit|stop))?\s+(\d+(?:[.,]\d+)?)/i;
    var NUM = /[-+\u2212\u2013]?\d{1,3}(?: \d{3})+[.,]\d{1,5}|[-+\u2212\u2013]?\d+[.,]\d{1,5}/g;
    var DATE = /(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?/;
    var DATE_G = new RegExp(DATE.source, "g");

    function numsIn(text) { return (String(text).replace(DATE_G, " ").match(NUM) || []).map(num); }
    function lastNum(text) { var n = numsIn(text); return n.length ? n[n.length - 1] : NaN; }
    function firstNum(text) { var n = numsIn(text); return n.length ? n[0] : NaN; }
    function fmtDate(d) { return d ? d[1] + "-" + d[2] + "-" + d[3] : ""; }

    function parse(text) {
        var lines = String(text).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
        var blocks = [], cur = null;

        lines.forEach(function (l) {
            var m = l.match(HEAD);
            if (m && !/^(position|order|deal|history)$/i.test(m[1])) {
                cur = { sym: m[1].toUpperCase().replace(/[^A-Z0-9.#]/g, ""), dir: /^b/i.test(m[2]) ? "BUY" : "SELL",
                        lot: num(m[3]), head: l, lines: [] };
                blocks.push(cur);
            } else if (cur) cur.lines.push(l);
        });

        return blocks.map(function (b) {
            var entry = NaN, exit = NaN, pnl = NaN, sl = NaN, tp = NaN, swap = NaN, comm = NaN, ticket = "";
            var closeD = b.head.match(DATE), openD = null, warn = [];

            b.lines.forEach(function (l) {
                var t = l.match(/#\s*(\d{5,})/);
                if (t && !ticket) ticket = t[1];

                if (/open/i.test(l) && !openD) { var o = l.match(DATE); if (o) openD = o; }

                var si = l.search(/swap/i), ci = l.search(/commission/i);
                if (si > -1) {
                    sl = lastNum(l.slice(0, si));
                    swap = firstNum(l.slice(si + 4));
                } else if (ci > -1) {
                    tp = lastNum(l.slice(0, ci));
                }
                if (ci > -1) comm = firstNum(l.slice(ci + 10));

                if (si < 0 && ci < 0 && !/open/i.test(l) && !isFinite(entry)) {
                    var n = numsIn(l);
                    if (n.length >= 2) { entry = n[0]; exit = n[1]; if (n.length >= 3) pnl = n[2]; }
                }
            });

            if (!closeD) closeD = b.lines.map(function (l) { return l.match(DATE); }).filter(Boolean)[0] || null;
            var d = openD || closeD;

            if (isFinite(entry) && isFinite(exit) && isFinite(pnl) && pnl !== 0) {
                var up = (exit - entry) * (b.dir === "BUY" ? 1 : -1);
                if (up !== 0 && (up > 0) !== (pnl > 0)) { pnl = up > 0 ? Math.abs(pnl) : -Math.abs(pnl); warn.push("sign adjusted"); }
            }
            if (!isFinite(entry) || !isFinite(exit)) warn.push("prices missing");
            if (!isFinite(pnl)) warn.push("profit missing");
            if (!isFinite(b.lot) || b.lot <= 0) warn.push("lot missing");

            return { pair: b.sym, direction: b.dir, lot: b.lot, entry: entry, exit: exit, pnl: pnl,
                     sl: sl, tp: tp, swap: swap, comm: comm, ticket: ticket,
                     date: fmtDate(d), time: d && d[4] ? d[4] : "", warn: warn };
        });
    }
    window.FXShotParse = parse;

    function sessionOf(time) {
        if (!time) return "London";
        var h = parseInt(time, 10);
        return h >= 13 && h < 21 ? "New York" : h >= 7 && h < 13 ? "London" : "Asian";
    }

    /* ---------- OCR ---------- */

    function loadTess() {
        if (window.Tesseract) return Promise.resolve();
        return new Promise(function (res, rej) {
            var s = document.createElement("script");
            s.src = TESS; s.onload = res;
            s.onerror = function () { rej(new Error("Could not load the text reader. Check your internet connection.")); };
            document.head.appendChild(s);
        });
    }

    function prep(file) {
        return new Promise(function (res, rej) {
            var url = URL.createObjectURL(file), img = new Image();
            img.onload = function () {
                var w = img.naturalWidth, h = img.naturalHeight, sc = w < 1600 ? 1600 / w : (w > 2400 ? 2400 / w : 1);
                var c = document.createElement("canvas");
                c.width = Math.round(w * sc); c.height = Math.round(h * sc);
                var x = c.getContext("2d"); x.drawImage(img, 0, 0, c.width, c.height);
                var d = x.getImageData(0, 0, c.width, c.height), p = d.data, i, lum = 0;
                for (i = 0; i < p.length; i += 4) lum += 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
                var dark = lum / (p.length / 4) < 128, g;
                /* dark theme: brightest channel keeps coloured text (red/blue/green) bright, then invert.
                   light theme: darkest channel keeps coloured text dark. */
                for (i = 0; i < p.length; i += 4) {
                    g = dark ? 255 - Math.max(p[i], p[i + 1], p[i + 2]) : Math.min(p[i], p[i + 1], p[i + 2]);
                    p[i] = p[i + 1] = p[i + 2] = g;
                }
                x.putImageData(d, 0, 0); URL.revokeObjectURL(url); res(c);
            };
            img.onerror = function () { rej(new Error("Could not open that image.")); };
            img.src = url;
        });
    }

    function status(msg, bad) { var s = $("shotStatus"); s.textContent = msg; s.style.color = bad ? "var(--red)" : "var(--muted)"; }

    async function readFiles(files) {
        rows = []; $("shotList").innerHTML = ""; $("shotAdd").style.display = "none"; $("shotRaw").value = "";
        var worker = null, raw = "";
        try {
            status("Loading text reader (first time needs internet)...");
            await loadTess();
            for (var i = 0; i < files.length; i++) {
                if (!worker) {
                    worker = await Tesseract.createWorker("eng", 1, { logger: function (m) {
                        if (m.status === "recognizing text") status("Reading image " + (cur + 1) + " of " + files.length + " - " + Math.round(m.progress * 100) + "%");
                    } });
                }
                await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1", user_defined_dpi: "300" });
                var cur = i;
                status("Reading image " + (i + 1) + " of " + files.length + "...");
                var canvas = await prep(files[i]);
                var r = await worker.recognize(canvas);
                raw += r.data.text + "\n----\n";
                parse(r.data.text).forEach(function (t) { rows.push(t); });
            }
        } catch (e) { status(e.message || "Could not read the screenshot.", true); }
        if (worker) { try { await worker.terminate(); } catch (e) {} }
        $("shotRaw").value = raw;
        markDuplicates(); render();
    }

    /* ---------- review table ---------- */

    function key(t) { return t.ticket ? "T" + t.ticket : [t.pair, t.direction, t.lot, t.entry, t.exit, t.date].join("|"); }

    function existingKeys() {
        var list = []; try { list = JSON.parse(localStorage.getItem("fxTrades")) || []; } catch (e) {}
        var k = {}; list.forEach(function (t) { k[[t.pair, t.direction, t.lot, t.entry, t.exit, t.date].join("|")] = 1; if (t.ticket) k["T" + t.ticket] = 1; });
        return k;
    }

    function markDuplicates() {
        var seen = existingKeys();
        rows.forEach(function (t) {
            var k = key(t);
            t.dup = !!seen[k] || false; seen[k] = 1;
            t.ok = !t.dup && t.warn.indexOf("prices missing") < 0 && t.warn.indexOf("profit missing") < 0 && t.warn.indexOf("lot missing") < 0;
        });
    }

    function esc(v) { return String(v === undefined || v === null || (typeof v === "number" && !isFinite(v)) ? "" : v).replace(/"/g, "&quot;"); }

    function render() {
        var list = $("shotList");
        if (!rows.length) { list.innerHTML = ""; if ($("shotStatus").textContent.indexOf("Reading") === 0 || !$("shotStatus").style.color) status("No trades found. Try a clearer screenshot of the MT5 History tab (Positions).", true); return; }
        var okN = rows.filter(function (t) { return t.ok; }).length;
        status(rows.length + " trade(s) detected, " + okN + " ready. Check the values, then add.");
        list.innerHTML = rows.map(function (t, i) {
            var note = t.dup ? "Already in your journal / duplicate" : (t.warn.length ? "Check: " + t.warn.join(", ") : "");
            return '<div class="shot-row" data-i="' + i + '">' +
                '<div class="shot-top"><label><input type="checkbox" class="s-on"' + (t.ok ? " checked" : "") + '> Add</label>' +
                '<span style="color:' + (t.dup || t.warn.length ? "var(--red)" : "var(--green)") + ';font-size:12px">' + (note || "Looks good") + "</span></div>" +
                '<div class="shot-grid">' +
                f("Pair", '<input class="s-pair" value="' + esc(t.pair) + '">') +
                f("Type", '<select class="s-dir"><option' + (t.direction === "BUY" ? " selected" : "") + '>BUY</option><option' + (t.direction === "SELL" ? " selected" : "") + ">SELL</option></select>") +
                f("Lot", '<input class="s-lot" inputmode="decimal" value="' + esc(t.lot) + '">') +
                f("Entry", '<input class="s-entry" inputmode="decimal" value="' + esc(t.entry) + '">') +
                f("Exit", '<input class="s-exit" inputmode="decimal" value="' + esc(t.exit) + '">') +
                f("Stop loss", '<input class="s-sl" inputmode="decimal" value="' + esc(t.sl) + '">') +
                f("Take profit", '<input class="s-tp" inputmode="decimal" value="' + esc(t.tp) + '">') +
                f("Profit ($)", '<input class="s-pnl" inputmode="decimal" value="' + esc(t.pnl) + '">') +
                f("Date", '<input class="s-date" type="date" value="' + esc(t.date) + '">') +
                f("Session", '<select class="s-ses">' + ["Asian", "London", "New York"].map(function (s) { return "<option" + (sessionOf(t.time) === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>") +
                "</div></div>";
        }).join("");
        $("shotAdd").style.display = "block";
    }
    function f(label, input) { return "<div><span>" + label + "</span>" + input + "</div>"; }

    function addSelected() {
        var all = []; try { all = JSON.parse(localStorage.getItem("fxTrades")) || []; } catch (e) {}
        var base = Date.now(), added = 0, today = new Date().toISOString().slice(0, 10);
        document.querySelectorAll(".shot-row").forEach(function (el) {
            if (!el.querySelector(".s-on").checked) return;
            var q = function (c) { return el.querySelector(c).value; };
            var entry = parseFloat(q(".s-entry")), exit = parseFloat(q(".s-exit")), lot = parseFloat(q(".s-lot")), pnl = parseFloat(q(".s-pnl"));
            if (!isFinite(entry) || !isFinite(exit) || !isFinite(lot) || !isFinite(pnl)) return;
            var sl = parseFloat(q(".s-sl")), tp = parseFloat(q(".s-tp")), dir = q(".s-dir"), rr = null;
            if (isFinite(sl) && isFinite(tp)) {
                var risk = dir === "BUY" ? entry - sl : sl - entry, reward = dir === "BUY" ? tp - entry : entry - tp;
                if (risk > 0 && reward > 0) rr = "1:" + (reward / risk).toFixed(2);
            }
            var r = rows[Number(el.getAttribute("data-i"))] || {};
            var extra = [];
            if (r.ticket) extra.push("ticket #" + r.ticket);
            if (isFinite(r.comm)) extra.push("commission " + r.comm.toFixed(2));
            if (isFinite(r.swap)) extra.push("swap " + r.swap.toFixed(2));
            all.push({
                id: base + added, date: q(".s-date") || today, pair: q(".s-pair").toUpperCase().trim(), direction: dir,
                session: q(".s-ses"), entry: entry, exit: exit, stopLoss: isFinite(sl) ? sl : 0, takeProfit: isFinite(tp) ? tp : 0,
                lot: lot, rr: rr, strategy: "Screenshot Import", result: pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN",
                pnl: Number(pnl.toFixed(2)), notes: "Imported from MT5 screenshot" + (extra.length ? " - " + extra.join(", ") : ""),
                ticket: r.ticket || ""
            });
            added++;
        });
        if (!added) { status("Nothing to add. Tick at least one complete trade.", true); return; }
        localStorage.setItem("fxTrades", JSON.stringify(all));
        status(added + " trade(s) added.");
        setTimeout(function () { location.reload(); }, 700);
    }

    /* ---------- modal + button ---------- */

    function build() {
        var css = document.createElement("style");
        css.textContent =
            "#shotModal{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:none;align-items:flex-start;justify-content:center;overflow-y:auto;padding:16px}" +
            "#shotBox{width:100%;max-width:640px;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;color:var(--text);margin:auto}" +
            "#shotBox h2{font-size:20px;margin-bottom:6px}#shotBox p{color:var(--muted);font-size:13px;line-height:1.5;margin-bottom:14px}" +
            ".shot-btn{border:none;border-radius:10px;padding:11px 17px;background:var(--green);color:#07110d;font-weight:800;cursor:pointer}" +
            ".shot-btn.alt{background:transparent;border:1px solid var(--border);color:var(--text)}" +
            ".shot-row{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px}" +
            ".shot-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:13px}" +
            ".shot-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}" +
            ".shot-grid span{display:block;font-size:11px;color:var(--muted);margin-bottom:3px}" +
            ".shot-grid input,.shot-grid select{width:100%;padding:9px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px}";
        document.head.appendChild(css);

        var m = document.createElement("div");
        m.id = "shotModal";
        m.innerHTML =
            '<div id="shotBox"><h2>Import from screenshot</h2>' +
            "<p>Choose one or more screenshots of your MT5 <b>History</b> tab (Positions). All trades found are listed so you can check them before adding. Images stay on your phone.</p>" +
            '<input type="file" id="shotFile" accept="image/*" multiple style="display:none">' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">' +
            '<button class="shot-btn" id="shotPick">Choose screenshots</button><button class="shot-btn alt" id="shotClose">Close</button></div>' +
            '<div id="shotStatus" style="font-size:13px;color:var(--muted);margin-bottom:12px"></div>' +
            '<div id="shotList"></div>' +
            '<button class="shot-btn" id="shotAdd" style="display:none;width:100%;margin-top:6px">Add selected trades</button>' +
            '<details style="margin-top:14px"><summary style="font-size:12px;color:var(--muted);cursor:pointer">Show text the app read</summary>' +
            '<textarea id="shotRaw" readonly style="width:100%;height:120px;margin-top:8px;background:var(--bg);color:var(--muted);border:1px solid var(--border);border-radius:8px;font-size:11px"></textarea></details></div>';
        document.body.appendChild(m);

        $("shotPick").onclick = function () { $("shotFile").click(); };
        $("shotClose").onclick = function () { m.style.display = "none"; };
        $("shotAdd").onclick = addSelected;
        $("shotFile").onchange = function (e) { if (e.target.files.length) readFiles(Array.prototype.slice.call(e.target.files)); e.target.value = ""; };

        var head = document.querySelector(".page-header");
        if (head) {
            var b = document.createElement("button");
            b.className = "shot-btn"; b.textContent = "📷 Import screenshot";
            b.onclick = function () { m.style.display = "flex"; };
            head.appendChild(b);
        }
    }

    document.addEventListener("DOMContentLoaded", build);
})();
