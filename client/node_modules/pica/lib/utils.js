'use strict';


function objClass(obj) { return Object.prototype.toString.call(obj); }


module.exports.isCanvas = function isCanvas(element) {
  let cname = objClass(element);

  return cname === '[object HTMLCanvasElement]'/* browser */ ||
         cname === '[object OffscreenCanvas]' ||
         cname === '[object Canvas]'/* node-canvas */;
};


module.exports.isImage = function isImage(element) {
  return objClass(element) === '[object HTMLImageElement]';
};


module.exports.isImageBitmap = function isImageBitmap(element) {
  return objClass(element) === '[object ImageBitmap]';
};


module.exports.limiter = function limiter(concurrency) {
  let active = 0,
      queue  = [];

  function roll() {
    if (active < concurrency && queue.length) {
      active++;
      queue.shift()();
    }
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push(() => {
        fn().then(
          result => {
            resolve(result);
            active--;
            roll();
          },
          err => {
            reject(err);
            active--;
            roll();
          }
        );
      });

      roll();
    });
  };
};


module.exports.cib_quality_name = function cib_quality_name(num) {
  switch (num) {
    case 0: return 'pixelated';
    case 1: return 'low';
    case 2: return 'medium';
  }
  return 'high';
};


module.exports.cib_support = function cib_support(createCanvas) {
  return Promise.resolve().then(() => {
    if (typeof createImageBitmap === 'undefined') {
      return false;
    }

    let c = createCanvas(100, 100);

    return createImageBitmap(c, 0, 0, 100, 100, {
      resizeWidth: 10,
      resizeHeight: 10,
      resizeQuality: 'high'
    })
    .then(bitmap => {
      let status = (bitmap.width === 10);

      // Branch below is filtered on upper level. We do not call resize
      // detection for basic ImageBitmap.
      //
      // https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap
      // old Crome 51 has ImageBitmap without .close(). Then this code
      // will throw and return 'false' as expected.
      //
      bitmap.close();
      c = null;
      return status;
    });
  })
  .catch(() => false);
};


module.exports.worker_offscreen_canvas_support = function worker_offscreen_canvas_support() {
  return new Promise((resolve, reject) => {
    if (typeof OffscreenCanvas === 'undefined') {
      // if OffscreenCanvas is present, we assume browser supports Worker and built-in Promise as well
      resolve(false);
      return;
    }

    function workerPayload(self) {
      if (typeof createImageBitmap === 'undefined') {
        self.postMessage(false);
        return;
      }

      Promise.resolve()
        .then(() => {
          let canvas = new OffscreenCanvas(10, 10);
          // test that 2d context can be used in worker
          let ctx = canvas.getContext('2d');
          ctx.rect(0, 0, 1, 1);
          // test that cib can be used to return image bitmap from worker
          return createImageBitmap(canvas, 0, 0, 1, 1);
        })
        .then(
          () => self.postMessage(true),
          () => self.postMessage(false)
        );
    }

    let code = btoa(`(${workerPayload.toString()})(self);`);
    let w = new Worker(`data:text/javascript;base64,${code}`);
    w.onmessage = ev => resolve(ev.data);
    w.onerror = reject;
  }).then(result => result, () => false);
};


// Check if canvas.getContext('2d').getImageData can be used,
// FireFox randomizes the output of that function in `privacy.resistFingerprinting` mode
module.exports.can_use_canvas = function can_use_canvas(createCanvas) {
  let usable = false;
  try {
    let canvas = createCanvas(2, 1);
    let ctx = canvas.getContext('2d');

    let d = ctx.createImageData(2, 1);
    d.data[0] = 12; d.data[1] = 23; d.data[2] = 34; d.data[3] = 255;
    d.data[4] = 45; d.data[5] = 56; d.data[6] = 67; d.data[7] = 255;
    ctx.putImageData(d, 0, 0);
    d = null;

    d = ctx.getImageData(0, 0, 2, 1);

    if (d.data[0] === 12 && d.data[1] === 23 && d.data[2] === 34 && d.data[3] === 255 &&
        d.data[4] === 45 && d.data[5] === 56 && d.data[6] === 67 && d.data[7] === 255) {
      usable = true;
    }
  } catch (err) {}

  return usable;
};


// Check if createImageBitmap(img, sx, sy, sw, sh) signature works correctly
// with JPEG images oriented with Exif;
// https://bugs.chromium.org/p/chromium/issues/detail?id=1220671
// TODO: remove after it's fixed in chrome for at least 2 releases
module.exports.cib_can_use_region = function cib_can_use_region() {
  return new Promise(resolve => {
    // `Image` check required for use in `ServiceWorker`
    if ((typeof Image === 'undefined') || (typeof createImageBitmap === 'undefined')) {
      resolve(false);
      return;
    }

    let image = new Image();
    image.src = 'data:image/jpeg;base64,' +
      '/9j/4QBiRXhpZgAATU0AKgAAAAgABQESAAMAAAABAAYAAAEaAAUAAAABAAAASgEbAAUAA' +
      'AABAAAAUgEoAAMAAAABAAIAAAITAAMAAAABAAEAAAAAAAAAAABIAAAAAQAAAEgAAAAB/9' +
      'sAQwAEAwMEAwMEBAMEBQQEBQYKBwYGBgYNCQoICg8NEBAPDQ8OERMYFBESFxIODxUcFRc' +
      'ZGRsbGxAUHR8dGh8YGhsa/9sAQwEEBQUGBQYMBwcMGhEPERoaGhoaGhoaGhoaGhoaGhoa' +
      'GhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoa/8IAEQgAAQACAwERAAIRAQMRA' +
      'f/EABQAAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAA' +
      'IQAxAAAAF/P//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAA' +
      'AAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIB' +
      'AT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAA' +
      'AAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQH//EABQRAQAAAAAAAAAAAAAAAA' +
      'AAAAD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Qf//EABQ' +
      'QAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z';

    image.onload = () => {
      createImageBitmap(image, 0, 0, image.width, image.height).then(bitmap => {
        if (bitmap.width === image.width && bitmap.height === image.height) {
          resolve(true);
        } else {
          resolve(false);
        }
      }, () => resolve(false));
    };

    image.onerror = () => resolve(false);
  });
};
