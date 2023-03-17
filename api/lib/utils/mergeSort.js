function mergeSort(arr, compareFn) {
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
  let leftIndex = 0;
  let rightIndex = 0;
  
  while (leftIndex < leftArr.length && rightIndex < rightArr.length) {
    if (compareFn(leftArr[leftIndex], rightArr[rightIndex]) < 0) {
      result.push(leftArr[leftIndex++]);
    } else {
      result.push(rightArr[rightIndex++]);
    }
  }
  
  return result.concat(leftArr.slice(leftIndex)).concat(rightArr.slice(rightIndex));
}

module.exports = mergeSort;