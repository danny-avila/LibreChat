
'use strict';

//////////////////////////////////////////////////////////////////////////
// Helpers
//
function error(message, code) {
  var err = new Error(message);
  err.code = code;
  return err;
}


// Convert number to 0xHH string
//
function to_hex(number) {
  var n = number.toString(16).toUpperCase();
  for (var i = 2 - n.length; i > 0; i--) n = '0' + n;
  return '0x' + n;
}


function utf8_encode(str) {
  try {
    return unescape(encodeURIComponent(str));
  } catch (_) {
    return str;
  }
}


function utf8_decode(str) {
  try {
    return decodeURIComponent(escape(str));
  } catch (_) {
    return str;
  }
}


// Check if input is a Uint8Array
//
function is_uint8array(bin) {
  return Object.prototype.toString.call(bin) === '[object Uint8Array]';
}


//////////////////////////////////////////////////////////////////////////
// Exif parser
//
// Input:
//  - jpeg_bin:   Uint8Array - jpeg file
//  - exif_start: Number     - start of TIFF header (after Exif\0\0)
//  - exif_end:   Number     - end of Exif segment
//  - on_entry:   Number     - callback
//
function ExifParser(jpeg_bin, exif_start, exif_end) {
  // Uint8Array, exif without signature (which isn't included in offsets)
  this.input      = jpeg_bin.subarray(exif_start, exif_end);

  // offset correction for `on_entry` callback
  this.start      = exif_start;

  // Check TIFF header (includes byte alignment and first IFD offset)
  var sig = String.fromCharCode.apply(null, this.input.subarray(0, 4));

  if (sig !== 'II\x2A\0' && sig !== 'MM\0\x2A') {
    throw error('invalid TIFF signature', 'EBADDATA');
  }

  // true if motorola (big endian) byte alignment, false if intel
  this.big_endian = sig[0] === 'M';
}


ExifParser.prototype.each = function (on_entry) {
  // allow premature exit
  this.aborted = false;

  var offset = this.read_uint32(4);

  this.ifds_to_read = [ {
    id:     0,
    offset: offset
  } ];

  while (this.ifds_to_read.length > 0 && !this.aborted) {
    var i = this.ifds_to_read.shift();
    if (!i.offset) continue;
    this.scan_ifd(i.id, i.offset, on_entry);
  }
};


ExifParser.prototype.filter = function (on_entry) {
  var ifds = {};

  // make sure IFD0 always exists
  ifds.ifd0 = { id: 0, entries: [] };

  this.each(function (entry) {
    if (on_entry(entry) === false && !entry.is_subifd_link) return;
    if (entry.is_subifd_link && entry.count !== 1 && entry.format !== 4) return; // filter out bogus links

    if (!ifds['ifd' + entry.ifd]) {
      ifds['ifd' + entry.ifd] = { id: entry.ifd, entries: [] };
    }

    ifds['ifd' + entry.ifd].entries.push(entry);
  });

  // thumbnails are not supported just yet, so delete all information related to it
  delete ifds.ifd1;

  // Calculate output size
  var length = 8;
  Object.keys(ifds).forEach(function (ifd_no) {
    length += 2;

    ifds[ifd_no].entries.forEach(function (entry) {
      length += 12 + (entry.data_length > 4 ? Math.ceil(entry.data_length / 2) * 2 : 0);
    });

    length += 4;
  });

  this.output = new Uint8Array(length);
  this.output[0] = this.output[1] = (this.big_endian ? 'M' : 'I').charCodeAt(0);
  this.write_uint16(2, 0x2A);

  var offset = 8;
  var self = this;
  this.write_uint32(4, offset);

  Object.keys(ifds).forEach(function (ifd_no) {
    ifds[ifd_no].written_offset = offset;

    var ifd_start = offset;
    var ifd_end   = ifd_start + 2 + ifds[ifd_no].entries.length * 12 + 4;
    offset = ifd_end;

    self.write_uint16(ifd_start, ifds[ifd_no].entries.length);

    ifds[ifd_no].entries.sort(function (a, b) {
      // IFD entries must be in order of increasing tag IDs
      return a.tag - b.tag;
    }).forEach(function (entry, idx) {
      var entry_offset = ifd_start + 2 + idx * 12;

      self.write_uint16(entry_offset, entry.tag);
      self.write_uint16(entry_offset + 2, entry.format);
      self.write_uint32(entry_offset + 4, entry.count);

      if (entry.is_subifd_link) {
        // filled in later
        if (ifds['ifd' + entry.tag]) ifds['ifd' + entry.tag].link_offset = entry_offset + 8;
      } else if (entry.data_length <= 4) {
        self.output.set(
          self.input.subarray(entry.data_offset - self.start, entry.data_offset - self.start + 4),
          entry_offset + 8
        );
      } else {
        self.write_uint32(entry_offset + 8, offset);
        self.output.set(
          self.input.subarray(entry.data_offset - self.start, entry.data_offset - self.start + entry.data_length),
          offset
        );
        offset += Math.ceil(entry.data_length / 2) * 2;
      }
    });

    var next_ifd = ifds['ifd' + (ifds[ifd_no].id + 1)];
    if (next_ifd) next_ifd.link_offset = ifd_end - 4;
  });

  Object.keys(ifds).forEach(function (ifd_no) {
    if (ifds[ifd_no].written_offset && ifds[ifd_no].link_offset) {
      self.write_uint32(ifds[ifd_no].link_offset, ifds[ifd_no].written_offset);
    }
  });

  if (this.output.length !== offset) throw error('internal error: incorrect buffer size allocated');

  return this.output;
};


ExifParser.prototype.read_uint16 = function (offset) {
  var d = this.input;
  if (offset + 2 > d.length) throw error('unexpected EOF', 'EBADDATA');

  return this.big_endian ?
    d[offset] * 0x100 + d[offset + 1] :
    d[offset] + d[offset + 1] * 0x100;
};


ExifParser.prototype.read_uint32 = function (offset) {
  var d = this.input;
  if (offset + 4 > d.length) throw error('unexpected EOF', 'EBADDATA');

  return this.big_endian ?
    d[offset] * 0x1000000 + d[offset + 1] * 0x10000 + d[offset + 2] * 0x100 + d[offset + 3] :
    d[offset] + d[offset + 1] * 0x100 + d[offset + 2] * 0x10000 + d[offset + 3] * 0x1000000;
};


ExifParser.prototype.write_uint16 = function (offset, value) {
  var d = this.output;

  if (this.big_endian) {
    d[offset]     = (value >>> 8) & 0xFF;
    d[offset + 1] = value & 0xFF;
  } else {
    d[offset]     = value & 0xFF;
    d[offset + 1] = (value >>> 8) & 0xFF;
  }
};


ExifParser.prototype.write_uint32 = function (offset, value) {
  var d = this.output;

  if (this.big_endian) {
    d[offset]     = (value >>> 24) & 0xFF;
    d[offset + 1] = (value >>> 16) & 0xFF;
    d[offset + 2] = (value >>> 8) & 0xFF;
    d[offset + 3] = value & 0xFF;
  } else {
    d[offset]     = value & 0xFF;
    d[offset + 1] = (value >>> 8) & 0xFF;
    d[offset + 2] = (value >>> 16) & 0xFF;
    d[offset + 3] = (value >>> 24) & 0xFF;
  }
};


ExifParser.prototype.is_subifd_link = function (ifd, tag) {
  return (ifd === 0 && tag === 0x8769) || // SubIFD
         (ifd === 0 && tag === 0x8825) || // GPS Info
         (ifd === 0x8769 && tag === 0xA005); // Interop IFD
};


// Returns byte length of a single component of a given format
//
ExifParser.prototype.exif_format_length = function (format) {
  switch (format) {
    case 1: // byte
    case 2: // ascii
    case 6: // sbyte
    case 7: // undefined
      return 1;

    case 3: // short
    case 8: // sshort
      return 2;

    case 4:  // long
    case 9:  // slong
    case 11: // float
      return 4;

    case 5:  // rational
    case 10: // srational
    case 12: // double
      return 8;

    default:
      // unknown type
      return 0;
  }
};


// Reads Exif data
//
ExifParser.prototype.exif_format_read = function (format, offset) {
  var v;

  switch (format) {
    case 1: // byte
    case 2: // ascii
      v = this.input[offset];
      return v;

    case 6: // sbyte
      v = this.input[offset];
      return v | (v & 0x80) * 0x1fffffe;

    case 3: // short
      v = this.read_uint16(offset);
      return v;

    case 8: // sshort
      v = this.read_uint16(offset);
      return v | (v & 0x8000) * 0x1fffe;

    case 4: // long
      v = this.read_uint32(offset);
      return v;

    case 9: // slong
      v = this.read_uint32(offset);
      return v | 0;

    case 5:  // rational
    case 10: // srational
    case 11: // float
    case 12: // double
      return null; // not implemented

    case 7: // undefined
      return null; // blob

    default:
      // unknown type
      return null;
  }
};


ExifParser.prototype.scan_ifd = function (ifd_no, offset, on_entry) {
  var entry_count = this.read_uint16(offset);

  offset += 2;

  for (var i = 0; i < entry_count; i++) {
    var tag    = this.read_uint16(offset);
    var format = this.read_uint16(offset + 2);
    var count  = this.read_uint32(offset + 4);

    var comp_length    = this.exif_format_length(format);
    var data_length    = count * comp_length;
    var data_offset    = data_length <= 4 ? offset + 8 : this.read_uint32(offset + 8);
    var is_subifd_link = false;

    if (data_offset + data_length > this.input.length) {
      throw error('unexpected EOF', 'EBADDATA');
    }

    var value = [];
    var comp_offset = data_offset;

    for (var j = 0; j < count; j++, comp_offset += comp_length) {
      var item = this.exif_format_read(format, comp_offset);
      if (item === null) {
        value = null;
        break;
      }
      value.push(item);
    }

    if (Array.isArray(value) && format === 2) {
      try {
        value = utf8_decode(String.fromCharCode.apply(null, value));
      } catch (_) {
        value = null;
      }

      if (value && value[value.length - 1] === '\0') value = value.slice(0, -1);
    }

    if (this.is_subifd_link(ifd_no, tag)) {
      if (Array.isArray(value) && Number.isInteger(value[0]) && value[0] > 0) {
        this.ifds_to_read.push({
          id:     tag,
          offset: value[0]
        });
        is_subifd_link = true;
      }
    }

    var entry = {
      is_big_endian:  this.big_endian,
      ifd:            ifd_no,
      tag:            tag,
      format:         format,
      count:          count,
      entry_offset:   offset + this.start,
      data_length:    data_length,
      data_offset:    data_offset + this.start,
      value:          value,
      is_subifd_link: is_subifd_link
    };

    if (on_entry(entry) === false) {
      this.aborted = true;
      return;
    }

    offset += 12;
  }

  if (ifd_no === 0) {
    this.ifds_to_read.push({
      id:     1,
      offset: this.read_uint32(offset)
    });
  }
};


// Check whether input is a JPEG image
//
// Input:
//  - jpeg_bin: Uint8Array - jpeg file
//
// Returns true if it is and false otherwise
//
module.exports.is_jpeg = function (jpeg_bin) {
  return jpeg_bin.length >= 4 && jpeg_bin[0] === 0xFF && jpeg_bin[1] === 0xD8 && jpeg_bin[2] === 0xFF;
};


// Call an iterator on each segment in the given JPEG image
//
// Input:
//  - jpeg_bin:   Uint8Array - jpeg file
//  - on_segment: Function - callback executed on each JPEG marker segment
//    - segment:  Object
//      - code:   Number - marker type (2nd byte, e.g. 0xE0 for APP0)
//      - offset: Number - offset of the first byte (0xFF) relative to `jpeg_bin` start
//      - length: Number - length of the entire marker segment including first two bytes and length
//        - 2 for standalone markers
//        - 4+length for markers with data
//
// Iteration stops when `EOI` (0xFFD9) marker is reached or if `on_segment`
// function returns `false`.
//
module.exports.jpeg_segments_each = function (jpeg_bin, on_segment) {
  if (!is_uint8array(jpeg_bin)) {
    throw error('Invalid argument (jpeg_bin), Uint8Array expected', 'EINVAL');
  }

  if (typeof on_segment !== 'function') {
    throw error('Invalid argument (on_segment), Function expected', 'EINVAL');
  }

  if (!module.exports.is_jpeg(jpeg_bin)) {
    throw error('Unknown file format', 'ENOTJPEG');
  }

  var offset = 0, length = jpeg_bin.length, inside_scan = false;

  for (;;) {
    var segment_code, segment_length;

    if (offset + 1 >= length) throw error('Unexpected EOF', 'EBADDATA');
    var byte1 = jpeg_bin[offset];
    var byte2 = jpeg_bin[offset + 1];

    if (byte1 === 0xFF && byte2 === 0xFF) {
      // padding
      segment_code = 0xFF;
      segment_length = 1;

    } else if (byte1 === 0xFF && byte2 !== 0) {
      // marker
      segment_code = byte2;
      segment_length = 2;

      if ((0xD0 <= segment_code && segment_code <= 0xD9) || segment_code === 0x01) {
        // standalone markers, according to JPEG 1992,
        // http://www.w3.org/Graphics/JPEG/itu-t81.pdf, see Table B.1
      } else {
        if (offset + 3 >= length) throw error('Unexpected EOF', 'EBADDATA');
        segment_length += jpeg_bin[offset + 2] * 0x100 + jpeg_bin[offset + 3];
        if (segment_length < 2) throw error('Invalid segment length', 'EBADDATA');
        if (offset + segment_length - 1 >= length) throw error('Unexpected EOF', 'EBADDATA');
      }

      if (inside_scan) {
        if (segment_code >= 0xD0 && segment_code <= 0xD7) {
          // reset markers
        } else {
          inside_scan = false;
        }
      }

      if (segment_code === 0xDA /* SOS */) inside_scan = true;
    } else if (inside_scan) {
      // entropy-encoded segment
      for (var pos = offset + 1; ; pos++) {
        // scan until we find FF
        if (pos >= length) throw error('Unexpected EOF', 'EBADDATA');
        if (jpeg_bin[pos] === 0xFF) {
          if (pos + 1 >= length) throw error('Unexpected EOF', 'EBADDATA');
          if (jpeg_bin[pos + 1] !== 0) {
            segment_code = 0;
            segment_length = pos - offset;
            break;
          }
        }
      }
    } else {
      throw error('Unexpected byte at segment start: ' + to_hex(byte1) +
        ' (offset ' + to_hex(offset) + ')', 'EBADDATA');
    }

    if (on_segment({ code: segment_code, offset: offset, length: segment_length }) === false) break;
    if (segment_code === 0xD9 /* EOI */) break;
    offset += segment_length;
  }
};


// Replace or remove segments in the given JPEG image
//
// Input:
//  - jpeg_bin:   Uint8Array - jpeg file
//  - on_segment: Function - callback executed on each JPEG marker segment
//    - segment:  Object
//      - code:   Number - marker type (2nd byte, e.g. 0xE0 for APP0)
//      - offset: Number - offset of the first byte (0xFF) relative to `jpeg_bin` start
//      - length: Number - length of the entire marker segment including first two bytes and length
//        - 2 for standalone markers
//        - 4+length for markers with data
//
// `on_segment` function should return one of the following:
//  - `false`        - segment is removed from the output
//  - Uint8Array     - segment is replaced with the new data
//  - [ Uint8Array ] - segment is replaced with the new data
//  - anything else  - segment is copied to the output as is
//
// Any data after `EOI` (0xFFD9) marker is removed.
//
module.exports.jpeg_segments_filter = function (jpeg_bin, on_segment) {
  if (!is_uint8array(jpeg_bin)) {
    throw error('Invalid argument (jpeg_bin), Uint8Array expected', 'EINVAL');
  }

  if (typeof on_segment !== 'function') {
    throw error('Invalid argument (on_segment), Function expected', 'EINVAL');
  }

  var ranges = [];
  var out_length = 0;

  module.exports.jpeg_segments_each(jpeg_bin, function (segment) {
    var new_segment = on_segment(segment);

    if (is_uint8array(new_segment)) {
      ranges.push({ data: new_segment });
      out_length += new_segment.length;
    } else if (Array.isArray(new_segment)) {
      new_segment.filter(is_uint8array).forEach(function (s) {
        ranges.push({ data: s });
        out_length += s.length;
      });
    } else if (new_segment !== false) {
      var new_range = { start: segment.offset, end: segment.offset + segment.length };

      if (ranges.length > 0 && ranges[ranges.length - 1].end === new_range.start) {
        ranges[ranges.length - 1].end = new_range.end;
      } else {
        ranges.push(new_range);
      }

      out_length += segment.length;
    }
  });

  var result = new Uint8Array(out_length);
  var offset = 0;

  ranges.forEach(function (range) {
    var data = range.data || jpeg_bin.subarray(range.start, range.end);
    result.set(data, offset);
    offset += data.length;
  });

  return result;
};


// Call an iterator on each Exif entry in the given JPEG image
//
// Input:
//  - jpeg_bin: Uint8Array - jpeg file
//  - on_entry: Function - callback executed on each Exif entry
//    - entry:  Object
//      - is_big_endian:  Boolean - whether Exif uses big or little endian byte alignment
//      - ifd:            Number  - IFD identifier (0 for IFD0, 1 for IFD1, 0x8769 for SubIFD,
//                                 0x8825 for GPS Info, 0xA005 for Interop IFD)
//      - tag:            Number  - exif entry tag (0x0110 - camera name, 0x0112 - orientation, etc. - see Exif spec)
//      - format:         Number  - exif entry format (1 - byte, 2 - ascii, 3 - short, etc. - see Exif spec)
//      - count:          Number  - number of components of the given format inside data
//                                 (usually 1, or string length for ascii format)
//      - entry_offset:   Number  - start of Exif entry (entry length is always 12, so not included)
//      - data_offset:    Number  - start of data attached to Exif entry (will overlap with entry if length <= 4)
//      - data_length:    Number  - length of data attached to Exif entry
//      - value:          Array|String|Null - our best attempt at parsing data (not all formats supported right now)
//      - is_subifd_link: Boolean - whether this entry is recognized to be a link to subifd (can't filter these out)
//
// Iteration stops early if iterator returns `false`.
//
// If Exif wasn't found anywhere (before start of the image data, SOS),
// iterator is never executed.
//
module.exports.jpeg_exif_tags_each = function (jpeg_bin, on_exif_entry) {
  if (!is_uint8array(jpeg_bin)) {
    throw error('Invalid argument (jpeg_bin), Uint8Array expected', 'EINVAL');
  }

  if (typeof on_exif_entry !== 'function') {
    throw error('Invalid argument (on_exif_entry), Function expected', 'EINVAL');
  }

  /* eslint-disable consistent-return */
  module.exports.jpeg_segments_each(jpeg_bin, function (segment) {
    if (segment.code === 0xDA /* SOS */) return false;

    // look for APP1 segment and compare header with 'Exif\0\0'
    if (segment.code === 0xE1 && segment.length >= 10 &&
        jpeg_bin[segment.offset + 4] === 0x45 && jpeg_bin[segment.offset + 5] === 0x78 &&
        jpeg_bin[segment.offset + 6] === 0x69 && jpeg_bin[segment.offset + 7] === 0x66 &&
        jpeg_bin[segment.offset + 8] === 0x00 && jpeg_bin[segment.offset + 9] === 0x00) {

      new ExifParser(jpeg_bin, segment.offset + 10, segment.offset + segment.length).each(on_exif_entry);
      return false;
    }
  });
};


// Remove Exif entries in the given JPEG image
//
// Input:
//  - jpeg_bin: Uint8Array - jpeg file
//  - on_entry: Function - callback executed on each Exif entry
//    - entry:  Object
//      - is_big_endian:  Boolean - whether Exif uses big or little endian byte alignment
//      - ifd:            Number  - IFD identifier (0 for IFD0, 1 for IFD1, 0x8769 for SubIFD,
//                                  0x8825 for GPS Info, 0xA005 for Interop IFD)
//      - tag:            Number  - exif entry tag (0x0110 - camera name, 0x0112 - orientation, etc. - see Exif spec)
//      - format:         Number  - exif entry format (1 - byte, 2 - ascii, 3 - short, etc. - see Exif spec)
//      - count:          Number  - number of components of the given format inside data
//                                  (usually 1, or string length for ascii format)
//      - entry_offset:   Number  - start of Exif entry (entry length is always 12, so not included)
//      - data_offset:    Number  - start of data attached to Exif entry (will overlap with entry if length <= 4)
//      - data_length:    Number  - length of data attached to Exif entry
//      - value:          Array|String|Null - our best attempt at parsing data (not all formats supported right now)
//      - is_subifd_link: Boolean - whether this entry is recognized to be a link to subifd (can't filter these out)
//
// This function removes following from Exif:
//  - all entries where iterator returned false (except subifd links which are mandatory)
//  - IFD1 and thumbnail image (the purpose of this function is to reduce file size,
//    so thumbnail is usually the first thing to go)
//  - all other data that isn't in IFD0, SubIFD, GPSIFD, InteropIFD
//    (theoretically possible proprietary extensions, I haven't seen any of these yet)
//
// Changing data inside Exif entries is NOT supported yet (modifying `entry` object inside callback may break stuff).
//
// If Exif wasn't found anywhere (before start of the image data, SOS),
// iterator is never executed, and original JPEG is returned as is.
//
module.exports.jpeg_exif_tags_filter = function (jpeg_bin, on_exif_entry) {
  if (!is_uint8array(jpeg_bin)) {
    throw error('Invalid argument (jpeg_bin), Uint8Array expected', 'EINVAL');
  }

  if (typeof on_exif_entry !== 'function') {
    throw error('Invalid argument (on_exif_entry), Function expected', 'EINVAL');
  }

  var stop_search = false;

  return module.exports.jpeg_segments_filter(jpeg_bin, function (segment) {
    if (stop_search) return;
    if (segment.code === 0xDA /* SOS */) stop_search = true;

    // look for APP1 segment and compare header with 'Exif\0\0'
    if (segment.code === 0xE1 && segment.length >= 10 &&
        jpeg_bin[segment.offset + 4] === 0x45 && jpeg_bin[segment.offset + 5] === 0x78 &&
        jpeg_bin[segment.offset + 6] === 0x69 && jpeg_bin[segment.offset + 7] === 0x66 &&
        jpeg_bin[segment.offset + 8] === 0x00 && jpeg_bin[segment.offset + 9] === 0x00) {

      var new_exif = new ExifParser(jpeg_bin, segment.offset + 10, segment.offset + segment.length)
        .filter(on_exif_entry);
      if (!new_exif) return false;

      var header = new Uint8Array(10);

      header.set(jpeg_bin.slice(segment.offset, segment.offset + 10));
      header[2] = ((new_exif.length + 8) >>> 8) & 0xFF;
      header[3] = (new_exif.length + 8) & 0xFF;

      stop_search = true;
      return [ header, new_exif ];
    }
  });
};


// Inserts a custom comment marker segment into JPEG file.
//
// Input:
//  - jpeg_bin: Uint8Array - jpeg file
//  - comment:  String
//
// Comment is inserted after first two bytes (FFD8, SOI).
//
// If JFIF (APP0) marker exists immediately after SOI (as mandated by the JFIF
// spec), we insert comment after it instead.
//
module.exports.jpeg_add_comment = function (jpeg_bin, comment) {
  var comment_inserted = false, segment_count = 0;

  return module.exports.jpeg_segments_filter(jpeg_bin, function (segment) {
    segment_count++;
    if (segment_count === 1 && segment.code === 0xD8 /* SOI  */) return;
    if (segment_count === 2 && segment.code === 0xE0 /* APP0 */) return;

    if (comment_inserted) return;
    comment = utf8_encode(comment);

    // comment segment
    var csegment = new Uint8Array(5 + comment.length);
    var offset = 0;

    csegment[offset++] = 0xFF;
    csegment[offset++] = 0xFE;
    csegment[offset++] = ((comment.length + 3) >>> 8) & 0xFF;
    csegment[offset++] = (comment.length + 3) & 0xFF;

    comment.split('').forEach(function (c) {
      csegment[offset++] = c.charCodeAt(0) & 0xFF;
    });

    csegment[offset++] = 0;
    comment_inserted = true;

    return [ csegment, jpeg_bin.subarray(segment.offset, segment.offset + segment.length) ];
  });
};
