import { configureStore } from '@reduxjs/toolkit';

import convoReducer from './convoSlice.js';
import messageReducer from './messageSlice.js'

export const store = configureStore({
  reducer: {
    convo: convoReducer,
    messages: messageReducer,
  },
});
