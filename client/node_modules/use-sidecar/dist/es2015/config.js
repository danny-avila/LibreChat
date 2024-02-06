export var config = {
    onError: function (e) { return console.error(e); },
};
export var setConfig = function (conf) {
    Object.assign(config, conf);
};
