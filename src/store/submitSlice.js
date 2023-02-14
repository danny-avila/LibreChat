import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isSubmitting: false,
  model: 'chatgpt'
};

const currentSlice = createSlice({
  name: 'submit',
  initialState,
  reducers: {
    setSubmitState: (state, action) => {
      state.isSubmitting = action.payload;
    },
    setModel: (state, action) => {
      state.model = action.payload;
    },
  }
});

export const { setSubmitState, setModel } = currentSlice.actions;

export default currentSlice.reducer;
