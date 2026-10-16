/* =========================================
   FX MANAGER - ONLINE ACCOUNTS + CLOUD STORAGE
   Load this FIRST in <head> on every page.

   - Sign-up / sign-in uses Firebase Authentication
     (passwords are handled and hashed by Google,
     never stored by this app).
   - All user data (trades, goals, journal, settings)
     is stored online in Firestore under the user's
     own account. Nothing is kept in the browser's
     localStorage.
   - window.localStorage is replaced by a live view of
     the user's online data, so the existing page code
     (fxTrades, fxGoals, journal_*, ...) works unchanged.

   SETUP: paste your two Firebase values below.
   See FIREBASE_SETUP.md.
========================================= */

(function () {

    var CONFIG = {
        apiKey:    "AIzaSyCe2i9V_f0HyA7-H2TDnBcIfu0uCU763QE",
        projectId: "fx-manager-app"
    };

    /* ---------------------------------------------------- */

    var T = window.__FX_TEST_BASE;                       /* used only by automated tests */
    var AUTH_URL  = T ? T + "/identitytoolkit" : "https://identitytoolkit.googleapis.com/v1";
    var TOKEN_URL = T ? T + "/securetoken"     : "https://securetoken.googleapis.com/v1/token";
    var FS_URL    = T ? T + "/fs"              : "https://firestore.googleapis.com/v1";

    var real = window.localStorage;           /* only touched to move old on-device data online */
    var isLoginPage = /login\.html$/i.test(location.pathname);

    function configured() { return CONFIG.apiKey && !/^PASTE/i.test(CONFIG.apiKey) && CONFIG.projectId && !/^PASTE/i.test(CONFIG.projectId); }
    function emailOf(u) { return u + "@fxmanager.app"; }
    function norm(u) { return String(u).trim().toLowerCase(); }
    function noop() {}

    function readJSON(store, key, fallback) {
        try { var v = JSON.parse(store.getItem(key)); return v === null || v === undefined ? fallback : v; }
        catch (e) { return fallback; }
    }


    /* ---------- session (kept by the Android app, not in localStorage) ---------- */

    function readSession() {
        var raw = "";
        try {
            raw = window.FXNative ? FXNative.getSession() : (window.sessionStorage.getItem("fxSessionTab") || "");
        } catch (e) {}
        try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }

    function writeSession(s) {
        var j = JSON.stringify(s);
        try {
            if (window.FXNative) FXNative.saveSession(j, !!s.remember);
            else window.sessionStorage.setItem("fxSessionTab", j);
        } catch (e) {}
    }

    function clearSession() {
        try {
            if (window.FXNative) FXNative.clearSession();
            else window.sessionStorage.removeItem("fxSessionTab");
        } catch (e) {}
    }


    /* ---------- Firebase auth (async, used by login page) ---------- */

    function mapError(code) {
        code = String(code || "");
        if (/EMAIL_EXISTS/.test(code)) return "That username is already taken.";
        if (/INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD/.test(code)) return "Incorrect username or password.";
        if (/WEAK_PASSWORD/.test(code)) return "Password must be at least 6 characters.";
        if (/TOO_MANY_ATTEMPTS/.test(code)) return "Too many attempts. Try again later.";
        if (/USER_DISABLED/.test(code)) return "This account has been disabled.";
        if (/CONFIGURATION_NOT_FOUND/.test(code)) return "Firebase Authentication is not set up yet. In the Firebase console open Build > Authentication > Get started, then enable Email/Password.";
        if (/OPERATION_NOT_ALLOWED/.test(code)) return "Email/Password sign-in is not enabled in your Firebase project.";
        if (/API key/i.test(code)) return "The Firebase API key is not valid. Check auth.js.";
        return code || "Something went wrong. Please try again.";
    }

    function post(url, body) {
        return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            .catch(function () { throw new Error("Cannot reach the server. Check your internet connection."); })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (j) {
                    if (!r.ok) throw new Error(mapError(j.error && j.error.message));
                    return j;
                });
            });
    }

    function fsBase(uid) { return FS_URL + "/projects/" + CONFIG.projectId + "/databases/(default)/documents/users/" + uid + "/kv"; }

    function fsAsync(s, method, url, body) {
        return fetch(url, {
            method: method,
            headers: { "Authorization": "Bearer " + s.idToken, "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, json: j }; }); });
    }

    function fsPut(s, key, value) {
        return fsAsync(s, "PATCH", fsBase(s.uid) + "/" + encodeURIComponent(key) + "?updateMask.fieldPaths=v",
            { fields: { v: { stringValue: String(value) } } }).then(function (r) { if (!r.ok) throw new Error("save failed"); });
    }

    function sessionFrom(r, uname, name, remember) {
        return { uid: r.localId, username: uname, name: name || uname, idToken: r.idToken, refreshToken: r.refreshToken,
                 expiresAt: Date.now() + Number(r.expiresIn || 3600) * 1000, remember: !!remember };
    }


    /* ---------- move data saved on this device (older versions) online ---------- */

    function legacyKeys() {
        var keys = [];
        for (var i = 0; i < real.length; i++) {
            var k = real.key(i);
            if (k && k !== "fxUsers" && k !== "fxSession" && k.indexOf("u_") !== 0) keys.push(k);
        }
        return keys;
    }

    function collectLocal(uname) {
        var users = readJSON(real, "fxUsers", []), out = { data: {}, cleanup: noop }, n = 0, i, k;
        var u = users.filter(function (x) { return x.username === uname; })[0];

        if (u) {
            var prefix = "u_" + u.id + ":", own = [];
            for (i = 0; i < real.length; i++) { k = real.key(i); if (k && k.indexOf(prefix) === 0) own.push(k); }
            own.forEach(function (f) { out.data[f.slice(prefix.length)] = real.getItem(f); n++; });
            out.cleanup = function () {
                own.forEach(function (f) { real.removeItem(f); });
                saveUsers(users.filter(function (x) { return x.id !== u.id; }));
            };
        } else if (users.length === 0) {
            var old = legacyKeys();
            old.forEach(function (f) { out.data[f] = real.getItem(f); n++; });
            out.cleanup = function () { old.forEach(function (f) { real.removeItem(f); }); };
        }
        return n ? out : null;
    }

    function saveUsers(list) { if (list.length) real.setItem("fxUsers", JSON.stringify(list)); else real.removeItem("fxUsers"); }

    function migrateLocal(s, uname) {
        var local;
        try { local = collectLocal(uname); } catch (e) { return Promise.resolve(); }
        if (!local) return Promise.resolve();

        return fsAsync(s, "GET", fsBase(s.uid) + "?pageSize=5").then(function (r) {
            var has = ((r.json && r.json.documents) || []).some(function (d) { return decodeURIComponent(d.name.split("/").pop()) !== "fxProfile"; });
            if (has) return;                                        /* online account already has data: never overwrite */
            var chain = Promise.resolve();
            Object.keys(local.data).forEach(function (k) { chain = chain.then(function () { return fsPut(s, k, local.data[k]); }); });
            return chain.then(function () { local.cleanup(); });
        }).catch(noop);
    }


    /* ---------- public API ---------- */

    window.FXAuth = {

        current: function () {
            var s = readSession();
            return s && s.uid ? { id: s.uid, name: s.name, username: s.username } : null;
        },

        hasLegacyData: function () {
            try { return readJSON(real, "fxUsers", []).length > 0 || legacyKeys().length > 0; } catch (e) { return false; }
        },

        isConfigured: configured,

        register: function (name, username, password) {
            if (!configured()) return Promise.reject(new Error("Online storage is not set up yet. Add your Firebase keys in auth.js."));
            var uname = norm(username), cleanName = String(name).trim();
            return post(AUTH_URL + "/accounts:signUp?key=" + CONFIG.apiKey,
                        { email: emailOf(uname), password: password, returnSecureToken: true })
                .then(function (r) {
                    var s = sessionFrom(r, uname, cleanName, false);
                    return fsPut(s, "fxProfile", JSON.stringify({ name: cleanName })).catch(noop).then(function () { return s; });
                });
        },

        login: function (username, password, remember) {
            if (!configured()) return Promise.reject(new Error("Online storage is not set up yet. Add your Firebase keys in auth.js."));
            var uname = norm(username);
            return post(AUTH_URL + "/accounts:signInWithPassword?key=" + CONFIG.apiKey,
                        { email: emailOf(uname), password: password, returnSecureToken: true })
                .then(function (r) {
                    var s = sessionFrom(r, uname, uname, remember);
                    return fsAsync(s, "GET", fsBase(s.uid) + "/fxProfile").then(function (d) {
                        try { var p = JSON.parse(d.json.fields.v.stringValue); if (p && p.name) s.name = p.name; } catch (e) {}
                    }).catch(noop)
                    .then(function () { return migrateLocal(s, uname); })
                    .then(function () { writeSession(s); return s; });
                });
        },

        logout: function () {
            clearSession();
            location.href = "login.html";
        }
    };

    if (isLoginPage) return;


    /* ---------- everything below runs on app pages ---------- */

    var sess = readSession();

    function memoryStorage(readonly) {
        var data = {};
        var api = {
            getItem:    function (k)    { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
            setItem:    function (k, v) { if (!readonly) data[k] = String(v); },
            removeItem: function (k)    { if (!readonly) delete data[k]; },
            key:        function (i)    { return Object.keys(data)[i] || null; },
            clear:      function ()     { if (!readonly) data = {}; }
        };
        Object.defineProperty(api, "length", { get: function () { return Object.keys(data).length; } });
        return api;
    }

    function install(store) {
        try { Object.defineProperty(window, "localStorage", { configurable: true, value: store }); }
        catch (e) { console.error("FXAuth: could not install storage", e); }
    }

    function overlay(msg) {
        document.addEventListener("DOMContentLoaded", function () {
            var d = document.createElement("div");
            d.style.cssText = "position:fixed;inset:0;z-index:99999;background:#080b12;color:#e8edf5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;font-family:sans-serif";
            d.innerHTML = '<div style="font-size:18px;font-weight:bold">FX Manager</div><div style="max-width:320px;line-height:1.5;color:#9aa6b8">' + msg +
                '</div><button style="padding:12px 22px;border:none;border-radius:9px;background:#20d897;color:#07110d;font-weight:bold;font-size:15px">Try again</button>';
            d.querySelector("button").onclick = function () { location.reload(); };
            document.body.appendChild(d);
        });
    }

    function goLogin() { clearSession(); location.replace("login.html"); }

    if (!sess || !sess.uid || !configured()) {
        install(memoryStorage(true));
        goLogin();
        return;
    }

    /* synchronous requests: the existing page scripts read storage while the page is loading */

    function xhr(method, url, body, token, form) {
        var x = new XMLHttpRequest();
        try {
            x.open(method, url, false);
            if (token) x.setRequestHeader("Authorization", "Bearer " + token);
            if (body !== undefined) x.setRequestHeader("Content-Type", form ? "application/x-www-form-urlencoded" : "application/json");
            x.send(body === undefined ? null : body);
        } catch (e) { return { status: 0, text: "" }; }
        return { status: x.status, text: x.responseText };
    }

    function refresh() {
        var r = xhr("POST", TOKEN_URL + "?key=" + CONFIG.apiKey,
                    "grant_type=refresh_token&refresh_token=" + encodeURIComponent(sess.refreshToken), null, true);
        if (r.status !== 200) return r.status === 400 ? "denied" : "offline";
        try {
            var j = JSON.parse(r.text);
            sess.idToken = j.id_token; sess.refreshToken = j.refresh_token;
            sess.expiresAt = Date.now() + Number(j.expires_in || 3600) * 1000;
            writeSession(sess);
            return "ok";
        } catch (e) { return "offline"; }
    }

    function call(method, url, body) {
        if (Date.now() > (sess.expiresAt || 0) - 120000) {
            var st = refresh();
            if (st === "denied") { goLogin(); return { status: 401, text: "" }; }
        }
        var r = xhr(method, url, body, sess.idToken);
        if (r.status === 401) {
            if (refresh() === "ok") r = xhr(method, url, body, sess.idToken);
            else if (r.status === 401) { goLogin(); }
        }
        return r;
    }

    function docUrl(key) { return fsBase(sess.uid) + "/" + encodeURIComponent(key); }

    function loadAll() {
        var out = {}, tok = "", guard = 0;
        do {
            var r = call("GET", fsBase(sess.uid) + "?pageSize=300" + (tok ? "&pageToken=" + encodeURIComponent(tok) : ""));
            if (r.status !== 200) return { error: r.status };
            var j = {}; try { j = JSON.parse(r.text || "{}"); } catch (e) { return { error: 0 }; }
            (j.documents || []).forEach(function (d) {
                var f = d.fields && d.fields.v;
                out[decodeURIComponent(d.name.split("/").pop())] = f && typeof f.stringValue === "string" ? f.stringValue : "";
            });
            tok = j.nextPageToken || "";
        } while (tok && ++guard < 200);
        return { data: out };
    }

    /* ---------- live online storage ---------- */

    var loaded = loadAll();

    if (loaded.error !== undefined) {
        install(memoryStorage(true));                               /* read-only: never overwrite online data with an empty page */
        overlay(loaded.error === 403
            ? "Online storage is not set up correctly (permission denied). Check the Firestore rules in FIREBASE_SETUP.md."
            : "Cannot reach your online account. Check your internet connection and try again.");
        return;
    }

    var data = loaded.data, pending = {}, bannerEl = null, timer = null;

    function banner() {
        var n = Object.keys(pending).length;
        document.addEventListener("DOMContentLoaded", draw);
        draw();
        function draw() {
            if (!document.body) return;
            if (!n) { if (bannerEl) bannerEl.style.display = "none"; return; }
            if (!bannerEl) {
                bannerEl = document.createElement("div");
                bannerEl.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:99998;background:#d63e4a;color:#fff;padding:10px 14px;border-radius:10px;font:13px sans-serif;text-align:center";
                document.body.appendChild(bannerEl);
            }
            bannerEl.style.display = "block";
            bannerEl.textContent = "Offline - " + n + " change(s) not saved online yet. They will sync when the connection returns.";
        }
    }

    function push(key, value) {
        var r = value === null
            ? call("DELETE", docUrl(key))
            : call("PATCH", docUrl(key) + "?updateMask.fieldPaths=v", JSON.stringify({ fields: { v: { stringValue: value } } }));
        return r.status === 200 || (value === null && r.status === 404);
    }

    function write(key, value) {
        if (push(key, value)) { delete pending[key]; }
        else { pending[key] = value; startRetry(); }
        banner();
    }

    function startRetry() {
        if (timer) return;
        timer = setInterval(function () {
            Object.keys(pending).forEach(function (k) { if (push(k, pending[k])) delete pending[k]; });
            banner();
            if (!Object.keys(pending).length) { clearInterval(timer); timer = null; }
        }, 5000);
    }

    window.addEventListener("online", function () { if (timer) { clearInterval(timer); timer = null; } startRetry(); });

    var api = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
        setItem: function (k, v) {
            v = String(v);
            if (Object.prototype.hasOwnProperty.call(data, k) && data[k] === v) return;     /* unchanged: no network call */
            data[k] = v; write(k, v);
        },
        removeItem: function (k) {
            if (!Object.prototype.hasOwnProperty.call(data, k)) return;
            delete data[k]; write(k, null);
        },
        key: function (i) { var ks = Object.keys(data); return i < ks.length ? ks[i] : null; },
        clear: function () { Object.keys(data).forEach(function (k) { delete data[k]; write(k, null); }); }
    };
    Object.defineProperty(api, "length", { get: function () { return Object.keys(data).length; } });

    install(api);

})();
