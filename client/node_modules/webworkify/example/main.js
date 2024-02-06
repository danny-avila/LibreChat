var work = require('../');

var w = work(require('./worker.js'));

var first = true;
w.addEventListener('message', function (ev) {
    if (first) {
        // revoke the Object URL that was used to create this worker, so as
        // not to leak it
        URL.revokeObjectURL(w.objectURL);
        first = false;
    }
    console.log(ev.data);
});

w.postMessage(4); // send the worker a message
