var work = require('../');

// use 'normal' webworkify to create a worker that listens for a URL to a
// script and loads said script using importScripts
var w = work(require('./bare-blob-worker.js'));
var first = true;
w.addEventListener('message', function (ev) {
    console.log(ev.data);
    if (first) {
        // first message comes back when the worker has imported our script
        w.postMessage(4);
        first = false;
    }
});

// use `bare:true` to get a Blob of the require()'ed module, then manually
// create an object url to a script for the worker to import and execute
var blob = work(require('./worker.js'), {bare: true});
var url = URL.createObjectURL(blob);

w.postMessage(url); // send the worker the URL for a script to load with importScripts
