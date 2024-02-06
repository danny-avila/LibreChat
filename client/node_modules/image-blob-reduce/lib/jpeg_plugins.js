
'use strict';


var image_traverse = require('./image_traverse');


function jpeg_patch_exif(env) {
  return this._getUint8Array(env.blob).then(function (data) {
    env.is_jpeg = image_traverse.is_jpeg(data);

    if (!env.is_jpeg) return Promise.resolve(env);

    env.orig_blob = env.blob;

    try {
      var exif_is_big_endian, orientation_offset;

      /* eslint-disable consistent-return */
      image_traverse.jpeg_exif_tags_each(data, function (entry) {
        if (entry.ifd === 0 && entry.tag === 0x112 && Array.isArray(entry.value)) {
          env.orientation    = entry.value[0] || 1;
          exif_is_big_endian = entry.is_big_endian;
          orientation_offset = entry.data_offset;
          return false;
        }
      });

      if (orientation_offset) {
        var orientation_patch = exif_is_big_endian ?
          new Uint8Array([ 0, 1 ]) :
          new Uint8Array([ 1, 0 ]);

        env.blob = new Blob([
          data.slice(0, orientation_offset),
          orientation_patch,
          data.slice(orientation_offset + 2)
        ], { type: 'image/jpeg' });
      }
    } catch (_) {}

    return env;
  });
}


function jpeg_rotate_canvas(env) {
  if (!env.is_jpeg) return Promise.resolve(env);

  var orientation = env.orientation - 1;
  if (!orientation) return Promise.resolve(env);

  var canvas;

  if (orientation & 4) {
    canvas = this.pica.options.createCanvas(env.out_canvas.height, env.out_canvas.width);
  } else {
    canvas = this.pica.options.createCanvas(env.out_canvas.width, env.out_canvas.height);
  }

  var ctx = canvas.getContext('2d');

  ctx.save();

  if (orientation & 1) ctx.transform(-1, 0, 0, 1, canvas.width, 0);
  if (orientation & 2) ctx.transform(-1, 0, 0, -1, canvas.width, canvas.height);
  if (orientation & 4) ctx.transform(0, 1, 1, 0, 0, 0);

  ctx.drawImage(env.out_canvas, 0, 0);
  ctx.restore();

  // Safari 12 workaround
  // https://github.com/nodeca/pica/issues/199
  env.out_canvas.width = env.out_canvas.height = 0;

  env.out_canvas = canvas;

  return Promise.resolve(env);
}


function jpeg_attach_orig_segments(env) {
  if (!env.is_jpeg) return Promise.resolve(env);

  return Promise.all([
    this._getUint8Array(env.blob),
    this._getUint8Array(env.out_blob)
  ]).then(function (res) {
    var data = res[0];
    var data_out = res[1];

    if (!image_traverse.is_jpeg(data)) return Promise.resolve(env);

    var segments = [];

    image_traverse.jpeg_segments_each(data, function (segment) {
      if (segment.code === 0xDA /* SOS */) return false;
      segments.push(segment);
    });

    segments = segments
      .filter(function (segment) {
        // Drop ICC_PROFILE
        //
        if (segment.code === 0xE2) return false;

        // Keep all APPn segments excluding APP2 (ICC_PROFILE),
        // remove others because most of them depend on image data (DCT and such).
        //
        // APP0 - JFIF, APP1 - Exif, the rest are photoshop metadata and such
        //
        // See full list at https://www.w3.org/Graphics/JPEG/itu-t81.pdf (table B.1 on page 32)
        //
        if (segment.code >= 0xE0 && segment.code < 0xF0) return true;

        // Keep comments
        //
        if (segment.code === 0xFE) return true;

        return false;
      })
      .map(function (segment) {
        return data.slice(segment.offset, segment.offset + segment.length);
      });

    env.out_blob = new Blob(
      // intentionally omitting expected JFIF segment (offset 2 to 20)
      [ data_out.slice(0, 2) ].concat(segments).concat([ data_out.slice(20) ]),
      { type: 'image/jpeg' }
    );

    return env;
  });
}


function assign(reducer) {
  reducer.before('_blob_to_image', jpeg_patch_exif);
  reducer.after('_transform',      jpeg_rotate_canvas);
  reducer.after('_create_blob',    jpeg_attach_orig_segments);
}


module.exports.jpeg_patch_exif = jpeg_patch_exif;
module.exports.jpeg_rotate_canvas = jpeg_rotate_canvas;
module.exports.jpeg_attach_orig_segments = jpeg_attach_orig_segments;
module.exports.assign = assign;
