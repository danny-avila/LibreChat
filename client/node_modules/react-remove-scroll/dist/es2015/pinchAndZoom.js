var ds = function (ab) { return (ab[0] <= 0 && ab[1] >= 0) || (ab[0] >= 0 && ab[1] <= 0); };
var sign = function (x) { return (x < 0 ? -1 : 1); };
export var pinchOrZoom = function (event, cache) {
    if (!event.changedTouches) {
        return false;
    }
    if (event.touches.length === 2) {
        var oldPoints = [cache[event.touches[0].identifier], cache[event.touches[1].identifier]];
        var newPoints = [event.touches[0], event.touches[1]];
        if (oldPoints[0] && oldPoints[1]) {
            // Calculate the difference between the start and move coordinates
            var diffx = [oldPoints[0].clientX - newPoints[0].clientX, oldPoints[1].clientX - newPoints[1].clientX];
            var diffy = [oldPoints[0].clientY - newPoints[0].clientY, oldPoints[1].clientY - newPoints[1].clientY];
            console.log(diffx, diffy);
            if (ds(diffx) || ds(diffy)) {
                return {
                    action: 'zoom',
                };
            }
            var mx = Math.max(Math.abs(diffx[0]), Math.abs(diffx[1]));
            var my = Math.max(Math.abs(diffy[0]), Math.abs(diffy[1]));
            return {
                action: 'pinch',
                coords: [mx * sign(diffx[0]), my * sign(diffx[1])],
            };
        }
    }
    Array.from(event.changedTouches).forEach(function (touch) { return (cache[touch.identifier] = touch); });
    return {
        action: 'move',
        coords: [event.changedTouches[0].clientX, event.changedTouches[0].clientY],
    };
};
