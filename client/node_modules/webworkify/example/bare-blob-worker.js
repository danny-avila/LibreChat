var gamma = require('gamma');

module.exports = function (self) {
    self.addEventListener('message', doImport);
    function doImport (ev){
        importScripts(ev.data); // Object URL for worker script sent from main.js
        self.postMessage('imported script at:' + ev.data)
        self.removeEventListener('message', doImport);
    }
};
