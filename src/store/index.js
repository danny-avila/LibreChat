import { configureStore } from '@reduxjs/toolkit';

import convoReducer from './convoSlice.js';
import messageReducer from './messageSlice.js'
import submitReducer from './submitSlice.js'
import textReducer from './textSlice.js'

export const store = configureStore({
  reducer: {
    convo: convoReducer,
    messages: messageReducer,
    text: textReducer,
    submit: submitReducer,
  },
});