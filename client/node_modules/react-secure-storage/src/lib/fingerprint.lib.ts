import murmurhash3_32_gc from "murmurhash-js/murmurhash3_gc";
import { FINGERPRINT_KEYS, getDisabledKeys } from "./utils";

// ClientJS prototype which contains all methods.
const ClientJS = class {
  //
  // MAIN METHODS
  //

  // Get Fingerprint.  Return a 32-bit integer representing the browsers fingerprint.
  getFingerprint() {
    let bar = "|";

    const disabledKeys = getDisabledKeys();
    let key = "";
    if (!disabledKeys.includes(FINGERPRINT_KEYS.USERAGENT)) {
      key += navigator.userAgent + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.HOSTNAME)) {
      key += window.location.hostname + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.SCREEN_PRINT)) {
      key += this.getScreenPrint() + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.PLUGINS)) {
      key += this.getPlugins() + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.FONTS)) {
      key += this.getFonts() + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.LOCAL_STORAGE)) {
      key += this.isLocalStorage() + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.SESSION_STORAGE)) {
      key += this.isSessionStorage() + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.TIMEZONE)) {
      key += this.getTimeZone() + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.LANGUAGE)) {
      key += this.getLanguage() + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.SYSTEM_LANGUAGE)) {
      key += this.getSystemLanguage() + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.COOKIE)) {
      key += this.isCookie() + bar;
    }
    if (!disabledKeys.includes(FINGERPRINT_KEYS.CANVAS)) {
      key += this.getCanvasPrint();
    }
    if (key.endsWith(bar)) key = key.substring(0, key.length - 1);
    let seed = 256;

    return murmurhash3_32_gc(key, seed);
  }

  //
  // SCREEN METHODS
  //

  // Get Screen Print.  Return a string containing screen information.
  getScreenPrint() {
    // "Current Resolution: " + this.getCurrentResolution() +", Available Resolution: " + this.getAvailableResolution() +
    return "Color Depth: " + this.getColorDepth() + ", Device XDPI: " + this.getDeviceXDPI() + ", Device YDPI: " + this.getDeviceYDPI();
  }

  // Get Color Depth.  Return a string containing the color depth.
  getColorDepth() {
    return window.screen.colorDepth;
  }

  // Get Current Resolution.  Return a string containing the current resolution.
  getCurrentResolution() {
    return window.screen.width + "x" + window.screen.height;
  }

  // Get Available Resolution.  Return a string containing the available resolution.
  getAvailableResolution() {
    return window.screen.availWidth + "x" + window.screen.availHeight;
  }

  // Get Device XPDI.  Return a string containing the device XPDI.
  getDeviceXDPI() {
    // return window.screen.deviceXDPI;
    return "";
  }

  // Get Device YDPI.  Return a string containing the device YDPI.
  getDeviceYDPI() {
    // return window.screen.deviceYDPI;
    return "";
  }

  //
  // PLUGIN METHODS
  //

  // Get Plugins.  Return a string containing a list of installed plugins.
  getPlugins() {
    let pluginsList = "";

    for (let i = 0; i < navigator.plugins.length; i++) {
      if (i === navigator.plugins.length - 1) {
        pluginsList += navigator.plugins[i].name;
      } else {
        pluginsList += navigator.plugins[i].name + ", ";
      }
    }
    return pluginsList;
  }

  //
  // FONT METHODS
  //

  // Get Fonts.  Return a string containing a list of installed fonts.
  getFonts() {
    let fontArray = [
      "Abadi MT Condensed Light",
      "Adobe Fangsong Std",
      "Adobe Hebrew",
      "Adobe Ming Std",
      "Agency FB",
      "Aharoni",
      "Andalus",
      "Angsana New",
      "AngsanaUPC",
      "Aparajita",
      "Arab",
      "Arabic Transparent",
      "Arabic Typesetting",
      "Arial Baltic",
      "Arial Black",
      "Arial CE",
      "Arial CYR",
      "Arial Greek",
      "Arial TUR",
      "Arial",
      "Batang",
      "BatangChe",
      "Bauhaus 93",
      "Bell MT",
      "Bitstream Vera Serif",
      "Bodoni MT",
      "Bookman Old Style",
      "Braggadocio",
      "Broadway",
      "Browallia New",
      "BrowalliaUPC",
      "Calibri Light",
      "Calibri",
      "Californian FB",
      "Cambria Math",
      "Cambria",
      "Candara",
      "Castellar",
      "Casual",
      "Centaur",
      "Century Gothic",
      "Chalkduster",
      "Colonna MT",
      "Comic Sans MS",
      "Consolas",
      "Constantia",
      "Copperplate Gothic Light",
      "Corbel",
      "Cordia New",
      "CordiaUPC",
      "Courier New Baltic",
      "Courier New CE",
      "Courier New CYR",
      "Courier New Greek",
      "Courier New TUR",
      "Courier New",
      "DFKai-SB",
      "DaunPenh",
      "David",
      "DejaVu LGC Sans Mono",
      "Desdemona",
      "DilleniaUPC",
      "DokChampa",
      "Dotum",
      "DotumChe",
      "Ebrima",
      "Engravers MT",
      "Eras Bold ITC",
      "Estrangelo Edessa",
      "EucrosiaUPC",
      "Euphemia",
      "Eurostile",
      "FangSong",
      "Forte",
      "FrankRuehl",
      "Franklin Gothic Heavy",
      "Franklin Gothic Medium",
      "FreesiaUPC",
      "French Script MT",
      "Gabriola",
      "Gautami",
      "Georgia",
      "Gigi",
      "Gisha",
      "Goudy Old Style",
      "Gulim",
      "GulimChe",
      "GungSeo",
      "Gungsuh",
      "GungsuhChe",
      "Haettenschweiler",
      "Harrington",
      "Hei S",
      "HeiT",
      "Heisei Kaku Gothic",
      "Hiragino Sans GB",
      "Impact",
      "Informal Roman",
      "IrisUPC",
      "Iskoola Pota",
      "JasmineUPC",
      "KacstOne",
      "KaiTi",
      "Kalinga",
      "Kartika",
      "Khmer UI",
      "Kino MT",
      "KodchiangUPC",
      "Kokila",
      "Kozuka Gothic Pr6N",
      "Lao UI",
      "Latha",
      "Leelawadee",
      "Levenim MT",
      "LilyUPC",
      "Lohit Gujarati",
      "Loma",
      "Lucida Bright",
      "Lucida Console",
      "Lucida Fax",
      "Lucida Sans Unicode",
      "MS Gothic",
      "MS Mincho",
      "MS PGothic",
      "MS PMincho",
      "MS Reference Sans Serif",
      "MS UI Gothic",
      "MV Boli",
      "Magneto",
      "Malgun Gothic",
      "Mangal",
      "Marlett",
      "Matura MT Script Capitals",
      "Meiryo UI",
      "Meiryo",
      "Menlo",
      "Microsoft Himalaya",
      "Microsoft JhengHei",
      "Microsoft New Tai Lue",
      "Microsoft PhagsPa",
      "Microsoft Sans Serif",
      "Microsoft Tai Le",
      "Microsoft Uighur",
      "Microsoft YaHei",
      "Microsoft Yi Baiti",
      "MingLiU",
      "MingLiU-ExtB",
      "MingLiU_HKSCS",
      "MingLiU_HKSCS-ExtB",
      "Miriam Fixed",
      "Miriam",
      "Mongolian Baiti",
      "MoolBoran",
      "NSimSun",
      "Narkisim",
      "News Gothic MT",
      "Niagara Solid",
      "Nyala",
      "PMingLiU",
      "PMingLiU-ExtB",
      "Palace Script MT",
      "Palatino Linotype",
      "Papyrus",
      "Perpetua",
      "Plantagenet Cherokee",
      "Playbill",
      "Prelude Bold",
      "Prelude Condensed Bold",
      "Prelude Condensed Medium",
      "Prelude Medium",
      "PreludeCompressedWGL Black",
      "PreludeCompressedWGL Bold",
      "PreludeCompressedWGL Light",
      "PreludeCompressedWGL Medium",
      "PreludeCondensedWGL Black",
      "PreludeCondensedWGL Bold",
      "PreludeCondensedWGL Light",
      "PreludeCondensedWGL Medium",
      "PreludeWGL Black",
      "PreludeWGL Bold",
      "PreludeWGL Light",
      "PreludeWGL Medium",
      "Raavi",
      "Rachana",
      "Rockwell",
      "Rod",
      "Sakkal Majalla",
      "Sawasdee",
      "Script MT Bold",
      "Segoe Print",
      "Segoe Script",
      "Segoe UI Light",
      "Segoe UI Semibold",
      "Segoe UI Symbol",
      "Segoe UI",
      "Shonar Bangla",
      "Showcard Gothic",
      "Shruti",
      "SimHei",
      "SimSun",
      "SimSun-ExtB",
      "Simplified Arabic Fixed",
      "Simplified Arabic",
      "Snap ITC",
      "Sylfaen",
      "Symbol",
      "Tahoma",
      "Times New Roman Baltic",
      "Times New Roman CE",
      "Times New Roman CYR",
      "Times New Roman Greek",
      "Times New Roman TUR",
      "Times New Roman",
      "TlwgMono",
      "Traditional Arabic",
      "Trebuchet MS",
      "Tunga",
      "Tw Cen MT Condensed Extra Bold",
      "Ubuntu",
      "Umpush",
      "Univers",
      "Utopia",
      "Utsaah",
      "Vani",
      "Verdana",
      "Vijaya",
      "Vladimir Script",
      "Vrinda",
      "Webdings",
      "Wide Latin",
      "Wingdings",
    ];
    let fontString = "";

    // TODO: Need to enable this code
    // for (let i = 0; i < fontArray.length; i++) {
    //   if (fontDetective.detect(fontArray[i])) {
    //     if (i == fontArray.length - 1) {
    //       fontString += fontArray[i];
    //     } else {
    //       fontString += fontArray[i] + ", ";
    //     }
    //   }
    // }

    return fontString;
  }

  //
  // STORAGE METHODS
  //

  // Is Local Storage.  Check if local storage is enabled.
  isLocalStorage() {
    try {
      return !!localStorage;
    } catch (e) {
      return true; // SecurityError when referencing it means it exists
    }
  }

  // Is Session Storage.  Check if session storage is enabled.
  isSessionStorage() {
    try {
      return !!sessionStorage;
    } catch (e) {
      return true; // SecurityError when referencing it means it exists
    }
  }

  // Is Cookie.  Check if cookies are enabled.
  isCookie() {
    return navigator.cookieEnabled;
  }

  //
  // TIME METHODS
  //

  // Get Time Zone.  Return a string containing the time zone.
  getTimeZone() {
    let rightNow, myNumber: any, formattedNumber, result;
    rightNow = new Date();
    myNumber = String(-(rightNow.getTimezoneOffset() / 60));
    if (myNumber < 0) {
      myNumber = myNumber * -1;
      formattedNumber = ("0" + myNumber).slice(-2);
      result = "-" + formattedNumber;
    } else {
      formattedNumber = ("0" + myNumber).slice(-2);
      result = "+" + formattedNumber;
    }
    return result;
  }

  //
  // LANGUAGE METHODS
  //

  // Get Language.  Return a string containing the user language.
  getLanguage() {
    return navigator.language;
  }

  // Get System Language.  Return a string containing the system language.
  getSystemLanguage() {
    return navigator.language || window.navigator.language;
  }

  // Get Canvas Print.  Return a string containing the canvas URI data.
  getCanvasPrint() {
    // create a canvas element
    let canvas = document.createElement("canvas");

    // define a context let that will be used for browsers with canvas support
    let ctx: any;

    // try/catch for older browsers that don't support the canvas element
    try {
      // attempt to give ctx a 2d canvas context value
      ctx = canvas.getContext("2d");
    } catch (e) {
      // return empty string if canvas element not supported
      return "";
    }

    // https://www.browserleaks.com/canvas#how-does-it-work
    // Text with lowercase/uppercase/punctuation symbols
    let txt = "ClientJS,org <canvas> 1.0";
    ctx.textBaseline = "top";
    // The most common type
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    // Some tricks for color mixing to increase the difference in rendering
    ctx.fillStyle = "#069";
    ctx.fillText(txt, 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText(txt, 4, 17);
    return canvas.toDataURL();
  }
};

const clientJS = new ClientJS();

export default clientJS;
