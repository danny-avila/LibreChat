import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isSubmitting: false,
};

const currentSlice = createSlice({
  name: 'submit',
  initialState,
  reducers: {
    setSubmitState: (state, action) => {
      state.isSubmitting = action.payload;
    },
  }
});

export const { setSubmitState } = currentSlice.actions;

export default currentSlice.reducer;
