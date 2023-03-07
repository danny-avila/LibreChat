import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  text: '',
};

const currentSlice = createSlice({
  name: 'text',
  initialState,
  reducers: {
    setText: (state, action) => {
      state.text = action.payload;
    },
  }
});

export const { setText } = currentSlice.actions;

export default currentSlice.reducer;
