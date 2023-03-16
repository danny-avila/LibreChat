import { configureStore } from '@reduxjs/toolkit';

import convoReducer from './convoSlice.js';
import messageReducer from './messageSlice.js'
import modelReducer from './modelSlice.js'
import submitReducer from './submitSlice.js'
import textReducer from './textSlice.js'
import userReducer from './userReducer.js'

export const store = configureStore({
  reducer: {
    convo: convoReducer,
    messages: messageReducer,
    models: modelReducer,
    text: textReducer,
    submit: submitReducer,
    user: userReducer,
  },
  devTools: true,
});