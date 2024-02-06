"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function sumMultipleOfMatricesCells(matrix1Array, matrix2Array, {
  i,
  j
}) {
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    const matrix1Index = j - 1 + k * 4;
    const matrix2Index = (i - 1) * 4 + k;
    sum += matrix1Array[matrix1Index] * matrix2Array[matrix2Index];
  }
  return sum;
}
function multiplyMatrices(leftMatrix, rightMatrix) {
  const leftMatrixArray = leftMatrix.toFloat64Array();
  const rightMatrixArray = rightMatrix.toFloat64Array();
  for (let i = 1; i <= 4; i++) {
    for (let j = 1; j <= 4; j++) {
      leftMatrix[`m${i}${j}`] = sumMultipleOfMatricesCells(leftMatrixArray, rightMatrixArray, {
        i,
        j
      });
    }
  }
}
class DOMMatrix {
  constructor(transform) {
    _defineProperty(this, "_is2D", true);
    _defineProperty(this, "m11", 1.0);
    _defineProperty(this, "m12", 0.0);
    _defineProperty(this, "m13", 0.0);
    _defineProperty(this, "m14", 0.0);
    _defineProperty(this, "m21", 0.0);
    _defineProperty(this, "m22", 1.0);
    _defineProperty(this, "m23", 0.0);
    _defineProperty(this, "m24", 0.0);
    _defineProperty(this, "m31", 0.0);
    _defineProperty(this, "m32", 0.0);
    _defineProperty(this, "m33", 1.0);
    _defineProperty(this, "m34", 0.0);
    _defineProperty(this, "m41", 0.0);
    _defineProperty(this, "m42", 0.0);
    _defineProperty(this, "m43", 0.0);
    _defineProperty(this, "m44", 1.0);
    if (transform && transform.length === 6) {
      this.m11 = transform[0];
      this.m12 = transform[1];
      this.m21 = transform[2];
      this.m22 = transform[3];
      this.m41 = transform[4];
      this.m42 = transform[5];
      this._is2D = true;
      return this;
    }
    if (transform && transform.length === 16) {
      this.m11 = transform[0];
      this.m12 = transform[1];
      this.m13 = transform[2];
      this.m14 = transform[3];
      this.m21 = transform[4];
      this.m22 = transform[5];
      this.m23 = transform[6];
      this.m24 = transform[7];
      this.m31 = transform[8];
      this.m32 = transform[9];
      this.m33 = transform[10];
      this.m34 = transform[11];
      this.m41 = transform[12];
      this.m42 = transform[13];
      this.m43 = transform[14];
      this.m44 = transform[15];
      this._is2D = false;
      return this;
    }
    if (transform) {
      throw new TypeError("Failed to construct 'DOMMatrix': The sequence must contain 6 elements for a 2D matrix or 16 elements for a 3D matrix.");
    }
    this._is2D = false;
  }
  get isIdentity() {
    if (this._is2D) {
      return this.m11 == 1.0 && this.m12 == 0.0 && this.m21 == 0.0 && this.m22 == 1.0 && this.m41 == 0.0 && this.m42 == 0.0;
    } else {
      return this.m11 = 1.0 && this.m12 === 0.0 && this.m13 === 0.0 && this.m14 === 0.0 && this.m21 === 0.0 && this.m22 === 1.0 && this.m23 === 0.0 && this.m24 === 0.0 && this.m31 === 0.0 && this.m32 === 0.0 && this.m33 === 1.0 && this.m34 === 0.0 && this.m41 === 0.0 && this.m42 === 0.0 && this.m43 === 0.0 && this.m44 === 1.0;
    }
  }
  get a() {
    return this.m11;
  }
  set a(value) {
    this.m11 = value;
  }
  get b() {
    return this.m12;
  }
  set b(value) {
    this.m12 = value;
  }
  get c() {
    return this.m21;
  }
  set c(value) {
    this.m21 = value;
  }
  get d() {
    return this.m22;
  }
  set d(value) {
    this.m22 = value;
  }
  get e() {
    return this.m41;
  }
  set e(value) {
    this.m41 = value;
  }
  get f() {
    return this.m42;
  }
  set f(value) {
    this.m42 = value;
  }
  get is2D() {
    return this._is2D;
  }
  toFloat32Array() {
    return new Float32Array([this.m11, this.m12, this.m13, this.m14, this.m21, this.m22, this.m23, this.m24, this.m31, this.m32, this.m33, this.m34, this.m41, this.m42, this.m43, this.m44]);
  }
  toFloat64Array() {
    return new Float64Array([this.m11, this.m12, this.m13, this.m14, this.m21, this.m22, this.m23, this.m24, this.m31, this.m32, this.m33, this.m34, this.m41, this.m42, this.m43, this.m44]);
  }
  translateSelf(x, y, z) {
    const tx = Number(x),
      ty = Number(y),
      tz = isNaN(Number(z)) ? 0 : Number(z);
    const translationMatrix = new DOMMatrix();
    translationMatrix.m41 = tx;
    translationMatrix.m42 = ty;
    translationMatrix.m43 = tz;
    multiplyMatrices(this, translationMatrix);
    if (tz) {
      this._is2D = false;
    }
    return this;
  }
  translate(x, y, z) {
    let translatedMatrix;
    if (this.is2D) {
      translatedMatrix = new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]);
    } else {
      translatedMatrix = new DOMMatrix(this.toFloat32Array());
    }
    return translatedMatrix.translateSelf(x, y, z);
  }
  scaleSelf(scaleX, scaleY, scaleZ, originX, originY, originZ) {
    const sx = Number(scaleX),
      sy = isNaN(Number(scaleY)) ? sx : Number(scaleY),
      sz = isNaN(Number(scaleZ)) ? 1 : Number(scaleZ);
    const ox = isNaN(Number(originX)) ? 0 : Number(originX),
      oy = isNaN(Number(originY)) ? 0 : Number(originY),
      oz = isNaN(Number(originZ)) ? 0 : Number(originZ);
    this.translateSelf(ox, oy, oz);
    const scaleMatrix = new DOMMatrix();
    scaleMatrix.m11 = sx;
    scaleMatrix.m22 = sy;
    scaleMatrix.m33 = sz;
    multiplyMatrices(this, scaleMatrix);
    this.translateSelf(-ox, -oy, -oz);
    if (Math.abs(sz) !== 1) {
      this._is2D = false;
    }
    return this;
  }
  scale(scaleX, scaleY, scaleZ, originX, originY, originZ) {
    let scaledMatrix;
    if (this.is2D) {
      scaledMatrix = new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]);
    } else {
      scaledMatrix = new DOMMatrix(this.toFloat32Array());
    }
    return scaledMatrix.scaleSelf(scaleX, scaleY, scaleZ, originX, originY, originZ);
  }
}
exports.default = DOMMatrix;