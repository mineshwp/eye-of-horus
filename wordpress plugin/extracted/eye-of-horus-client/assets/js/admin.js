(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var syncBtn   = document.getElementById('eoh-sync-now');
        var testBtn   = document.getElementById('eoh-test-connection');
        var statusEl  = document.getElementById('eoh-sync-status');

        if (typeof EyeOfHorusClient === 'undefined') { return; }

        function sendAjax(action, nonce, btnEl, busyText, defaultText) {
            var data = new FormData();
            data.append('action', action);
            data.append('nonce', nonce);

            btnEl.disabled = true;
            btnEl.textContent = busyText;
            if (statusEl) { statusEl.textContent = ''; }

            fetch(EyeOfHorusClient.ajaxUrl, {
                method: 'POST',
                credentials: 'same-origin',
                body: data,
            })
                .then(function (r) { return r.json(); })
                .then(function (json) {
                    var msg = (json.data && json.data.message) ? json.data.message : (json.success ? 'Done.' : 'An error occurred.');
                    if (statusEl) {
                        statusEl.textContent = msg;
                        statusEl.style.color = json.success ? '#00a32a' : '#d63638';
                    }
                    if (json.success && action === 'eoh_manual_sync') {
                        window.setTimeout(function () { window.location.reload(); }, 1200);
                    }
                })
                .catch(function () {
                    if (statusEl) {
                        statusEl.textContent = 'Request failed. Check your network and try again.';
                        statusEl.style.color = '#d63638';
                    }
                })
                .finally(function () {
                    btnEl.disabled = false;
                    btnEl.textContent = defaultText;
                });
        }

        if (syncBtn) {
            syncBtn.addEventListener('click', function () {
                sendAjax('eoh_manual_sync', EyeOfHorusClient.nonce, syncBtn, EyeOfHorusClient.syncingText, EyeOfHorusClient.defaultText);
            });
        }

        if (testBtn) {
            testBtn.addEventListener('click', function () {
                sendAjax('eoh_test_connection', EyeOfHorusClient.testNonce, testBtn, EyeOfHorusClient.testingText, EyeOfHorusClient.testDefault);
            });
        }
    });
}());
