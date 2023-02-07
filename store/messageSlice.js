import { createSlice } from '@reduxjs/toolkit';

const initialState = [];

const currentSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    setMessages: (state, action) => {
      console.log('in setMessages reducer');
      const { payload } = action;
      state = payload;
    },
  }
});
//

export const { setMessages } = currentSlice.actions;

export default currentSlice.reducer;
