import {
  TConversationTagRequest,
  TConversationTagResponse,
  TConversationTagsResponse,
} from 'librechat-data-provider';

export const updateConversationTag = (
  queryCache: TConversationTagsResponse,
  request: TConversationTagRequest,
  response: TConversationTagResponse,
  tag?: string,
): TConversationTagsResponse => {
  if (queryCache.length === 0) {
    return [response];
  }
  const oldData = queryCache.find((t) => t.tag === tag);
  if (!oldData) {
    // When a new tag is added, it is positioned at the top of the list.
    return [queryCache[0], response, ...queryCache.slice(1)].map((t, index) => ({
      ...t,
      position: index,
    }));
  }

  const oldPosition = oldData.position;
  const newPosition = response.position;

  // Remove the updated data from the array
  const filteredData = queryCache.filter((t) => t.tag !== tag);

  if (newPosition === undefined || oldPosition === newPosition) {
    // If the position hasn't changed, just replace the updated tag
    return queryCache.map((t) => (t.tag === tag ? response : t));
  }

  // If the position has changed, update the position of the tag
  const newData = [
    ...filteredData.slice(0, newPosition),
    response,
    ...filteredData.slice(newPosition),
  ];

  if (newPosition > oldPosition) {
    // moving down
    for (let i = oldPosition; i < newPosition; i++) {
      newData[i].position = i;
    }
  } else {
    // moving up
    for (let i = newPosition + 1; i < newData.length; i++) {
      newData[i].position = i;
    }
  }
  return newData;
};
