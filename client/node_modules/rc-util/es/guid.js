var seed = 0;
export default function guid() {
  return "".concat(Date.now(), "_").concat(seed++);
}