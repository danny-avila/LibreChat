import { InfiniteData } from '@tanstack/react-query';

export const addData = <TCollection, TData>(
  data: InfiniteData<TCollection>,
  collectionName: string,
  newData: TData,
  findIndex: (page: TCollection) => number,
) => {
  const dataJson = JSON.parse(JSON.stringify(data)) as InfiniteData<TCollection>;
  const { pageIndex, index } = findPage<TCollection>(data, findIndex);

  if (pageIndex !== -1 && index !== -1) {
    return updateData(data, collectionName, newData, findIndex);
  }
  dataJson.pages[0][collectionName].unshift({
    ...newData,
    updatedAt: new Date().toISOString(),
  });

  return dataJson;
};

export function findPage<TData>(data: InfiniteData<TData>, findIndex: (page: TData) => number) {
  for (let pageIndex = 0; pageIndex < data.pages.length; pageIndex++) {
    const page = data.pages[pageIndex];
    const index = findIndex(page);
    if (index !== -1) {
      return { pageIndex, index };
    }
  }
  return { pageIndex: -1, index: -1 }; // Not found
}

export const updateData = <TCollection, TData>(
  data: InfiniteData<TCollection>,
  collectionName: string,
  updatedData: TData,
  findIndex: (page: TCollection) => number,
) => {
  const newData = JSON.parse(JSON.stringify(data)) as InfiniteData<TCollection>;
  const { pageIndex, index } = findPage<TCollection>(data, findIndex);

  if (pageIndex !== -1 && index !== -1) {
    // Remove the data from its current position
    newData.pages[pageIndex][collectionName].splice(index, 1);
    // Add the updated data to the top of the first page
    newData.pages[0][collectionName].unshift({
      ...updatedData,
      updatedAt: new Date().toISOString(),
    });
  }

  return newData;
};

export const deleteData = <TCollection, TData>(
  data: TData,
  collectionName: string,
  findIndex: (page: TCollection) => number,
): TData => {
  const newData = JSON.parse(JSON.stringify(data));
  const { pageIndex, index } = findPage<TCollection>(newData, findIndex);

  if (pageIndex !== -1 && index !== -1) {
    // Delete the data from its current page
    newData.pages[pageIndex][collectionName].splice(index, 1);
  }

  return newData;
};
