/* =========================================
   FX MANAGER - AUTH + PER-USER STORAGE
   Load this FIRST in <head> on every page.

   - Signed-out visitors are sent to login.html
   - window.localStorage is replaced with a
     per-user view, so all existing code
     (fxTrades, fxGoals, journal_*, ...) keeps
     working but only sees the logged-in
     user's data.
========================================= */

(function () {

    var real = window.localStorage;          // the browser's real storage
    var USERS = "fxUsers";
    var SESSION = "fxSession";
    var isLoginPage = /login\.html$/i.test(location.pathname);


    /* ---------- helpers ---------- */

    function readJSON(store, key, fallback) {
        try {
            var v = JSON.parse(store.getItem(key));
            return v === null || v === undefined ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    function getUsers() { return readJSON(real, USERS, []); }
    function saveUsers(list) { real.setItem(USERS, JSON.stringify(list)); }

    function getSession() {
        return readJSON(window.sessionStorage, SESSION, null) ||
               readJSON(real, SESSION, null);
    }

    function randomHex(bytes) {
        var out = "";
        if (window.crypto && crypto.getRandomValues) {
            var arr = new Uint8Array(bytes);
            crypto.getRandomValues(arr);
            arr.forEach(function (b) { out += ("0" + b.toString(16)).slice(-2); });
        } else {
            for (var i = 0; i < bytes; i++) {
                out += ("0" + Math.floor(Math.random() * 256).toString(16)).slice(-2);
            }
        }
        return out;
    }

    function hashPassword(password, salt) {

        if (window.crypto && crypto.subtle && window.TextEncoder) {

            var enc = new TextEncoder();

            return crypto.subtle
                .importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
                .then(function (key) {
                    return crypto.subtle.deriveBits(
                        { name: "PBKDF2", salt: enc.encode(salt), iterations: 150000, hash: "SHA-256" },
                        key, 256
                    );
                })
                .then(function (buf) {
                    return Array.from(new Uint8Array(buf))
                        .map(function (b) { return ("0" + b.toString(16)).slice(-2); })
                        .join("");
                });
        }

        /* Fallback for non-secure (plain http) pages */
        var s = salt + password, h = 5381;
        for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); }
        return Promise.resolve("f" + (h >>> 0).toString(16));
    }


    /* ---------- per-user storage view ---------- */

    function makeScoped(userId) {

        var prefix = "u_" + userId + ":";

        function ownKeys() {
            var keys = [];
            for (var i = 0; i < real.length; i++) {
                var k = real.key(i);
                if (k && k.indexOf(prefix) === 0) keys.push(k.slice(prefix.length));
            }
            return keys;
        }

        var api = {
            getItem:    function (k)    { return real.getItem(prefix + k); },
            setItem:    function (k, v) { real.setItem(prefix + k, String(v)); },
            removeItem: function (k)    { real.removeItem(prefix + k); },
            key:        function (i)    { var ks = ownKeys(); return i < ks.length ? ks[i] : null; },
            clear:      function ()     { ownKeys().forEach(function (k) { real.removeItem(prefix + k); }); }
        };

        Object.defineProperty(api, "length", { get: function () { return ownKeys().length; } });

        return api;
    }

    function makeMemoryStorage() {
        var data = {};
        var api = {
            getItem:    function (k)    { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
            setItem:    function (k, v) { data[k] = String(v); },
            removeItem: function (k)    { delete data[k]; },
            key:        function (i)    { return Object.keys(data)[i] || null; },
            clear:      function ()     { data = {}; }
        };
        Object.defineProperty(api, "length", { get: function () { return Object.keys(data).length; } });
        return api;
    }

    /* Data saved before login existed (unprefixed keys) */
    function legacyKeys() {
        var keys = [];
        for (var i = 0; i < real.length; i++) {
            var k = real.key(i);
            if (k && k !== USERS && k !== SESSION && k.indexOf("u_") !== 0) keys.push(k);
        }
        return keys;
    }

    function adoptLegacyData(scoped) {
        legacyKeys().forEach(function (k) {
            scoped.setItem(k, real.getItem(k));
            real.removeItem(k);
        });
    }


    /* ---------- public API ---------- */

    window.FXAuth = {

        current: function () { return getSession(); },

        hasLegacyData: function () {
            return getUsers().length === 0 && legacyKeys().length > 0;
        },

        register: function (name, username, password) {

            var uname = String(username).trim().toLowerCase();
            var users = getUsers();

            if (users.some(function (u) { return u.username === uname; })) {
                return Promise.reject(new Error("That username is already taken."));
            }

            var salt = randomHex(16);

            return hashPassword(password, salt).then(function (hash) {

                var user = {
                    id: randomHex(8),
                    name: String(name).trim(),
                    username: uname,
                    salt: salt,
                    hash: hash,
                    created: Date.now()
                };

                var isFirst = users.length === 0;

                users.push(user);
                saveUsers(users);

                var scoped = makeScoped(user.id);

                /* First account inherits data already in this browser */
                if (isFirst) adoptLegacyData(scoped);

                if (!scoped.getItem("fxProfile")) {
                    scoped.setItem("fxProfile", JSON.stringify({ name: user.name }));
                }

                return user;
            });
        },

        login: function (username, password, remember) {

            var uname = String(username).trim().toLowerCase();
            var user = getUsers().filter(function (u) { return u.username === uname; })[0];
            var fail = new Error("Incorrect username or password.");

            if (!user) return Promise.reject(fail);

            return hashPassword(password, user.salt).then(function (hash) {

                if (hash !== user.hash) throw fail;

                var session = JSON.stringify({ id: user.id, name: user.name, username: user.username });

                window.sessionStorage.removeItem(SESSION);
                real.removeItem(SESSION);

                if (remember) real.setItem(SESSION, session);
                else window.sessionStorage.setItem(SESSION, session);

                return user;
            });
        },

        logout: function () {
            window.sessionStorage.removeItem(SESSION);
            real.removeItem(SESSION);
            location.href = "login.html";
        }
    };


    /* ---------- guard + storage swap ---------- */

    if (isLoginPage) return;

    var session = getSession();
    var valid = session && getUsers().some(function (u) { return u.id === session.id; });

    try {
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            value: valid ? makeScoped(session.id) : makeMemoryStorage()
        });
    } catch (e) {
        console.error("FXAuth: could not scope localStorage", e);
    }

    if (!valid) {
        location.replace("login.html");
    }

})();
