/* =========================================
   SHARED SIDEBAR - shows the logged-in
   user's profile name / avatar / username
========================================= */

document.addEventListener("DOMContentLoaded", function () {

    var profile = {};

    try {
        profile = JSON.parse(localStorage.getItem("fxProfile")) || {};
    } catch (e) {
        profile = {};
    }

    var session = window.FXAuth ? FXAuth.current() : null;

    var name = profile.name || (session && session.name) || "Trader";
    var avatar = profile.avatar || name.charAt(0);

    var nameEl = document.getElementById("sidebarProfileName");
    var avatarEl = document.getElementById("sidebarAvatar");
    var roleEl = document.querySelector(".profile-mini-role");

    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = avatar.substring(0, 2).toUpperCase();
    if (roleEl && session) roleEl.textContent = "@" + session.username;

});
