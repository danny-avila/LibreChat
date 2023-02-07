import { configureStore } from '@reduxjs/toolkit';

import convoReducer from './convoSlice.js';
// import uploadReducer from './uploadSlice.js'

export const store = configureStore({
  reducer: {
    convo: convoReducer,
    // upload: uploadReducer,
  },
});
