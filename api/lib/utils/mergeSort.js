function mergeSort(arr, compareFn) {
  if (!Array.isArray(arr)) {
    throw new Error('Input is not an array');
  }

  if (arr.length <= 1) {
    return arr;
  }

  const mid = Math.floor(arr.length / 2);
  const leftArr = arr.slice(0, mid);
  const rightArr = arr.slice(mid);

  return merge(mergeSort(leftArr, compareFn), mergeSort(rightArr, compareFn), compareFn);
}

function merge(leftArr, rightArr, compareFn) {
  const result = [];
  let [leftIndex, rightIndex] = [0, 0];
  const leftArrLength = leftArr.length;
  const rightArrLength = rightArr.length;

  while (leftIndex < leftArrLength && rightIndex < rightArrLength) {
    if (compareFn(leftArr[leftIndex], rightArr[rightIndex]) < 0) {
      result.push(leftArr[leftIndex++]);
    } else {
      result.push(rightArr[rightIndex++]);
    }
  }

  return result.concat(leftArr.slice(leftIndex)).concat(rightArr.slice(rightIndex));
}

module.exports = mergeSort;
