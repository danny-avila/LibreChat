import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: null,
};

const currentSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
    },
  }
});

export const { setUser } = currentSlice.actions;

export default currentSlice.reducer;
